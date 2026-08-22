import { GuildMember } from 'discord.js';
import * as db from '../../utils/db';

function format(msg: string, member: GuildMember): string {
  return msg
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{membercount\}/g, member.guild.memberCount.toString())
    .replace(/\{#membercount\}/g, `#${member.guild.memberCount}`);
}

const welcomeModule = {
  name: 'welcome',
  handlers: {
    guildMemberAdd: async ({ data: [member] }: { data: [GuildMember] }) => {
      const config = await db.getWelcomeConfig(member.guild.id);
      if (!config || !config.enabled || !config.channel_id) return;

      const channel = member.guild.channels.cache.get(config.channel_id) as any;
      if (channel?.isTextBased()) {
        await channel.send(format(config.message, member)).catch(() => {});
      }

      if (config.dm_message) {
        await member.user.send(format(config.dm_message, member)).catch(() => {});
      }
    },
  },
};

export default welcomeModule;
