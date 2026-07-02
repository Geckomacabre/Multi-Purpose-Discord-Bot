import { Client, TextChannel } from 'discord.js';
import {
  getLotteryConfigs, getLotteryLastRun, setLotteryLastRun,
  getRandomLotteryWinner, adjustBalance, clearGuildBoosts,
} from '../../utils/db';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function runLotteryForGuild(
  client: Client,
  guildId: string,
  channelId: string,
  prize: number,
): Promise<void> {
  const winnerId = await getRandomLotteryWinner(guildId);
  // Loaded Dice only applies to one draw — clear them win or lose.
  await clearGuildBoosts(guildId, 'lotto').catch(() => {});
  if (!winnerId) return;

  await adjustBalance(guildId, winnerId, prize).catch(() => {});

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return;

  await channel.send(
    `🎰 **Daily Lottery!**\n<@${winnerId}> is today's lucky winner and received **🪙 ${prize.toLocaleString()} coins**! 🎉`
  ).catch(() => {});
}

async function checkAndRunLottery(client: Client): Promise<void> {
  const today = todayUTC();
  const configs = await getLotteryConfigs();

  for (const cfg of configs) {
    const lastRun = await getLotteryLastRun(cfg.guild_id);
    if (lastRun === today) continue;

    await setLotteryLastRun(cfg.guild_id, today);
    await runLotteryForGuild(client, cfg.guild_id, cfg.lottery_channel_id, cfg.lottery_prize).catch(console.error);
  }
}

export function startLottery(client: Client): void {
  // Check every hour
  setInterval(() => checkAndRunLottery(client).catch(console.error), 3_600_000);
  // Also check immediately on startup
  checkAndRunLottery(client).catch(console.error);
}
