import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const RemoveTimeout: Command = {
  data: new SlashCommandBuilder()
    .setName('removetimeout')
    .setDescription("Remove a member's timeout")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('Member to un-timeout').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply();

    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!member) { await interaction.editReply('Could not find that member.'); return; }
    if (!member.isCommunicationDisabled()) { await interaction.editReply('That member is not currently timed out.'); return; }

    await member.timeout(null, reason);

    const modCase = await db.createModCase(
      interaction.guildId!, 'removetimeout', user.id, user.tag,
      interaction.user.id, interaction.user.tag, reason
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`Case #${modCase.case_num} — Timeout Removed`)
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const cfg = await db.getModConfig(interaction.guildId!);
    if (cfg.modlog_channel_id) {
      const ch = await interaction.guild!.channels.fetch(cfg.modlog_channel_id).catch(() => null) as TextChannel | null;
      await ch?.send({ embeds: [embed] }).catch(() => {});
    }
  },
};

export default RemoveTimeout;
