import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const TRIGGER_TYPES = ['command', 'startswith', 'contains', 'regex', 'exact'] as const;

const CC: Command = {
  data: new SlashCommandBuilder()
    .setName('cc')
    .setDescription('Manage custom commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a custom command')
      .addStringOption(o => o.setName('name').setDescription('Command name').setRequired(true))
      .addStringOption(o => o.setName('trigger_type').setDescription('Trigger type').setRequired(true)
        .addChoices(
          { name: 'command (exact prefix match)', value: 'command' },
          { name: 'startswith', value: 'startswith' },
          { name: 'contains', value: 'contains' },
          { name: 'exact', value: 'exact' },
          { name: 'regex', value: 'regex' },
        ))
      .addStringOption(o => o.setName('trigger').setDescription('The trigger text or pattern').setRequired(true))
      .addStringOption(o => o.setName('response').setDescription('Response (use {user}, {username}, {server}, {channel}, {membercount})').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('edit')
      .setDescription('Edit a custom command response')
      .addIntegerOption(o => o.setName('id').setDescription('Command ID').setRequired(true))
      .addStringOption(o => o.setName('response').setDescription('New response').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a custom command')
      .addIntegerOption(o => o.setName('id').setDescription('Command ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable a custom command')
      .addIntegerOption(o => o.setName('id').setDescription('Command ID').setRequired(true))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all custom commands')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);
      const triggerType = interaction.options.getString('trigger_type', true) as any;
      const trigger = interaction.options.getString('trigger', true);
      const response = interaction.options.getString('response', true);
      const cmd = await db.createCustomCommand(interaction.guildId!, name, triggerType, trigger, response, interaction.user.id);
      await interaction.editReply(`✅ Custom command **${name}** created (ID: ${cmd.id}). Trigger: \`${triggerType}\` → \`${trigger}\``);

    } else if (sub === 'edit') {
      const id = interaction.options.getInteger('id', true);
      const response = interaction.options.getString('response', true);
      const ok = await db.editCustomCommand(id, interaction.guildId!, response);
      await interaction.editReply(ok ? `✅ Command #${id} updated.` : `❌ Command #${id} not found.`);

    } else if (sub === 'delete') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.deleteCustomCommand(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Command #${id} deleted.` : `❌ Command #${id} not found.`);

    } else if (sub === 'toggle') {
      const id = interaction.options.getInteger('id', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      await db.toggleCustomCommand(id, interaction.guildId!, enabled);
      await interaction.editReply(`✅ Command #${id} ${enabled ? 'enabled' : 'disabled'}.`);

    } else {
      const cmds = await db.getAllCustomCommands(interaction.guildId!);
      if (!cmds.length) { await interaction.editReply('No custom commands configured.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Custom Commands')
        .setDescription(cmds.map(c => `**#${c.id}** ${c.enabled ? '✅' : '❌'} **${c.name}** — \`${c.trigger_type}\`: \`${c.trigger.slice(0, 30)}\``).join('\n'))
        .setFooter({ text: `${cmds.length} command(s). Available template vars: {user} {username} {server} {channel} {membercount}` });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default CC;
