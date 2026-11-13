import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Colors, ComponentType,
  InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult, consumeBoost } from '../../utils/db';
import { applyLossInsurance, insuranceLine, buildGamePanel, settleJackpot, jackpotLine } from '../../utils/gamble.js';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { rand } from '../../utils/random.js';
import { cv2Err } from '../../utils/components.js';

// Stock-style multiplier: it drifts up and down each tick. You can cash out at the
// current value (never below 1.00x) any time — the only way to lose is the "crash
// to 0" bust event, whose chance rises the higher the multiplier climbs.
//
// The bet is taken when the game starts and paid back (times the multiplier) on
// cash-out. It used to be charged only on a crash, and a charge the balance
// couldn't cover was skipped, so running several all-in games at once (or
// spending mid-game) made every loss free and every win real.
//
// HOUSE EDGE: the upward drift offsets the base bust risk, but the 1.00x floor
// clips away the downside near the start, which made early cash-outs pay
// (simulated EV 1.014 for "all in, cash out at 1.10x"). A small flat hazard plus
// a stronger one near the floor now puts every strategy slightly under 1.0:
// simulated EV 0.98 at 1.01x-1.1x (about 4 in 5 still win), 0.96 at 1.25x,
// 0.94 at 1.5x, 0.92 at 2x, 0.90 at 5x. The jackpot cut is on top of that.
const FLOOR = 1.00;

function baseHazard(m: number): number {
  return Math.min(0.12, 0.04 + 0.01 * (m - 1));
}

function bustChance(m: number): number {
  return Math.min(0.45, baseHazard(m) + 0.002 + 0.18 * Math.max(0, 1.25 - m));
}

function nextMultiplier(m: number): number {
  const b = baseHazard(m);
  const drift = b / (1 - b);
  const pct = (rand() - 0.5) * 0.5 + drift;
  return Math.max(FLOOR, Math.min(100, Math.round(m * (1 + pct) * 100) / 100));
}

function fmtMult(m: number): string {
  return m.toFixed(2) + 'x';
}

function buildCashOutRow(mult: number, sym: string, bet: number): ActionRowBuilder<ButtonBuilder> {
  const potential = Math.floor(bet * mult);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('crash_cashout')
      .setLabel(`💰 Cash Out — ${sym} ${potential.toLocaleString()} (${fmtMult(mult)})`)
      .setStyle(ButtonStyle.Success),
  );
}

const Crash: Command = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Ride the multiplier as it swings up and down — cash out before it crashes to 0!')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);

    const cfg = await getEconomyConfig(guildId);
    // Take the stake now, in one atomic step. Fails if the balance can't cover it,
    // including when other games already hold that money.
    const stake = await adjustBalance(guildId, userId, -bet);
    if (!stake.success) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Balance: **${cfg.currency_symbol} ${stake.newBalance.toLocaleString()}**.`)); return;
    }

    const sym = cfg.currency_symbol;
    let current = 1.00;
    let peak = 1.00;
    let gameOver = false;

    let msg;
    try {
      await interaction.deferReply();
      msg = await interaction.editReply(buildGamePanel(
        `**🚀 Crash**\n\n📈 **${fmtMult(current)}** — Bet: ${sym} ${bet.toLocaleString()}\n\n*The price swings up and down — cash out before it crashes to 0!*`,
        Colors.Blurple, buildCashOutRow(current, sym, bet),
      ));
    } catch (err) {
      // The game never started, so hand the stake back.
      await adjustBalance(guildId, userId, bet);
      throw err;
    }

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId && btn.customId === 'crash_cashout',
      max: 1,
      time: 120_000,
    });

    collector.on('collect', async (btn) => {
      if (gameOver) {
        await btn.reply(cv2Err('💥 Too late — it already crashed!'));
        return;
      }
      gameOver = true;
      clearInterval(tick);

      const luckMult = await getGambleMultiplier(guildId, userId);
      const winAmount = Math.floor(bet * current * luckMult);
      const { newBalance } = await adjustBalance(guildId, userId, winAmount);
      recordGameResult(guildId, userId, 'crash', winAmount >= bet, bet).catch(() => {});

      let xpLine = '';
      // XP only when there was real profit — an instant 1.00x cash-out risks
      // nothing and shouldn't farm the daily game-XP cap.
      if (winAmount > bet) {
        const xpGiven = await awardBonusXp({
          guildId, userId, baseAmount: Math.min(Math.floor(50 * current), 200),
          client: interaction.client, channelId: interaction.channelId, isGame: true,
        });
        xpLine = xpGiven > 0 ? ` +**${xpGiven} XP**!` : '';
      }
      const boostLine = luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : '';

      await btn.update(buildGamePanel(
        `**🚀 Crash**\n\n✅ **Cashed out at ${fmtMult(current)}!** *(peak ${fmtMult(peak)})*\nYou won **${sym} ${winAmount.toLocaleString()}**!${boostLine}${xpLine}\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
        Colors.Green,
      ));
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'time' && !gameOver) {
        // Fell asleep at the wheel? Auto-cash at the current value instead of
        // confiscating the bet — the game stays fair even for AFK players.
        gameOver = true;
        clearInterval(tick);
        const winAmount = Math.floor(bet * current);
        const { newBalance } = await adjustBalance(guildId, userId, winAmount);
        recordGameResult(guildId, userId, 'crash', winAmount >= bet, bet).catch(() => {});
        await interaction.editReply(buildGamePanel(
          `**🚀 Crash**\n\n⏰ **Timed out** — auto-cashed you out at **${fmtMult(current)}** for **${sym} ${winAmount.toLocaleString()}**. *(peak ${fmtMult(peak)})*\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
          Colors.Yellow,
        )).catch(() => {});
      }
    });

    const tick = setInterval(async () => {
      if (gameOver) { clearInterval(tick); return; }

      // Bust check — the price crashes straight to 0 and the bet is lost.
      if (rand() < bustChance(current)) {
        gameOver = true;
        clearInterval(tick);
        collector.stop('crashed');
        recordGameResult(guildId, userId, 'crash', false, bet).catch(() => {});

        // Second Chance (one-shot shop item): a bust below 1.5x refunds the bet.
        if (current < 1.5 && await consumeBoost(guildId, userId, 'second_chance')) {
          const { newBalance: balance } = await adjustBalance(guildId, userId, bet);
          await interaction.editReply(buildGamePanel(
            `**🚀 Crash**\n\n💥 **CRASHED to 0 from ${fmtMult(current)}!** *(peak ${fmtMult(peak)})*\n🔁 **Second Chance!** Your bet of **${sym} ${bet.toLocaleString()}** was refunded.\n**Balance:** ${sym} **${balance.toLocaleString()}**`,
            Colors.Green,
          )).catch(() => {});
          return;
        }

        // The stake was taken at the start, so there is nothing left to charge.
        const { balance: newBalance } = await getOrCreateEconomy(guildId, userId);
        const refund = await applyLossInsurance(guildId, userId, bet);
        const jp = await settleJackpot(guildId, userId, bet, bet);
        await interaction.editReply(buildGamePanel(
          `**🚀 Crash**\n\n💥 **CRASHED to 0 from ${fmtMult(current)}!** *(peak ${fmtMult(peak)})*\nYou lost **${sym} ${bet.toLocaleString()}**.${insuranceLine(sym, refund)}\n**Balance:** ${sym} **${(newBalance + refund + jp.won).toLocaleString()}**${jackpotLine(sym, jp.won)}`,
          Colors.Red,
        )).catch(() => {});
        return;
      }

      const prev = current;
      current = nextMultiplier(current);
      if (current > peak) peak = current;
      const arrow = current >= prev ? '📈' : '📉';

      await interaction.editReply(buildGamePanel(
        `**🚀 Crash**\n\n${arrow} **${fmtMult(current)}** — Bet: ${sym} ${bet.toLocaleString()}  *(peak ${fmtMult(peak)})*\n\n*The price swings up and down — cash out before it crashes to 0!*`,
        Colors.Blurple, buildCashOutRow(current, sym, bet),
      )).catch(() => {});
    }, 1500);
  },
};

export default Crash;
