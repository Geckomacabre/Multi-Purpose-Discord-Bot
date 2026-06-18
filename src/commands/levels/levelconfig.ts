import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, Colors,
  EmbedBuilder, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getXpConfig, setXpConfig } from '../../utils/db';

const Levelconfig: Command = {
  data: new SlashCommandBuilder()
    .setName('levelconfig')
    .setDescription('Configure the leveling / XP system')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable XP gain')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable XP?').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('channel')
      .setDescription('Set the channel for level-up announcements')
      .addChannelOption(o => o.setName('channel').setDescription('Announcement channel (leave blank to announce in the message channel)').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub => sub
      .setName('xp')
      .setDescription('Set XP per message and cooldown')
      .addIntegerOption(o => o.setName('min').setDescription('Minimum XP per message (default 15)').setMinValue(1))
      .addIntegerOption(o => o.setName('max').setDescription('Maximum XP per message (default 25)').setMinValue(1))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown between XP awards in seconds (default 60)').setMinValue(5))
    )
    .addSubcommand(sub => sub
      .setName('message')
      .setDescription('Set the level-up announcement message')
      .addStringOption(o => o.setName('text').setDescription('Message text. Use {user}, {username}, {level}').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current leveling settings')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await setXpConfig(guildId, { enabled: enabled ? 1 : 0 });
      await interaction.reply({ content: `XP system **${enabled ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      await setXpConfig(guildId, { level_up_channel_id: channel?.id ?? null });
      await interaction.reply({
        content: channel
          ? `Level-up announcements will be posted in <#${channel.id}>.`
          : 'Level-up announcements will now post in the channel where the user is chatting.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'xp') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      const cooldown = interaction.options.getInteger('cooldown');
      if (min !== null && max !== null && min > max) {
        await interaction.reply({ content: '❌ Min XP cannot be greater than max XP.', flags: MessageFlags.Ephemeral }); return;
      }
      const fields: Parameters<typeof setXpConfig>[1] = {};
      if (min !== null) fields.xp_min = min;
      if (max !== null) fields.xp_max = max;
      if (cooldown !== null) fields.cooldown_seconds = cooldown;
      await setXpConfig(guildId, fields);
      await interaction.reply({ content: 'XP settings updated.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      await setXpConfig(guildId, { level_up_message: text });
      await interaction.reply({ content: `Level-up message set to:\n> ${text}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'view') {
      const cfg = await getXpConfig(guildId);
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('Leveling Config')
        .addFields(
          { name: 'Status', value: cfg.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'XP per Message', value: `${cfg.xp_min}–${cfg.xp_max} XP`, inline: true },
          { name: 'Cooldown', value: `${cfg.cooldown_seconds}s`, inline: true },
          { name: 'Announce Channel', value: cfg.level_up_channel_id ? `<#${cfg.level_up_channel_id}>` : 'Message channel', inline: true },
          { name: 'Level-up Message', value: cfg.level_up_message },
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
  },
};

export default Levelconfig;
