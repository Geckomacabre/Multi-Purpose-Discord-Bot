import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Rss: Command = {
  data: new SlashCommandBuilder()
    .setName('rss')
    .setDescription('Subscribe to RSS feed notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add an RSS feed')
      .addStringOption(o => o.setName('url').setDescription('RSS feed URL').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Discord channel for posts').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove an RSS feed')
      .addIntegerOption(o => o.setName('id').setDescription('Feed ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List RSS feeds')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'add') {
      const url = interaction.options.getString('url', true);
      const channel = interaction.options.getChannel('channel', true);

      // Quick validation
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.includes('<rss') && !text.includes('<feed')) throw new Error('Not a valid RSS/Atom feed');
      } catch (e: any) {
        await interaction.editReply(`❌ Could not validate feed: ${e.message}`); return;
      }

      const feed = await db.addRssFeed(interaction.guildId!, channel.id, url);
      await interaction.editReply(`✅ RSS feed added (ID: ${feed.id}). Posts → <#${channel.id}>`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeRssFeed(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ RSS feed #${id} removed.` : `❌ Not found.`);

    } else {
      const feeds = await db.getRssFeeds(interaction.guildId!);
      if (!feeds.length) { await interaction.editReply('No RSS feeds configured.'); return; }
      const embed = new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle('RSS Feeds')
        .setDescription(feeds.map(f => `**#${f.id}** ${f.feed_url.slice(0, 60)} → <#${f.channel_id}>`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Rss;
