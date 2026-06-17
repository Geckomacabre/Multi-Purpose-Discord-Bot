import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import Config from '../../config';
import { Command } from '../../interfaces/command';

const Report: Command = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription("Report a member to the server's staff")
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('Member to report').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the report').setRequired(true))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    await interaction.deferReply({ ephemeral: true });

    const cfg = await db.getModConfig(interaction.guildId!);
    const channelId = cfg.modlog_channel_id ?? Config.REPORT_CHANNEL_ID;

    if (!channelId) {
      await interaction.editReply('No report channel is configured. Ask an admin to set a modlog channel with `/modconfig`.');
      return;
    }

    const ch = await interaction.guild!.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (!ch) { await interaction.editReply('Report channel not found. Contact an admin.'); return; }

    const modCase = await db.createModCase(
      interaction.guildId!, 'report', user.id, user.tag,
      interaction.user.id, interaction.user.tag, reason
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Case #${modCase.case_num} — Report`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Reported User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Reporter', value: `${interaction.user.tag}`, inline: true },
        { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    await ch.send({ embeds: [embed] });
    await interaction.editReply('✅ Your report has been submitted to the moderation team.');
  },
};

export default Report;
