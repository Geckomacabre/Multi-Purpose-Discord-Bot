import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Reddit: Command = {
  data: new SlashCommandBuilder()
    .setName('reddit')
    .setDescription('Subscribe to subreddit post notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a subreddit subscription')
      .addStringOption(o => o.setName('subreddit').setDescription('Subreddit name (without r/)').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Discord channel for posts').setRequired(true))
      .addBooleanOption(o => o.setName('nsfw').setDescription('Allow NSFW posts (default: no)'))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a subreddit subscription')
      .addIntegerOption(o => o.setName('id').setDescription('Subscription ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List subreddit subscriptions')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const subreddit = interaction.options.getString('subreddit', true).replace(/^r\//i, '');
      const channel = interaction.options.getChannel('channel', true);
      const nsfw = interaction.options.getBoolean('nsfw') ?? false;
      const feed = await db.addRedditFeed(interaction.guildId!, channel.id, subreddit, nsfw);
      await interaction.editReply(`✅ Subscribed to **r/${subreddit}**. Posts → <#${channel.id}> (ID: ${feed.id})`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeRedditFeed(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Reddit subscription #${id} removed.` : `❌ Not found.`);

    } else {
      const feeds = await db.getRedditFeeds(interaction.guildId!);
      if (!feeds.length) { await interaction.editReply('No Reddit subscriptions.'); return; }
      const embed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle('Reddit Subscriptions')
        .setDescription(feeds.map(f => `**#${f.id}** r/${f.subreddit} → <#${f.channel_id}>${f.nsfw ? ' (NSFW)' : ''}`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Reddit;
