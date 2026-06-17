import { AuditLogEvent, Colors, EmbedBuilder, TextChannel } from 'discord.js';
import { EventModule } from '../feature';
import type * as Db from '../../utils/db';

async function getLogChannel(bot: any, cfg: Db.ILogConfig | null): Promise<TextChannel | null> {
  if (!cfg || !cfg.enabled || !cfg.channel_id) return null;
  try {
    const ch = await bot.channels.fetch(cfg.channel_id);
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
      const ch = await getLogChannel(bot, cfg);
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
      const ch = await getLogChannel(bot, cfg);
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
      const ch = await getLogChannel(bot, cfg);
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

    messageUpdate: async ({ data: [oldMessage, newMessage], bot, db }) => {
      if (!newMessage.guildId || newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;
      const cfg = await db.getLogConfig(newMessage.guildId);
      if (!cfg?.log_message_edits) return;
      const ignored: string[] = cfg.ignored_channels ? JSON.parse(cfg.ignored_channels) : [];
      if (ignored.includes(newMessage.channelId)) return;
      const ch = await getLogChannel(bot, cfg);
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
      const ch = await getLogChannel(bot, cfg);
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
      const ch = await getLogChannel(bot, cfg);
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
      const ch = await getLogChannel(bot, cfg);
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Member Unbanned')
        .setDescription(`<@${ban.user.id}> **${ban.user.tag}**`)
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp();
      await ch.send({ embeds: [embed] }).catch(() => {});
    },
  },
};

export default logsModule;
