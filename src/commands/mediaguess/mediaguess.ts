import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { activeGames, resolveGame, startGame, cancelSkipTimer } from '../../utils/mediagame';
import * as db from '../../utils/db';

const MediaGuess: Command = {
  data: new SlashCommandBuilder()
    .setName('mediaguess')
    .setDescription('Manage the movie & TV show guessing game')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Set or change the channel for a guessing game')
      .addStringOption(o => o
        .setName('type')
        .setDescription('Which game to configure')
        .setRequired(true)
        .addChoices({ name: 'Movie', value: 'movie' }, { name: 'TV Show', value: 'tv' }),
      )
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('Channel to run the game in')
        .setRequired(true),
      ),
    )
    .addSubcommand(s => s
      .setName('stop')
      .setDescription('Stop the guessing game in this channel and remove its config'),
    )
    .addSubcommand(s => s
      .setName('skip')
      .setDescription('Admin-force skip the current round without a vote'),
    )
    .addSubcommand(s => s
      .setName('info')
      .setDescription('Show current guessing game configuration'),
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ── Setup ───────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const type = interaction.options.getString('type', true) as 'movie' | 'tv';
      const channel = interaction.options.getChannel('channel', true) as TextChannel;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await db.setMediaGuessConfig(guildId, type, channel.id);

      // Stop any existing game in that channel before starting a new one
      const existing = activeGames.get(channel.id);
      if (existing) {
        existing.answered = true;
        activeGames.delete(channel.id);
        await db.deleteMediaGuessRound(channel.id).catch(() => {});
        cancelSkipTimer(channel.id);
      }

      await startGame(guildId, channel.id, type, interaction.client);

      const typeStr = type === 'movie' ? 'Movie' : 'TV Show';
      await interaction.editReply(`✅ **${typeStr}** guessing game configured in <#${channel.id}>. First round is live!`);
    }

    // ── Stop ────────────────────────────────────────────────────────────────────
    else if (sub === 'stop') {
      const state = activeGames.get(interaction.channelId);
      if (!state) {
        await interaction.reply({ content: '❌ No active guessing game in this channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      const cfg = await db.getMediaGuessConfig(guildId);
      if (cfg?.movie_channel_id === interaction.channelId) {
        await db.setMediaGuessConfig(guildId, 'movie', null);
      } else if (cfg?.tv_channel_id === interaction.channelId) {
        await db.setMediaGuessConfig(guildId, 'tv', null);
      }

      state.answered = true;
      activeGames.delete(interaction.channelId);
      await db.deleteMediaGuessRound(interaction.channelId).catch(() => {});
      cancelSkipTimer(interaction.channelId);

      await interaction.reply({
        content: `🛑 Game stopped. The answer was **${state.media.title}**. Configure a new game with \`/mediaguess setup\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Admin skip ──────────────────────────────────────────────────────────────
    else if (sub === 'skip') {
      const state = activeGames.get(interaction.channelId);
      if (!state || state.answered) {
        await interaction.reply({ content: '❌ No active guessing game in this channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.reply({ content: `⏭️ Skipping round (admin override). Answer: **${state.media.title}**` });
      await resolveGame(state, interaction.client, null, 'skip');
    }

    // ── Info ────────────────────────────────────────────────────────────────────
    else if (sub === 'info') {
      const cfg = await db.getMediaGuessConfig(guildId);

      const movieChannel = cfg?.movie_channel_id ? `<#${cfg.movie_channel_id}>` : 'Not set';
      const tvChannel = cfg?.tv_channel_id ? `<#${cfg.tv_channel_id}>` : 'Not set';

      const movieState = cfg?.movie_channel_id ? activeGames.get(cfg.movie_channel_id) : null;
      const tvState = cfg?.tv_channel_id ? activeGames.get(cfg.tv_channel_id) : null;

      const movieStatus = movieState
        ? `Active — ${movieState.hintsUsed}/5 hints used, ${movieState.voteskips.size}/2 skip votes`
        : (cfg?.movie_channel_id ? 'Channel set but no active round' : 'Not configured');
      const tvStatus = tvState
        ? `Active — ${tvState.hintsUsed}/5 hints used, ${tvState.voteskips.size}/2 skip votes`
        : (cfg?.tv_channel_id ? 'Channel set but no active round' : 'Not configured');

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('🎬 Guessing Game Config')
        .addFields(
          { name: '🎬 Movie Channel', value: movieChannel, inline: true },
          { name: 'Movie Status', value: movieStatus, inline: true },
          { name: '​', value: '​', inline: true },
          { name: '📺 TV Show Channel', value: tvChannel, inline: true },
          { name: 'TV Status', value: tvStatus, inline: true },
          { name: '​', value: '​', inline: true },
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default MediaGuess;
