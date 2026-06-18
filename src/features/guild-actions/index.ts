import { GuildMember, PartialGuildMember } from 'discord.js';
import { EventModule } from '../feature';
import { LinkedRoles, Roles } from '../../constants';
import { shouldHaveRole } from '../../utils/linkedRoles';

const guildActionsModule: EventModule = {
  name: 'guild-actions',
  handlers: {
    guildMemberAdd: async ({ data: [member] }: { data: [GuildMember] }) => {
      const { user, guild } = member;
      try {
        await new Promise((res) => setTimeout(res, 5_000));
        const freshMember = await guild.members.fetch(member.id).catch(() => null);
        if (!freshMember) return;

        if (user.bot) {
          await freshMember.roles.add(Roles.MidnightSystems);
          return;
        }

        await freshMember.roles.add(Roles.Newcomer);
      } catch (err) {
        console.error(`Error assigning role to ${user.tag}`, err);
      }
    },
    guildMemberUpdate: async ({ data: [oldMember, newMember] }: { data: [GuildMember | PartialGuildMember, GuildMember] }) => {
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      const roleIds = new Set(newRoles.keys());

      for (const rule of LinkedRoles) {
        const hasParent = newRoles.has(rule.parent);
        const shouldHave = shouldHaveRole(rule, roleIds);

        if (shouldHave === hasParent) continue;

        if (shouldHave) {
          await newMember.roles.add(rule.parent).catch(() => null);
        } else {
          await newMember.roles.remove(rule.parent).catch(() => null);
        }
      }

      const added = newRoles.filter((role) => !oldRoles.has(role.id));
      const removed = oldRoles.filter((role) => !newRoles.has(role.id));

      if (!added.size && !removed.size) return;
    },
  },
};

export default guildActionsModule;
