import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
  MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import {
  getFreeGameConfig, setFreeGameConfig, hasFreeGameBeenPosted, markFreeGamePosted,
} from '../../utils/db';
import { fetchAllFreeGames } from '../../features/freegames';

const PLATFORMS = ['epic', 'steam', 'gog'] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  epic: 'Epic Games Store',
  steam: 'Steam',
  gog: 'GOG',
};

const Freegames: Command = {
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Track and announce free game promotions')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Set up the free game tracker')
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('Channel to post free game alerts')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
      )
      .addRoleOption(o => o.setName('ping').setDescription('Role to ping when a new free game is found'))
    )
    .addSubcommand(sub => sub
      .setName('platforms')
      .setDescription('Choose which platforms to track')
      .addBooleanOption(o => o.setName('epic').setDescription('Track Epic Games Store (default: on)'))
      .addBooleanOption(o => o.setName('steam').setDescription('Track Steam (default: on)'))
      .addBooleanOption(o => o.setName('gog').setDescription('Track GOG (default: on)'))
    )
    .addSubcommand(sub => sub
      .setName('ping')
      .setDescription('Set or clear the role pinged for free game alerts')
      .addRoleOption(o => o.setName('role').setDescription('Role to ping (leave blank to clear)'))
    )
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable the free game tracker for this server')
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current free game tracker settings')
    )
    .addSubcommand(sub => sub
      .setName('check')
      .setDescription('Check for free games right now and post any new ones')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const ping = interaction.options.getRole('ping');
      await setFreeGameConfig(guildId, {
        channel_id: channel.id,
        platforms: JSON.stringify(PLATFORMS),
        ...(ping !== null ? { ping_role_id: ping.id } : {}),
      });
      await interaction.reply({
        content: `✅ Free game tracker enabled. Alerts → <#${channel.id}>${ping ? ` | Ping: <@&${ping.id}>` : ''}.\nAll platforms tracked: Epic, Steam, GOG.\nUse \`/freegames platforms\` to toggle platforms.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'platforms') {
      const config = await getFreeGameConfig(guildId);
      if (!config?.channel_id) {
        await interaction.reply({ content: '❌ Set up the tracker first with `/freegames setup`.', flags: MessageFlags.Ephemeral }); return;
      }

      const current: Platform[] = JSON.parse(config.platforms);
      const epic = interaction.options.getBoolean('epic');
      const steam = interaction.options.getBoolean('steam');
      const gog = interaction.options.getBoolean('gog');

      const updated = PLATFORMS.filter(p => {
        if (p === 'epic' && epic !== null) return epic;
        if (p === 'steam' && steam !== null) return steam;
        if (p === 'gog' && gog !== null) return gog;
        return current.includes(p);
      });

      if (updated.length === 0) {
        await interaction.reply({ content: '❌ At least one platform must be enabled.', flags: MessageFlags.Ephemeral }); return;
      }

      await setFreeGameConfig(guildId, { platforms: JSON.stringify(updated) });
      const labels = updated.map(p => PLATFORM_LABELS[p]).join(', ');
      await interaction.reply({ content: `✅ Now tracking: **${labels}**.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'ping') {
      const config = await getFreeGameConfig(guildId);
      if (!config?.channel_id) {
        await interaction.reply({ content: '❌ Set up the tracker first with `/freegames setup`.', flags: MessageFlags.Ephemeral }); return;
      }
      const role = interaction.options.getRole('role');
      await setFreeGameConfig(guildId, { ping_role_id: role?.id ?? null });
      await interaction.reply({
        content: role ? `✅ Will ping <@&${role.id}> for new free games.` : '✅ Ping role cleared.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'disable') {
      await setFreeGameConfig(guildId, { channel_id: null });
      await interaction.reply({ content: '✅ Free game tracker disabled.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'view') {
      const config = await getFreeGameConfig(guildId);
      if (!config?.channel_id) {
        await interaction.reply({ content: 'Free game tracker is not set up. Use `/freegames setup` to get started.', flags: MessageFlags.Ephemeral }); return;
      }
      const platforms: Platform[] = JSON.parse(config.platforms);
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('🎮 Free Game Tracker')
        .addFields(
          { name: 'Channel', value: `<#${config.channel_id}>`, inline: true },
          { name: 'Ping Role', value: config.ping_role_id ? `<@&${config.ping_role_id}>` : 'None', inline: true },
          { name: 'Platforms', value: platforms.map(p => PLATFORM_LABELS[p]).join(', '), inline: true },
        )
        .setFooter({ text: 'Checks for new free games every hour.' });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'check') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const config = await getFreeGameConfig(guildId);
      if (!config?.channel_id) {
        await interaction.editReply('❌ Set up the tracker first with `/freegames setup`.'); return;
      }

      const platforms: Platform[] = JSON.parse(config.platforms);
      const games = await fetchAllFreeGames();
      const filtered = games.filter(g => platforms.includes(g.id.split(':')[0] as Platform));

      if (filtered.length === 0) {
        await interaction.editReply('No free games detected right now. Check back later!');
        return;
      }

      const channel = interaction.client.channels.cache.get(config.channel_id) as TextChannel | undefined;
      if (!channel) {
        await interaction.editReply('❌ The configured channel is not accessible.'); return;
      }

      let posted = 0;
      let skipped = 0;

      for (const game of filtered) {
        if (await hasFreeGameBeenPosted(guildId, game.id)) { skipped++; continue; }

        const embed = new EmbedBuilder()
          .setColor(Colors.Gold)
          .setTitle(`🎮 Free on ${game.platform}: ${game.title}`)
          .setURL(game.url)
          .setDescription(game.description ?? `**${game.title}** is currently free on ${game.platform}!`)
          .setFooter({ text: game.platform });

        if (game.image) embed.setImage(game.image);
        const fields: { name: string; value: string; inline?: boolean }[] = [];
        if (game.originalPrice) fields.push({ name: 'Normal Price', value: `~~${game.originalPrice}~~  →  **FREE**`, inline: true });
        if (game.endDate) {
          const ts = Math.floor(new Date(game.endDate).getTime() / 1000);
          fields.push({ name: 'Free Until', value: `<t:${ts}:F>`, inline: true });
        }
        if (fields.length) embed.addFields(fields);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setLabel('Claim Free Game').setStyle(ButtonStyle.Link).setURL(game.url).setEmoji('🎮')
        );

        const content = config.ping_role_id ? `<@&${config.ping_role_id}>` : undefined;
        await channel.send({ content, embeds: [embed], components: [row] }).catch(() => {});
        await markFreeGamePosted(guildId, game.id);
        posted++;
      }

      await interaction.editReply(
        posted > 0
          ? `✅ Posted **${posted}** new free game${posted !== 1 ? 's' : ''} to <#${config.channel_id}>.${skipped > 0 ? ` (${skipped} already posted)` : ''}`
          : `All ${skipped} current free game${skipped !== 1 ? 's' : ''} were already posted.`
      );
    }
  },
};

export default Freegames;
