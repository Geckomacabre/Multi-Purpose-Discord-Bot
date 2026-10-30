import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  InteractionContextType, MessageFlags, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import Config from '../../config';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';
import { LogColor, logCard, quote, who } from '../../utils/logCard';

const Report: Command = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription("Report a member to the server's staff")
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('Member to report').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the report').setRequired(true)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = await db.getModConfig(guildId);
    const channelId = cfg.modlog_channel_id ?? Config.REPORT_CHANNEL_ID;
    if (!channelId) { await interaction.editReply(cv2Text('❌ No report channel configured. Ask an admin to set a modlog channel with `/modconfig modlog`.')); return; }
    const ch = await interaction.guild!.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (!ch) { await interaction.editReply(cv2Text('❌ Report channel not found. Contact an admin.')); return; }
    const modCase = await db.createModCase(guildId, 'report', user.id, user.tag, interaction.user.id, interaction.user.tag, reason);
    await ch.send(logCard({
      color: LogColor.info,
      title: `📣 Member Reported · Case #${modCase.case_num}`,
      subtitle: user.username,
      thumbnail: user.displayAvatarURL({ size: 128 }),
      fields: [
        { name: 'Reported', value: who(user), inline: true },
        { name: 'By', value: who(interaction.user), inline: true },
        { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Reason', value: quote(reason, 1000) },
      ],
      footer: `📣 /report · User ID ${user.id}`,
    })).catch(() => {});
    await interaction.editReply(cv2Text('✅ Your report has been submitted to the moderation team.'));
  },
};

export default Report;
