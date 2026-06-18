import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, Colors, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import * as db from '../../utils/db';

function parseDuration(s: string): number | null {
  const re = /^(\d+)(m|h|d|w)$/i;
  const m = re.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1]);
  const units: Record<string, number> = { m: 60, h: 3600, d: 86400, w: 604800 };
  return n * (units[m[2].toLowerCase()] ?? 0) || null;
}

function formatDuration(seconds: number): string {
  if (seconds >= 604800) return `${Math.floor(seconds / 604800)}w`;
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 60)}m`;
}

const Topics: Command = {
  data: new SlashCommandBuilder()
    .setName('topics')
    .setDescription('Manage automatic discussion topic rotation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s =>
      s.setName('setup').setDescription('Set up topic rotation for a channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post topics in').setRequired(true))
        .addStringOption(o => o.setName('interval').setDescription('How often to post (e.g. 6h, 1d, 12h)').setRequired(true))
        .addStringOption(o =>
          o.setName('mode').setDescription('Order to cycle through topics')
            .addChoices(
              { name: 'Sequential (in order)', value: 'sequential' },
              { name: 'Random', value: 'random' },
            )))
    .addSubcommand(s =>
      s.setName('remove').setDescription('Stop topic rotation for a channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to remove').setRequired(true)))
    .addSubcommand(s =>
      s.setName('add').setDescription('Add a topic to a channel\'s rotation')
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
        .addStringOption(o => o.setName('topic').setDescription('The discussion topic text').setRequired(true)))
    .addSubcommand(s =>
      s.setName('delete').setDescription('Remove a topic by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Topic ID from /topics list').setRequired(true)))
    .addSubcommand(s =>
      s.setName('list').setDescription('List topics for a channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand(s =>
      s.setName('post').setDescription('Manually post the next topic now')
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const intervalStr = interaction.options.getString('interval', true);
      const mode = (interaction.options.getString('mode') ?? 'sequential') as 'sequential' | 'random';
      const seconds = parseDuration(intervalStr);
      if (!seconds) return interaction.reply({ content: 'Invalid interval. Use formats like `6h`, `1d`, `30m`.', flags: MessageFlags.Ephemeral });

      await db.setTopicChannel(guild.id, channel.id, seconds, mode);
      return interaction.reply({
        content: `✅ Topic rotation set up for <#${channel.id}> every **${formatDuration(seconds)}** (${mode} mode).\nAdd topics with \`/topics add\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel', true);
      await db.removeTopicChannel(guild.id, channel.id);
      return interaction.reply({ content: `✅ Topic rotation removed from <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add') {
      const channel = interaction.options.getChannel('channel', true);
      const text = interaction.options.getString('topic', true);
      const tc = await db.getTopicChannel(guild.id, channel.id);
      if (!tc) return interaction.reply({ content: `<#${channel.id}> is not set up for topic rotation yet. Use \`/topics setup\` first.`, flags: MessageFlags.Ephemeral });

      const topic = await db.addTopic(guild.id, channel.id, text);
      return interaction.reply({ content: `✅ Topic added (ID: **${topic.id}**).`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      const id = interaction.options.getInteger('id', true);
      const removed = await db.removeTopic(id, guild.id);
      if (!removed) return interaction.reply({ content: 'No topic found with that ID.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: '✅ Topic removed.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const channel = interaction.options.getChannel('channel', true);
      const tc = await db.getTopicChannel(guild.id, channel.id);
      const topics = await db.getTopics(guild.id, channel.id);

      if (!tc) return interaction.reply({ content: `<#${channel.id}> has no topic rotation configured.`, flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`💬 Topics for #${(guild.channels.cache.get(channel.id) as any)?.name ?? channel.id}`)
        .addFields(
          { name: 'Interval', value: formatDuration(tc.interval_seconds), inline: true },
          { name: 'Mode', value: tc.mode, inline: true },
          { name: 'Last Posted', value: tc.last_posted ? `<t:${Math.floor(tc.last_posted / 1000)}:R>` : 'Never', inline: true },
        )
        .setDescription(
          topics.length
            ? topics.map(t => `**#${t.id}** ${t.text}`).join('\n')
            : 'No topics added yet. Use `/topics add` to add some.',
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'post') {
      const channel = interaction.options.getChannel('channel', true);
      const tc = await db.getTopicChannel(guild.id, channel.id);
      if (!tc) return interaction.reply({ content: `<#${channel.id}> is not set up for topic rotation.`, flags: MessageFlags.Ephemeral });

      const topic = await db.getNextTopic(guild.id, channel.id, tc.mode);
      if (!topic) return interaction.reply({ content: 'No topics added yet. Use `/topics add`.', flags: MessageFlags.Ephemeral });

      const ch = guild.channels.cache.get(channel.id) as any;
      if (!ch?.isTextBased()) return interaction.reply({ content: 'Channel not found or not a text channel.', flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('💬 Discussion Topic')
        .setDescription(topic.text)
        .setTimestamp();

      await ch.send({ embeds: [embed] });
      await db.updateTopicLastPosted(tc.id);
      if (tc.mode === 'sequential') await db.rotateTopic(guild.id, channel.id);

      return interaction.reply({ content: `✅ Topic posted in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }
  },
};

export default Topics;
