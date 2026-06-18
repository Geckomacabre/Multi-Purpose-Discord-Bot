import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

const Welcome: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages for new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('channel').setDescription('Set the welcome channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel for welcome messages').setRequired(true)))
    .addSubcommand(s =>
      s.setName('message').setDescription('Set the welcome message')
        .addStringOption(o => o.setName('text').setDescription('Message template. Supports {user}, {username}, {server}, {membercount}').setRequired(true)))
    .addSubcommand(s =>
      s.setName('dm').setDescription('Set a DM message sent to new members (or "none" to disable)')
        .addStringOption(o => o.setName('text').setDescription('DM template (use "none" to disable)').setRequired(true)))
    .addSubcommand(s =>
      s.setName('toggle').setDescription('Enable or disable welcome messages'))
    .addSubcommand(s =>
      s.setName('test').setDescription('Preview the welcome message for yourself'))
    .addSubcommand(s =>
      s.setName('view').setDescription('View current welcome settings')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const config = await db.getWelcomeConfig(interaction.guildId!);

    const format = (msg: string) => msg
      .replace(/\{user\}/g, `<@${interaction.user.id}>`)
      .replace(/\{username\}/g, interaction.user.username)
      .replace(/\{server\}/g, interaction.guild!.name)
      .replace(/\{membercount\}/g, interaction.guild!.memberCount.toString())
      .replace(/\{#membercount\}/g, `#${interaction.guild!.memberCount}`);

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      await db.setWelcomeConfig(interaction.guildId!, { channel_id: channel.id });
      return interaction.reply({ content: `✅ Welcome messages will be sent to <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      await db.setWelcomeConfig(interaction.guildId!, { message: text });
      return interaction.reply({ content: `✅ Welcome message updated.\nPreview: ${format(text)}`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'dm') {
      const text = interaction.options.getString('text', true);
      const dm_message = text.toLowerCase() === 'none' ? null : text;
      await db.setWelcomeConfig(interaction.guildId!, { dm_message });
      return interaction.reply({
        content: dm_message ? `✅ DM message set.\nPreview: ${format(dm_message)}` : '✅ DM message disabled.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'toggle') {
      const newState = config ? !config.enabled : true;
      await db.setWelcomeConfig(interaction.guildId!, { enabled: newState ? 1 : 0 });
      return interaction.reply({ content: `✅ Welcome messages are now **${newState ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'test') {
      if (!config?.channel_id) {
        return interaction.reply({ content: 'No welcome channel set. Use `/welcome channel` first.', flags: MessageFlags.Ephemeral });
      }
      const channel = interaction.guild!.channels.cache.get(config.channel_id) as any;
      if (!channel?.isTextBased()) {
        return interaction.reply({ content: 'The configured welcome channel no longer exists or is invalid.', flags: MessageFlags.Ephemeral });
      }
      await channel.send(format(config.message));
      return interaction.reply({ content: `✅ Test message sent to <#${config.channel_id}>.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('👋 Welcome Config')
        .addFields(
          { name: 'Status', value: config?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Channel', value: config?.channel_id ? `<#${config.channel_id}>` : 'Not set', inline: true },
          { name: 'Message', value: config?.message ?? 'Default', inline: false },
          { name: 'DM Message', value: config?.dm_message ?? 'None', inline: false },
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default Welcome;
