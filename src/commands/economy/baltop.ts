import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getEconomyLeaderboard, getEconomyConfig } from '../../utils/db';

const Baltop: Command = {
  data: new SlashCommandBuilder()
    .setName('baltop')
    .setDescription('Show the richest users in the server')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('limit').setDescription('Number of users to show (default 10, max 25)').setMinValue(1).setMaxValue(25)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const guildId = interaction.guildId!;
    const limit = interaction.options.getInteger('limit') ?? 10;

    const [rows, cfg] = await Promise.all([
      getEconomyLeaderboard(guildId, limit),
      getEconomyConfig(guildId),
    ]);

    if (rows.length === 0) {
      await interaction.editReply('No economy data yet. Start earning with `/daily` and `/work`!');
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((row, i) => {
      const prefix = medals[i] ?? `**${i + 1}.**`;
      return `${prefix} <@${row.user_id}> — ${cfg.currency_symbol} **${row.balance.toLocaleString()}**`;
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`${cfg.currency_symbol} Richest Users`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: interaction.guild?.name ?? '' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default Baltop;
