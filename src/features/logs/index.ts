import {
  AttachmentBuilder, AuditLogEvent, ChatInputCommandInteraction, Guild, GuildChannel, GuildVerificationLevel,
  PartialUser, TextChannel, User,
} from 'discord.js';
import { EventModule } from '../feature';
import type * as Db from '../../utils/db';
import { isBotDeleting } from '../../utils/deleteMessages';
import { LogColor, ago, channelTypeName, logCard, quote, truncate, who, type LogCardOptions } from '../../utils/logCard';
import { peekImages } from '../../utils/recentImages';

type LogCategory = 'member' | 'message' | 'voice' | 'server' | 'command';

function resolveChannelId(cfg: Db.ILogConfig, category: LogCategory): string | null {
  switch (category) {
    case 'member':  return cfg.member_log_channel_id || cfg.channel_id || null;
    case 'message': return cfg.message_log_channel_id || cfg.channel_id || null;
    case 'voice':   return cfg.voice_log_channel_id || cfg.channel_id || null;
    case 'server':  return cfg.server_log_channel_id || cfg.channel_id || null;
    case 'command': return cfg.command_log_channel_id || cfg.channel_id || null;
  }
}

async function getLogChannel(bot: any, channelId: string | null): Promise<TextChannel | null> {
  if (!channelId) return null;
  try {
    const ch = await bot.channels.fetch(channelId);
    return ch instanceof TextChannel ? ch : null;
  } catch {
    return null;
  }
}

const post = (ch: TextChannel, card: LogCardOptions) => ch.send(logCard(card)).catch(() => {});

// Correlates an event with a recent matching audit-log entry to attribute WHO
// did it and WHY. Audit-log entries only exist for moderator/bot actions
// taken against someone else — a message someone deletes themselves, or a
// member who leaves voluntarily, never produces one, so a null return
// usually just means "no one else was involved," not a failed lookup. Also
// returns null (silently) if the bot lacks View Audit Log.
async function findAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId: string,
  withinMs = 10_000,
): Promise<{ executor: User | PartialUser | null; reason: string | null } | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find(e => e.targetId === targetId && Date.now() - e.createdTimestamp < withinMs);
    return entry ? { executor: entry.executor, reason: entry.reason } : null;
  } catch {
    return null;
  }
}

// Renders a chat command invocation into a short "/command sub opt:val" string for logging.
function describeCommand(interaction: ChatInputCommandInteraction): string {
  const parts = [interaction.commandName];
  const group = interaction.options.getSubcommandGroup(false);
  if (group) parts.push(group);
  const sub = interaction.options.getSubcommand(false);
  if (sub) parts.push(sub);
  let cmd = `/${parts.join(' ')}`;
  const opts = (interaction.options as any).data as Array<{ name: string; value?: unknown; options?: unknown[] }> | undefined;
  const flat = (opts ?? []).flatMap(function walk(o: any): any[] {
    return o.options ? o.options.flatMap(walk) : [o];
  });
  const optStr = flat
    .filter(o => o.value !== undefined)
    .map(o => `${o.name}:${String(o.value).slice(0, 80)}`)
    .join(' ');
  if (optStr) cmd += ` ${optStr}`;
  return cmd.slice(0, 400);
}

const NEW_ACCOUNT_MS = 3 * 24 * 60 * 60_000; // same age the raid detection watches for
const VERIFICATION: Record<GuildVerificationLevel, string> = {
  [GuildVerificationLevel.None]: 'None', [GuildVerificationLevel.Low]: 'Low', [GuildVerificationLevel.Medium]: 'Medium',
  [GuildVerificationLevel.High]: 'High', [GuildVerificationLevel.VeryHigh]: 'Highest',
};
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/**
 * The deleted message's images, to show inside the log card. Discord removes
 * attachments on delete, so these come from the copies the scam image check
 * kept, or (for a few seconds after a delete) Discord's media proxy cache.
 */
async function deletedImages(messageId: string, attachments: { name: string; proxyURL: string; size: number }[]) {
  const files: AttachmentBuilder[] = [];
  const kept = peekImages(messageId);
  for (const a of attachments.filter(a => IMAGE_EXT.test(a.name)).slice(0, 4)) {
    let data = kept.find(k => k.name === a.name)?.data;
    if (!data && a.size <= 8 * 1024 * 1024) {
      data = await fetch(a.proxyURL, { signal: AbortSignal.timeout(4_000) })
        .then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? Buffer.from(b) : undefined)).catch(() => undefined);
    }
    if (data) files.push(new AttachmentBuilder(data, { name: `${files.length}-${a.name}`.replace(/[^\w.-]/g, '_') }));
  }
  return files;
}

// Called from onInteraction.ts for every successfully-dispatched slash command —
// not tied to a ClientEvents event, so it's a plain exported function rather than
// an EventModule handler.
export async function logCommandUsage(interaction: ChatInputCommandInteraction, db: typeof Db): Promise<void> {
  if (!interaction.guildId) return;
  const cfg = await db.getLogConfig(interaction.guildId);
  if (!cfg?.log_commands) return;
  const ch = await getLogChannel(interaction.client, resolveChannelId(cfg, 'command'));
  if (!ch) return;
  await post(ch, {
    color: LogColor.neutral,
    title: '⌨️ Command Used',
    subtitle: interaction.user.username,
    fields: [
      { name: 'User', value: who(interaction.user), inline: true },
      { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
      { name: 'Command', value: `\`${describeCommand(interaction).replace(/`/g, "'")}\`` },
    ],
    footer: `User ID ${interaction.user.id}`,
  });
}

const logsModule: EventModule = {
  name: 'logs',
  handlers: {
    guildMemberAdd: async ({ data: [member], bot, db }) => {
      const cfg = await db.getLogConfig(member.guild.id);
      if (!cfg?.log_joins) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const isNew = Date.now() - member.user.createdTimestamp < NEW_ACCOUNT_MS;
      await post(ch, {
        color: LogColor.good,
        title: '📥 Member Joined',
        subtitle: member.user.username,
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Member', value: who(member.user), inline: true },
          { name: 'Account Created', value: `${ago(member.user.createdTimestamp)}${isNew ? ' 🆕 **new account**' : ''}`, inline: true },
          { name: 'Member Count', value: member.guild.memberCount.toLocaleString(), inline: true },
          member.user.bot && { name: 'Type', value: '🤖 Bot', inline: true },
        ],
        footer: `User ID ${member.id}`,
      });
    },

    guildMemberRemove: async ({ data: [member], bot, db }) => {
      const cfg = await db.getLogConfig(member.guild.id);
      if (!cfg?.log_leaves) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;

      // A kick fires the same guildMemberRemove event as a voluntary leave —
      // the only way to tell them apart is a matching MemberKick audit-log entry.
      const kick = await findAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);

      const roles = member.roles.cache.filter(r => r.id !== member.guild.id);
      const rolesValue = roles.size
        ? [...roles.values()].slice(0, 20).map(r => `<@&${r.id}>`).join(' ') + (roles.size > 20 ? ` *+${roles.size - 20} more*` : '')
        : '';

      await post(ch, {
        color: kick ? LogColor.orange : LogColor.bad,
        title: kick ? '👢 Member Kicked' : '📤 Member Left',
        subtitle: member.user.username,
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Member', value: who(member.user), inline: true },
          { name: 'Joined', value: member.joinedTimestamp ? ago(member.joinedTimestamp) : '*Unknown*', inline: true },
          { name: 'Account Created', value: ago(member.user.createdTimestamp), inline: true },
          kick && { name: 'Reason', value: kick.reason ?? 'No reason given', inline: true },
          rolesValue && { name: `Roles (${roles.size})`, value: rolesValue },
        ],
        footer: kick ? `👢 Kicked by ${kick.executor?.username ?? 'unknown'} · User ID ${member.id}` : `User ID ${member.id}`,
      });
    },

    guildMemberUpdate: async ({ data: [oldMember, newMember], bot, db }) => {
      const cfg = await db.getLogConfig(newMember.guild.id);
      if (!cfg?.enabled) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;

      if (cfg.log_nickname_changes && oldMember.nickname !== newMember.nickname) {
        const by = await findAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        const byOther = by?.executor && by.executor.id !== newMember.id ? by.executor : null;
        await post(ch, {
          color: LogColor.warn,
          title: '✏️ Nickname Changed',
          subtitle: newMember.user.username,
          thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
          fields: [
            { name: 'Member', value: who(newMember.user), inline: true },
            { name: 'Before', value: oldMember.nickname ?? '*none*', inline: true },
            { name: 'After', value: newMember.nickname ?? '*none*', inline: true },
          ],
          footer: byOther ? `✏️ Changed by ${byOther.username} · User ID ${newMember.id}` : `User ID ${newMember.id}`,
        });
      }

      if (cfg.log_role_changes) {
        const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        if (added.size || removed.size) {
          const by = await findAuditEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
          await post(ch, {
            color: LogColor.info,
            title: '🎭 Roles Updated',
            subtitle: newMember.user.username,
            thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
            fields: [
              { name: 'Member', value: who(newMember.user), inline: true },
              added.size > 0 && { name: 'Added', value: added.map(r => `<@&${r.id}>`).join(' '), inline: true },
              removed.size > 0 && { name: 'Removed', value: removed.map(r => `<@&${r.id}>`).join(' '), inline: true },
            ],
            footer: by?.executor ? `🎭 Changed by ${by.executor.username} · User ID ${newMember.id}` : `User ID ${newMember.id}`,
          });
        }
      }
    },

    userUpdate: async ({ data: [oldUser, newUser], bot, db }) => {
      const usernameChanged = oldUser.username !== newUser.username;
      const avatarChanged = oldUser.avatar !== newUser.avatar;
      if (!usernameChanged && !avatarChanged) return;

      for (const guild of bot.guilds.cache.values()) {
        if (!guild.members.cache.has(newUser.id)) continue;
        const cfg = await db.getLogConfig(guild.id);
        if (!cfg?.log_member_profile) continue;
        const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
        if (!ch) continue;

        if (usernameChanged) {
          await post(ch, {
            color: LogColor.warn,
            title: '🪪 Username Changed',
            subtitle: newUser.username,
            thumbnail: newUser.displayAvatarURL({ size: 128 }),
            fields: [
              { name: 'Member', value: who(newUser), inline: true },
              { name: 'Before', value: oldUser.username ?? '*unknown*', inline: true },
              { name: 'After', value: newUser.username, inline: true },
            ],
            footer: `User ID ${newUser.id}`,
          });
        }

        if (avatarChanged) {
          await post(ch, {
            color: LogColor.warn,
            title: '🖼️ Avatar Changed',
            subtitle: newUser.username,
            fields: [{ name: 'Member', value: who(newUser), inline: true }],
            images: [{ url: newUser.displayAvatarURL({ size: 512 }), description: 'New avatar' }],
            footer: `User ID ${newUser.id}`,
          });
        }
      }
    },

    messageUpdate: async ({ data: [oldMessage, newMessage], bot, db }) => {
      if (!newMessage.guildId || newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;
      const cfg = await db.getLogConfig(newMessage.guildId);
      if (!cfg?.log_message_edits) return;
      const ignored: string[] = cfg.ignored_channels ? JSON.parse(cfg.ignored_channels) : [];
      if (ignored.includes(newMessage.channelId)) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'message'));
      if (!ch) return;
      await post(ch, {
        color: LogColor.warn,
        title: '✏️ Message Edited',
        subtitle: newMessage.author?.username,
        thumbnail: newMessage.author?.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
          { name: 'Author', value: who(newMessage.author), inline: true },
          newMessage.createdTimestamp > 0 && { name: 'Sent', value: ago(newMessage.createdTimestamp), inline: true },
          { name: 'Before', value: oldMessage.partial ? '> *Not cached, so the old text is unknown*' : quote(oldMessage.content ?? '') },
          { name: 'After', value: quote(newMessage.content ?? '') },
        ],
        footer: `Message ID ${newMessage.id} · User ID ${newMessage.author?.id}`,
        links: [{ label: 'Jump to message', url: newMessage.url }],
      });
    },

    messageDelete: async ({ data: [message], bot, db }) => {
      if (!message.guildId || message.author?.bot) return;
      if (isBotDeleting(message.id)) return; // part of a /purge or poll-archive wipe
      const cfg = await db.getLogConfig(message.guildId);
      if (!cfg?.log_message_deletes) return;
      const ignored: string[] = cfg.ignored_channels ? JSON.parse(cfg.ignored_channels) : [];
      if (ignored.includes(message.channelId)) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'message'));
      if (!ch) return;

      const guild = message.guild ?? (message.guildId ? bot.guilds.cache.get(message.guildId) : null);
      const deleter = guild && message.author ? await findAuditEntry(guild, AuditLogEvent.MessageDelete, message.author.id) : null;

      const attachments = [...message.attachments.values()];
      const files = await deletedImages(message.id, attachments);
      const shown = new Set(files.map(f => f.name!.replace(/^\d+-/, '')));
      const notShown = attachments.filter(a => !shown.has(a.name.replace(/[^\w.-]/g, '_')));

      await post(ch, {
        color: LogColor.bad,
        title: '🗑️ Message Deleted',
        subtitle: message.author?.username,
        thumbnail: message.author?.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
          { name: 'Author', value: who(message.author), inline: true },
          !message.partial && message.createdTimestamp > 0 && { name: 'Sent', value: ago(message.createdTimestamp), inline: true },
          deleter?.reason && { name: 'Reason', value: deleter.reason, inline: true },
          message.partial
            ? { name: 'Content', value: '> *Not cached, so the content is unknown*' }
            : message.content && { name: 'Content', value: quote(message.content) },
          attachments.length > 0 && {
            name: `${attachments.length} Attachment${attachments.length === 1 ? '' : 's'}`,
            value: notShown.length
              ? notShown.map(a => `> 📎 ${truncate(a.name, 80)}${IMAGE_EXT.test(a.name) ? ' *(image already gone)*' : ''}`).join('\n')
              : '',
          },
        ],
        images: files.map(f => ({ url: `attachment://${f.name}`, description: f.name!.replace(/^\d+-/, '') })),
        files,
        footer: `${deleter?.executor ? `🗑️ Deleted by ${deleter.executor.username}` : '🗑️ Deleted by the author'} · Message ID ${message.id}`,
      });
    },

    messageDeleteBulk: async ({ data: [messages, channel], bot, db }) => {
      const cfg = await db.getLogConfig(channel.guild.id);
      if (!cfg?.log_message_deletes) return;
      const ignored: string[] = cfg.ignored_channels ? JSON.parse(cfg.ignored_channels) : [];
      if (ignored.includes(channel.id)) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'message'));
      if (!ch) return;

      const deleter = await findAuditEntry(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id);
      const authors = new Map<string, number>();
      for (const m of messages.values()) if (m.author) authors.set(m.author.id, (authors.get(m.author.id) ?? 0) + 1);
      const top = [...authors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

      await post(ch, {
        color: LogColor.bad,
        title: '🧹 Messages Bulk Deleted',
        description: `**${messages.size}** messages removed from <#${channel.id}>`,
        fields: [
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          deleter?.reason && { name: 'Reason', value: deleter.reason, inline: true },
          top.length > 0 && { name: 'From', value: top.map(([id, n]) => `> <@${id}> · ${n}`).join('\n') },
        ],
        footer: deleter?.executor ? `🧹 Deleted by ${deleter.executor.username}` : '🧹 Deleted by a bot or automated action',
      });
    },

    guildBanAdd: async ({ data: [ban], bot, db }) => {
      const cfg = await db.getLogConfig(ban.guild.id);
      if (!cfg?.log_bans) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const by = await findAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      await post(ch, {
        color: LogColor.danger,
        title: '🔨 Member Banned',
        subtitle: ban.user.username,
        thumbnail: ban.user.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Member', value: who(ban.user), inline: true },
          { name: 'Account Created', value: ago(ban.user.createdTimestamp), inline: true },
          { name: 'Reason', value: by?.reason ?? ban.reason ?? 'No reason given', inline: true },
        ],
        footer: by?.executor ? `🔨 Banned by ${by.executor.username} · User ID ${ban.user.id}` : `User ID ${ban.user.id}`,
      });
    },

    guildBanRemove: async ({ data: [ban], bot, db }) => {
      const cfg = await db.getLogConfig(ban.guild.id);
      if (!cfg?.log_bans) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const by = await findAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
      await post(ch, {
        color: LogColor.good,
        title: '🕊️ Member Unbanned',
        subtitle: ban.user.username,
        thumbnail: ban.user.displayAvatarURL({ size: 128 }),
        fields: [
          { name: 'Member', value: who(ban.user), inline: true },
          by?.reason && { name: 'Reason', value: by.reason, inline: true },
        ],
        footer: by?.executor ? `🕊️ Unbanned by ${by.executor.username} · User ID ${ban.user.id}` : `User ID ${ban.user.id}`,
      });
    },

    voiceStateUpdate: async ({ data: [oldState, newState], bot, db }) => {
      const guildId = newState.guild?.id ?? oldState.guild?.id;
      if (!guildId) return;
      const cfg = await db.getLogConfig(guildId);
      if (!cfg?.log_voice_events) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'voice'));
      if (!ch) return;

      const member = newState.member ?? oldState.member;
      const base = {
        subtitle: member?.user.username,
        thumbnail: member?.user.displayAvatarURL({ size: 128 }),
        footer: `User ID ${newState.id}`,
      };
      const memberField = { name: 'Member', value: member ? who(member.user) : `<@${newState.id}>`, inline: true };

      if (!oldState.channelId && newState.channelId) {
        await post(ch, { ...base, color: LogColor.good, title: '🔊 Joined Voice',
          fields: [memberField, { name: 'Channel', value: `<#${newState.channelId}>`, inline: true }] });
      } else if (oldState.channelId && !newState.channelId) {
        await post(ch, { ...base, color: LogColor.bad, title: '🔇 Left Voice',
          fields: [memberField, { name: 'Channel', value: `<#${oldState.channelId}>`, inline: true }] });
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        await post(ch, { ...base, color: LogColor.warn, title: '🔀 Switched Voice',
          fields: [memberField, { name: 'From', value: `<#${oldState.channelId}>`, inline: true }, { name: 'To', value: `<#${newState.channelId}>`, inline: true }] });
      }
    },

    emojiCreate: async ({ data: [emoji], bot, db }) => {
      const cfg = await db.getLogConfig(emoji.guild.id);
      if (!cfg?.log_emoji_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const by = await findAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
      await post(ch, {
        color: LogColor.good,
        title: '😀 Emoji Added',
        thumbnail: emoji.imageURL(),
        fields: [{ name: 'Emoji', value: `${emoji.toString()} \`:${emoji.name}:\``, inline: true }],
        footer: by?.executor ? `😀 Added by ${by.executor.username} · Emoji ID ${emoji.id}` : `Emoji ID ${emoji.id}`,
      });
    },

    emojiDelete: async ({ data: [emoji], bot, db }) => {
      const cfg = await db.getLogConfig(emoji.guild.id);
      if (!cfg?.log_emoji_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const by = await findAuditEntry(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
      await post(ch, {
        color: LogColor.bad,
        title: '😶 Emoji Removed',
        thumbnail: emoji.imageURL(),
        fields: [{ name: 'Emoji', value: `\`:${emoji.name}:\``, inline: true }],
        footer: by?.executor ? `😶 Removed by ${by.executor.username} · Emoji ID ${emoji.id}` : `Emoji ID ${emoji.id}`,
      });
    },

    emojiUpdate: async ({ data: [oldEmoji, newEmoji], bot, db }) => {
      if (oldEmoji.name === newEmoji.name) return;
      const cfg = await db.getLogConfig(newEmoji.guild.id);
      if (!cfg?.log_emoji_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      await post(ch, {
        color: LogColor.warn,
        title: '✏️ Emoji Renamed',
        thumbnail: newEmoji.imageURL(),
        fields: [
          { name: 'Emoji', value: newEmoji.toString(), inline: true },
          { name: 'Before', value: `\`:${oldEmoji.name}:\``, inline: true },
          { name: 'After', value: `\`:${newEmoji.name}:\``, inline: true },
        ],
        footer: `Emoji ID ${newEmoji.id}`,
      });
    },

    guildUpdate: async ({ data: [oldGuild, newGuild], bot, db }) => {
      const cfg = await db.getLogConfig(newGuild.id);
      if (!cfg?.log_server_updates) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;

      const changes = [
        oldGuild.name !== newGuild.name && { name: 'Name', value: `${oldGuild.name} → **${newGuild.name}**`, inline: true },
        oldGuild.icon !== newGuild.icon && { name: 'Icon', value: newGuild.icon ? 'New icon' : 'Removed', inline: true },
        oldGuild.banner !== newGuild.banner && { name: 'Banner', value: newGuild.banner ? 'New banner' : 'Removed', inline: true },
        oldGuild.verificationLevel !== newGuild.verificationLevel && {
          name: 'Verification', value: `${VERIFICATION[oldGuild.verificationLevel]} → **${VERIFICATION[newGuild.verificationLevel]}**`, inline: true,
        },
        oldGuild.description !== newGuild.description && {
          name: 'Description', value: `${quote(oldGuild.description ?? '*none*', 400)}\n→\n${quote(newGuild.description ?? '*none*', 400)}`,
        },
      ].filter(Boolean);
      if (!changes.length) return;

      const by = await findAuditEntry(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
      await post(ch, {
        color: LogColor.info,
        title: '⚙️ Server Updated',
        thumbnail: newGuild.iconURL({ size: 128 }),
        fields: changes,
        images: oldGuild.banner !== newGuild.banner && newGuild.banner ? [{ url: newGuild.bannerURL({ size: 1024 })!, description: 'New banner' }] : [],
        footer: by?.executor ? `⚙️ Changed by ${by.executor.username}` : `Server ID ${newGuild.id}`,
      });
    },

    channelCreate: async ({ data: [channel], bot, db }) => {
      if (!(channel instanceof GuildChannel)) return;
      const cfg = await db.getLogConfig(channel.guild.id);
      if (!cfg?.log_channel_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const by = await findAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      await post(ch, {
        color: LogColor.good,
        title: '➕ Channel Created',
        fields: [
          { name: 'Channel', value: `<#${channel.id}> · ${channel.name}`, inline: true },
          { name: 'Type', value: channelTypeName(channel.type), inline: true },
          channel.parent && { name: 'Category', value: channel.parent.name, inline: true },
        ],
        footer: by?.executor ? `➕ Created by ${by.executor.username} · Channel ID ${channel.id}` : `Channel ID ${channel.id}`,
      });
    },

    channelDelete: async ({ data: [channel], bot, db }) => {
      if (!(channel instanceof GuildChannel)) return;
      const cfg = await db.getLogConfig(channel.guild.id);
      if (!cfg?.log_channel_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const by = await findAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      await post(ch, {
        color: LogColor.bad,
        title: '➖ Channel Deleted',
        fields: [
          { name: 'Channel', value: `#${channel.name}`, inline: true },
          { name: 'Type', value: channelTypeName(channel.type), inline: true },
          channel.parent && { name: 'Category', value: channel.parent.name, inline: true },
        ],
        footer: by?.executor ? `➖ Deleted by ${by.executor.username} · Channel ID ${channel.id}` : `Channel ID ${channel.id}`,
      });
    },
  },
};

export default logsModule;

/** Sample cards for /config logs preview, built from the person asking. */
export function sampleLogCards(user: User, guildId: string, channelId: string): LogCardOptions[] {
  const avatar = user.displayAvatarURL({ size: 128 });
  const now = Date.now();
  const link = `https://discord.com/channels/${guildId}/${channelId}`;
  return [
    {
      color: LogColor.good, title: '📥 Member Joined', subtitle: user.username, thumbnail: avatar,
      fields: [
        { name: 'Member', value: who(user), inline: true },
        { name: 'Account Created', value: `${ago(now - 2 * 86_400_000)} 🆕 **new account**`, inline: true },
        { name: 'Member Count', value: '1,234', inline: true },
      ],
      footer: `User ID ${user.id}`,
    },
    {
      color: LogColor.bad, title: '🗑️ Message Deleted', subtitle: user.username, thumbnail: avatar,
      fields: [
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
        { name: 'Author', value: who(user), inline: true },
        { name: 'Sent', value: ago(now - 4 * 60_000), inline: true },
        { name: 'Content', value: quote('check out this picture') },
      ],
      images: [{ url: user.displayAvatarURL({ size: 512 }), description: 'image.png' }],
      footer: `🗑️ Deleted by a moderator · Message ID 123456789012345678`,
    },
    {
      color: LogColor.warn, title: '✏️ Message Edited', subtitle: user.username, thumbnail: avatar,
      fields: [
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
        { name: 'Author', value: who(user), inline: true },
        { name: 'Before', value: quote('see you at 7') },
        { name: 'After', value: quote('see you at 8 actually') },
      ],
      footer: `Message ID 123456789012345678 · User ID ${user.id}`,
      links: [{ label: 'Jump to message', url: link }],
    },
    {
      color: LogColor.danger, title: '🔨 Member Banned', subtitle: user.username, thumbnail: avatar,
      fields: [
        { name: 'Member', value: who(user), inline: true },
        { name: 'Account Created', value: ago(now - 400 * 86_400_000), inline: true },
        { name: 'Reason', value: 'Posting scam links', inline: true },
      ],
      footer: `🔨 Banned by a moderator · User ID ${user.id}`,
    },
    {
      color: LogColor.orange, title: '🚨 Spam Detected', subtitle: user.username, thumbnail: avatar,
      fields: [
        { name: 'Member', value: who(user), inline: true },
        { name: 'Action', value: '⏱️ 24-hour timeout', inline: true },
        { name: 'Messages Removed', value: '3', inline: true },
        { name: 'Why', value: quote('Known scam image: matches the shared scam image list (SomewhatDamaged/Scam-Images), score 10/10') },
      ],
      footer: `🛡️ Spam detection · User ID ${user.id}`,
    },
  ];
}
