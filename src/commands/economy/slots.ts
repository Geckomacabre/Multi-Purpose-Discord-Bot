import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { randInt } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

const REEL = ['🍒','🍒','🍒','🍒','🍒','🍋','🍋','🍋','🍋','🔔','🔔','🔔','💎','💎','7️⃣'];
// Paytable tuned to 99.97% RTP with a 60% hit rate (pairs pay too).
// A 🍒 pair returns half the bet, a 🍋 pair refunds it — everything above is profit.
const TRIPLE_MULT: Record<string, number> = { '🍒': 4, '🍋': 7, '🔔': 12, '💎': 25, '7️⃣': 75 };
const PAIR_MULT:   Record<string, number> = { '🍒': 0.5, '🍋': 1, '🔔': 1.5, '💎': 2, '7️⃣': 3 };
const LEGEND = '*Pairs: 🍒 ½x | 🍋 1x | 🔔 1.5x | 💎 2x | 7️⃣ 3x — Triples: 🍒 4x | 🍋 7x | 🔔 12x | 💎 25x | 7️⃣ 75x*';

function spinReel() { return REEL[randInt(0, REEL.length - 1)]!; }

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
        client: interaction.client, channelId: interaction.channelId, isGame: true,
      });
      xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
    }

    const label = isTriple
      ? `**JACKPOT!** Triple ${reels[0]}`
      : pairSymbol
        ? `**Pair of ${pairSymbol}!**`
        : 'No match — better luck next time!';
    const resultLine = multiplier === 0
      ? `You lost **${sym} ${bet.toLocaleString()}**.`
      : winnings >= bet
        ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}`
        : `**${multiplier}x** — you got **${sym} ${winnings.toLocaleString()}** back.`;

    const container = new ContainerBuilder()
      .setAccentColor(profit ? Colors.Gold : multiplier > 0 ? Colors.Yellow : Colors.Red)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**🎰 Slots**\n${reels.join(' ｜ ')}\n${label}\n${resultLine}${insuranceLine(sym, refund)}\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**\n${LEGEND}${xpLine}`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Slots;
