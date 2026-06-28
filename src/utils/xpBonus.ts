import { Client, TextChannel } from 'discord.js';
import { addXp, getXpConfig, getLevelRoles, adjustBalance } from './db.js';

const GAME_XP_DAILY_CAP = 1000;

// guildId:userId -> { total, date (YYYY-MM-DD) }
const gameXpTracker = new Map<string, { total: number; date: string }>();

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function getGameXpRemaining(guildId: string, userId: string): number {
  const key = `${guildId}:${userId}`;
  const entry = gameXpTracker.get(key);
  if (!entry || entry.date !== todayDate()) return GAME_XP_DAILY_CAP;
  return Math.max(0, GAME_XP_DAILY_CAP - entry.total);
}

function recordGameXp(guildId: string, userId: string, amount: number) {
  const key = `${guildId}:${userId}`;
  const today = todayDate();
  const entry = gameXpTracker.get(key);
  if (!entry || entry.date !== today) {
    gameXpTracker.set(key, { total: amount, date: today });
  } else {
    entry.total += amount;
  }
}

async function handleLevelUp(
  guildId: string, userId: string, newLevel: number,
  client: Client, fallbackChannelId: string,
) {
  await adjustBalance(guildId, userId, newLevel * 50).catch(() => {});

  const levelRoles = await getLevelRoles(guildId);
  const earned = levelRoles.filter(r => r.level <= newLevel);
  if (earned.length > 0) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const toAdd = earned.map(r => r.role_id).filter(id => !member.roles.cache.has(id));
        if (toAdd.length) await member.roles.add(toAdd).catch(() => {});
      }
    }
  }

  const config = await getXpConfig(guildId);
  if (!config.level_up_announce) return;

  const announceChannelId = config.level_up_channel_id ?? fallbackChannelId;
  const channel = client.channels.cache.get(announceChannelId) as TextChannel | undefined;
  if (!channel) return;

  const guild = client.guilds.cache.get(guildId);
  const member = await guild?.members.fetch(userId).catch(() => null);
  const username = member?.user.username ?? 'Unknown';

  const text = config.level_up_message
    .replace(/{user}/g, `<@${userId}>`)
    .replace(/{username}/g, username)
    .replace(/{level}/g, String(newLevel));

  await channel.send(text).catch(() => {});
}

/**
 * Award bonus XP from a rep or game win.
 * @param isGame - if true, applies and enforces the 1000 XP/day game cap
 * @returns how much XP was actually awarded (0 if cap reached or XP disabled)
 */
export async function awardBonusXp(opts: {
  guildId: string;
  userId: string;
  baseAmount: number;
  client: Client;
  channelId: string;
  isGame?: boolean;
}): Promise<number> {
  const { guildId, userId, baseAmount, client, channelId, isGame = false } = opts;

  const config = await getXpConfig(guildId);
  if (!config.enabled) return 0;

  let amount = baseAmount;
  if (isGame) {
    const remaining = getGameXpRemaining(guildId, userId);
    if (remaining <= 0) return 0;
    amount = Math.min(baseAmount, remaining);
    recordGameXp(guildId, userId, amount);
  }

  const { row, oldLevel } = await addXp(guildId, userId, amount, false);
  if (row.level > oldLevel) {
    await handleLevelUp(guildId, userId, row.level, client, channelId);
  }

  return amount;
}
