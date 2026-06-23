import { Colors, EmbedBuilder, GuildChannel, TextChannel } from 'discord.js';
import { EventModule } from '../feature';
import type * as Db from '../../utils/db';

type LogCategory = 'member' | 'message' | 'voice' | 'server';

function resolveChannelId(cfg: Db.ILogConfig, category: LogCategory): string | null {
  switch (category) {
    case 'member':  return cfg.member_log_channel_id || cfg.channel_id || null;
    case 'message': return cfg.message_log_channel_id || cfg.channel_id || null;
    case 'voice':   return cfg.voice_log_channel_id || cfg.channel_id || null;
    case 'server':  return cfg.server_log_channel_id || cfg.channel_id || null;
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

const logsModule: EventModule = {
  name: 'logs',
  handlers: {
    guildMemberAdd: async ({ data: [member], bot, db }) => {
      const cfg = await db.getLogConfig(member.guild.id);
      if (!cfg?.log_joins) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Member Joined')
        .setThumbnail(member.user.displayAvatarURL())
        .setDescription(`<@${member.id}> **${member.user.tag}**`)
        .addFields({ name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` })
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    guildMemberRemove: async ({ data: [member], bot, db }) => {
      const cfg = await db.getLogConfig(member.guild.id);
      if (!cfg?.log_leaves) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Member Left')
        .setThumbnail(member.user.displayAvatarURL())
        .setDescription(`<@${member.id}> **${member.user.tag}**`)
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    guildMemberUpdate: async ({ data: [oldMember, newMember], bot, db }) => {
      const cfg = await db.getLogConfig(newMember.guild.id);
      if (!cfg?.enabled) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;

      if (cfg.log_nickname_changes && oldMember.nickname !== newMember.nickname) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Yellow)
          .setTitle('Nickname Changed')
          .setDescription(`<@${newMember.id}> **${newMember.user.tag}**`)
          .addFields(
            { name: 'Before', value: oldMember.nickname ?? '*none*', inline: true },
            { name: 'After', value: newMember.nickname ?? '*none*', inline: true }
          )
          .setFooter({ text: `ID: ${newMember.id}` })
          .setTimestamp();
        await ch.send({ embeds: [embed] }).catch(() => {});
      }

      if (cfg.log_role_changes) {
        const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        if (added.size || removed.size) {
          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Roles Updated')
            .setDescription(`<@${newMember.id}> **${newMember.user.tag}**`)
            .setFooter({ text: `ID: ${newMember.id}` })
            .setTimestamp();
          if (added.size) embed.addFields({ name: 'Added', value: added.map(r => `<@&${r.id}>`).join(', ') });
          if (removed.size) embed.addFields({ name: 'Removed', value: removed.map(r => `<@&${r.id}>`).join(', ') });
          await ch.send({ embeds: [embed] }).catch(() => {});
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
          const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('Username Changed')
            .setThumbnail(newUser.displayAvatarURL())
            .setDescription(`<@${newUser.id}>`)
            .addFields(
              { name: 'Before', value: oldUser.username ?? '*unknown*', inline: true },
              { name: 'After', value: newUser.username, inline: true }
            )
            .setFooter({ text: `ID: ${newUser.id}` })
            .setTimestamp();
          await ch.send({ embeds: [embed] }).catch(() => {});
        }

        if (avatarChanged) {
          const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('Avatar Changed')
            .setDescription(`<@${newUser.id}> **${newUser.username}**`)
            .setThumbnail(newUser.displayAvatarURL({ size: 256 }))
            .setFooter({ text: `ID: ${newUser.id}` })
            .setTimestamp();
          await ch.send({ embeds: [embed] }).catch(() => {});
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
      const embed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle('Message Edited')
        .setDescription(`<@${newMessage.author?.id}> in <#${newMessage.channelId}>\n[Jump to message](${newMessage.url})`)
        .addFields(
          { name: 'Before', value: (oldMessage.content || '*empty*').slice(0, 1024) },
          { name: 'After', value: (newMessage.content || '*empty*').slice(0, 1024) }
        )
        .setFooter({ text: `User: ${newMessage.author?.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    messageDelete: async ({ data: [message], bot, db }) => {
      if (!message.guildId || message.author?.bot) return;
      const cfg = await db.getLogConfig(message.guildId);
      if (!cfg?.log_message_deletes) return;
      const ignored: string[] = cfg.ignored_channels ? JSON.parse(cfg.ignored_channels) : [];
      if (ignored.includes(message.channelId)) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'message'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Message Deleted')
        .setDescription(`<@${message.author?.id}> in <#${message.channelId}>`)
        .addFields({ name: 'Content', value: (message.content || '*empty*').slice(0, 1024) })
        .setFooter({ text: `User: ${message.author?.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    guildBanAdd: async ({ data: [ban], bot, db }) => {
      const cfg = await db.getLogConfig(ban.guild.id);
      if (!cfg?.log_bans) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.DarkRed)
        .setTitle('Member Banned')
        .setDescription(`<@${ban.user.id}> **${ban.user.tag}**`)
        .addFields({ name: 'Reason', value: ban.reason ?? 'No reason provided' })
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    guildBanRemove: async ({ data: [ban], bot, db }) => {
      const cfg = await db.getLogConfig(ban.guild.id);
      if (!cfg?.log_bans) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'member'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Member Unbanned')
        .setDescription(`<@${ban.user.id}> **${ban.user.tag}**`)
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    voiceStateUpdate: async ({ data: [oldState, newState], bot, db }) => {
      const guildId = newState.guild?.id ?? oldState.guild?.id;
      if (!guildId) return;
      const cfg = await db.getLogConfig(guildId);
      if (!cfg?.log_voice_events) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'voice'));
      if (!ch) return;

      const userId = newState.id;
      let embed: EmbedBuilder | null = null;

      if (!oldState.channelId && newState.channelId) {
        embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('Joined Voice Channel')
          .setDescription(`<@${userId}> joined <#${newState.channelId}>`)
          .setFooter({ text: `ID: ${userId}` })
          .setTimestamp();
      } else if (oldState.channelId && !newState.channelId) {
        embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle('Left Voice Channel')
          .setDescription(`<@${userId}> left <#${oldState.channelId}>`)
          .setFooter({ text: `ID: ${userId}` })
          .setTimestamp();
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const fromId = oldState.channelId;
        const toId = newState.channelId;
        embed = new EmbedBuilder()
          .setColor(Colors.Yellow)
          .setTitle('Moved Voice Channel')
          .setDescription(`<@${userId}>`)
          .addFields(
            { name: 'From', value: `<#${fromId}>`, inline: true },
            { name: 'To', value: `<#${toId}>`, inline: true }
          )
          .setFooter({ text: `ID: ${userId}` })
          .setTimestamp();
      }

      if (embed) await ch.send({ embeds: [embed] }).catch(() => {});
    },

    emojiCreate: async ({ data: [emoji], bot, db }) => {
      const cfg = await db.getLogConfig(emoji.guild.id);
      if (!cfg?.log_emoji_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Emoji Added')
        .setDescription(`**:${emoji.name}:** ${emoji.toString()}`)
        .setThumbnail(emoji.imageURL())
        .setFooter({ text: `ID: ${emoji.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    emojiDelete: async ({ data: [emoji], bot, db }) => {
      const cfg = await db.getLogConfig(emoji.guild.id);
      if (!cfg?.log_emoji_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Emoji Removed')
        .setDescription(`**:${emoji.name}:**`)
        .setThumbnail(emoji.imageURL())
        .setFooter({ text: `ID: ${emoji.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    emojiUpdate: async ({ data: [oldEmoji, newEmoji], bot, db }) => {
      if (oldEmoji.name === newEmoji.name) return;
      const cfg = await db.getLogConfig(newEmoji.guild.id);
      if (!cfg?.log_emoji_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle('Emoji Renamed')
        .setDescription(newEmoji.toString())
        .addFields(
          { name: 'Before', value: `:${oldEmoji.name}:`, inline: true },
          { name: 'After', value: `:${newEmoji.name}:`, inline: true }
        )
        .setFooter({ text: `ID: ${newEmoji.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    guildUpdate: async ({ data: [oldGuild, newGuild], bot, db }) => {
      const cfg = await db.getLogConfig(newGuild.id);
      if (!cfg?.log_server_updates) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;

      const fields: { name: string; value: string; inline?: boolean }[] = [];
      if (oldGuild.name !== newGuild.name)
        fields.push({ name: 'Name', value: `${oldGuild.name} → ${newGuild.name}` });
      if (oldGuild.icon !== newGuild.icon)
        fields.push({ name: 'Icon', value: newGuild.icon ? '[New icon set]' : 'Icon removed' });
      if (oldGuild.description !== newGuild.description)
        fields.push({ name: 'Description', value: `${oldGuild.description ?? '*none*'} → ${newGuild.description ?? '*none*'}` });
      if (oldGuild.verificationLevel !== newGuild.verificationLevel)
        fields.push({ name: 'Verification Level', value: `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}` });
      if (oldGuild.banner !== newGuild.banner)
        fields.push({ name: 'Banner', value: newGuild.banner ? 'Updated' : 'Removed' });

      if (!fields.length) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Server Updated')
        .addFields(fields)
        .setFooter({ text: `Guild: ${newGuild.id}` })
        .setTimestamp();
      if (newGuild.icon) embed.setThumbnail(newGuild.iconURL());
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    channelCreate: async ({ data: [channel], bot, db }) => {
      if (!(channel instanceof GuildChannel)) return;
      const cfg = await db.getLogConfig(channel.guild.id);
      if (!cfg?.log_channel_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Channel Created')
        .setDescription(`<#${channel.id}> **${channel.name}**`)
        .addFields({ name: 'Type', value: channel.type.toString() })
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },

    channelDelete: async ({ data: [channel], bot, db }) => {
      if (!(channel instanceof GuildChannel)) return;
      const cfg = await db.getLogConfig(channel.guild.id);
      if (!cfg?.log_channel_changes) return;
      const ch = await getLogChannel(bot, resolveChannelId(cfg, 'server'));
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Channel Deleted')
        .setDescription(`**#${channel.name}**`)
        .addFields({ name: 'Type', value: channel.type.toString() })
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },
  },
};

export default logsModule;
