import { TextChannel } from 'discord.js';
import { EventModule } from '../feature';
import { getXpConfig, addXp, getLevelRoles, adjustBalance } from '../../utils/db';

// In-memory cooldown: `${guild_id}:${user_id}` -> timestamp last XP was awarded
const xpCooldowns = new Map<string, number>();

// Clean up stale cooldown entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, ts] of xpCooldowns) {
    if (ts < cutoff) xpCooldowns.delete(key);
  }
}, 600_000);

const xpModule: EventModule = {
  name: 'xp',
  handlers: {
    messageCreate: async ({ data: [message], bot }) => {
      if (message.author.bot || !message.guild) return;

      const guildId = message.guild.id;
      const userId = message.author.id;
      const key = `${guildId}:${userId}`;

      const config = await getXpConfig(guildId);
      if (!config.enabled) return;

      const now = Date.now();
      const lastXp = xpCooldowns.get(key) ?? 0;
      if (now - lastXp < config.cooldown_seconds * 1000) return;

      xpCooldowns.set(key, now);

      const amount = Math.floor(Math.random() * (config.xp_max - config.xp_min + 1)) + config.xp_min;
      const { row, oldLevel } = await addXp(guildId, userId, amount);

      if (row.level <= oldLevel) return;

      // Level up!
      const newLevel = row.level;

      // Coin reward on level-up
      const coinReward = newLevel * 50;
      await adjustBalance(guildId, userId, coinReward).catch(() => {});

      // Assign any level roles
      const levelRoles = await getLevelRoles(guildId);
      const earned = levelRoles.filter(r => r.level <= newLevel);
      if (earned.length > 0 && message.member) {
        const toAdd = earned.map(r => r.role_id).filter(id => !message.member!.roles.cache.has(id));
        if (toAdd.length > 0) {
          await message.member.roles.add(toAdd).catch(() => {});
        }
      }

      // Announce level-up
      const announceChannelId = config.level_up_channel_id ?? message.channel.id;
      const channel = bot.channels.cache.get(announceChannelId) as TextChannel | undefined;
      if (!channel) return;

      const text = config.level_up_message
        .replace(/{user}/g, `<@${userId}>`)
        .replace(/{username}/g, message.author.username)
        .replace(/{level}/g, String(newLevel));

      await channel.send(text).catch(() => {});
    },
  },
};

export default xpModule;
