import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Warn: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    await interaction.deferReply();

    if (user.bot) { await interaction.editReply('You cannot warn a bot.'); return; }

    await db.addWarning(interaction.guildId!, user.id, interaction.user.id, reason);

    const modCase = await db.createModCase(
      interaction.guildId!, 'warn', user.id, user.tag,
      interaction.user.id, interaction.user.tag, reason
    );

    const cfg = await db.getModConfig(interaction.guildId!);
    if (cfg.dm_on_punish) {
      await user.send(`You have received a **warning** in **${interaction.guild!.name}**.\nReason: ${reason}`).catch(() => {});
    }

    const warnings = await db.getWarnings(interaction.guildId!, user.id);

    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle(`Case #${modCase.case_num} — Warning`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Total Warnings', value: String(warnings.length), inline: true },
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

export default Warn;
