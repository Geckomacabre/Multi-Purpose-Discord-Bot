import { EventModule } from '../feature';

const autoroleModule: EventModule = {
  name: 'autorole',
  handlers: {
    guildMemberAdd: async ({ data: [member], db }) => {
      const roles = await db.getAutoroles(member.guild.id);
      for (const ar of roles) {
        if (ar.wait_seconds > 0) {
          setTimeout(async () => {
            try {
              const fresh = await member.guild.members.fetch(member.id).catch(() => null);
              if (fresh) await fresh.roles.add(ar.role_id).catch(() => {});
            } catch {}
          }, ar.wait_seconds * 1000);
        } else {
          await member.roles.add(ar.role_id).catch(() => {});
        }
      }
    },
  },
};

export default autoroleModule;
