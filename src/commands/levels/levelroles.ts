import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getLevelRoles, addLevelRole, removeLevelRole } from '../../utils/db';

const Levelroles: Command = {
  data: new SlashCommandBuilder()
    .setName('levelroles')
    .setDescription('Assign roles automatically when users reach a level')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Assign a role when a user reaches a specific level')
      .addIntegerOption(o => o.setName('level').setDescription('Level required').setRequired(true).setMinValue(1))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a level role binding')
      .addIntegerOption(o => o.setName('id').setDescription('Binding ID from /levelroles list').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all level role bindings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'add') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      const binding = await addLevelRole(guildId, level, role.id);
      await interaction.reply({
        content: `✅ <@&${role.id}> will be assigned when users reach **level ${level}**. (ID: ${binding.id})`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const removed = await removeLevelRole(id, guildId);
      await interaction.reply({
        content: removed ? `✅ Level role binding #${id} removed.` : `❌ No binding found with ID ${id}.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const rows = await getLevelRoles(guildId);
      if (rows.length === 0) {
        await interaction.reply({ content: 'No level roles configured. Use `/levelroles add` to set one up.', ephemeral: true });
        return;
      }
      const lines = rows.map(r => `**ID ${r.id}** — Level **${r.level}** → <@&${r.role_id}>`);
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('Level Roles')
        .setDescription(lines.join('\n'));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
  },
};

export default Levelroles;
