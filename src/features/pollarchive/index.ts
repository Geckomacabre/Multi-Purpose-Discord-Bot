import {
  AttachmentBuilder, Colors, EmbedBuilder, MessageType, PermissionFlagsBits,
  type Client, type Guild, type GuildTextBasedChannel, type Message,
} from 'discord.js';
import { EventModule } from '../feature';
import * as db from '../../utils/db';
import { deleteMessages } from '../../utils/deleteMessages';
import logger from '../../utils/logger';

// When a native Discord poll ends in a configured channel, Discord posts a "poll
// ended" system message pointing at it. We then:
//   1. post a results card (+ a .txt log of the discussion) to the archive channel
//   2. delete the poll, the "poll ended" notice, and everything posted in the
//      channel while the poll was running (except pinned messages and other polls)
// A periodic sweep catches polls that ended while the bot was offline, and a
// full-history backfill (on setup, or /config pollarchive sweep) archives polls
// that ended before the channel was set up.

const MAX_DISCUSSION = 1000;   // messages archived per poll
const MAX_VOTERS = 100;        // voters listed per answer in the log
const MAX_SCAN = 50_000;       // messages a full-history backfill will look through
const SWEEP_EVERY_MS = 10 * 60 * 1000;

const inFlight = new Set<string>();  // polls being archived
const scanning = new Set<string>();  // poll channels being scanned

/** Permissions the bot lacks for archiving between these channels. */
export function missingPollArchivePerms(guild: Guild, sourceId: string, archiveId: string): string[] {
  const me = guild.members.me;
  const source = guild.channels.cache.get(sourceId);
  const archive = guild.channels.cache.get(archiveId);
  if (!me || !source || !archive) return ['channel not found'];
  const missing: string[] = [];
  const need = (ch: typeof source, perm: bigint, label: string) => {
    if (!ch.permissionsFor(me)?.has(perm)) missing.push(`**${label}** in <#${ch.id}>`);
  };
  need(source, PermissionFlagsBits.ViewChannel, 'View Channel');
  need(source, PermissionFlagsBits.ReadMessageHistory, 'Read Message History');
  need(source, PermissionFlagsBits.ManageMessages, 'Manage Messages');
  need(archive, PermissionFlagsBits.SendMessages, 'Send Messages');
  need(archive, PermissionFlagsBits.EmbedLinks, 'Embed Links');
  need(archive, PermissionFlagsBits.AttachFiles, 'Attach Files');
  return missing;
}

function pollEnded(m: Message): boolean {
  const poll = m.poll;
  if (!poll) return false;
  return poll.resultsFinalized || (!!poll.expiresTimestamp && poll.expiresTimestamp < Date.now() - 60_000);
}

function answerLabel(a: any): string {
  return `${a.emoji ? `${a.emoji} ` : ''}${a.text ?? 'Answer'}`;
}

function resultsEmbed(msg: Message, endedAt: number): EmbedBuilder {
  const poll = msg.poll!;
  const answers = [...poll.answers.values()] as any[];
  const total = answers.reduce((n, a) => n + (a.voteCount ?? 0), 0);
  const top = Math.max(0, ...answers.map(a => a.voteCount ?? 0));
  const lines = answers.map(a => {
    const votes = a.voteCount ?? 0;
    const pct = total ? Math.round((votes / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '░');
    const winner = top > 0 && votes === top ? '🏆 ' : '';
    return `${winner}**${answerLabel(a)}**\n\`${bar}\` ${votes} vote${votes === 1 ? '' : 's'} · ${pct}%`;
  });
  const ts = (ms: number) => `<t:${Math.floor(ms / 1000)}:f>`;
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({ name: `Poll by ${msg.author.displayName}`, iconURL: msg.author.displayAvatarURL() })
    .setTitle(`📊 ${poll.question.text ?? 'Poll'}`.slice(0, 256))
    .setDescription(lines.join('\n\n').slice(0, 4096) || '*No answers*')
    .addFields(
      { name: 'Total votes', value: String(total), inline: true },
      { name: 'Type', value: poll.allowMultiselect ? 'Multiple choice' : 'Single choice', inline: true },
      { name: 'Channel', value: `<#${msg.channelId}>`, inline: true },
      { name: 'Ran', value: `${ts(msg.createdTimestamp)} → ${ts(endedAt)}` },
    )
    .setFooter({ text: `Poll ${msg.id}` });
}

/** Messages posted in the channel while the poll was running, oldest first. */
async function collectDiscussion(channel: GuildTextBasedChannel, poll: Message, endedAt: number, skipIds: Set<string>): Promise<Message[]> {
  const out: Message[] = [];
  let after = poll.id;
  while (out.length < MAX_DISCUSSION) {
    const batch = await channel.messages.fetch({ after, limit: 100 }).catch(() => null);
    if (!batch?.size) break;
    const sorted = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    let reachedEnd = false;
    for (const m of sorted) {
      if (m.createdTimestamp > endedAt) { reachedEnd = true; break; }
      // Leave pinned messages, other polls (they get archived when they end), and
      // other polls' "poll ended" notices alone.
      if (m.pinned || m.poll || m.type === MessageType.PollResult || skipIds.has(m.id)) continue;
      out.push(m);
    }
    if (reachedEnd || batch.size < 100) break;
    after = sorted.at(-1)!.id;
  }
  return out;
}

async function transcript(poll: Message, endedAt: number, discussion: Message[]): Promise<string> {
  const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const p = poll.poll!;
  const lines = [
    `Poll: ${p.question.text ?? ''}`,
    `Asked by: ${poll.author.username} (${poll.author.id})`,
    `Channel: #${'name' in poll.channel ? poll.channel.name : poll.channelId}`,
    `Ran: ${iso(poll.createdTimestamp)} -> ${iso(endedAt)}`,
    '',
    '== Results ==',
  ];
  for (const a of p.answers.values() as Iterable<any>) {
    lines.push(`${answerLabel(a)}: ${a.voteCount ?? 0} vote(s)`);
    const voters = await a.voters?.fetch({ limit: MAX_VOTERS }).catch(() => null);
    if (voters?.size) lines.push(`    voted: ${[...voters.values()].map((u: any) => u.username).join(', ')}`);
  }
  lines.push('', `== Discussion (${discussion.length} message${discussion.length === 1 ? '' : 's'}) ==`);
  for (const m of discussion) {
    lines.push(`[${iso(m.createdTimestamp)}] ${m.author.displayName} (@${m.author.username}): ${m.content || ''}`.trimEnd());
    for (const att of m.attachments.values()) lines.push(`    [attachment] ${att.name} ${att.url}`);
    for (const e of m.embeds) if (e.title || e.description) lines.push(`    [embed] ${[e.title, e.description].filter(Boolean).join(' - ').slice(0, 300)}`);
  }
  return lines.join('\n');
}

/** Archive one ended poll. `endMessage` is Discord's "poll ended" notice, if we have it. */
async function archivePoll(bot: Client, pollMsg: Message, endMessage: Message | null): Promise<boolean> {
  const guildId = pollMsg.guildId;
  if (!guildId || inFlight.has(pollMsg.id)) return false;
  if (await db.isPollArchived(pollMsg.id)) return false;
  const cfg = await db.getPollArchiveForChannel(pollMsg.channelId);
  if (!cfg) return false;

  inFlight.add(pollMsg.id);
  try {
    const archive = await bot.channels.fetch(cfg.archive_channel_id).catch(() => null);
    if (!archive?.isSendable()) {
      logger.warn(`[pollarchive] archive channel ${cfg.archive_channel_id} missing or not sendable`);
      return false;
    }
    // Make sure the vote counts are the final ones.
    if (!pollMsg.poll?.resultsFinalized) pollMsg = await pollMsg.fetch(true).catch(() => pollMsg);
    if (!pollMsg.poll) return false;

    const source = pollMsg.channel as GuildTextBasedChannel;
    const endedAt = endMessage?.createdTimestamp ?? pollMsg.poll.expiresTimestamp ?? Date.now();
    const discussion = await collectDiscussion(source, pollMsg, endedAt, new Set(endMessage ? [endMessage.id] : []));
    const log = await transcript(pollMsg, endedAt, discussion);

    await archive.send({
      embeds: [resultsEmbed(pollMsg, endedAt)],
      files: [new AttachmentBuilder(Buffer.from(log, 'utf8'), { name: `poll-${pollMsg.id}.txt` })],
      allowedMentions: { parse: [] },
    });
    await db.markPollArchived(guildId, pollMsg.id);

    // Only clear the source once the archive copy exists.
    const toDelete = [...discussion, ...(endMessage ? [endMessage] : []), pollMsg];
    const deleted = await deleteMessages(source, toDelete);
    if (deleted < toDelete.length) {
      logger.warn(`[pollarchive] deleted ${deleted}/${toDelete.length} messages for poll ${pollMsg.id} (missing Manage Messages?)`);
    }
    logger.info(`[pollarchive] archived poll ${pollMsg.id} (${discussion.length} discussion messages) to #${'name' in archive ? archive.name : archive.id}`);
    return true;
  } catch (err) {
    logger.error(`[pollarchive] failed to archive poll ${pollMsg.id}: ${err}`);
    return false;
  } finally {
    inFlight.delete(pollMsg.id);
  }
}

export type BackfillProgress = { scanned: number; found: number; archived: number };

/**
 * Archive every ended poll in a poll channel, oldest first. `depth` is how many
 * of the newest messages to scan: the periodic sweep only looks at the last 100,
 * while a backfill walks the channel's whole history (up to MAX_SCAN).
 */
export async function archiveEndedPolls(
  bot: Client,
  sourceChannelId: string,
  depth = MAX_SCAN,
  onProgress?: (p: BackfillProgress) => void,
): Promise<BackfillProgress> {
  const progress: BackfillProgress = { scanned: 0, found: 0, archived: 0 };
  if (scanning.has(sourceChannelId)) return progress;
  const channel = await bot.channels.fetch(sourceChannelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) return progress;

  scanning.add(sourceChannelId);
  try {
    // Only ended polls and "poll ended" notices are kept from the scan, so even a
    // long history stays small in memory.
    const polls: Message[] = [];
    const notices = new Map<string, Message>();
    let before: string | undefined;
    while (progress.scanned < depth) {
      const batch = await channel.messages.fetch({ limit: Math.min(100, depth - progress.scanned), ...(before ? { before } : {}) }).catch(() => null);
      if (!batch?.size) break;
      for (const m of batch.values()) {
        if (pollEnded(m)) polls.push(m);
        else if (m.type === MessageType.PollResult && m.reference?.messageId) notices.set(m.reference.messageId, m);
      }
      progress.scanned += batch.size;
      before = batch.lastKey();
      onProgress?.(progress);
      if (batch.size < 100) break;
    }

    const pending: Message[] = [];
    for (const p of polls) if (!(await db.isPollArchived(p.id))) pending.push(p);
    // Oldest first, so the archive channel reads in order and each poll's
    // discussion window is cleared before the next one's.
    pending.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    progress.found = pending.length;
    onProgress?.(progress);

    for (const poll of pending) {
      if (await archivePoll(bot, poll, notices.get(poll.id) ?? null)) progress.archived++;
      onProgress?.(progress);
    }
    return progress;
  } finally {
    scanning.delete(sourceChannelId);
  }
}

/** Is a channel's history being scanned right now? */
export const isScanning = (sourceChannelId: string) => scanning.has(sourceChannelId);

export function startPollArchiveSweeper(bot: Client) {
  const sweep = async () => {
    for (const cfg of await db.getAllPollArchiveConfigs()) {
      await archiveEndedPolls(bot, cfg.source_channel_id, 100)
        .catch(err => logger.error(`[pollarchive] sweep of ${cfg.source_channel_id} failed: ${err}`));
    }
  };
  setTimeout(sweep, 60_000);
  setInterval(sweep, SWEEP_EVERY_MS);
}

const pollArchiveModule: EventModule = {
  name: 'pollarchive',
  handlers: {
    messageCreate: async ({ data: [message], bot }) => {
      if (message.type !== MessageType.PollResult || !message.guildId) return;
      const pollId = message.reference?.messageId;
      if (!pollId) return;
      if (!(await db.getPollArchiveForChannel(message.channelId))) return;
      const poll = await message.channel.messages.fetch(pollId).catch(() => null);
      if (poll?.poll) await archivePoll(bot, poll, message);
    },
  },
};

export default pollArchiveModule;
