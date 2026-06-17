import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Case: Command = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('View a mod case')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('number').setDescription('Case number').setRequired(true))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const caseNum = interaction.options.getInteger('number', true);
    const modCase = await db.getModCase(interaction.guildId!, caseNum);
    if (!modCase) { await interaction.reply({ content: `❌ Case #${caseNum} not found.`, ephemeral: true }); return; }

    const typeColors: Record<string, number> = {
      ban: Colors.Red, unban: Colors.Green, kick: Colors.Orange,
      timeout: Colors.Yellow, removetimeout: Colors.Green, warn: Colors.Yellow, report: Colors.Blue,
    };

    const embed = new EmbedBuilder()
      .setColor(typeColors[modCase.type] ?? Colors.Grey)
      .setTitle(`Case #${modCase.case_num} — ${capitalize(modCase.type)}`)
      .addFields(
        { name: 'User', value: `${modCase.user_tag} (${modCase.user_id})`, inline: true },
        { name: 'Moderator', value: `${modCase.mod_tag} (${modCase.mod_id})`, inline: true },
        { name: 'Reason', value: modCase.reason ?? 'No reason provided' },
        { name: 'Date', value: `<t:${Math.floor(modCase.created_at / 1000)}:F>`, inline: true },
        ...(modCase.expires_at ? [{ name: 'Expires', value: `<t:${Math.floor(modCase.expires_at / 1000)}:R>`, inline: true }] : []),
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export default Case;
