import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, ComponentType, InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { randInt } from '../../utils/random.js';
import { cv2Err } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

const REEL = ['🍒','🍒','🍒','🍒','🍒','🍋','🍋','🍋','🍋','🔔','🔔','🔔','💎','💎','7️⃣'];
// Paytable tuned to 99.97% RTP with a 60% hit rate (pairs pay too).
// A 🍒 pair returns half the bet, a 🍋 pair refunds it — everything above is profit.
const TRIPLE_MULT: Record<string, number> = { '🍒': 4, '🍋': 7, '🔔': 12, '💎': 25, '7️⃣': 75 };
const PAIR_MULT:   Record<string, number> = { '🍒': 0.5, '🍋': 1, '🔔': 1.5, '💎': 2, '7️⃣': 3 };
const LEGEND = '*Pairs: 🍒 ½x | 🍋 1x | 🔔 1.5x | 💎 2x | 7️⃣ 3x — Triples: 🍒 4x | 🍋 7x | 🔔 12x | 💎 25x | 7️⃣ 75x*';

function spinReel() { return REEL[randInt(0, REEL.length - 1)]!; }

function buildSpinAgainRow(disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('slots_again').setLabel('🔄 Spin Again').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  )];
}

// Resolves a single spin (bet already validated by the caller) and returns the
// message content to display — factored out so both the initial command and
// the "Spin Again" button reuse identical logic.
async function playSpin(
  bet: number, guildId: string, userId: string,
  cfg: Awaited<ReturnType<typeof getEconomyConfig>>,
  client: ChatInputCommandInteraction['client'], channelId: string,
): Promise<string> {
  const sym = cfg.currency_symbol;
  const reels = [spinReel(), spinReel(), spinReel()];

  const isTriple = reels[0] === reels[1] && reels[1] === reels[2];
  let pairSymbol: string | null = null;
  if (!isTriple) {
    if (reels[0] === reels[1] || reels[0] === reels[2]) pairSymbol = reels[0]!;
    else if (reels[1] === reels[2]) pairSymbol = reels[1]!;
  }
  const multiplier = isTriple ? TRIPLE_MULT[reels[0]!]! : pairSymbol ? PAIR_MULT[pairSymbol]! : 0;

  const luckMult = multiplier > 0 ? await getGambleMultiplier(guildId, userId) : 1;
  const winnings = Math.floor(bet * multiplier * luckMult);
  const delta = winnings - bet;
  const profit = winnings > bet;
  const { newBalance } = await adjustBalance(guildId, userId, delta);
  recordGameResult(guildId, userId, 'slots', winnings >= bet, bet).catch(() => {});
  const refund = multiplier === 0 ? await applyLossInsurance(guildId, userId, bet) : 0;

  let xpLine = '';
  if (profit) {
    const baseXp = Math.min(50 + Math.floor(multiplier * 20), 200);
    const xpGiven = await awardBonusXp({
      guildId, userId, baseAmount: baseXp,
      client, channelId, isGame: true,
    });
    xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
  }

  const label = isTriple
    ? `**JACKPOT!** Triple ${reels[0]}`
    : pairSymbol
      ? `**Pair of ${pairSymbol}!**`
      : 'No match — better luck next time!';
  const resultLine = multiplier === 0
    ? `You lost **${sym} ${bet.toLocaleString()}**.${insuranceLine(sym, refund)}`
    : winnings >= bet
      ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}`
      : `**${multiplier}x** — you got **${sym} ${winnings.toLocaleString()}** back.`;

  return `**🎰 Slots** — Bet: ${sym} ${bet.toLocaleString()}\n${reels.join(' ｜ ')}\n${label}\n${resultLine}\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**\n${LEGEND}${xpLine}`;
}

const Slots: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine — pairs pay, triples pay big!')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);
    const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
    if (eco.balance < bet) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Your balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`)); return;
    }

    await interaction.deferReply();
    const content = await playSpin(bet, guildId, userId, cfg, interaction.client, interaction.channelId);
    const msg = await interaction.editReply({ content, components: buildSpinAgainRow() });

    // Keeps the whole session in one message instead of a new one per spin.
    // idle-based so an actively-playing user isn't cut off after a fixed
    // 2 minutes — the button only expires after a stretch of inactivity.
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId && btn.customId === 'slots_again',
      idle: 5 * 60_000,
      time: 30 * 60_000,
    });

    collector.on('collect', async (btn) => {
      await btn.deferUpdate();
      const eco2 = await getOrCreateEconomy(guildId, userId);
      if (eco2.balance < bet) {
        collector.stop('broke');
        await btn.editReply({
          content: `❌ Not enough ${cfg.currency_name} to spin again — need **${cfg.currency_symbol} ${bet.toLocaleString()}**, you have **${cfg.currency_symbol} ${eco2.balance.toLocaleString()}**.`,
          components: [],
        }).catch(() => {});
        return;
      }
      const nextContent = await playSpin(bet, guildId, userId, cfg, interaction.client, interaction.channelId);
      await btn.editReply({ content: nextContent, components: buildSpinAgainRow() }).catch(() => {});
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'broke') return;
      await interaction.editReply({ components: buildSpinAgainRow(true) }).catch(() => {});
    });
  },
};

export default Slots;
