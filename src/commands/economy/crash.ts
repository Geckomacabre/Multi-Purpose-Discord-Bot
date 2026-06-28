import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, ComponentType, InteractionContextType, MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { rand, randInt } from '../../utils/random.js';
import { cv2Err } from '../../utils/components.js';

// 4% house edge via forced instant crash; otherwise uniform→ ~1/(1-t) distribution
function generateCrash(): number {
  const r = rand();
  if (r < 0.04) return 1.00;
  const t = (r - 0.04) / 0.96;
  return Math.min(100, Math.round(1 / (1 - t) * 100) / 100);
}

function getStep(m: number): number {
  if (m < 2)  return 0.10;
  if (m < 5)  return 0.20;
  if (m < 10) return 0.50;
  return 1.00;
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
    .setDescription('Ride the multiplier up — cash out before it crashes or lose everything!')
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
    const crashPoint = generateCrash();
    let current = 1.00;
    let gameOver = false;

    await interaction.deferReply();

    if (crashPoint <= 1.00) {
      // Instant crash
      const { newBalance } = await adjustBalance(guildId, userId, -bet);
      await interaction.editReply({
        content: `**🚀 Crash**\n💥 **Crashed instantly at 1.00x!**\nYou lost **${sym} ${bet.toLocaleString()}**.\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
        components: [],
      });
      return;
    }

    const msg = await interaction.editReply({
      content: `**🚀 Crash**\n\n📈 **${fmtMult(current)}** — Bet: ${sym} ${bet.toLocaleString()}\n\n*Click Cash Out before the rocket crashes!*`,
      components: buildCashOutRow(current, sym, bet),
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId && btn.customId === 'crash_cashout',
      max: 1,
      time: 90_000,
    });

    collector.on('collect', async (btn) => {
      if (gameOver) {
        await btn.reply({ content: '💥 Too late — already crashed!', flags: MessageFlags.Ephemeral });
        return;
      }
      gameOver = true;
      clearInterval(tick);

      const winAmount = Math.floor(bet * current);
      const delta = winAmount - bet;
      const { newBalance } = await adjustBalance(guildId, userId, delta);

      const xpGiven = await awardBonusXp({
        guildId, userId, baseAmount: Math.min(Math.floor(50 * current), 200),
        client: interaction.client, channelId: interaction.channelId, isGame: true,
      });
      const xpLine = xpGiven > 0 ? ` +**${xpGiven} XP**!` : '';

      await btn.update({
        content:
          `**🚀 Crash**\n\n` +
          `✅ **Cashed out at ${fmtMult(current)}!**\n` +
          `You won **${sym} ${winAmount.toLocaleString()}**!${xpLine}\n` +
          `*(Rocket crashed at ${fmtMult(crashPoint)})*\n` +
          `**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
        components: [],
      });
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'time' && !gameOver) {
        gameOver = true;
        clearInterval(tick);
        const { newBalance } = await adjustBalance(guildId, userId, -bet);
        await interaction.editReply({
          content:
            `**🚀 Crash**\n\n` +
            `⏰ **Timed out** — the rocket crashed at ${fmtMult(crashPoint)}.\n` +
            `You lost **${sym} ${bet.toLocaleString()}**.\n` +
            `**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
          components: [],
        }).catch(() => {});
      }
    });

    const tick = setInterval(async () => {
      if (gameOver) { clearInterval(tick); return; }

      current = Math.round((current + getStep(current)) * 100) / 100;

      if (current >= crashPoint) {
        gameOver = true;
        clearInterval(tick);
        collector.stop('crashed');
        const { newBalance } = await adjustBalance(guildId, userId, -bet);
        await interaction.editReply({
          content:
            `**🚀 Crash**\n\n` +
            `💥 **CRASHED at ${fmtMult(crashPoint)}!**\n` +
            `You lost **${sym} ${bet.toLocaleString()}**.\n` +
            `**Balance:** ${sym} **${newBalance.toLocaleString()}**`,
          components: [],
        }).catch(() => {});
        return;
      }

      await interaction.editReply({
        content: `**🚀 Crash**\n\n📈 **${fmtMult(current)}** — Bet: ${sym} ${bet.toLocaleString()}\n\n*Click Cash Out before the rocket crashes!*`,
        components: buildCashOutRow(current, sym, bet),
      }).catch(() => {});
    }, 1500);
  },
};

export default Crash;
