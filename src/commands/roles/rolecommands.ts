import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Rolecommands: Command = {
  data: new SlashCommandBuilder()
    .setName('rolecommands')
    .setDescription('Manage self-assignable roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Register a self-assignable role')
      .addStringOption(o => o.setName('name').setDescription('Command name users will use').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('The role to assign').setRequired(true))
      .addStringOption(o => o.setName('group').setDescription('Group name (only one role per group can be held)'))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a self-assignable role by ID')
      .addIntegerOption(o => o.setName('id').setDescription('Role command ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all self-assignable roles')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const name = interaction.options.getString('name', true);
      const role = interaction.options.getRole('role', true);
      const group = interaction.options.getString('group');
      const rc = await db.addRoleCommand(interaction.guildId!, name, role.id, group);
      await interaction.editReply(`✅ Role command **${name}** → <@&${role.id}> created (ID: ${rc.id}).`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeRoleCommand(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Role command #${id} removed.` : `❌ Role command #${id} not found.`);

    } else {
      const cmds = await db.getRoleCommands(interaction.guildId!);
      if (!cmds.length) { await interaction.editReply('No self-assignable roles configured.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Self-Assignable Roles')
        .setDescription(cmds.map(c => `**#${c.id}** \`${c.name}\` → <@&${c.role_id}>${c.group_name ? ` [${c.group_name}]` : ''}`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Rolecommands;
