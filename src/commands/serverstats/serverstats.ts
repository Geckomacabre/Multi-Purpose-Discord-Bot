import {
  ApplicationIntegrationType, ChannelType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const STAT_TYPES = ['members', 'humans', 'bots', 'channels', 'roles'] as const;
type StatType = typeof STAT_TYPES[number];
const STAT_LABELS: Record<StatType, string> = { members: 'Members', humans: 'Humans', bots: 'Bots', channels: 'Channels', roles: 'Roles' };

const ServerStats: Command = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Server statistics')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('view').setDescription('View server activity statistics')
      .addIntegerOption(o => o.setName('hours').setDescription('Hours to look back (default: 24, max: 168)').setMinValue(1).setMaxValue(168)))
    .addSubcommandGroup(g => g.setName('channels').setDescription('Auto-updating stat channels')
      .addSubcommand(s => s.setName('add').setDescription('Create a new stat channel')
        .addStringOption(o => o.setName('type').setDescription('What stat to display').setRequired(true)
          .addChoices(...STAT_TYPES.map(t => ({ name: STAT_LABELS[t], value: t }))))
        .addStringOption(o => o.setName('label').setDescription('Label prefix (default: stat type name)')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a stat channel')
        .addIntegerOption(o => o.setName('id').setDescription('ID from /serverstats channels list').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all stat channels'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'channels') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ ...cv2Text('❌ You need **Manage Server** to manage stat channels.'), flags: IS_CV2 | MessageFlags.Ephemeral });
        return;
      }
      const guild = interaction.guild!;

      if (sub === 'add') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const type = interaction.options.getString('type', true) as StatType;
        const label = interaction.options.getString('label') ?? STAT_LABELS[type];
        const channel = await guild.channels.create({
          name: `${label}: 0`,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: ['Connect'] },
            { id: interaction.client.user!.id, allow: ['ManageChannels', 'Connect'] },
          ],
        });
        await db.addStatChannel(guild.id, channel.id, type, label);
        await interaction.editReply(cv2Text(`✅ Created stat channel <#${channel.id}>. It will update every 10 minutes.`));

      } else if (sub === 'remove') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const id = interaction.options.getInteger('id', true);
        const all = await db.getStatChannels(guild.id);
        const sc = all.find(s => s.id === id);
        if (!sc) { await interaction.editReply(cv2Text('No stat channel found with that ID.')); return; }
        await db.removeStatChannelById(id, guild.id);
        const channel = guild.channels.cache.get(sc.channel_id);
        if (channel) await channel.delete().catch(() => {});
        await interaction.editReply(cv2Text('✅ Stat channel removed.'));

      } else {
        const all = await db.getStatChannels(guild.id);
        if (!all.length) { await interaction.reply({ ...cv2Text('No stat channels configured.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return; }
        const container = new ContainerBuilder()
          .setAccentColor(Colors.Blue)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**📊 Stat Channels**\n\n${all.map(s => `**ID ${s.id}** — <#${s.channel_id}> (${s.type})`).join('\n')}`
          ));
        await interaction.reply({ flags: IS_CV2 | MessageFlags.Ephemeral, components: [container] });
      }
      return;
    }

    // view subcommand
    const hours = interaction.options.getInteger('hours') ?? 24;
    await interaction.deferReply();
    const stats = await db.getServerStats(interaction.guildId!, hours);
    const totals = stats.reduce((acc, s) => ({
      messages: acc.messages + s.messages,
      joins: acc.joins + s.joins,
      leaves: acc.leaves + s.leaves,
    }), { messages: 0, joins: 0, leaves: 0 });
    const container = new ContainerBuilder()
      .setAccentColor(Colors.Blue)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Server Stats — Last ${hours}h**\n\n💬 **Messages:** ${totals.messages.toLocaleString()}\n➕ **Joins:** ${totals.joins.toLocaleString()}\n➖ **Leaves:** ${totals.leaves.toLocaleString()}\n👥 **Current Members:** ${interaction.guild!.memberCount.toLocaleString()}`
      ));
    await interaction.editReply({ flags: IS_CV2, components: [container] });
  },
};

export default ServerStats;
