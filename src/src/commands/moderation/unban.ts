import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Unban: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for unban'))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply();

    try {
      await interaction.guild!.members.unban(userId, reason);
    } catch {
      await interaction.editReply('Failed to unban. Ensure the ID is correct and the user is actually banned.'); return;
    }

    const user = await interaction.client.users.fetch(userId).catch(() => null);
    const modCase = await db.createModCase(
      interaction.guildId!, 'unban', userId, user?.tag ?? userId,
      interaction.user.id, interaction.user.tag, reason
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`Case #${modCase.case_num} — Unban`)
      .addFields(
        { name: 'User', value: `${user?.tag ?? userId} (${userId})`, inline: true },
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

export default Unban;
