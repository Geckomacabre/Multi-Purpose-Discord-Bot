import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  ChannelType, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

const TYPES = ['members', 'humans', 'bots', 'channels', 'roles'] as const;
type StatType = typeof TYPES[number];

const LABELS: Record<StatType, string> = {
  members: 'Members',
  humans: 'Humans',
  bots: 'Bots',
  channels: 'Channels',
  roles: 'Roles',
};

const StatChannels: Command = {
  data: new SlashCommandBuilder()
    .setName('statschannels')
    .setDescription('Create auto-updating stat channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('add').setDescription('Create a new stat channel')
        .addStringOption(o =>
          o.setName('type').setDescription('What stat to display').setRequired(true)
            .addChoices(...TYPES.map(t => ({ name: LABELS[t], value: t }))))
        .addStringOption(o => o.setName('label').setDescription('Label prefix (default: stat type name)')))
    .addSubcommand(s =>
      s.setName('remove').setDescription('Remove a stat channel')
        .addIntegerOption(o => o.setName('id').setDescription('ID from /statschannels list').setRequired(true)))
    .addSubcommand(s =>
      s.setName('list').setDescription('List all stat channels')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;

    if (sub === 'add') {
      const type = interaction.options.getString('type', true) as StatType;
      const label = interaction.options.getString('label') ?? LABELS[type];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = await guild.channels.create({
        name: `${label}: 0`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: ['Connect'] },
          { id: interaction.client.user!.id, allow: ['ManageChannels', 'Connect'] },
        ],
      });

      await db.addStatChannel(guild.id, channel.id, type, label);
      return interaction.editReply(`✅ Created stat channel <#${channel.id}>. It will update every 10 minutes.`);
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const all = await db.getStatChannels(guild.id);
      const sc = all.find(s => s.id === id);
      if (!sc) return interaction.editReply('No stat channel found with that ID.');

      await db.removeStatChannelById(id, guild.id);
      const channel = guild.channels.cache.get(sc.channel_id);
      if (channel) await channel.delete().catch(() => {});
      return interaction.editReply('✅ Stat channel removed.');
    }

    if (sub === 'list') {
      const all = await db.getStatChannels(guild.id);
      if (!all.length) return interaction.reply({ content: 'No stat channels configured.', flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('📊 Stat Channels')
        .setDescription(all.map(s => `**ID ${s.id}** — <#${s.channel_id}> (${s.type})`).join('\n'));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default StatChannels;
