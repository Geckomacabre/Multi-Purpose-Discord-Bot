import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MessageFlags,
  PermissionFlagsBits, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import Config from '../../config';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const Feed: Command = {
  data: new SlashCommandBuilder()
    .setName('feed')
    .setDescription('Manage notification feeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommandGroup(g => g.setName('reddit').setDescription('Subreddit post notifications')
      .addSubcommand(s => s.setName('add').setDescription('Add a subreddit subscription')
        .addStringOption(o => o.setName('subreddit').setDescription('Subreddit name (without r/)').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Discord channel for posts').setRequired(true))
        .addBooleanOption(o => o.setName('nsfw').setDescription('Allow NSFW posts (default: no)')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a subreddit subscription')
        .addIntegerOption(o => o.setName('id').setDescription('Subscription ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List subreddit subscriptions')))
    .addSubcommandGroup(g => g.setName('rss').setDescription('RSS feed notifications')
      .addSubcommand(s => s.setName('add').setDescription('Add an RSS feed')
        .addStringOption(o => o.setName('url').setDescription('RSS feed URL').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Discord channel for posts').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove an RSS feed')
        .addIntegerOption(o => o.setName('id').setDescription('Feed ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List RSS feeds')))
    .addSubcommandGroup(g => g.setName('twitch').setDescription('Twitch stream notifications')
      .addSubcommand(s => s.setName('add').setDescription('Add a Twitch stream subscription')
        .addStringOption(o => o.setName('username').setDescription('Twitch username').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel for notifications').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Custom message (use {username}, {game}, {title}, {url})')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a Twitch subscription')
        .addIntegerOption(o => o.setName('id').setDescription('Subscription ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List Twitch subscriptions')))
    .addSubcommandGroup(g => g.setName('youtube').setDescription('YouTube channel upload notifications')
      .addSubcommand(s => s.setName('add').setDescription('Add a YouTube channel subscription')
        .addStringOption(o => o.setName('channel_id').setDescription('YouTube channel ID (starts with UC...)').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Discord channel for notifications').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Custom message (use {channel}, {title}, {url})')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a YouTube subscription')
        .addIntegerOption(o => o.setName('id').setDescription('Subscription ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List YouTube subscriptions'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── Reddit ─────────────────────────────────────────────────────────────────
    if (group === 'reddit') {
      if (sub === 'add') {
        const subreddit = interaction.options.getString('subreddit', true).replace(/^r\//i, '');
        const channel = interaction.options.getChannel('channel', true);
        const nsfw = interaction.options.getBoolean('nsfw') ?? false;
        const feed = await db.addRedditFeed(interaction.guildId!, channel.id, subreddit, nsfw);
        await interaction.editReply(cv2Text(`✅ Subscribed to **r/${subreddit}**. Posts → <#${channel.id}> (ID: ${feed.id})`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeRedditFeed(id, interaction.guildId!);
        await interaction.editReply(cv2Text(ok ? `✅ Reddit subscription #${id} removed.` : '❌ Not found.'));
      } else {
        const feeds = await db.getRedditFeeds(interaction.guildId!);
        if (!feeds.length) { await interaction.editReply(cv2Text('No Reddit subscriptions.')); return; }
        const container = new ContainerBuilder()
          .setAccentColor(0xff4500)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Reddit Subscriptions**\n\n${feeds.map(f => `**#${f.id}** r/${f.subreddit} → <#${f.channel_id}>${f.nsfw ? ' (NSFW)' : ''}`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── RSS ────────────────────────────────────────────────────────────────────
    if (group === 'rss') {
      if (sub === 'add') {
        const url = interaction.options.getString('url', true);
        const channel = interaction.options.getChannel('channel', true);
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (!text.includes('<rss') && !text.includes('<feed')) throw new Error('Not a valid RSS/Atom feed');
        } catch (e: any) {
          await interaction.editReply(cv2Text(`❌ Could not validate feed: ${e.message}`)); return;
        }
        const feed = await db.addRssFeed(interaction.guildId!, channel.id, url);
        await interaction.editReply(cv2Text(`✅ RSS feed added (ID: ${feed.id}). Posts → <#${channel.id}>`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeRssFeed(id, interaction.guildId!);
        await interaction.editReply(cv2Text(ok ? `✅ RSS feed #${id} removed.` : '❌ Not found.'));
      } else {
        const feeds = await db.getRssFeeds(interaction.guildId!);
        if (!feeds.length) { await interaction.editReply(cv2Text('No RSS feeds configured.')); return; }
        const container = new ContainerBuilder()
          .setAccentColor(0xff6600)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**RSS Feeds**\n\n${feeds.map(f => `**#${f.id}** ${f.feed_url.slice(0, 60)} → <#${f.channel_id}>`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── Twitch ─────────────────────────────────────────────────────────────────
    if (group === 'twitch') {
      if (sub === 'add') {
        const username = interaction.options.getString('username', true);
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message');
        const feed = await db.addTwitchFeed(interaction.guildId!, channel.id, username, message);
        await interaction.editReply(cv2Text(`✅ Now watching **${username}** on Twitch. Notifications → <#${channel.id}> (ID: ${feed.id})`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeTwitchFeed(id, interaction.guildId!);
        await interaction.editReply(cv2Text(ok ? `✅ Twitch subscription #${id} removed.` : '❌ Not found.'));
      } else {
        const feeds = await db.getTwitchFeeds(interaction.guildId!);
        if (!feeds.length) { await interaction.editReply(cv2Text('No Twitch subscriptions.')); return; }
        const container = new ContainerBuilder()
          .setAccentColor(0x9146ff)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Twitch Subscriptions**\n\n${feeds.map(f => `**#${f.id}** **${f.twitch_username}** → <#${f.channel_id}> ${f.live ? '🔴 Live' : '⬛ Offline'}`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
      return;
    }

    // ── YouTube ────────────────────────────────────────────────────────────────
    if (group === 'youtube') {
      if (sub === 'add') {
        if (!Config.YOUTUBE_API_KEY) {
          await interaction.editReply(cv2Text('❌ YouTube API key not configured. Set `YOUTUBE_API_KEY` in your environment.')); return;
        }
        const ytChannelId = interaction.options.getString('channel_id', true);
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message');
        let channelName: string | null = null;
        try {
          const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?id=${ytChannelId}&part=snippet&key=${Config.YOUTUBE_API_KEY}`);
          const json: any = await res.json();
          channelName = json?.items?.[0]?.snippet?.title ?? null;
        } catch {}
        const feed = await db.addYoutubeFeed(interaction.guildId!, channel.id, ytChannelId, channelName, message);
        await interaction.editReply(cv2Text(`✅ Subscribed to **${channelName ?? ytChannelId}** on YouTube. Notifications → <#${channel.id}> (ID: ${feed.id})`));
      } else if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const ok = await db.removeYoutubeFeed(id, interaction.guildId!);
        await interaction.editReply(cv2Text(ok ? `✅ YouTube subscription #${id} removed.` : '❌ Not found.'));
      } else {
        const feeds = await db.getYoutubeFeeds(interaction.guildId!);
        if (!feeds.length) { await interaction.editReply(cv2Text('No YouTube subscriptions.')); return; }
        const container = new ContainerBuilder()
          .setAccentColor(0xff0000)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**YouTube Subscriptions**\n\n${feeds.map(f => `**#${f.id}** **${f.youtube_channel_name ?? f.youtube_channel_id}** → <#${f.channel_id}>`).join('\n')}`
          ));
        await interaction.editReply({ flags: IS_CV2, components: [container] });
      }
    }
  },
};

export default Feed;
