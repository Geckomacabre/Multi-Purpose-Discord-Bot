import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig } from '../../utils/db';

const Balance: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your or another user\'s coin balance')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('User to check (default: yourself)')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guildId!;

    const [eco, cfg] = await Promise.all([
      getOrCreateEconomy(guildId, target.id),
      getEconomyConfig(guildId),
    ]);

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .setTitle(`${cfg.currency_symbol} Balance`)
      .addFields(
        { name: 'Balance', value: `${cfg.currency_symbol} **${eco.balance.toLocaleString()}** ${cfg.currency_name}`, inline: true },
        { name: 'Total Earned', value: `${cfg.currency_symbol} **${eco.total_earned.toLocaleString()}** ${cfg.currency_name}`, inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default Balance;
