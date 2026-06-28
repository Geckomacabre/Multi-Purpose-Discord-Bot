import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { randInt } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';

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
      o.setName('number').setDescription('0–36 (only used with Single Number)').setMinValue(0).setMaxValue(36)),

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

    const result = randInt(0, 36);
    const isRed = RED.has(result);
    const colorEmoji = result === 0 ? '🟢' : isRed ? '🔴' : '⚫';
    const colorName  = result === 0 ? 'Green' : isRed ? 'Red' : 'Black';

    let win = false;
    let multiplier = 2;
    switch (type) {
      case 'red':    win = isRed;                          break;
      case 'black':  win = !isRed && result !== 0;         break;
      case 'even':   win = result !== 0 && result % 2 === 0; break;
      case 'odd':    win = result % 2 === 1;               break;
      case 'low':    win = result >= 1 && result <= 18;    break;
      case 'high':   win = result >= 19;                   break;
      case 'number': win = result === targetNum; multiplier = 36; break;
    }

    const sym = cfg.currency_symbol;
    const delta = win ? bet * (multiplier - 1) : -bet;
    const { newBalance } = await adjustBalance(guildId, userId, delta);

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
          ? `✅ You won **${sym} ${(bet * (multiplier - 1)).toLocaleString()}**!`
          : `❌ You lost **${sym} ${bet.toLocaleString()}**.`) +
        `\n**Balance:** ${sym} **${newBalance.toLocaleString()}**${xpLine}`
      ));

    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Roulette;
