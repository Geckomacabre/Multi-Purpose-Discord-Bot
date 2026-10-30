import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, Message, TextChannel, PermissionFlagsBits } from 'discord.js';
import { EventModule } from '../feature';
import { getLogConfig } from '../../utils/db.js';
import logger from '../../utils/logger';
import { LogColor, logCard, quote, who, type LogCardOptions } from '../../utils/logCard';
import { peekImages } from '../../utils/recentImages';
import { WARNING_RE, addScamImages, findScamImage, fingerprintMessage, repeatedAcrossChannels } from './scamImages';
import type { ImageFingerprint } from '../../utils/phash';

const WINDOW_MS = 30_000;       // 30-second sliding window for cross-channel image spam
const IMAGE_MIN_CHANNELS = 3;   // images in 3+ channels triggers action (4 let scam image raids hitting 3 channels through)
// The same-message/same-link cross-channel check gets its own window and
// threshold — it's the exact fingerprint of a hijacked or malicious account
// running a scam (a fake giveaway link posted in a bunch of channels), so
// it's tuned wider than the image check to catch a campaign that takes its
// time, and — unlike every other check here — it is NEVER skipped for
// trusted accounts. See messageCreate below for why.
const CROSS_CHANNEL_WINDOW_MS = 45_000;
const CROSS_CHANNEL_MIN_CHANNELS = 3; // identical text/link in 3+ channels — nothing legitimate does this
const URL_RE = /https?:\/\/[^\s<>]+/gi;
// Two separate signals for same-channel flooding, so a fast typer sending several
// *different* real messages isn't treated the same as a bot/paste spamming one line
// over and over. Either one firing is enough to punish.
const RAPID_WINDOW_MS = 6_000;      // window for the raw flood-rate safety net
const RAPID_THRESHOLD = 8;          // 8+ messages in 6s — not achievable by hand typing distinct content
const DUPLICATE_WINDOW_MS = 10_000; // window for repeated-content detection
const DUPLICATE_THRESHOLD = 4;      // the *same* message 4+ times — the actual signature of spam
const CMD_RAPID_WINDOW_MS = 8_000; // 8-second window for rapid slash-command usage
const CMD_RAPID_THRESHOLD = 6;     // 6+ commands in 8 seconds — normal users don't do this, raid scripts do
const MSG_HISTORY_MS = 60 * 1000; // 1 minute — how far back to purge on spam
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

type TrackedMsg = { id: string; channelId: string; timestamp: number; content: string };
type TrackedContent = { content: string; timestamp: number };

type UserTrack = {
  imageChannels: Map<string, number>;
  messageChannels: Map<string, Set<string>>;
  recentMessages: number[];
  recentContents: TrackedContent[];
  recentCommands: number[];
  msgHistory: TrackedMsg[];
  imagePosts: { channelId: string; timestamp: number; fingerprints: Promise<ImageFingerprint[]> }[]; // pHashes being worked out
  lastPunishedAt: number;
};

// guildId -> userId -> track
const tracker = new Map<string, Map<string, UserTrack>>();

function getTrack(guildId: string, userId: string): UserTrack {
  if (!tracker.has(guildId)) tracker.set(guildId, new Map());
  const guild = tracker.get(guildId)!;
  if (!guild.has(userId)) guild.set(userId, { imageChannels: new Map(), messageChannels: new Map(), recentMessages: [], recentContents: [], recentCommands: [], msgHistory: [], imagePosts: [], lastPunishedAt: 0 });
  return guild.get(userId)!;
}

function pruneWindow(map: Map<string, number>, now: number) {
  for (const [k, ts] of map) {
    if (now - ts > WINDOW_MS) map.delete(k);
  }
}

async function purgeHistory(member: GuildMember, history: TrackedMsg[]): Promise<TrackedMsg[]> {
  const cutoff = Date.now() - MSG_HISTORY_MS;
  const toDelete = history.filter(m => m.timestamp >= cutoff);

  // group by channel
  const byChannel = new Map<string, string[]>();
  for (const m of toDelete) {
    if (!byChannel.has(m.channelId)) byChannel.set(m.channelId, []);
    byChannel.get(m.channelId)!.push(m.id);
  }

  const deleted: TrackedMsg[] = [];
  for (const [channelId, ids] of byChannel) {
    try {
      const ch = await member.guild.channels.fetch(channelId) as TextChannel;
      // bulkDelete requires 2–100 messages; handle singles separately
      if (ids.length === 1) {
        await ch.messages.delete(ids[0]!).catch(() => {});
        deleted.push(toDelete.find(m => m.id === ids[0])!);
      } else {
        const chunks = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        for (const chunk of chunks) {
          const res = await ch.bulkDelete(chunk, true).catch(() => null);
          if (res) {
            for (const id of res.keys()) {
              const m = toDelete.find(t => t.id === id);
              if (m) deleted.push(m);
            }
          }
        }
      }
    } catch {}
  }

  return deleted;
}

// Flattens whitespace, escapes backticks, and truncates for safe display inside
// a code span in an embed. Attachment-only messages have no text.
function sanitizeForLog(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!flat) return '*(no text — attachment/embed only)*';
  const clipped = flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
  return `\`${clipped.replace(/`/g, "'")}\``;
}

async function punish(
  member: GuildMember,
  reason: string,
  db: any,
  msgHistory: TrackedMsg[],
) {
  const guildId = member.guild.id;

  let timedOut = false;
  try {
    if (member.moderatable) {
      await member.timeout(TIMEOUT_MS, reason);
      timedOut = true;
    }
  } catch {}

  const deleted = await purgeHistory(member, msgHistory);

  // The images they posted (kept by the scam image check), shown inside the report
  const files: AttachmentBuilder[] = [];
  for (const m of deleted) {
    for (const img of peekImages(m.id)) {
      if (files.length < 4) files.push(new AttachmentBuilder(img.data, { name: `${files.length}-${img.name}`.replace(/[^\w.-]/g, '_') }));
    }
  }
  const sample = [...deleted].sort((a, b) => b.timestamp - a.timestamp).find(m => m.content.trim().length > 0);

  const [logCfg, modCfg] = await Promise.all([getLogConfig(guildId), db.getModConfig(guildId)]);
  const send = async (channelId: string, card: LogCardOptions) => {
    const ch = await member.guild.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    await ch?.send(logCard(card)).catch(() => {});
  };
  const report = (title: string): LogCardOptions => ({
    color: LogColor.orange,
    title,
    subtitle: member.user.username,
    thumbnail: member.user.displayAvatarURL({ size: 128 }),
    fields: [
      { name: 'Member', value: who(member.user), inline: true },
      { name: 'Action', value: timedOut ? '⏱️ 24-hour timeout' : '⚠️ Not timed out (their role is above mine)', inline: true },
      { name: 'Messages Removed', value: `${deleted.length}`, inline: true },
      { name: 'Why', value: quote(reason, 600) },
      sample && { name: 'Sample', value: quote(sample.content, 300) },
    ],
    images: files.map(f => ({ url: `attachment://${f.name}` })),
    files,
    footer: `🛡️ Spam detection · User ID ${member.id}`,
  });

  // Member log
  const memberLogId = logCfg?.member_log_channel_id ?? modCfg?.modlog_channel_id;
  if (memberLogId) await send(memberLogId, report('🚨 Spam Detected'));

  // Message log: everything that was removed
  const msgLogId = logCfg?.message_log_channel_id;
  if (msgLogId && deleted.length > 0) {
    const lines = deleted
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(m => `> <t:${Math.floor(m.timestamp / 1000)}:T> <#${m.channelId}> · ${sanitizeForLog(m.content)}`);
    await send(msgLogId, {
      color: LogColor.bad,
      title: `🧹 ${deleted.length} Message${deleted.length === 1 ? '' : 's'} Removed`,
      subtitle: `Spam purge · ${member.user.username}`,
      thumbnail: member.user.displayAvatarURL({ size: 128 }),
      fields: [
        { name: 'Member', value: who(member.user), inline: true },
        { name: 'Why', value: quote(reason, 400) },
        { name: 'Messages', value: lines.join('\n') },
      ],
      footer: `🛡️ Spam detection · User ID ${member.id}`,
    });
  }

  // Modlog, so a moderator looks at it
  if (modCfg?.modlog_channel_id && modCfg.modlog_channel_id !== memberLogId) {
    await send(modCfg.modlog_channel_id, { ...report('🚨 Spam Detected · Please Review'), color: LogColor.danger });
  }
}

const REPUNISH_GUARD_MS = 60_000; // one burst of spam gets one punishment

/** Punishes a post of a known scam image (our list or the shared one, matched by pHash). */
async function checkScamImages(msg: Message, member: GuildMember, track: UserTrack, pending: Promise<ImageFingerprint[]>, db: any) {
  try {
    const match = await findScamImage(await pending);
    if (!match || WARNING_RE.test(msg.content)) return; // someone warning others about it
    if (Date.now() - track.lastPunishedAt < REPUNISH_GUARD_MS) return;
    track.lastPunishedAt = Date.now();
    if (match.list === 'ours') await db.recordScamImageHit(match.entry.id);
    const history = [...track.msgHistory];
    track.msgHistory = [];
    track.imageChannels.clear();
    track.imagePosts = [];
    const where = match.list === 'ours'
      ? `#${match.entry.id} on our scam image list, ${match.distance}/256 bits apart`
      : `the shared scam image list (SomewhatDamaged/Scam-Images), score ${match.score}/10${match.part === 'whole' ? '' : ` on the ${match.part} half`}`;
    await punish(member, `Known scam image: matches ${where}`, db, history);
  } catch (err) {
    logger.error(`[spamdetect] scam image check failed: ${err}`);
  }
}

/** After the cross-channel image rule fires: remember images that showed up in 2+ of those channels. */
async function learnScamImages(posts: UserTrack['imagePosts'], guildId: string) {
  try {
    const resolved = await Promise.all(posts.map(async p => ({
      channelId: p.channelId,
      hashes: (await p.fingerprints).filter(f => f.part === 'whole').map(f => f.hash),
    })));
    const repeated = repeatedAcrossChannels(resolved);
    if (repeated.length) await addScamImages(repeated, 'auto', guildId);
  } catch (err) {
    logger.error(`[spamdetect] couldn't learn scam images: ${err}`);
  }
}

// Called from onInteraction.ts for every chat command — not a ClientEvents event,
// so it's a plain exported function rather than an EventModule handler. A raid
// script hammering slash commands trips the same timeout+purge+log pipeline as
// message spam. Returns true if the user was just punished (caller should abort).
export async function checkCommandSpam(interaction: ChatInputCommandInteraction, db: any): Promise<boolean> {
  if (!interaction.guildId) return false;
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const now = Date.now();
  const track = getTrack(interaction.guildId, interaction.user.id);
  track.recentCommands.push(now);
  track.recentCommands = track.recentCommands.filter(ts => now - ts <= CMD_RAPID_WINDOW_MS);

  if (track.recentCommands.length < CMD_RAPID_THRESHOLD) return false;

  const count = track.recentCommands.length;
  const history = [...track.msgHistory];
  track.recentCommands = [];
  track.msgHistory = [];
  await punish(member, `Command spam: ${count} slash commands in ${CMD_RAPID_WINDOW_MS / 1000} seconds`, db, history);
  return true;
}

const spamDetectModule: EventModule = {
  name: 'spamdetect',
  handlers: {
    messageCreate: async ({ data: [message], bot, db }) => {
      const msg = message as Message;
      if (!msg.guildId || msg.author.id === bot.user?.id) return; // never police the bot itself

      const member = msg.member as GuildMember | null;
      if (!member) return;

      // Manage Messages holders (staff, or a bot granted that role) skip the
      // noisier same-channel checks below — those are more prone to false
      // positives, so trusting elevated roles there is reasonable. They are
      // NOT exempt from the cross-channel check further down: identical text
      // or an identical link posted across several channels is never a
      // legitimate action, no matter who's doing it. A previous version of
      // this file exempted every bot-flagged account AND every Manage
      // Messages holder from all of this — meaning a hijacked account with
      // staff permissions, or a malicious/compromised bot, could spam a scam
      // link across the whole server with zero detection. This closes that.
      const trusted = member.permissions.has(PermissionFlagsBits.ManageMessages);

      const now = Date.now();
      const track = getTrack(msg.guildId, msg.author.id);
      const channelId = msg.channelId;

      // Track every message for history-based purge (keep last hour)
      track.msgHistory.push({ id: msg.id, channelId, timestamp: now, content: msg.content ?? '' });
      track.msgHistory = track.msgHistory.filter(m => now - m.timestamp <= MSG_HISTORY_MS);

      if (!trusted) {
        // ── Rapid-fire / repeated-content detection ────────────────────────────
        // Raw flood rate is a safety net (an enthusiastic person typing distinct
        // messages back to back can hit 3-4 in a few seconds — that's not spam).
        // The stronger signal is the *same* message posted over and over, which is
        // what real spam bots and copy-paste raids actually do.
        track.recentMessages.push(now);
        track.recentMessages = track.recentMessages.filter(ts => now - ts <= RAPID_WINDOW_MS);

        const normalizedContent = msg.content.trim().toLowerCase().replace(/\s+/g, ' ');
        track.recentContents.push({ content: normalizedContent, timestamp: now });
        track.recentContents = track.recentContents.filter(c => now - c.timestamp <= DUPLICATE_WINDOW_MS);
        const duplicateCount = normalizedContent.length >= 2
          ? track.recentContents.filter(c => c.content === normalizedContent).length
          : 0;

        const isFlooding = track.recentMessages.length >= RAPID_THRESHOLD;
        const isRepeating = duplicateCount >= DUPLICATE_THRESHOLD;

        if (isFlooding || isRepeating) {
          const reason = isRepeating
            ? `Repeated-message spam: sent the same message ${duplicateCount} times within ${DUPLICATE_WINDOW_MS / 1000} seconds`
            : `Rapid-fire spam: ${track.recentMessages.length} messages in ${RAPID_WINDOW_MS / 1000} seconds`;
          const history = [...track.msgHistory];
          track.recentMessages = [];
          track.recentContents = [];
          track.msgHistory = [];
          await punish(member, reason, db, history);
          return;
        }

        // ── Known scam images (pHash) ──────────────────────────────────────────
        // Fingerprinting downloads the image, so it runs alongside the checks
        // below instead of holding them up.
        if (msg.attachments.some(a => a.contentType?.startsWith('image/'))) {
          const fingerprints = fingerprintMessage(msg).catch(() => [] as ImageFingerprint[]);
          track.imagePosts.push({ channelId, timestamp: now, fingerprints });
          track.imagePosts = track.imagePosts.filter(p => now - p.timestamp <= WINDOW_MS);
          void checkScamImages(msg, member, track, fingerprints, db);
        }

        // ── Image spam detection ───────────────────────────────────────────────
        const hasImage = msg.attachments.some(a =>
          a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/')
        ) || msg.embeds.some(e => e.image || e.video || e.thumbnail);

        if (hasImage) {
          pruneWindow(track.imageChannels, now);
          if (!track.imageChannels.has(channelId)) {
            track.imageChannels.set(channelId, now);
          }
          if (track.imageChannels.size >= IMAGE_MIN_CHANNELS) {
            const channelList = [...track.imageChannels.keys()].map(id => `<#${id}>`).join(', ');
            const history = [...track.msgHistory];
            const posts = track.imagePosts;
            track.imageChannels.clear();
            track.msgHistory = [];
            track.imagePosts = [];
            if (now - track.lastPunishedAt < REPUNISH_GUARD_MS) return;
            track.lastPunishedAt = now;
            await punish(member, `Image spam: posted images in ${channelList} within ${WINDOW_MS / 1000} seconds`, db, history);
            await learnScamImages(posts, msg.guildId);
            return;
          }
        }
      }

      // ── Same-message / same-link cross-channel spam detection ───────────────
      // Applies to everyone, no exceptions — see the comment on `trusted` above.
      // Tracks both the exact message text AND any URLs found in it separately,
      // so a scam script that varies the surrounding wording per channel but
      // reuses the same link still gets caught.
      const content = msg.content.trim().toLowerCase();
      const urls = content.match(URL_RE) ?? [];
      const keys = [content.length >= 3 ? content : null, ...urls].filter((k): k is string => !!k);

      for (const key of keys) {
        if (!track.messageChannels.has(key)) track.messageChannels.set(key, new Set());
        const channels = track.messageChannels.get(key)!;
        channels.add(channelId);

        setTimeout(() => {
          const t = tracker.get(msg.guildId!)?.get(msg.author.id);
          const ch = t?.messageChannels.get(key);
          if (ch) {
            ch.delete(channelId);
            if (ch.size === 0) t!.messageChannels.delete(key);
          }
        }, CROSS_CHANNEL_WINDOW_MS);

        if (channels.size >= CROSS_CHANNEL_MIN_CHANNELS) {
          const channelList = [...channels].map(id => `<#${id}>`).join(', ');
          const history = [...track.msgHistory];
          track.messageChannels.clear();
          track.msgHistory = [];
          const kind = key === content ? 'message' : 'link';
          await punish(member, `Message spam: sent the same ${kind} in ${channelList} within ${CROSS_CHANNEL_WINDOW_MS / 1000} seconds`, db, history);
          return;
        }
      }
    },
  },
};

export default spamDetectModule;
