import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

const BirthdayConfig: Command = {
  data: new SlashCommandBuilder()
    .setName('birthdayconfig')
    .setDescription('Configure birthday announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('channel').setDescription('Set the birthday announcement channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel for announcements').setRequired(true)))
    .addSubcommand(s =>
      s.setName('toggle').setDescription('Enable or disable birthday announcements'))
    .addSubcommand(s =>
      s.setName('view').setDescription('View current birthday settings')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const config = await db.getBirthdayConfig(interaction.guildId!);

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      await db.setBirthdayConfig(interaction.guildId!, { channel_id: channel.id });
      return interaction.reply({ content: `✅ Birthday announcements will be sent to <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'toggle') {
      const newState = !config.enabled;
      await db.setBirthdayConfig(interaction.guildId!, { enabled: newState ? 1 : 0 });
      return interaction.reply({ content: `✅ Birthday announcements are now **${newState ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('🎂 Birthday Config')
        .addFields(
          { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Channel', value: config.channel_id ? `<#${config.channel_id}>` : 'Not set', inline: true },
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default BirthdayConfig;
