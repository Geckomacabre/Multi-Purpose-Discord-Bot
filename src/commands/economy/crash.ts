import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, ComponentType, InteractionContextType, MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { rand, getHouseCut } from '../../utils/random.js';
import { cv2Err } from '../../utils/components.js';

// Stock-style multiplier: it drifts up and down each tick. You can cash out at the
// current value (never below 1.00x) any time — the only way to lose everything is
// a "crash to 0" bust event, whose chance rises the higher the multiplier climbs.
const FLOOR = 1.00;

function bustChance(m: number): number {
  // 4% near the floor, climbing as it goes up (higher reward ⇒ higher risk), capped at 35%.
  return Math.min(0.35, 0.04 + (m - 1) * 0.025);
}

function nextMultiplier(m: number): number {
  // Multiplicative random walk, roughly symmetric (range ≈ -24.75%…+25.25%). Tuned
  // so no cash-out target is profitable: house edge grows the higher you hold out.
  const pct = (rand() - 0.495) * 0.5;
  return Math.max(FLOOR, Math.min(100, Math.round(m * (1 + pct) * 100) / 100));
}

function fmtMult(m: number): string {
  return m.toFixed(2) + 'x';
}

function buildCashOutRow(mult: number, sym: string, bet: number, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  const potential = Math.floor(bet * mult);
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('crash_cashout')
      .setLabel(`💰 Cash Out — ${sym} ${potential.toLocaleString()} (${fmtMult(mult)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  )];
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

    const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
    if (eco.balance < bet) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`)); return;
    }

    const sym = cfg.currency_symbol;
    let current = 1.00;
    let peak = 1.00;
    let gameOver = false;

    await interaction.deferReply();

    const msg = await interaction.editReply({
      content: `**🚀 Crash**\n\n📈 **${fmtMult(current)}** — Bet: ${sym} ${bet.toLocaleString()}\n\n*The price swings up and down — cash out before it crashes to 0!*`,
      components: buildCashOutRow(current, sym, bet),
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId && btn.customId === 'crash_cashout',
      max: 1,
      time: 120_000,
    });

    collector.on('collect', async (btn) => {
      if (gameOver) {
        await btn.reply({ content: '💥 Too late — it already crashed!', flags: MessageFlags.Ephemeral });
        return;
      }
      gameOver = true;
      clearInterval(tick);

      // Progressive house cut: larger bets have a chance the cash-out is voided.
      const houseLoss = rand() < getHouseCut(bet);
      const luckMult = !houseLoss ? await getGambleMultiplier(guildId, userId) : 1;
      const winAmount = houseLoss ? 0 : Math.floor(bet * current * luckMult);
      const delta = winAmount - bet;
      const { newBalance } = await adjustBalance(guildId, userId, delta);
      recordGameResult(guildId, userId, 'crash', !houseLoss, bet).catch(() => {});

      let xpLine = '';
      if (!houseLoss) {
        const xpGiven = await awardBonusXp({
          guildId, userId, baseAmount: Math.min(Math.floor(50 * current), 200),
          client: interaction.client, channelId: interaction.channelId, isGame: true,
        });
        xpLine = xpGiven > 0 ? ` +**${xpGiven} XP**!` : '';
      }
      const boostLine = luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : '';

      await btn.update({
        content: houseLoss
          ? `**🚀 Crash**\n\n💸 **The house wins!** You cashed out at ${fmtMult(current)} but the house took this one.\nYou lost **${sym} ${bet.toLocaleString()}**.\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`
          : `**🚀 Crash**\n\n✅ **Cashed out at ${fmtMult(current)}!** *(peak ${fmtMult(peak)})*\nYou won **${sym} ${winAmount.toLocaleString()}**!${boostLine}${xpLine}\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
        components: [],
      });
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'time' && !gameOver) {
        gameOver = true;
        clearInterval(tick);
        const { newBalance } = await adjustBalance(guildId, userId, -bet);
        recordGameResult(guildId, userId, 'crash', false, bet).catch(() => {});
        await interaction.editReply({
          content:
            `**🚀 Crash**\n\n` +
            `⏰ **Timed out** — you never cashed out and lost **${sym} ${bet.toLocaleString()}**.\n` +
            `**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
          components: [],
        }).catch(() => {});
      }
    });

    const tick = setInterval(async () => {
      if (gameOver) { clearInterval(tick); return; }

      // Bust check — the price crashes straight to 0 and the bet is lost.
      if (rand() < bustChance(current)) {
        gameOver = true;
        clearInterval(tick);
        collector.stop('crashed');
        const { newBalance } = await adjustBalance(guildId, userId, -bet);
        recordGameResult(guildId, userId, 'crash', false, bet).catch(() => {});
        await interaction.editReply({
          content:
            `**🚀 Crash**\n\n` +
            `💥 **CRASHED to 0 from ${fmtMult(current)}!** *(peak ${fmtMult(peak)})*\n` +
            `You lost **${sym} ${bet.toLocaleString()}**.\n` +
            `**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
          components: [],
        }).catch(() => {});
        return;
      }

      const prev = current;
      current = nextMultiplier(current);
      if (current > peak) peak = current;
      const arrow = current >= prev ? '📈' : '📉';

      await interaction.editReply({
        content: `**🚀 Crash**\n\n${arrow} **${fmtMult(current)}** — Bet: ${sym} ${bet.toLocaleString()}  *(peak ${fmtMult(peak)})*\n\n*The price swings up and down — cash out before it crashes to 0!*`,
        components: buildCashOutRow(current, sym, bet),
      }).catch(() => {});
    }, 1500);
  },
};

export default Crash;
