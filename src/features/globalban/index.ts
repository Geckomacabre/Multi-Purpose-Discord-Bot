import { Client, Guild } from 'discord.js';
import { EventModule } from '../feature';
import { GLOBAL_BANS } from '../../constants';
import logger from '../../utils/logger';

const REASON = 'Global ban';

async function enforceBan(guild: Guild, userId: string): Promise<void> {
  // Skip servers where they're already banned, so restarts don't spam the ban logs.
  const existing = await guild.bans.fetch({ user: userId, force: true }).catch(() => null);
  if (existing) return;
  try {
    await guild.members.ban(userId, { reason: REASON });
    logger.info(`[global-ban] Banned ${userId} from "${guild.name}" (${guild.id})`);
  } catch (err: any) {
    logger.warn(`[global-ban] Couldn't ban ${userId} from "${guild.name}" (${guild.id}): ${err.message}`);
  }
}

async function enforceAll(guild: Guild): Promise<void> {
  for (const userId of GLOBAL_BANS) await enforceBan(guild, userId);
}

// Bans can be placed by ID, so this covers servers they've never joined too.
export async function startGlobalBans(bot: Client): Promise<void> {
  for (const guild of bot.guilds.cache.values()) await enforceAll(guild);
}

const globalBanModule: EventModule = {
  name: 'global-ban',
  handlers: {
    guildCreate: async ({ data: [guild] }) => enforceAll(guild),

    // Safety net for a ban that was lifted by hand or failed earlier (e.g. missing permission).
    guildMemberAdd: async ({ data: [member] }) => {
      if (GLOBAL_BANS.includes(member.id)) await enforceBan(member.guild, member.id);
    },
  },
};

export default globalBanModule;
