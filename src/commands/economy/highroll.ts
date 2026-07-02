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

const HighRoll: Command = {
  data: new SlashCommandBuilder()
    .setName('highroll')
    .setDescription('Roll 1–100 against the bot — higher roll wins')
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
    const playerRoll = randInt(1, 100);
    let botRoll = randInt(1, 100);
    // Apply house cut before showing result: boost bot roll so the displayed numbers tell the true story
    if (playerRoll > botRoll && rand() < getHouseCut(bet)) {
      botRoll = randInt(playerRoll, 100); // bot wins or ties
    }
    const win = playerRoll > botRoll, tie = playerRoll === botRoll;
    const luckMult = win ? await getGambleMultiplier(guildId, userId) : 1;
    const { newBalance } = await adjustBalance(guildId, userId, win ? Math.floor(bet * luckMult) : tie ? 0 : -bet);
    if (!tie) recordGameResult(guildId, userId, 'highroll', win, bet).catch(() => {});
    const refund = !win && !tie ? await applyLossInsurance(guildId, userId, bet) : 0;
    let xpLine = '';
    if (win) {
      const xpGiven = await awardBonusXp({
        guildId, userId, baseAmount: randInt(50, 100),
        client: interaction.client, channelId: interaction.channelId, isGame: true,
      });
      xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
    }
    const result = tie ? `It's a tie! Your bet of **${sym} ${bet.toLocaleString()}** is refunded.` : win ? `You won **${sym} ${Math.floor(bet * luckMult).toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}` : `You lost **${sym} ${bet.toLocaleString()}**.`;
    const container = new ContainerBuilder()
      .setAccentColor(win ? Colors.Green : tie ? Colors.Yellow : Colors.Red)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**🎲 High Roll**\n**Your Roll:** ${playerRoll} | **Bot Roll:** ${botRoll}\n${result}${insuranceLine(sym, refund)}\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**${xpLine}`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default HighRoll;
