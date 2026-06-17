import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Kick: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the kick'))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply();

    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!member) { await interaction.editReply('Could not find that member in this server.'); return; }
    if (!member.kickable) { await interaction.editReply('I cannot kick this user.'); return; }

    const cfg = await db.getModConfig(interaction.guildId!);
    if (cfg.dm_on_punish) {
      await user.send(`You have been **kicked** from **${interaction.guild!.name}**.\nReason: ${reason}`).catch(() => {});
    }

    await member.kick(reason);

    const modCase = await db.createModCase(
      interaction.guildId!, 'kick', user.id, user.tag,
      interaction.user.id, interaction.user.tag, reason
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle(`Case #${modCase.case_num} — Kick`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    if (cfg.modlog_channel_id) {
      const ch = await interaction.guild!.channels.fetch(cfg.modlog_channel_id).catch(() => null) as TextChannel | null;
      await ch?.send({ embeds: [embed] }).catch(() => {});
    }
  },
};

export default Kick;
