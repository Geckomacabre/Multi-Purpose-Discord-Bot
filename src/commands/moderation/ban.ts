import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Ban: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban'))
    .addIntegerOption(o => o.setName('days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7))
    .addStringOption(o => o.setName('duration').setDescription('Temporary ban duration (e.g. 1d, 12h). Leave blank for permanent.')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const days = interaction.options.getInteger('days') ?? 0;
    const durationStr = interaction.options.getString('duration');

    await interaction.deferReply();

    let expiresAt: number | null = null;
    if (durationStr) {
      const ms = parseDuration(durationStr);
      if (!ms) { await interaction.editReply('Invalid duration. Use formats like `1d`, `12h`, `30m`.'); return; }
      expiresAt = Date.now() + ms;
    }

    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (member) {
      if (!member.bannable) { await interaction.editReply('I cannot ban this user.'); return; }
      if (member.roles.highest.position >= interaction.guild!.members.me!.roles.highest.position) {
        await interaction.editReply('That user has a higher or equal role than me.'); return;
      }
    }

    const cfg = await db.getModConfig(interaction.guildId!);
    if (cfg.dm_on_punish) {
      await user.send(`You have been **banned** from **${interaction.guild!.name}**.\nReason: ${reason}${expiresAt ? `\nExpires: <t:${Math.floor(expiresAt / 1000)}:R>` : ''}`).catch(() => {});
    }

    try {
      await interaction.guild!.members.ban(user.id, { reason, deleteMessageSeconds: days * 86400 });
    } catch {
      await interaction.editReply('Failed to ban user. Check my permissions.'); return;
    }

    const modCase = await db.createModCase(
      interaction.guildId!, 'ban', user.id, user.tag,
      interaction.user.id, interaction.user.tag, reason, expiresAt
    );

    // Schedule unban if temporary
    if (expiresAt) {
      await db.createScheduledTask('unban', expiresAt, {
        guild_id: interaction.guildId!,
        user_id: user.id,
        data: { caseNum: modCase.case_num },
      });
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(`Case #${modCase.case_num} — Ban`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        ...(expiresAt ? [{ name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>` }] : [])
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    if (cfg.modlog_channel_id) {
      const ch = await interaction.guild!.channels.fetch(cfg.modlog_channel_id).catch(() => null) as TextChannel | null;
      await ch?.send({ embeds: [embed] }).catch(() => {});
    }
  },
};

function parseDuration(s: string): number | null {
  const re = /^(\d+)(s|m|h|d|w)$/i;
  const m = re.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * (units[m[2].toLowerCase()] ?? 0) || null;
}

export default Ban;
