import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { randInt, rand, getHouseCut } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

// Standard European roulette red numbers
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const Roulette: Command = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Spin the roulette wheel and bet on the outcome')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
    .addStringOption(o =>
      o.setName('type').setDescription('What to bet on').setRequired(true)
        .addChoices(
          { name: '🔴 Red (2x)', value: 'red' },
          { name: '⚫ Black (2x)', value: 'black' },
          { name: '🔢 Even (2x)', value: 'even' },
          { name: '🔢 Odd (2x)', value: 'odd' },
          { name: '⬇️ Low 1–18 (2x)', value: 'low' },
          { name: '⬆️ High 19–36 (2x)', value: 'high' },
          { name: '🎯 Single Number (35x)', value: 'number' },
        ))
    .addIntegerOption(o =>
      o.setName('number').setDescription('1–36 (only used with Single Number)').setMinValue(1).setMaxValue(36)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);
    const type = interaction.options.getString('type', true);
    const targetNum = interaction.options.getInteger('number');

    if (type === 'number' && targetNum === null) {
      await interaction.reply(cv2Err('❌ Provide a number (0–36) when using **Single Number** type.')); return;
    }

    const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
    if (eco.balance < bet) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`)); return;
    }

    let result = randInt(1, 36);
    let multiplier = 2;
    const wouldWin = (r: number) => {
      const red = RED.has(r);
      switch (type) {
        case 'red':    return red;
        case 'black':  return !red;
        case 'even':   return r % 2 === 0;
        case 'odd':    return r % 2 === 1;
        case 'low':    return r <= 18;
        case 'high':   return r >= 19;
        case 'number': return r === targetNum;
        default:       return false;
      }
    };
    if (type === 'number') multiplier = 36;
    // Apply house cut before showing result: re-spin to a losing number so the display is honest
    if (wouldWin(result) && rand() < getHouseCut(bet)) {
      for (let i = 0; i < 50; i++) {
        const candidate = randInt(1, 36);
        if (!wouldWin(candidate)) { result = candidate; break; }
      }
    }
    const isRed = RED.has(result);
    const colorEmoji = isRed ? '🔴' : '⚫';
    const colorName  = isRed ? 'Red' : 'Black';
    const win = wouldWin(result);

    const sym = cfg.currency_symbol;
    const luckMult = win ? await getGambleMultiplier(guildId, userId) : 1;
    const winnings = win ? Math.floor(bet * (multiplier - 1) * luckMult) : 0;
    const delta = win ? winnings : -bet;
    const { newBalance } = await adjustBalance(guildId, userId, delta);
    recordGameResult(guildId, userId, 'roulette', win, bet).catch(() => {});
    const refund = win ? 0 : await applyLossInsurance(guildId, userId, bet);

    let xpLine = '';
    if (win) {
      const base = type === 'number' ? 200 : randInt(50, 100);
      const xpGiven = await awardBonusXp({
        guildId, userId, baseAmount: base,
        client: interaction.client, channelId: interaction.channelId, isGame: true,
      });
      xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
    }

    const betLabel: Record<string, string> = {
      red: 'Red', black: 'Black', even: 'Even', odd: 'Odd',
      low: 'Low (1–18)', high: 'High (19–36)', number: `Number ${targetNum}`,
    };

    const container = new ContainerBuilder()
      .setAccentColor(win ? Colors.Green : Colors.Red)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**🎡 Roulette**\n` +
        `The ball landed on **${colorEmoji} ${result}** *(${colorName})*\n\n` +
        `Bet on: **${betLabel[type]}**\n` +
        (win
          ? `✅ You won **${sym} ${winnings.toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}`
          : `❌ You lost **${sym} ${bet.toLocaleString()}**.${insuranceLine(sym, refund)}`) +
        `\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**${xpLine}`
      ));

    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Roulette;
