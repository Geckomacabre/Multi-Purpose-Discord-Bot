import { Colors, EmbedBuilder, GuildMember, PartialGuildMember, User, Guild } from 'discord.js';
import * as db from '../../utils/db';

function fmt(msg: string, user: User, guild: Guild, extra: Record<string, string> = {}): string {
  let result = msg
    .replace(/\{user\}/g, `<@${user.id}>`)
    .replace(/\{username\}/g, user.username)
    .replace(/\{server\}/g, guild.name)
    .replace(/\{membercount\}/g, guild.memberCount.toString())
    .replace(/\{#membercount\}/g, `#${guild.memberCount}`);
  for (const [k, v] of Object.entries(extra)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return result;
}

async function sendMsg(channel: any, text: string, imageUrl: string | null, color: number) {
  if (!channel?.isTextBased()) return;
  if (imageUrl) {
    const embed = new EmbedBuilder().setDescription(text).setColor(color).setImage(imageUrl);
    await channel.send({ embeds: [embed] }).catch(() => {});
  } else {
    await channel.send(text).catch(() => {});
  }
}

const welcomeModule = {
  name: 'welcome',
  handlers: {
    guildMemberAdd: async ({ data: [member] }: { data: [GuildMember] }) => {
      const config = await db.getWelcomeConfig(member.guild.id);
      if (!config || !config.enabled || !config.channel_id) return;
      const channel = member.guild.channels.cache.get(config.channel_id);
      const text = fmt(config.message, member.user, member.guild);
      await sendMsg(channel, text, config.image_url, Colors.Green);
      if (config.dm_message) {
        await member.user.send(fmt(config.dm_message, member.user, member.guild)).catch(() => {});
      }
    },

    guildMemberRemove: async ({ data: [member] }: { data: [GuildMember | PartialGuildMember] }) => {
      if (!member.guild) return;
      const config = await db.getWelcomeConfig(member.guild.id);
      if (!config || !config.leave_enabled || !config.leave_channel_id || !config.leave_message) return;
      const channel = member.guild.channels.cache.get(config.leave_channel_id);
      const text = fmt(config.leave_message, member.user, member.guild);
      await sendMsg(channel, text, config.leave_image_url, Colors.Red);
    },

    guildBanAdd: async ({ data: [ban] }: { data: [import('discord.js').GuildBan] }) => {
      const config = await db.getWelcomeConfig(ban.guild.id);
      if (!config || !config.ban_enabled || !config.ban_channel_id || !config.ban_message) return;
      const channel = ban.guild.channels.cache.get(config.ban_channel_id);
      const text = fmt(config.ban_message, ban.user, ban.guild, { reason: ban.reason ?? 'No reason provided' });
      await sendMsg(channel, text, config.ban_image_url, Colors.DarkRed);
    },
  },
};

export default welcomeModule;
