import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import * as db from '../../utils/db';
import Config from '../../config';
import { Command } from '../../interfaces/command';

const Youtube: Command = {
  data: new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Subscribe to YouTube channel upload notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a YouTube channel subscription')
      .addStringOption(o => o.setName('channel_id').setDescription('YouTube channel ID (starts with UC...)').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Discord channel for notifications').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Custom message (use {channel}, {title}, {url})'))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a YouTube subscription')
      .addIntegerOption(o => o.setName('id').setDescription('Subscription ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List YouTube subscriptions')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      if (!Config.YOUTUBE_API_KEY) {
        await interaction.editReply('❌ YouTube API key not configured. Set `YOUTUBE_API_KEY` in your environment.'); return;
      }
      const ytChannelId = interaction.options.getString('channel_id', true);
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message');

      // Look up channel name
      let channelName: string | null = null;
      try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?id=${ytChannelId}&part=snippet&key=${Config.YOUTUBE_API_KEY}`);
        const json: any = await res.json();
        channelName = json?.items?.[0]?.snippet?.title ?? null;
      } catch {}

      const feed = await db.addYoutubeFeed(interaction.guildId!, channel.id, ytChannelId, channelName, message);
      await interaction.editReply(`✅ Subscribed to **${channelName ?? ytChannelId}** on YouTube. Notifications → <#${channel.id}> (ID: ${feed.id})`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeYoutubeFeed(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ YouTube subscription #${id} removed.` : `❌ Not found.`);

    } else {
      const feeds = await db.getYoutubeFeeds(interaction.guildId!);
      if (!feeds.length) { await interaction.editReply('No YouTube subscriptions.'); return; }
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('YouTube Subscriptions')
        .setDescription(feeds.map(f => `**#${f.id}** **${f.youtube_channel_name ?? f.youtube_channel_id}** → <#${f.channel_id}>`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Youtube;
