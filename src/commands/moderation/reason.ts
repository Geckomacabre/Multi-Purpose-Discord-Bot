import {
  ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType,
  PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Reason: Command = {
  data: new SlashCommandBuilder()
    .setName('reason')
    .setDescription('Edit the reason for a mod case')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('case').setDescription('Case number').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('New reason').setRequired(true))
    as any,

  async run(interaction: ChatInputCommandInteraction) {
    const caseNum = interaction.options.getInteger('case', true);
    const reason = interaction.options.getString('reason', true);

    const modCase = await db.getModCase(interaction.guildId!, caseNum);
    if (!modCase) { await interaction.reply({ content: `❌ Case #${caseNum} not found.`, ephemeral: true }); return; }

    await db.updateModCaseReason(interaction.guildId!, caseNum, reason);
    await interaction.reply({ content: `✅ Updated reason for case #${caseNum}.`, ephemeral: true });
  },
};

export default Reason;
