import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, Colors, ComponentType, EmbedBuilder,
  InteractionContextType, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder,
  type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember,
} from 'discord.js';
import { QueryType, QueueRepeatMode, SearchResult, Track, useQueue, type GuildQueue, type Player } from 'discord-player';
import { Command } from './command';
import { prefetch } from './audio';
import {
  FILTERS, LOOP_LABEL, VOICE_CONNECT_OPTIONS, applyAlwaysOn, applyFilters, botChannel, describeError, formatMs, getPlayer,
  isAdmin, isDJ, link, listenerCount, musicMessageIds, namedFilters, nodeOptions, nowPlayingEmbed, panelPayload,
  refreshPanel, requester, sameChannelError, session, waitForExtractors,
} from './player';
import { getMusicConfig, setMusicConfig } from './store';
import logger from './logger';

type Ctx = ChatInputCommandInteraction | ButtonInteraction;

const NOT_DJ = '🎧 Only DJs can do that. Use `/music skip` to vote instead.';

// ── Small helpers ────────────────────────────────────────────────────────────

async function deny(i: Ctx, content: string): Promise<null> {
  if (i.deferred || i.replied) await i.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  else await i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  return null;
}

/**
 * The guild's queue, if this member may control it from where they are.
 * `dj` requires DJ controls; `requesterOk` also lets the current track's requester through.
 */
async function controlQueue(i: Ctx, { dj = true, requesterOk = false, playing = true } = {}): Promise<GuildQueue | null> {
  const q = useQueue(i.guildId!);
  if (!q || (playing && !q.currentTrack)) return deny(i, '❌ Nothing is playing.');
  const member = i.member as GuildMember;
  const where = sameChannelError(member);
  if (where) return deny(i, where);
  const isRequester = requesterOk && q.currentTrack?.requestedBy?.id === member.id;
  if (dj && !isDJ(member) && !isRequester) return deny(i, NOT_DJ);
  return q;
}

// YouTube "radio"/"mix" URLs (list=RD…, start_radio=1) resolve to an empty
// playlist. When such a URL has a real video id, play just that video.
function normalizeQuery(q: string): string {
  let u: URL;
  try { u = new URL(q.trim()); } catch { return q; }
  const isYouTube = u.hostname === 'youtu.be' || /(^|\.)youtube\.com$/.test(u.hostname);
  if (!isYouTube) return q;
  const vid = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
  const list = u.searchParams.get('list');
  const isRadio = u.searchParams.get('start_radio') === '1' || !!list?.startsWith('RD');
  return vid && isRadio ? `https://www.youtube.com/watch?v=${vid}` : q;
}

/** "1:30", "90" or "1:02:03" → ms, or null if it isn't a time. */
function parseTime(s: string): number | null {
  const t = s.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

function addedEmbed(result: SearchResult, added: Track[], title: string, position: number) {
  if (result.playlist) {
    const total = added.reduce((sum, t) => sum + (t.durationMS || 0), 0);
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor({ name: title })
      .setTitle(result.playlist.title.slice(0, 256))
      .setURL(result.playlist.url || null)
      .setThumbnail(result.playlist.thumbnail || added[0]?.thumbnail || null)
      .setDescription(`**${added.length}** tracks · ${formatMs(total)}`);
  }
  const t = added[0]!;
  const e = new EmbedBuilder()
    .setColor(Colors.Green)
    .setAuthor({ name: title })
    .setDescription(`**${link(t)}**\nby ${t.author}`)
    .setThumbnail(t.thumbnail || null)
    .addFields(
      { name: 'Duration', value: t.durationMS ? t.duration : '🔴 Live', inline: true },
      { name: 'Requested by', value: requester(t), inline: true },
    );
  if (position > 0) e.addFields({ name: 'Position', value: `#${position}`, inline: true });
  return e;
}

function queueView(q: GuildQueue, page: number) {
  const tracks = q.tracks.toArray();
  const perPage = 10;
  const pages = Math.max(1, Math.ceil(tracks.length / perPage));
  page = Math.min(Math.max(page, 0), pages - 1);
  const start = page * perPage;
  const total = tracks.reduce((sum, t) => sum + (t.durationMS || 0), 0);
  const current = q.currentTrack;
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle('📜 Queue')
    .setDescription(
      (current ? `**Now playing:** ${link(current)} — ${current.duration}\n\n` : '') +
      (tracks.length
        ? tracks.slice(start, start + perPage).map((t, n) => `**${start + n + 1}.** ${link(t)} — ${t.duration} · ${requester(t)}`).join('\n')
        : '*Nothing queued.* Add songs with `/music play`.'),
    )
    .setFooter({ text: `${tracks.length} track(s) · ${formatMs(total)} total · Loop ${LOOP_LABEL[q.repeatMode]}${pages > 1 ? ` · Page ${page + 1}/${pages}` : ''}` });
  const components = pages > 1 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`music:qpage:${page - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`music:qpage:${page + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  )] : [];
  return { embeds: [embed], components };
}

async function lyricsEmbed(p: Player, query: string | Track) {
  const search = (params: Parameters<Player['lyrics']['search']>[0]) => p.lyrics.search(params).catch(() => []);
  let results = [] as Awaited<ReturnType<typeof search>>;
  if (typeof query === 'string') {
    results = await search({ q: query });
  } else {
    const title = query.cleanTitle || query.title;
    results = await search({ trackName: title, artistName: query.author });
    if (!results.some((r) => r.plainLyrics)) results = await search({ q: `${query.author} ${title}` });
    if (!results.some((r) => r.plainLyrics)) results = await search({ q: title });
  }
  const hit = results.find((r) => r.plainLyrics);
  if (!hit) return null;
  const text = hit.plainLyrics.length > 4000 ? `${hit.plainLyrics.slice(0, 4000)}\n…` : hit.plainLyrics;
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`🎤 ${hit.trackName}`.slice(0, 256))
    .setAuthor({ name: hit.artistName.slice(0, 256) })
    .setDescription(text)
    .setFooter({ text: 'Lyrics from LRCLIB' });
}

// ── Shared actions (used by both slash commands and panel buttons) ───────────

/** Skip now for DJs, the track's requester, or anyone alone; otherwise count a vote. */
async function skipOrVote(i: Ctx, q: GuildQueue): Promise<string> {
  const member = i.member as GuildMember;
  const current = q.currentTrack!;
  if (isDJ(member) || current.requestedBy?.id === member.id) {
    q.node.skip();
    return `⏭️ Skipped ${link(current)}.`;
  }
  const s = session(q.guild.id);
  const ch = botChannel(q.guild);
  const needed = Math.max(1, Math.ceil((ch ? listenerCount(ch) : 1) / 2));
  s.skipVotes.add(member.id);
  if (s.skipVotes.size >= needed) {
    q.node.skip();
    return `⏭️ Vote passed. Skipped ${link(current)}.`;
  }
  return `🗳️ ${member} voted to skip ${link(current)} (**${s.skipVotes.size}/${needed}**).`;
}

async function stopPlayback(q: GuildQueue) {
  if (getMusicConfig(q.guild.id).alwaysOn) {
    // 24/7: stop and clear, but stay in the channel.
    q.tracks.clear();
    q.node.stop();
  } else {
    q.delete();
  }
}

function cycleLoop(q: GuildQueue): string {
  const order = [QueueRepeatMode.OFF, QueueRepeatMode.QUEUE, QueueRepeatMode.TRACK, QueueRepeatMode.AUTOPLAY];
  const next = order[(order.indexOf(q.repeatMode) + 1) % order.length]!;
  q.setRepeatMode(next);
  return LOOP_LABEL[next]!;
}

// ── Adding tracks ────────────────────────────────────────────────────────────

/** Checks shared by every command that adds tracks. Replies and returns false when blocked. */
async function canAdd(i: ChatInputCommandInteraction, { djOnly = false } = {}): Promise<boolean> {
  const member = i.member as GuildMember;
  const vc = member.voice.channel;
  if (!vc) return !!(await deny(i, '❌ Join a voice channel first.'));
  const current = botChannel(i.guild!);
  if (current && current.id !== vc.id && listenerCount(current) > 0) {
    return !!(await deny(i, `❌ I'm already playing in <#${current.id}>. Join it, or ask a DJ to \`/music summon\` me.`));
  }
  if (getMusicConfig(i.guildId!).karaoke && !isDJ(member)) {
    return !!(await deny(i, '🎤 Karaoke mode is on, so only DJs can add tracks right now.'));
  }
  if (djOnly && !isDJ(member)) return !!(await deny(i, NOT_DJ));
  return true;
}

type Placement = 'end' | 'next' | 'now';

async function addTracks(i: ChatInputCommandInteraction, query: string | Track, placement: Placement = 'end', searchEngine?: any) {
  const p = getPlayer(i.client);
  await waitForExtractors();
  const member = i.member as GuildMember;

  let result: SearchResult;
  if (typeof query === 'string') {
    const q = normalizeQuery(query);
    // Text searches go straight to YouTube. Auto-search would resolve names via
    // Spotify/SoundCloud metadata and then have to bridge to a playable source.
    const engine = searchEngine ?? (/^https?:\/\//i.test(q) ? QueryType.AUTO : QueryType.YOUTUBE_SEARCH);
    result = await p.search(q, { requestedBy: i.user, searchEngine: engine });
  } else {
    result = new SearchResult(p, { query: query.url, tracks: [query], requestedBy: i.user });
  }
  if (!result.hasTracks()) throw new Error('No results found.');
  const added = result.playlist ? result.tracks : [result.tracks[0]!];

  const before = useQueue(i.guildId!);
  const wasPlaying = !!before?.currentTrack;

  // Start downloading the first track now so playback begins from a complete copy.
  await prefetch(added[0]);

  const { queue } = await p.play(member.voice.channel!, result, {
    requestedBy: i.user,
    nodeOptions: nodeOptions(i.guildId!, i.channel),
    connectionOptions: VOICE_CONNECT_OPTIONS,
  });
  const s = session(i.guildId!);
  if (!s.hostId) s.hostId = i.user.id;

  if (wasPlaying && placement !== 'end') {
    added.forEach((t, n) => queue.moveTrack(t, n));
    if (placement === 'now') queue.node.skip(); // playerStart posts the new Now Playing panel
    else refreshPanel(queue);
  }
  const position = wasPlaying && placement === 'end' ? queue.tracks.size - added.length + 1 : 0;
  const title = placement === 'now' ? '▶️ Playing Now' : placement === 'next' ? '⏩ Playing Next'
    : !wasPlaying ? '▶️ Starting Playback' : '➕ Added to Queue';
  return addedEmbed(result, added, title, position);
}

// ── Command definition ───────────────────────────────────────────────────────

const queryOption = (o: any) => o.setName('query').setDescription('Song name or link (YouTube, Spotify, SoundCloud, Apple Music)')
  .setRequired(true).setAutocomplete(true);

const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Music player')
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
  .setContexts([InteractionContextType.Guild])
  .addSubcommand((s) => s.setName('play').setDescription('Play a song or playlist, or add it to the queue').addStringOption(queryOption))
  .addSubcommand((s) => s.setName('playnext').setDescription('Queue a song to play next (DJ)').addStringOption(queryOption))
  .addSubcommand((s) => s.setName('playnow').setDescription('Play a song right now, skipping the current one (DJ)').addStringOption(queryOption))
  .addSubcommand((s) => s.setName('search').setDescription('Search and pick a track from the results')
    .addStringOption((o) => o.setName('query').setDescription('Search terms').setRequired(true))
    .addStringOption((o) => o.setName('source').setDescription('Where to search').setChoices(
      { name: 'YouTube', value: 'youtube' },
      { name: 'SoundCloud', value: 'soundcloud' },
    )))
  .addSubcommand((s) => s.setName('stream').setDescription('Play a direct stream URL, like internet radio')
    .addStringOption((o) => o.setName('url').setDescription('Stream URL').setRequired(true)))
  .addSubcommand((s) => s.setName('skip').setDescription('Skip the current track (starts a vote if you are not a DJ)'))
  .addSubcommand((s) => s.setName('skipto').setDescription('Jump to a track in the queue (DJ)')
    .addIntegerOption((o) => o.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('previous').setDescription('Play the previous track again (DJ)'))
  .addSubcommand((s) => s.setName('stop').setDescription('Stop the music and clear the queue (DJ)'))
  .addSubcommand((s) => s.setName('pause').setDescription('Pause or resume playback'))
  .addSubcommand((s) => s.setName('queue').setDescription('Show the queue')
    .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)))
  .addSubcommand((s) => s.setName('nowplaying').setDescription('Show the current track with a progress bar'))
  .addSubcommand((s) => s.setName('lyrics').setDescription('Show lyrics for the current song, or any song')
    .addStringOption((o) => o.setName('query').setDescription('Song to look up (defaults to what is playing)')))
  .addSubcommand((s) => s.setName('volume').setDescription('Set the volume (DJ, saved for this server)')
    .addIntegerOption((o) => o.setName('level').setDescription('Volume (1-200)').setRequired(true).setMinValue(1).setMaxValue(200)))
  .addSubcommand((s) => s.setName('speed').setDescription('Change the playback speed (DJ)')
    .addNumberOption((o) => o.setName('multiplier').setDescription('Speed (0.5-3, 1 is normal)').setRequired(true).setMinValue(0.5).setMaxValue(3)))
  .addSubcommand((s) => s.setName('seek').setDescription('Jump to a time in the current track (DJ)')
    .addStringOption((o) => o.setName('time').setDescription('For example 1:30 or 90').setRequired(true)))
  .addSubcommand((s) => s.setName('loop').setDescription('Set the loop mode (DJ)')
    .addStringOption((o) => o.setName('mode').setDescription('Loop mode').setRequired(true).setChoices(
      { name: 'Off', value: 'off' },
      { name: 'Track', value: 'track' },
      { name: 'Queue', value: 'queue' },
      { name: 'Autoplay (keep playing similar songs)', value: 'autoplay' },
    )))
  .addSubcommand((s) => s.setName('shuffle').setDescription('Shuffle the queue (DJ)'))
  .addSubcommand((s) => s.setName('remove').setDescription('Remove a track from the queue (DJ, or your own track)')
    .addIntegerOption((o) => o.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('move').setDescription('Move a track to a different spot in the queue (DJ)')
    .addIntegerOption((o) => o.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName('to').setDescription('New position').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('clear').setDescription('Clear the upcoming queue but keep the current track (DJ)'))
  .addSubcommand((s) => s.setName('filter').setDescription('Toggle an audio effect (DJ)')
    .addStringOption((o) => o.setName('effect').setDescription('Effect to toggle').setRequired(true).setChoices(
      { name: 'Turn all effects off', value: 'off' },
      ...Object.entries(FILTERS).map(([value, name]) => ({ name, value })),
    )))
  .addSubcommand((s) => s.setName('summon').setDescription('Bring the bot to your voice channel (DJ if it is busy elsewhere)'))
  .addSubcommand((s) => s.setName('clean').setDescription("Delete the music bot's recent messages here (DJ)")
    .addIntegerOption((o) => o.setName('amount').setDescription('How many recent messages to check (max 100)').setMinValue(1).setMaxValue(100)))
  .addSubcommandGroup((g) => g.setName('dj').setDescription('DJ and server music settings')
    .addSubcommand((s) => s.setName('host').setDescription('Hand this session\'s DJ controls to someone else')
      .addUserOption((o) => o.setName('user').setDescription('New host').setRequired(true)))
    .addSubcommand((s) => s.setName('follow').setDescription('Make the bot follow someone between voice channels (DJ)')
      .addUserOption((o) => o.setName('user').setDescription('User to follow (defaults to you)')))
    .addSubcommand((s) => s.setName('karaoke').setDescription('Toggle karaoke mode: only DJs can add tracks (Manage Server)'))
    .addSubcommand((s) => s.setName('247').setDescription('Toggle 24/7 mode: stay in voice when idle (Manage Server)'))
    .addSubcommand((s) => s.setName('role').setDescription('Set or clear the DJ role (Manage Server)')
      .addRoleOption((o) => o.setName('role').setDescription('DJ role (leave empty so everyone listening is a DJ)'))));

// ── Command handlers ─────────────────────────────────────────────────────────

async function runDJ(i: ChatInputCommandInteraction, sub: string) {
  const member = i.member as GuildMember;
  const guildId = i.guildId!;

  if (sub === 'host') {
    const target = i.options.getUser('user', true);
    const s = session(guildId);
    if (!isAdmin(member) && s.hostId && s.hostId !== member.id) return deny(i, '❌ Only the current host or a Manage Server member can hand over hosting.');
    if (target.bot) return deny(i, '❌ Bots can\'t host.');
    s.hostId = target.id;
    return i.reply(`🎧 ${target} is now the host and has DJ controls for this session.`);
  }

  if (sub === 'follow') {
    if (!isDJ(member)) return deny(i, NOT_DJ);
    const target = i.options.getUser('user') ?? i.user;
    const s = session(guildId);
    if (s.followId === target.id) {
      s.followId = null;
      return i.reply(`👋 No longer following ${target}.`);
    }
    s.followId = target.id;
    return i.reply(`👣 Now following ${target} between voice channels.`);
  }

  if (!isAdmin(member)) return deny(i, '❌ You need **Manage Server** to change music settings.');

  if (sub === 'karaoke') {
    const { karaoke } = setMusicConfig(guildId, { karaoke: !getMusicConfig(guildId).karaoke });
    return i.reply(karaoke ? '🎤 Karaoke mode is **on**. Only DJs can add tracks.' : '🎤 Karaoke mode is **off**.');
  }

  if (sub === '247') {
    const { alwaysOn } = setMusicConfig(guildId, { alwaysOn: !getMusicConfig(guildId).alwaysOn });
    const q = useQueue(guildId);
    if (q) applyAlwaysOn(q, alwaysOn);
    return i.reply(alwaysOn ? '🌙 24/7 mode is **on**. I\'ll stay in voice even when the queue ends or everyone leaves.' : '🌙 24/7 mode is **off**.');
  }

  if (sub === 'role') {
    const role = i.options.getRole('role');
    setMusicConfig(guildId, { djRoleId: role?.id ?? null });
    return i.reply(role
      ? `🎧 DJ role set to ${role}. Members without it can still add songs and vote to skip.`
      : '🎧 DJ role cleared. Everyone listening has DJ controls.');
  }
}

async function run(i: ChatInputCommandInteraction) {
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand();
  if (group === 'dj') return runDJ(i, sub);

  const p = getPlayer(i.client);
  const member = i.member as GuildMember;

  switch (sub) {
    case 'play':
    case 'playnext':
    case 'playnow': {
      if (!await canAdd(i, { djOnly: sub !== 'play' })) return;
      const query = i.options.getString('query', true);
      await i.deferReply();
      try {
        const embed = await addTracks(i, query, sub === 'play' ? 'end' : sub === 'playnext' ? 'next' : 'now');
        await i.editReply({ embeds: [embed] });
      } catch (e: any) {
        logger.warn(`[music] /music ${sub} "${query}" failed: ${describeError(e)}`);
        await i.editReply(`❌ Couldn't play that: ${e?.message ?? e}`);
      }
      return;
    }

    case 'search': {
      if (!await canAdd(i)) return;
      const query = i.options.getString('query', true);
      const source = i.options.getString('source') ?? 'youtube';
      await i.deferReply();
      await waitForExtractors();
      const results = await p.search(query, {
        searchEngine: source === 'soundcloud' ? QueryType.SOUNDCLOUD_SEARCH : QueryType.YOUTUBE_SEARCH,
        requestedBy: i.user,
      }).catch(() => null);
      if (!results?.hasTracks()) { await i.editReply('❌ No results found.'); return; }
      const tracks = results.tracks.slice(0, 10);
      const menu = new StringSelectMenuBuilder()
        .setCustomId('music-search-select')
        .setPlaceholder('Choose a track to queue')
        .addOptions(tracks.map((t, n) => ({
          label: t.title.slice(0, 100),
          description: `${t.author} · ${t.duration}`.slice(0, 100),
          value: String(n),
        })));
      const msg = await i.editReply({ content: `🔎 Results for **${query}**:`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
      let picked;
      try {
        picked = await msg.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: (c) => c.user.id === i.user.id, time: 60_000 });
      } catch {
        await i.editReply({ content: '⏱️ Search timed out.', components: [] }).catch(() => {});
        return;
      }
      await picked.deferUpdate();
      try {
        const embed = await addTracks(i, tracks[Number(picked.values[0])]!);
        await i.editReply({ content: null, embeds: [embed], components: [] });
      } catch (e: any) {
        await i.editReply({ content: `❌ Couldn't play that: ${e?.message ?? e}`, components: [] });
      }
      return;
    }

    case 'stream': {
      if (!await canAdd(i)) return;
      const url = i.options.getString('url', true);
      if (!/^https?:\/\//i.test(url)) return deny(i, '❌ That needs to be a full http(s) link.');
      await i.deferReply();
      try {
        const embed = await addTracks(i, url, 'end', QueryType.ARBITRARY);
        await i.editReply({ embeds: [embed.setAuthor({ name: '📡 Streaming' })] });
      } catch (e: any) {
        await i.editReply(`❌ Couldn't stream that: ${e?.message ?? e}`);
      }
      return;
    }

    case 'skip': {
      const q = await controlQueue(i, { dj: false }); if (!q) return;
      return i.reply({ content: await skipOrVote(i, q), flags: MessageFlags.SuppressEmbeds });
    }

    case 'skipto': {
      const q = await controlQueue(i); if (!q) return;
      const track = q.tracks.at(i.options.getInteger('position', true) - 1);
      if (!track) return deny(i, '❌ There\'s no track at that position.');
      q.node.skipTo(track);
      return i.reply({ content: `⏭️ Jumping to ${link(track)}.`, flags: MessageFlags.SuppressEmbeds });
    }

    case 'previous': {
      const q = await controlQueue(i); if (!q) return;
      if (!q.history.previousTrack) return deny(i, '❌ There\'s no previous track.');
      await i.deferReply();
      await q.history.previous().catch(() => {});
      return i.editReply('⏮️ Playing the previous track.');
    }

    case 'stop': {
      const q = await controlQueue(i, { playing: false }); if (!q) return;
      await stopPlayback(q);
      return i.reply('⏹️ Stopped and cleared the queue.');
    }

    case 'pause': {
      const q = await controlQueue(i, { requesterOk: true }); if (!q) return;
      q.node.setPaused(!q.node.isPaused());
      return i.reply(q.node.isPaused() ? '⏸️ Paused.' : '▶️ Resumed.');
    }

    case 'queue': {
      const q = useQueue(i.guildId!);
      if (!q?.currentTrack && !q?.tracks.size) return deny(i, '❌ The queue is empty.');
      return i.reply(queueView(q, (i.options.getInteger('page') ?? 1) - 1));
    }

    case 'nowplaying': {
      const q = useQueue(i.guildId!);
      if (!q?.currentTrack) return deny(i, '❌ Nothing is playing.');
      return i.reply({ embeds: [nowPlayingEmbed(q, true)] });
    }

    case 'lyrics': {
      const query = i.options.getString('query');
      const current = useQueue(i.guildId!)?.currentTrack;
      if (!query && !current) return deny(i, '❌ Nothing is playing. Give me a song to look up.');
      await i.deferReply();
      const embed = await lyricsEmbed(p, query ?? current!);
      return i.editReply(embed ? { embeds: [embed] } : '❌ I couldn\'t find lyrics for that song.');
    }

    case 'volume': {
      const level = i.options.getInteger('level', true);
      const q = useQueue(i.guildId!);
      if (q) {
        if (!await controlQueue(i, { playing: false })) return;
        q.node.setVolume(level);
        refreshPanel(q);
      } else if (!isDJ(member)) {
        return deny(i, NOT_DJ);
      }
      setMusicConfig(i.guildId!, { volume: level });
      return i.reply(`🔊 Volume set to **${level}%**.`);
    }

    case 'speed': {
      const q = await controlQueue(i); if (!q) return;
      const speed = Math.round(i.options.getNumber('multiplier', true) * 100) / 100;
      session(q.guild.id).speed = speed;
      await i.deferReply();
      await applyFilters(q, namedFilters(q));
      refreshPanel(q);
      return i.editReply(speed === 1 ? '⏩ Speed back to normal.' : `⏩ Playback speed set to **${speed}x**.`);
    }

    case 'seek': {
      const q = await controlQueue(i); if (!q) return;
      const raw = i.options.getString('time', true);
      const ms = parseTime(raw);
      if (ms === null) return deny(i, '❌ Use a time like `1:30`, `90` or `1:02:03`.');
      if (!q.currentTrack!.durationMS) return deny(i, '❌ You can\'t seek in a live stream.');
      if (ms >= q.currentTrack!.durationMS) return deny(i, `❌ This track is only ${q.currentTrack!.duration} long.`);
      await i.deferReply();
      await q.node.seek(ms);
      return i.editReply(`⏩ Jumped to **${formatMs(ms)}**.`);
    }

    case 'loop': {
      const q = await controlQueue(i); if (!q) return;
      const modes: Record<string, QueueRepeatMode> = {
        off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE, autoplay: QueueRepeatMode.AUTOPLAY,
      };
      q.setRepeatMode(modes[i.options.getString('mode', true)]!);
      refreshPanel(q);
      return i.reply(`🔁 Loop is now **${LOOP_LABEL[q.repeatMode]}**.`);
    }

    case 'shuffle': {
      const q = await controlQueue(i); if (!q) return;
      if (q.tracks.size < 2) return deny(i, '❌ There aren\'t enough tracks queued to shuffle.');
      q.tracks.shuffle();
      refreshPanel(q);
      return i.reply(`🔀 Shuffled **${q.tracks.size}** tracks.`);
    }

    case 'remove': {
      const q = await controlQueue(i, { dj: false, playing: false }); if (!q) return;
      const track = q.tracks.at(i.options.getInteger('position', true) - 1);
      if (!track) return deny(i, '❌ There\'s no track at that position.');
      if (!isDJ(member) && track.requestedBy?.id !== member.id) return deny(i, '❌ You can only remove tracks you added.');
      q.node.remove(track);
      refreshPanel(q);
      return i.reply({ content: `🗑️ Removed ${link(track)}.`, flags: MessageFlags.SuppressEmbeds });
    }

    case 'move': {
      const q = await controlQueue(i, { playing: false }); if (!q) return;
      const from = i.options.getInteger('from', true) - 1;
      const to = i.options.getInteger('to', true) - 1;
      const track = q.tracks.at(from);
      if (!track || to >= q.tracks.size) return deny(i, `❌ Positions go from 1 to ${q.tracks.size}.`);
      q.moveTrack(track, to);
      refreshPanel(q);
      return i.reply({ content: `↕️ Moved ${link(track)} to **#${to + 1}**.`, flags: MessageFlags.SuppressEmbeds });
    }

    case 'clear': {
      const q = await controlQueue(i, { playing: false }); if (!q) return;
      const count = q.tracks.size;
      if (!count) return deny(i, '❌ The queue is already empty.');
      q.tracks.clear();
      refreshPanel(q);
      return i.reply(`🧹 Cleared **${count}** track(s). The current song keeps playing.`);
    }

    case 'filter': {
      const q = await controlQueue(i); if (!q) return;
      const effect = i.options.getString('effect', true);
      const current = namedFilters(q);
      let named: string[];
      let msg: string;
      if (effect === 'off') {
        named = [];
        session(q.guild.id).speed = 1;
        msg = '🎛️ All effects are off.';
      } else if (current.includes(effect)) {
        named = current.filter((f) => f !== effect);
        msg = `🎛️ **${FILTERS[effect]}** is off.`;
      } else {
        named = [...current, effect];
        msg = `🎛️ **${FILTERS[effect]}** is on.`;
      }
      await i.deferReply();
      await applyFilters(q, named);
      refreshPanel(q);
      return i.editReply(msg);
    }

    case 'summon': {
      const vc = member.voice.channel;
      if (!vc) return deny(i, '❌ Join a voice channel first.');
      const current = botChannel(i.guild!);
      if (current?.id === vc.id) return deny(i, '✅ I\'m already here.');
      if (current && listenerCount(current) > 0 && !isDJ(member)) return deny(i, NOT_DJ);
      const q = useQueue(i.guildId!) ?? p.queues.create(i.guild!, nodeOptions(i.guildId!, i.channel));
      const s = session(i.guildId!);
      if (!s.hostId) s.hostId = i.user.id;
      try {
        await q.connect(vc, VOICE_CONNECT_OPTIONS);
        return i.reply(`🔊 Joined <#${vc.id}>.`);
      } catch (e: any) {
        return deny(i, `❌ I couldn't join: ${e?.message ?? e}`);
      }
    }

    case 'clean': {
      if (!isDJ(member)) return deny(i, NOT_DJ);
      const channel = i.channel;
      if (!channel?.isTextBased() || channel.isDMBased()) return deny(i, '❌ I can\'t clean this channel.');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const me = i.client.user!.id;
      const messages = await channel.messages.fetch({ limit: i.options.getInteger('amount') ?? 50 });
      // Only music messages: this bot posts as the same user as the main bot, so
      // "every message from me" would also delete giveaways, ticket panels and so on.
      const music = messages.filter((m) =>
        m.author.id === me && (musicMessageIds.has(m.id) || !!(m as any).interaction?.commandName?.startsWith('music')));
      const deleted = await channel.bulkDelete(music, true).catch(() => null);
      return i.editReply(`🧹 Deleted **${deleted?.size ?? 0}** music message(s).`);
    }
  }
}

// ── Panel buttons ────────────────────────────────────────────────────────────

async function button(i: ButtonInteraction) {
  const [, action, arg] = i.customId.split(':');
  const p = getPlayer(i.client);

  if (action === 'qpage') {
    const q = useQueue(i.guildId!);
    if (!q) return i.update({ content: '❌ The queue is gone.', embeds: [], components: [] });
    return i.update(queueView(q, Number(arg) || 0));
  }

  if (action === 'queue') {
    const q = useQueue(i.guildId!);
    if (!q) return deny(i, '❌ The queue is empty.');
    return i.reply({ ...queueView(q, 0), flags: MessageFlags.Ephemeral });
  }

  if (action === 'lyrics') {
    const current = useQueue(i.guildId!)?.currentTrack;
    if (!current) return deny(i, '❌ Nothing is playing.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const embed = await lyricsEmbed(p, current);
    return i.editReply(embed ? { embeds: [embed] } : '❌ I couldn\'t find lyrics for this song.');
  }

  switch (action) {
    case 'pause': {
      const q = await controlQueue(i, { requesterOk: true }); if (!q) return;
      q.node.setPaused(!q.node.isPaused());
      return i.update(panelPayload(q));
    }
    case 'loop': {
      const q = await controlQueue(i); if (!q) return;
      cycleLoop(q);
      return i.update(panelPayload(q));
    }
    case 'shuffle': {
      const q = await controlQueue(i); if (!q) return;
      q.tracks.shuffle();
      return i.update(panelPayload(q));
    }
    case 'skip': {
      const q = await controlQueue(i, { dj: false }); if (!q) return;
      const member = i.member as GuildMember;
      if (isDJ(member) || q.currentTrack?.requestedBy?.id === member.id) {
        await i.deferUpdate();
        q.node.skip(); // playerStart replaces this panel
        return;
      }
      return i.reply({ content: await skipOrVote(i, q), flags: MessageFlags.SuppressEmbeds });
    }
    case 'prev': {
      const q = await controlQueue(i); if (!q) return;
      if (!q.history.previousTrack) return deny(i, '❌ There\'s no previous track.');
      await i.deferUpdate();
      await q.history.previous().catch(() => {});
      return;
    }
    case 'stop': {
      const q = await controlQueue(i, { playing: false }); if (!q) return;
      await i.deferUpdate();
      await stopPlayback(q);
      return;
    }
  }
}

// ── Autocomplete ─────────────────────────────────────────────────────────────

async function autocomplete(i: AutocompleteInteraction) {
  const typed = i.options.getFocused().trim();
  if (typed.length < 2 || /^https?:\/\//i.test(typed)) return i.respond([]).catch(() => {});
  try {
    const p = getPlayer(i.client);
    await waitForExtractors();
    // Discord gives autocomplete 3 seconds to answer.
    const res = await Promise.race([
      p.search(typed, { searchEngine: QueryType.YOUTUBE_SEARCH }),
      new Promise<null>((r) => setTimeout(() => r(null), 2_000)),
    ]);
    const choices = (res?.tracks ?? [])
      .filter((t) => t.url.length <= 100)
      .slice(0, 10)
      .map((t) => ({ name: `${t.title} — ${t.author} (${t.duration})`.slice(0, 100), value: t.url }));
    await i.respond(choices);
  } catch {
    await i.respond([]).catch(() => {});
  }
}

const Music: Command = { data, run, button, autocomplete };

export default Music;
