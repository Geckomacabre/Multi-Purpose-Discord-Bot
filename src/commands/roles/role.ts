import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Role: Command = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Toggle a self-assignable role')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('name').setDescription('Role command name').setRequired(true)) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const name = interaction.options.getString('name', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rc = await db.getRoleCommandByName(interaction.guildId!, name);
    if (!rc) { await interaction.editReply(`❌ No self-assignable role named \`${name}\`. Use \`/rolecommands list\` to see available roles.`); return; }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const hasRole = member.roles.cache.has(rc.role_id);

    // Enforce group: if adding and group exists, remove other group roles first
    if (!hasRole && rc.group_name) {
      const groupCmds = (await db.getRoleCommands(interaction.guildId!)).filter(c => c.group_name === rc.group_name && c.id !== rc.id);
      for (const other of groupCmds) {
        if (member.roles.cache.has(other.role_id)) {
          await member.roles.remove(other.role_id).catch(() => {});
        }
      }
    }

    if (hasRole) {
      await member.roles.remove(rc.role_id).catch(() => {});
      await interaction.editReply(`✅ Removed <@&${rc.role_id}>.`);
    } else {
      await member.roles.add(rc.role_id).catch(() => {});
      await interaction.editReply(`✅ Added <@&${rc.role_id}>.`);
    }
  },
};

export default Role;
