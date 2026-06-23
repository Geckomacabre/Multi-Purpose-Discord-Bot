import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance } from '../../utils/db';
import { cv2Err, IS_CV2 } from '../../utils/components.js';

const Flip: Command = {
  data: new SlashCommandBuilder()
    .setName('flip')
    .setDescription('Bet on a coin flip (50/50 — win doubles your bet)')
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
    const win = Math.random() < 0.5;
    const { newBalance } = await adjustBalance(guildId, userId, win ? bet : -bet);
    const container = new ContainerBuilder()
      .setAccentColor(win ? Colors.Green : Colors.Red)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${win ? '🪙 Heads!' : '🌑 Tails!'}**\n${win ? `You won **${sym} ${bet.toLocaleString()}**!` : `You lost **${sym} ${bet.toLocaleString()}**.`}\n**Balance:** ${sym} **${newBalance.toLocaleString()}**`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Flip;
