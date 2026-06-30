import { EmbedBuilder, GuildMember, Message, TextChannel, PermissionFlagsBits } from 'discord.js';
import { EventModule } from '../feature';
import { getLogConfig } from '../../utils/db.js';

const WINDOW_MS = 10_000;       // 10-second sliding window for cross-channel spam
const THRESHOLD = 3;            // more than 3 channels triggers action
const RAPID_WINDOW_MS = 5_000;  // 5-second window for rapid-fire detection
const RAPID_THRESHOLD = 3;      // 3+ messages in 5 seconds triggers action
const MSG_HISTORY_MS = 60 * 1000; // 1 minute — how far back to purge on spam
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

type TrackedMsg = { id: string; channelId: string; timestamp: number };

type UserTrack = {
  imageChannels: Map<string, number>;
  messageChannels: Map<string, Set<string>>;
  recentMessages: number[];
  msgHistory: TrackedMsg[];
};

// guildId -> userId -> track
const tracker = new Map<string, Map<string, UserTrack>>();

function getTrack(guildId: string, userId: string): UserTrack {
  if (!tracker.has(guildId)) tracker.set(guildId, new Map());
  const guild = tracker.get(guildId)!;
  if (!guild.has(userId)) guild.set(userId, { imageChannels: new Map(), messageChannels: new Map(), recentMessages: [], msgHistory: [] });
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

async function punish(
  member: GuildMember,
  reason: string,
  db: any,
  msgHistory: TrackedMsg[],
  triggeringMsg: Message,
) {
  const guildId = member.guild.id;

  // timeout
  try {
    if (member.moderatable) await member.timeout(TIMEOUT_MS, reason);
  } catch {}

  // purge last hour of messages
  const deleted = await purgeHistory(member, msgHistory);

  const [logCfg, modCfg] = await Promise.all([
    getLogConfig(guildId),
    db.getModConfig(guildId),
  ]);

  // ── Member log ───────────────────────────────────────────────────────────────
  const memberLogId = logCfg?.member_log_channel_id ?? modCfg?.modlog_channel_id;
  if (memberLogId) {
    try {
      const ch = await member.guild.channels.fetch(memberLogId) as TextChannel;
      const embed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle('🚨 Spam Detected — Auto Timeout')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: 'Action', value: '24-hour timeout', inline: true },
          { name: 'Reason', value: reason },
          { name: 'Messages Purged', value: `${deleted.length} messages deleted (last hour)`, inline: true },
        )
        .setTimestamp();
      await ch.send({ embeds: [embed] });
    } catch {}
  }

  // ── Message log — list deleted messages ──────────────────────────────────────
  const msgLogId = logCfg?.message_log_channel_id;
  if (msgLogId && deleted.length > 0) {
    try {
      const ch = await member.guild.channels.fetch(msgLogId) as TextChannel;

      // Build a summary; Discord embed values max 1024 chars each
      const lines = deleted
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(m => `<t:${Math.floor(m.timestamp / 1000)}:T> <#${m.channelId}> — \`${m.id}\``)
        .join('\n');

      const truncated = lines.length > 4000 ? lines.slice(0, 4000) + '\n…(truncated)' : lines;

      const embed = new EmbedBuilder()
        .setColor(0xFF8800)
        .setTitle(`🗑️ ${deleted.length} Messages Deleted — Spam Purge`)
        .setDescription(`**User:** <@${member.id}> (${member.user.tag})\n**Reason:** ${reason}\n\n${truncated}`)
        .setTimestamp();
      await ch.send({ embeds: [embed] });
    } catch {}
  }

  // ── Modlog (existing) ─────────────────────────────────────────────────────────
  if (modCfg?.modlog_channel_id && modCfg.modlog_channel_id !== memberLogId) {
    try {
      const modCh = await member.guild.channels.fetch(modCfg.modlog_channel_id) as TextChannel;
      const embed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle('🚨 Spam Detected — User Timed Out')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: 'Action', value: '24-hour timeout', inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();
      await modCh.send({ content: `🚨 Spam detected — please review <@${member.id}>.`, embeds: [embed] });
    } catch {}
  }
}

const spamDetectModule: EventModule = {
  name: 'spamdetect',
  handlers: {
    messageCreate: async ({ data: [message], db }) => {
      const msg = message as Message;
      if (!msg.guildId || msg.author?.bot) return;

      const member = msg.member as GuildMember | null;
      if (!member) return;

      if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const now = Date.now();
      const track = getTrack(msg.guildId, msg.author.id);
      const channelId = msg.channelId;

      // Track every message for history-based purge (keep last hour)
      track.msgHistory.push({ id: msg.id, channelId, timestamp: now });
      track.msgHistory = track.msgHistory.filter(m => now - m.timestamp <= MSG_HISTORY_MS);

      // ── Rapid-fire detection ──────────────────────────────────────────────────
      track.recentMessages.push(now);
      track.recentMessages = track.recentMessages.filter(ts => now - ts <= RAPID_WINDOW_MS);
      if (track.recentMessages.length >= RAPID_THRESHOLD) {
        const count = track.recentMessages.length;
        const history = [...track.msgHistory];
        track.recentMessages = [];
        track.msgHistory = [];
        await punish(member, `Rapid-fire spam: ${count} messages in 5 seconds`, db, history, msg);
        return;
      }

      // ── Image spam detection ─────────────────────────────────────────────────
      const hasImage = msg.attachments.some(a =>
        a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/')
      ) || msg.embeds.some(e => e.image || e.video || e.thumbnail);

      if (hasImage) {
        pruneWindow(track.imageChannels, now);
        if (!track.imageChannels.has(channelId)) {
          track.imageChannels.set(channelId, now);
        }
        if (track.imageChannels.size > THRESHOLD) {
          const channelList = [...track.imageChannels.keys()].map(id => `<#${id}>`).join(', ');
          const history = [...track.msgHistory];
          track.imageChannels.clear();
          track.msgHistory = [];
          await punish(member, `Image spam: posted images in ${channelList} within 10 seconds`, db, history, msg);
          return;
        }
      }

      // ── Same-message cross-channel spam detection ─────────────────────────────
      const content = msg.content.trim().toLowerCase();
      if (content.length < 3) return;

      if (!track.messageChannels.has(content)) {
        track.messageChannels.set(content, new Set());
      }
      const channels = track.messageChannels.get(content)!;
      channels.add(channelId);

      setTimeout(() => {
        const t = tracker.get(msg.guildId!)?.get(msg.author.id);
        if (t) {
          const ch = t.messageChannels.get(content);
          if (ch) ch.delete(channelId);
          if (ch?.size === 0) t.messageChannels.delete(content);
        }
      }, WINDOW_MS);

      if (channels.size > THRESHOLD) {
        const channelList = [...channels].map(id => `<#${id}>`).join(', ');
        const history = [...track.msgHistory];
        track.messageChannels.clear();
        track.msgHistory = [];
        await punish(member, `Message spam: sent the same message in ${channelList} within 10 seconds`, db, history, msg);
      }
    },
  },
};

export default spamDetectModule;
