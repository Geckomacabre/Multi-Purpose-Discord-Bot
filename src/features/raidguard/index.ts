import { Guild, GuildMember, TextChannel } from 'discord.js';
import { LogColor, logCard } from '../../utils/logCard';
import { EventModule } from '../feature';

const RAID_WINDOW_MS = 60_000;               // look at joins in the last 60 seconds
const RAID_MIN_JOINS = 5;                    // this many "young" accounts joining that fast looks like a raid
const RAID_MAX_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000; // "young" = created within the last 3 days
const ALERT_COOLDOWN_MS = 5 * 60_000;        // don't re-alert more than once per 5 minutes per guild

// guildId -> last alert timestamp. Resets on restart — fine, since an ongoing
// raid re-triggers within minutes anyway and this only throttles repeat alerts.
const lastAlert = new Map<string, number>();

// No custom join tracker needed — the GuildMembers intent keeps guild.members.cache
// live, so both the auto-alert and the manual /raidguard recent command just filter it.
export function findRecentRaidJoiners(
  guild: Guild,
  windowMs: number = RAID_WINDOW_MS,
  maxAgeMs: number = RAID_MAX_ACCOUNT_AGE_MS,
): GuildMember[] {
  const now = Date.now();
  return guild.members.cache
    .filter(m => (m.joinedTimestamp ?? 0) > now - windowMs && (now - m.user.createdTimestamp) < maxAgeMs)
    .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
    .map(m => m);
}

async function getAlertChannel(guild: Guild, db: any): Promise<TextChannel | null> {
  const modCfg = await db.getModConfig(guild.id).catch(() => null);
  const logCfg = await db.getLogConfig(guild.id).catch(() => null);
  const channelId = modCfg?.modlog_channel_id ?? logCfg?.member_log_channel_id ?? logCfg?.channel_id;
  if (!channelId) return null;
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  return ch instanceof TextChannel ? ch : null;
}

const raidguardModule: EventModule = {
  name: 'raidguard',
  handlers: {
    guildMemberAdd: async ({ data: [member], db }) => {
      const guild = member.guild;
      const joiners = findRecentRaidJoiners(guild);
      if (joiners.length < RAID_MIN_JOINS) return;

      const last = lastAlert.get(guild.id) ?? 0;
      if (Date.now() - last < ALERT_COOLDOWN_MS) return;
      lastAlert.set(guild.id, Date.now());

      const ch = await getAlertChannel(guild, db);
      if (!ch) return;

      const lines = joiners.slice(0, 15).map(m =>
        `> <@${m.id}> (${m.user.username}) · created <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`
      );
      await ch.send(logCard({
        color: LogColor.danger,
        title: '🚨 Possible Raid',
        description: `**${joiners.length}** accounts under 3 days old joined in the last minute.`,
        thumbnail: guild.iconURL({ size: 128 }),
        fields: [
          { name: `New Accounts (${joiners.length})`, value: lines.join('\n') + (joiners.length > 15 ? `\n> …and ${joiners.length - 15} more` : '') },
          { name: 'What to do', value: 'Use `/ban` on anyone here, or run `/raidguard recent` any time to pull this list again.' },
        ],
        footer: '🛡️ Raid detection',
      })).catch(() => {});
    },
  },
};

export default raidguardModule;
