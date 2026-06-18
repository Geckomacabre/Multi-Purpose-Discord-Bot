import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import * as db from '../../utils/db';
import { Command } from '../../interfaces/command';

const Twitch: Command = {
  data: new SlashCommandBuilder()
    .setName('twitch')
    .setDescription('Subscribe to Twitch stream notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a Twitch stream subscription')
      .addStringOption(o => o.setName('username').setDescription('Twitch username').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post notifications in').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Custom message (use {username}, {game}, {title}, {url})'))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a Twitch subscription')
      .addIntegerOption(o => o.setName('id').setDescription('Subscription ID').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List Twitch subscriptions')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'add') {
      const username = interaction.options.getString('username', true);
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message');
      const feed = await db.addTwitchFeed(interaction.guildId!, channel.id, username, message);
      await interaction.editReply(`✅ Now watching **${username}** on Twitch. Notifications → <#${channel.id}> (ID: ${feed.id})`);

    } else if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const ok = await db.removeTwitchFeed(id, interaction.guildId!);
      await interaction.editReply(ok ? `✅ Twitch subscription #${id} removed.` : `❌ Not found.`);

    } else {
      const feeds = await db.getTwitchFeeds(interaction.guildId!);
      if (!feeds.length) { await interaction.editReply('No Twitch subscriptions.'); return; }
      const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle('Twitch Subscriptions')
        .setDescription(feeds.map(f => `**#${f.id}** **${f.twitch_username}** → <#${f.channel_id}> ${f.live ? '🔴 Live' : '⬛ Offline'}`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default Twitch;
