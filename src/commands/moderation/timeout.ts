import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

function parseDuration(s: string): number | null {
  const re = /^(\d+)(s|m|h|d)$/i;
  const m = re.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1]);
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const ms = n * (units[m[2].toLowerCase()] ?? 0);
  if (!ms || ms > 28 * 86400000) return null; // Discord max: 28 days
  return ms;
}

const Timeout: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member (max 28 days)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 10m, 1h, 7d)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply();

    const ms = parseDuration(durationStr);
    if (!ms) { await interaction.editReply('Invalid duration. Use formats like `10m`, `1h`, `7d` (max 28d).'); return; }

    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!member) { await interaction.editReply('Could not find that member.'); return; }
    if (!member.moderatable) { await interaction.editReply('I cannot timeout this user.'); return; }

    const cfg = await db.getModConfig(interaction.guildId!);
    if (cfg.dm_on_punish) {
      const until = Math.floor((Date.now() + ms) / 1000);
      await user.send(`You have been **timed out** in **${interaction.guild!.name}** until <t:${until}:R>.\nReason: ${reason}`).catch(() => {});
    }

    await member.timeout(ms, reason);

    const modCase = await db.createModCase(
      interaction.guildId!, 'timeout', user.id, user.tag,
      interaction.user.id, interaction.user.tag, reason, Date.now() + ms
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle(`Case #${modCase.case_num} — Timeout`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Duration', value: durationStr, inline: true },
        { name: 'Expires', value: `<t:${Math.floor((Date.now() + ms) / 1000)}:R>`, inline: true },
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

export default Timeout;
