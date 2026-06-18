import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const TRIGGER_TYPES = ['spam', 'caps', 'links', 'words', 'mentions', 'regex'] as const;
const ACTION_TYPES = ['delete', 'warn', 'timeout', 'kick', 'ban'] as const;

const Automod: Command = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage automod rules')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add an automod rule')
      .addStringOption(o => o.setName('name').setDescription('Rule name').setRequired(true))
      .addStringOption(o => o.setName('trigger').setDescription('Trigger type: spam, caps, links, words, mentions, regex').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Action: delete, warn, timeout, kick, ban').setRequired(true))
      .addStringOption(o => o.setName('value').setDescription('Trigger value (e.g. word list, message count, caps %, regex)'))
      .addIntegerOption(o => o.setName('duration').setDescription('Timeout duration in seconds (only for timeout action)'))
      .addStringOption(o => o.setName('reason').setDescription('Reason shown to user'))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all automod rules')
    )
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete an automod rule')
      .addIntegerOption(o => o.setName('id').setDescription('Rule ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable a rule')
      .addIntegerOption(o => o.setName('id').setDescription('Rule ID').setRequired(true))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true))
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const name = interaction.options.getString('name', true);
      const trigger = interaction.options.getString('trigger', true);
      const action = interaction.options.getString('action', true);
      const value = interaction.options.getString('value') ?? '';
      const duration = interaction.options.getInteger('duration');
      const reason = interaction.options.getString('reason');

      if (!TRIGGER_TYPES.includes(trigger as any)) {
        await interaction.editReply(`❌ Invalid trigger. Choose from: ${TRIGGER_TYPES.join(', ')}`); return;
      }
      if (!ACTION_TYPES.includes(action as any)) {
        await interaction.editReply(`❌ Invalid action. Choose from: ${ACTION_TYPES.join(', ')}`); return;
      }

      const rule = await db.createAutomodRule(interaction.guildId!, name, trigger, value, action, duration, reason);
      await interaction.editReply(`✅ Automod rule **${name}** (ID: ${rule.id}) created. Trigger: \`${trigger}\`, Action: \`${action}\`.`);

    } else if (sub === 'list') {
      const rules = await db.getAutomodRules(interaction.guildId!);
      if (!rules.length) { await interaction.editReply('No automod rules configured.'); return; }

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Automod Rules')
        .setDescription(rules.map(r =>
          `**#${r.id}** ${r.enabled ? '✅' : '❌'} **${r.name}** — trigger: \`${r.trigger_type}\` → action: \`${r.action}\`${r.trigger_value ? ` (value: \`${r.trigger_value.slice(0, 30)}\`)` : ''}`
        ).join('\n'))
        .setFooter({ text: `${rules.length} rule(s)` });

      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'delete') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.deleteAutomodRule(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Rule #${id} deleted.` : `❌ Rule #${id} not found.`);

    } else if (sub === 'toggle') {
      const id = interaction.options.getInteger('id', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      await db.toggleAutomodRule(id, interaction.guildId!, enabled);
      await interaction.editReply(`✅ Rule #${id} ${enabled ? 'enabled' : 'disabled'}.`);
    }
  },
};

export default Automod;
