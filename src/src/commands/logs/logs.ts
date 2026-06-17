import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Logs: Command = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure server logging')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('channel')
      .setDescription('Set the log channel')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel (omit to clear)'))
    )
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable logging entirely')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enabled').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('ignore')
      .setDescription('Ignore or un-ignore a channel from logs')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to toggle ignore').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('events')
      .setDescription('Toggle which events are logged')
      .addBooleanOption(o => o.setName('joins').setDescription('Log member joins'))
      .addBooleanOption(o => o.setName('leaves').setDescription('Log member leaves'))
      .addBooleanOption(o => o.setName('edits').setDescription('Log message edits'))
      .addBooleanOption(o => o.setName('deletes').setDescription('Log message deletes'))
      .addBooleanOption(o => o.setName('bans').setDescription('Log bans/unbans'))
      .addBooleanOption(o => o.setName('nicknames').setDescription('Log nickname changes'))
      .addBooleanOption(o => o.setName('roles').setDescription('Log role changes'))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current log settings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      await db.setLogChannel(interaction.guildId!, channel?.id ?? null);
      await interaction.editReply(channel ? `✅ Log channel set to <#${channel.id}>.` : '✅ Log channel cleared.');

    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await db.updateLogConfig(interaction.guildId!, { enabled: enabled ? 1 : 0 });
      await interaction.editReply(`✅ Logging ${enabled ? 'enabled' : 'disabled'}.`);

    } else if (sub === 'ignore') {
      const channel = interaction.options.getChannel('channel', true);
      const cfg = await db.getLogConfig(interaction.guildId!);
      const ignored: string[] = cfg?.ignored_channels ? JSON.parse(cfg.ignored_channels) : [];
      const idx = ignored.indexOf(channel.id);
      if (idx >= 0) { ignored.splice(idx, 1); } else { ignored.push(channel.id); }
      await db.updateLogConfig(interaction.guildId!, { ignored_channels: JSON.stringify(ignored) });
      await interaction.editReply(idx >= 0 ? `✅ <#${channel.id}> is no longer ignored.` : `✅ <#${channel.id}> is now ignored from logs.`);

    } else if (sub === 'events') {
      const fields: any = {};
      const joins = interaction.options.getBoolean('joins'); if (joins !== null) fields.log_joins = joins ? 1 : 0;
      const leaves = interaction.options.getBoolean('leaves'); if (leaves !== null) fields.log_leaves = leaves ? 1 : 0;
      const edits = interaction.options.getBoolean('edits'); if (edits !== null) fields.log_message_edits = edits ? 1 : 0;
      const deletes = interaction.options.getBoolean('deletes'); if (deletes !== null) fields.log_message_deletes = deletes ? 1 : 0;
      const bans = interaction.options.getBoolean('bans'); if (bans !== null) fields.log_bans = bans ? 1 : 0;
      const nicks = interaction.options.getBoolean('nicknames'); if (nicks !== null) fields.log_nickname_changes = nicks ? 1 : 0;
      const roles = interaction.options.getBoolean('roles'); if (roles !== null) fields.log_role_changes = roles ? 1 : 0;
      await db.updateLogConfig(interaction.guildId!, fields);
      await interaction.editReply('✅ Log events updated.');

    } else {
      const cfg = await db.getLogConfig(interaction.guildId!);
      if (!cfg) { await interaction.editReply('Logging not configured yet.'); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Log Settings')
        .addFields(
          { name: 'Channel', value: cfg.channel_id ? `<#${cfg.channel_id}>` : 'Not set', inline: true },
          { name: 'Enabled', value: cfg.enabled ? '✅' : '❌', inline: true },
          { name: 'Joins', value: cfg.log_joins ? '✅' : '❌', inline: true },
          { name: 'Leaves', value: cfg.log_leaves ? '✅' : '❌', inline: true },
          { name: 'Edits', value: cfg.log_message_edits ? '✅' : '❌', inline: true },
          { name: 'Deletes', value: cfg.log_message_deletes ? '✅' : '❌', inline: true },
          { name: 'Bans', value: cfg.log_bans ? '✅' : '❌', inline: true },
          { name: 'Nicknames', value: cfg.log_nickname_changes ? '✅' : '❌', inline: true },
          { name: 'Roles', value: cfg.log_role_changes ? '✅' : '❌', inline: true },
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Logs;
