import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

const Starboard: Command = {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure the starboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('channel').setDescription('Set the starboard channel')
        .addChannelOption(o => o.setName('channel').setDescription('Where starred messages are posted').setRequired(true)))
    .addSubcommand(s =>
      s.setName('threshold').setDescription('Set the minimum star count to appear on the starboard')
        .addIntegerOption(o => o.setName('count').setDescription('Minimum reactions needed').setRequired(true).setMinValue(1).setMaxValue(50)))
    .addSubcommand(s =>
      s.setName('emoji').setDescription('Set the reaction emoji to watch')
        .addStringOption(o => o.setName('emoji').setDescription('Emoji (default ⭐)').setRequired(true)))
    .addSubcommand(s =>
      s.setName('toggle').setDescription('Enable or disable the starboard'))
    .addSubcommand(s =>
      s.setName('view').setDescription('View current starboard settings')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const config = await db.getStarboardConfig(interaction.guildId!);

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      await db.setStarboardConfig(interaction.guildId!, { channel_id: channel.id });
      return interaction.reply({ content: `✅ Starboard channel set to <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'threshold') {
      const count = interaction.options.getInteger('count', true);
      await db.setStarboardConfig(interaction.guildId!, { threshold: count });
      return interaction.reply({ content: `✅ Starboard threshold set to **${count}** reactions.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'emoji') {
      const emoji = interaction.options.getString('emoji', true).trim();
      await db.setStarboardConfig(interaction.guildId!, { emoji });
      return interaction.reply({ content: `✅ Starboard emoji set to ${emoji}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'toggle') {
      const newState = config ? !config.enabled : true;
      await db.setStarboardConfig(interaction.guildId!, { enabled: newState ? 1 : 0 });
      return interaction.reply({ content: `✅ Starboard is now **${newState ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle('⭐ Starboard Config')
        .addFields(
          { name: 'Status', value: config?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Channel', value: config?.channel_id ? `<#${config.channel_id}>` : 'Not set', inline: true },
          { name: 'Emoji', value: config?.emoji ?? '⭐', inline: true },
          { name: 'Threshold', value: `${config?.threshold ?? 3} reactions`, inline: true },
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default Starboard;
