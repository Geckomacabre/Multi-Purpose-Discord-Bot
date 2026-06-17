import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Stats: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View server activity statistics')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('hours').setDescription('Hours to look back (default: 24, max: 168)').setMinValue(1).setMaxValue(168)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const hours = interaction.options.getInteger('hours') ?? 24;
    await interaction.deferReply();

    const stats = await db.getServerStats(interaction.guildId!, hours);

    const totals = stats.reduce((acc, s) => ({
      messages: acc.messages + s.messages,
      joins: acc.joins + s.joins,
      leaves: acc.leaves + s.leaves,
    }), { messages: 0, joins: 0, leaves: 0 });

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Server Stats — Last ${hours}h`)
      .setThumbnail(interaction.guild!.iconURL())
      .addFields(
        { name: '💬 Messages', value: totals.messages.toLocaleString(), inline: true },
        { name: '➕ Joins', value: totals.joins.toLocaleString(), inline: true },
        { name: '➖ Leaves', value: totals.leaves.toLocaleString(), inline: true },
        { name: '👥 Current Members', value: interaction.guild!.memberCount.toLocaleString(), inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default Stats;
