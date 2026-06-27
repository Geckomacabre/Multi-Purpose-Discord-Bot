import { EmbedBuilder, GuildMember, Message, TextChannel, PermissionFlagsBits } from 'discord.js';
import { EventModule } from '../feature';

const WINDOW_MS = 10_000;   // 10-second sliding window
const THRESHOLD = 3;        // more than 3 channels triggers action
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

type UserTrack = {
  // channelId -> timestamp of first message there in this window
  imageChannels: Map<string, number>;
  // normalized message content -> set of channelIds
  messageChannels: Map<string, Set<string>>;
};

// guildId -> userId -> track
const tracker = new Map<string, Map<string, UserTrack>>();

function getTrack(guildId: string, userId: string): UserTrack {
  if (!tracker.has(guildId)) tracker.set(guildId, new Map());
  const guild = tracker.get(guildId)!;
  if (!guild.has(userId)) guild.set(userId, { imageChannels: new Map(), messageChannels: new Map() });
  return guild.get(userId)!;
}

function pruneWindow(map: Map<string, number>, now: number) {
  for (const [k, ts] of map) {
    if (now - ts > WINDOW_MS) map.delete(k);
  }
}

async function punish(member: GuildMember, reason: string, db: any) {
  const guildId = member.guild.id;

  // Timeout for 24h
  try {
    if (member.moderatable) {
      await member.timeout(TIMEOUT_MS, reason);
    }
  } catch {}

  // Alert in modlog channel
  try {
    const cfg = await db.getModConfig(guildId);
    if (!cfg?.modlog_channel_id) return;
    const modCh = await member.guild.channels.fetch(cfg.modlog_channel_id) as TextChannel;
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

const spamDetectModule: EventModule = {
  name: 'spamdetect',
  handlers: {
    messageCreate: async ({ data: [message], db }) => {
      const msg = message as Message;
      if (!msg.guildId || msg.author?.bot) return;

      const member = msg.member as GuildMember | null;
      if (!member) return;

      // Never punish admins / mods with manage messages
      if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const now = Date.now();
      const track = getTrack(msg.guildId, msg.author.id);
      const channelId = msg.channelId;

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
          track.imageChannels.clear();
          await msg.delete().catch(() => {});
          await punish(member, `Image spam: posted images in ${channelList} within 10 seconds`, db);
          return;
        }
      }

      // ── Same-message spam detection ──────────────────────────────────────────
      const content = msg.content.trim().toLowerCase();
      if (content.length < 3) return;

      if (!track.messageChannels.has(content)) {
        track.messageChannels.set(content, new Set());
      }
      const channels = track.messageChannels.get(content)!;
      channels.add(channelId);

      // Clean up old message entries (keep only if seen in last window)
      // We use a simple count — entries older than WINDOW_MS are flushed per message
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
        track.messageChannels.clear();
        await msg.delete().catch(() => {});
        await punish(member, `Message spam: sent the same message in ${channelList} within 10 seconds`, db);
      }
    },
  },
};

export default spamDetectModule;
