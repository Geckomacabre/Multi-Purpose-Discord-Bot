import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getXpLeaderboard } from '../../utils/db';

const Leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top chatters by XP and level')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('limit').setDescription('Number of users to show (default 10, max 25)').setMinValue(1).setMaxValue(25)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const guildId = interaction.guildId!;
    const limit = interaction.options.getInteger('limit') ?? 10;

    const rows = await getXpLeaderboard(guildId, limit);

    if (rows.length === 0) {
      await interaction.editReply('No XP data yet. Start chatting to earn XP!');
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((row, i) => {
      const prefix = medals[i] ?? `**${i + 1}.**`;
      return `${prefix} <@${row.user_id}> — **Level ${row.level}** (${row.xp.toLocaleString()} XP | ${row.total_messages.toLocaleString()} messages)`;
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle('🏆 XP Leaderboard')
      .setDescription(lines.join('\n'))
      .setFooter({ text: interaction.guild?.name ?? '' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default Leaderboard;
