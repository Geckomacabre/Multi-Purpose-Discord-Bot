import { GuildMember } from 'discord.js';
import { Roles } from '../../constants';

// Assigns Newcomer role to new humans, MidnightSystems to bots
// Waits 5s before assigning to avoid Discord race conditions on join
const joinRolesModule = {
  name: 'joinroles',
  handlers: {
    guildMemberAdd: async ({ data: [member] }: { data: [GuildMember] }) => {
      const { user, guild } = member;
      try {
        await new Promise((res) => setTimeout(res, 5_000));
        const freshMember = await guild.members.fetch(member.id).catch(() => null);
        if (!freshMember) return;

        if (user.bot) {
          await freshMember.roles.add(Roles.MidnightSystems).catch(() => {});
        } else {
          await freshMember.roles.add(Roles.Newcomer).catch(() => {});
        }
      } catch (err) {
        console.error(`Error assigning role to ${user.tag}:`, err);
      }
    },
  },
};

export default joinRolesModule;
