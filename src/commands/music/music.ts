import {
  ActionRowBuilder, ApplicationIntegrationType, ChatInputCommandInteraction, Colors, ComponentType, EmbedBuilder,
  GuildMember, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { Player, QueryType, useQueue, GuildQueue, Track } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import * as db from '../../utils/db';
import logger from '../../utils/logger';

let player: Player | null = null;

// discord-player defaults to Discord's DAVE E2EE voice protocol, which requires
// the @snazzah/davey native package — not something we ship, and not needed for
// a bot streaming into a channel. Without this, connecting throws an uncaught
// exception that kills the voice connection entirely. Anything that connects to
// voice directly (play, summon, follow) must pass this.
const VOICE_CONNECT_OPTIONS = { daveEncryption: false } as const;

// Guilds with karaoke mode enabled — blocks new tracks from non-DJs.
const karaokeGuilds = new Set<string>();
// guildId -> userId the bot should follow between voice channels.
const followMap = new Map<string, string>();

export function getPlayer(client: any): Player {
  if (!player) {
    player = new Player(client, { skipFFmpeg: false });
    player.extractors.loadMulti(DefaultExtractors).catch(e => logger.error('Failed to load extractors:', e));
    // discord-player swallows extractor activation errors internally (register()
    // resolves to null instead of rejecting), so without this listener a failed
    // YouTube extractor activation is completely silent — it just shows up later
    // as "no results found (extractor: N/A)" with no clue why.
    player.extractors.on('error', (_ctx: any, extractor: any, err: any) =>
      logger.error(`[music] extractor "${extractor?.identifier}" failed to activate: ${err?.message ?? err}`)
    );
    // discord-player v7 dropped YouTube support from @discord-player/extractor entirely
    // (constant breakage from YouTube's side) — without this, every play/search query
    // fails with "Could not extract stream for this track" (ERR_NO_RESULT).
    // YOUTUBE_COOKIE is optional but strongly recommended: YouTube frequently
    // blocks/challenges datacenter IPs (most hosting providers), which makes
    // activation fail silently without an authenticated session.
    player.extractors.register(YoutubeiExtractor, Bun.env.YOUTUBE_COOKIE ? { cookie: Bun.env.YOUTUBE_COOKIE } : {})
      .catch(e => logger.error('Failed to load YouTube extractor:', e));
    (player.events as any).on('playerError', (_queue: any, err: any) => logger.error('Player error:', err));
    (player.events as any).on('error', (_queue: any, err: any) => logger.error('Queue error:', err));
    player.events.on('playerStart', (queue, track) => {
      const ch = queue.metadata as any;
      if (ch?.send) ch.send({ embeds: [nowPlayingEmbed(track)] });
    });
    client.on('voiceStateUpdate', (oldState: any, newState: any) => {
      const followedId = followMap.get(newState.guild.id);
      if (!followedId || newState.member?.id !== followedId) return;
      if (oldState.channelId === newState.channelId || !newState.channel) return;
      const q = useQueue(newState.guild.id);
      if (!q) return;
      q.connect(newState.channel, VOICE_CONNECT_OPTIONS).catch((e: any) =>
        logger.warn(`[music] failed to follow user between channels: ${e.message}`)
      );
    });
  }
  return player;
}

function checkKaraoke(guildId: string, member: GuildMember): string | null {
  if (!karaokeGuilds.has(guildId) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
  return '🎤 Karaoke mode is enabled — only a Manage Server member can add tracks right now.';
}

function nowPlayingEmbed(track: Track) {
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Duration', value: track.duration, inline: true },
      { name: 'Requested by', value: `${track.requestedBy}`, inline: true },
    )
    .setThumbnail(track.thumbnail);
}

function queueEmbed(queue: GuildQueue, page = 0) {
  const tracks = queue.tracks.toArray();
  const perPage = 10;
  const start = page * perPage;
  const slice = tracks.slice(start, start + perPage);
  const current = queue.currentTrack;
  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Queue')
    .setDescription(
      (current ? `**Now playing:** [${current.title}](${current.url})\n\n` : '') +
      (slice.length
        ? slice.map((t, i) => `**${start + i + 1}.** [${t.title}](${t.url}) — ${t.duration}`).join('\n')
        : '*Queue is empty*')
    )
    .setFooter({ text: `${tracks.length} track(s) in queue${tracks.length > perPage ? ` · Page ${page + 1}/${Math.ceil(tracks.length / perPage)}` : ''}` });
}

const Music: Command = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music player')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(s => s.setName('play').setDescription('Play a song or add it to the queue')
      .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('playnext').setDescription('Add a song to the front of the queue')
      .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('playnow').setDescription('Play a song immediately, skipping the current track')
      .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
    .addSubcommand(s => s.setName('search').setDescription('Search a service and pick a track to queue')
      .addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true))
      .addStringOption(o => o.setName('source').setDescription('Service to search').setChoices(
        { name: 'YouTube', value: 'youtube' },
        { name: 'SoundCloud', value: 'soundcloud' },
      )))
    .addSubcommand(s => s.setName('stream').setDescription('Play a direct stream URL (e.g. a radio stream)')
      .addStringOption(o => o.setName('url').setDescription('Stream URL').setRequired(true)))
    .addSubcommand(s => s.setName('skip').setDescription('Skip the current track'))
    .addSubcommand(s => s.setName('stop').setDescription('Stop music and clear the queue'))
    .addSubcommand(s => s.setName('pause').setDescription('Pause or resume playback'))
    .addSubcommand(s => s.setName('queue').setDescription('Show the queue')
      .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand(s => s.setName('nowplaying').setDescription('Show the currently playing track'))
    .addSubcommand(s => s.setName('volume').setDescription('Set playback volume')
      .addIntegerOption(o => o.setName('level').setDescription('Volume (1-200)').setRequired(true).setMinValue(1).setMaxValue(200)))
    .addSubcommand(s => s.setName('speed').setDescription('Set the playback speed of the current track')
      .addNumberOption(o => o.setName('multiplier').setDescription('Speed multiplier (0.5-100)').setRequired(true).setMinValue(0.5).setMaxValue(100)))
    .addSubcommand(s => s.setName('loop').setDescription('Toggle loop mode')
      .addStringOption(o => o.setName('mode').setDescription('Loop mode').setRequired(true).setChoices(
        { name: 'Off', value: 'off' },
        { name: 'Track', value: 'track' },
        { name: 'Queue', value: 'queue' },
        { name: 'Autoplay', value: 'autoplay' },
      )))
    .addSubcommand(s => s.setName('shuffle').setDescription('Shuffle the queue'))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a track from the queue')
      .addIntegerOption(o => o.setName('position').setDescription('Track position in queue').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('move').setDescription('Move a track to a different position in the queue')
      .addIntegerOption(o => o.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('to').setDescription('New position').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('clear').setDescription('Clear the upcoming queue without stopping the current track'))
    .addSubcommand(s => s.setName('seek').setDescription('Seek to a position in the current track')
      .addStringOption(o => o.setName('time').setDescription('Time (e.g. 1:30 or 90)').setRequired(true)))
    .addSubcommand(s => s.setName('karaoke').setDescription('Toggle karaoke mode (blocks new tracks from non-DJs)'))
    .addSubcommand(s => s.setName('summon').setDescription('Join your voice channel without playing anything'))
    .addSubcommand(s => s.setName('follow').setDescription('Follow a user between voice channels')
      .addUserOption(o => o.setName('user').setDescription('User to follow (defaults to you)')))
    .addSubcommand(s => s.setName('clean').setDescription("Delete the bot's recent messages in this channel")
      .addIntegerOption(o => o.setName('amount').setDescription('How many recent messages to search (max 100)').setMinValue(1).setMaxValue(100)))
    .addSubcommand(s => s.setName('host').setDescription('Transfer DJ privileges to another user')
      .addUserOption(o => o.setName('user').setDescription('User to transfer to').setRequired(true))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const member = interaction.member as GuildMember;
    const vc = member.voice.channel;
    const p = getPlayer(interaction.client);

    const requireVC = async () => {
      if (!vc) { await interaction.reply({ content: '❌ You must be in a voice channel.', flags: MessageFlags.Ephemeral }); return false; }
      return true;
    };

    const requireQueue = async () => {
      const q = useQueue(interaction.guildId!);
      if (!q || !q.isPlaying()) { await interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral }); return null; }
      return q;
    };

    const requireNotKaraoke = async () => {
      const block = checkKaraoke(interaction.guildId!, member);
      if (block) { await interaction.reply({ content: block, flags: MessageFlags.Ephemeral }); return false; }
      return true;
    };

    const queueTrack = async (query: string | Track, extra: Record<string, any> = {}) => p.play(vc!, query, {
      nodeOptions: {
        metadata: interaction.channel,
        volume: (await db.getMusicConfig(interaction.guildId!)).volume,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 30000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 30000,
      },
      connectionOptions: VOICE_CONNECT_OPTIONS,
      ...extra,
    });

    if (sub === 'play') {
      if (!await requireVC() || !await requireNotKaraoke()) return;
      const query = interaction.options.getString('query', true);
      await interaction.deferReply();
      try {
        const { track } = await queueTrack(query);
        const q = useQueue(interaction.guildId!);
        if (q && q.tracks.size > 0) {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Added to Queue').setDescription(`**[${track.title}](${track.url})**`).setThumbnail(track.thumbnail).addFields({ name: 'Position', value: `#${q.tracks.size}`, inline: true }, { name: 'Duration', value: track.duration, inline: true })] });
        } else {
          await interaction.editReply({ embeds: [nowPlayingEmbed(track)] });
        }
      } catch (e: any) {
        await interaction.editReply(`❌ Could not play: ${e?.message ?? e}`);
      }
    }

    else if (sub === 'playnext' || sub === 'playnow') {
      if (!await requireVC() || !await requireNotKaraoke()) return;
      const query = interaction.options.getString('query', true);
      await interaction.deferReply();
      try {
        const { track } = await queueTrack(query);
        const q = useQueue(interaction.guildId!)!;
        if (q.currentTrack !== track) {
          q.moveTrack(track, 0);
          if (sub === 'playnow') q.node.skip();
        }
        if (sub === 'playnow' || q.currentTrack === track) {
          await interaction.editReply({ embeds: [nowPlayingEmbed(track)] });
        } else {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Playing Next').setDescription(`**[${track.title}](${track.url})**`).setThumbnail(track.thumbnail)] });
        }
      } catch (e: any) {
        await interaction.editReply(`❌ Could not play: ${e?.message ?? e}`);
      }
    }

    else if (sub === 'search') {
      if (!await requireVC() || !await requireNotKaraoke()) return;
      const query = interaction.options.getString('query', true);
      const source = interaction.options.getString('source') ?? 'youtube';
      await interaction.deferReply();
      const results = await p.search(query, {
        searchEngine: source === 'soundcloud' ? QueryType.SOUNDCLOUD_SEARCH : QueryType.YOUTUBE_SEARCH,
        requestedBy: interaction.user,
      });
      if (!results.hasTracks()) { await interaction.editReply('❌ No results found.'); return; }
      const tracks = results.tracks.slice(0, 5);
      const menu = new StringSelectMenuBuilder()
        .setCustomId('music-search-select')
        .setPlaceholder('Choose a track to queue')
        .addOptions(tracks.map((t, i) => ({
          label: t.title.slice(0, 100),
          description: `${t.author} • ${t.duration}`.slice(0, 100),
          value: String(i),
        })));
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      const msg = await interaction.editReply({ content: `🔎 Results for **${query}**:`, components: [row] });
      try {
        const picked = await msg.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === interaction.user.id,
          time: 60_000,
        });
        const chosen = tracks[Number(picked.values[0])]!;
        await queueTrack(chosen);
        await picked.update({ content: `✅ Added **${chosen.title}** to the queue.`, components: [] });
      } catch {
        await interaction.editReply({ content: '⏱️ Search timed out.', components: [] }).catch(() => {});
      }
    }

    else if (sub === 'stream') {
      if (!await requireVC() || !await requireNotKaraoke()) return;
      const url = interaction.options.getString('url', true);
      await interaction.deferReply();
      try {
        const { track } = await queueTrack(url, { searchEngine: QueryType.ARBITRARY });
        await interaction.editReply(`📡 Now streaming **${track.title}**.`);
      } catch (e: any) {
        await interaction.editReply(`❌ Could not stream: ${e?.message ?? e}`);
      }
    }

    else if (sub === 'skip') {
      const q = await requireQueue(); if (!q) return;
      q.node.skip();
      await interaction.reply('⏭️ Skipped.');
    }

    else if (sub === 'stop') {
      const q = useQueue(interaction.guildId!);
      if (q) q.delete();
      await interaction.reply('⏹️ Stopped and queue cleared.');
    }

    else if (sub === 'clear') {
      const q = useQueue(interaction.guildId!);
      if (!q || q.tracks.size === 0) { await interaction.reply({ content: '❌ The queue is already empty.', flags: MessageFlags.Ephemeral }); return; }
      const count = q.tracks.size;
      q.clear();
      await interaction.reply(`🧹 Cleared **${count}** track(s) from the queue. Current track keeps playing.`);
    }

    else if (sub === 'pause') {
      const q = await requireQueue(); if (!q) return;
      if (q.node.isPaused()) { q.node.resume(); await interaction.reply('▶️ Resumed.'); }
      else { q.node.pause(); await interaction.reply('⏸️ Paused.'); }
    }

    else if (sub === 'queue') {
      const q = useQueue(interaction.guildId!);
      if (!q) { await interaction.reply({ content: '❌ Nothing in the queue.', flags: MessageFlags.Ephemeral }); return; }
      const page = (interaction.options.getInteger('page') ?? 1) - 1;
      await interaction.reply({ embeds: [queueEmbed(q, page)] });
    }

    else if (sub === 'nowplaying') {
      const q = await requireQueue(); if (!q) return;
      const track = q.currentTrack!;
      const bar = q.node.createProgressBar();
      await interaction.reply({ embeds: [nowPlayingEmbed(track).addFields({ name: 'Progress', value: bar ?? '―' })] });
    }

    else if (sub === 'volume') {
      const q = useQueue(interaction.guildId!);
      const level = interaction.options.getInteger('level', true);
      if (q) q.node.setVolume(level);
      await db.setMusicVolume(interaction.guildId!, level);
      await interaction.reply(`🔊 Volume set to **${level}%**.`);
    }

    else if (sub === 'speed') {
      const q = await requireQueue(); if (!q) return;
      const speed = interaction.options.getNumber('multiplier', true);
      await q.filters.ffmpeg.setFilters([`atempo=${speed}`]);
      await interaction.reply(`⏩ Playback speed set to **${speed}x**.`);
    }

    else if (sub === 'loop') {
      const q = await requireQueue(); if (!q) return;
      const { QueueRepeatMode } = await import('discord-player');
      const mode = interaction.options.getString('mode', true);
      const modeMap: Record<string, any> = { off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE, autoplay: QueueRepeatMode.AUTOPLAY };
      q.setRepeatMode(modeMap[mode]);
      await interaction.reply(`🔁 Loop mode set to **${mode}**.`);
    }

    else if (sub === 'shuffle') {
      const q = await requireQueue(); if (!q) return;
      q.tracks.shuffle();
      await interaction.reply('🔀 Queue shuffled.');
    }

    else if (sub === 'remove') {
      const q = await requireQueue(); if (!q) return;
      const pos = interaction.options.getInteger('position', true) - 1;
      const track = q.tracks.at(pos);
      if (!track) { await interaction.reply({ content: '❌ No track at that position.', flags: MessageFlags.Ephemeral }); return; }
      q.node.remove(track);
      await interaction.reply(`🗑️ Removed **${track.title}** from the queue.`);
    }

    else if (sub === 'move') {
      const q = await requireQueue(); if (!q) return;
      const from = interaction.options.getInteger('from', true) - 1;
      const to = interaction.options.getInteger('to', true) - 1;
      const track = q.tracks.at(from);
      if (!track || to < 0 || to >= q.tracks.size) { await interaction.reply({ content: '❌ Position out of range.', flags: MessageFlags.Ephemeral }); return; }
      q.moveTrack(track, to);
      await interaction.reply(`🔀 Moved **${track.title}** to position #${to + 1}.`);
    }

    else if (sub === 'seek') {
      const q = await requireQueue(); if (!q) return;
      const timeStr = interaction.options.getString('time', true);
      const parts = timeStr.split(':').map(Number);
      let ms = 0;
      if (parts.length === 1) ms = (parts[0] ?? 0) * 1000;
      else if (parts.length === 2) ms = ((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000;
      else ms = ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
      await q.node.seek(ms);
      await interaction.reply(`⏩ Seeked to **${timeStr}**.`);
    }

    else if (sub === 'karaoke') {
      const guildId = interaction.guildId!;
      if (karaokeGuilds.has(guildId)) {
        karaokeGuilds.delete(guildId);
        await interaction.reply('🎤 Karaoke mode is now **disabled**.');
      } else {
        karaokeGuilds.add(guildId);
        await interaction.reply('🎤 Karaoke mode is now **enabled** — only Manage Server members can add new tracks.');
      }
    }

    else if (sub === 'summon') {
      if (!await requireVC()) return;
      let q = useQueue(interaction.guildId!);
      if (!q) {
        q = p.queues.create(interaction.guild!, {
          metadata: interaction.channel,
          volume: (await db.getMusicConfig(interaction.guildId!)).volume,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 30000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 30000,
        });
      }
      try {
        await q.connect(vc!, VOICE_CONNECT_OPTIONS);
        await interaction.reply(`🔊 Joined **${vc!.name}**.`);
      } catch (e: any) {
        await interaction.reply(`❌ Could not join: ${e?.message ?? e}`);
      }
    }

    else if (sub === 'follow') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const guildId = interaction.guildId!;
      if (followMap.get(guildId) === target.id) {
        followMap.delete(guildId);
        await interaction.reply(`👋 No longer following **${target.tag}**.`);
      } else {
        followMap.set(guildId, target.id);
        await interaction.reply(`👣 Now following **${target.tag}** between voice channels.`);
      }
    }

    else if (sub === 'clean') {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.reply({ content: '❌ Cannot clean this channel.', flags: MessageFlags.Ephemeral }); return;
      }
      const me = interaction.guild!.members.me;
      if (!me || !channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ content: '❌ I need the **Manage Messages** permission to do that.', flags: MessageFlags.Ephemeral }); return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const amount = interaction.options.getInteger('amount') ?? 50;
      const messages = await channel.messages.fetch({ limit: amount });
      const botMessages = messages.filter(m => m.author.id === interaction.client.user!.id);
      const deleted = await channel.bulkDelete(botMessages, true);
      await interaction.editReply(`🧹 Cleaned **${deleted.size}** message(s).`);
    }

    else if (sub === 'host') {
      await interaction.reply({ content: 'DJ transfer is not implemented yet.', flags: MessageFlags.Ephemeral });
    }
  },
};

export default Music;
