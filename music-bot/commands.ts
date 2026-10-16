import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, InteractionContextType,
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember,
} from 'discord.js';
import type { Player, SearchPlatform, SearchResult } from 'lavalink-client';
import type { Command } from './command';
import {
  FILTERS, LOOP_LABEL, activeFilters, botChannel, checkIdle, currentSpeed, describeError, duration, filterSummary, formatMs,
  isAdmin, isDJ, link, listenerCount, loopMode, manager, nowPlayingEmbed, panelPayload, refreshPanel, requester, requesterOf,
  sameChannelError, session, syncSponsorBlock, toUnresolved,
  type AnyTrack, type FilterName, type LoopMode, type Requester,
} from './lavalink';
import { resolveLink } from './links';
import { getMusicConfig, setMusicConfig } from './store';
import logger from './logger';

type Ctx = ChatInputCommandInteraction | ButtonInteraction;

const NOT_DJ = '🎧 Only DJs can do that. Use `/skip` to vote instead.';
const SOUNDCLOUD = /^https?:\/\/(?:[\w-]+\.)?(?:soundcloud\.com|snd\.sc)\//i;

// ── Small helpers ────────────────────────────────────────────────────────────

async function deny(i: Ctx, content: string): Promise<null> {
  if (i.deferred || i.replied) await i.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  else await i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  return null;
}

/**
 * The guild's player, if this member may control it from where they are.
 * `dj` requires DJ controls; `requesterOk` also lets the current track's requester through.
 */
async function controlPlayer(i: Ctx, { dj = true, requesterOk = false, playing = true } = {}): Promise<Player | null> {
  const p = manager.getPlayer(i.guildId!);
  if (!p || (playing && !p.queue.current)) return deny(i, '❌ Nothing is playing.');
  const member = i.member as GuildMember;
  const where = sameChannelError(member);
  if (where) return deny(i, where);
  const isRequester = requesterOk && requesterOf(p.queue.current)?.id === member.id;
  if (dj && !isDJ(member) && !isRequester) return deny(i, NOT_DJ);
  return p;
}

// YouTube "radio"/"mix" links (list=RD…, start_radio=1) would queue a whole
// generated mix. When such a link has a video id, play just that video.
function normalizeQuery(q: string): string {
  let u: URL;
  try { u = new URL(q.trim()); } catch { return q.trim(); }
  const isYouTube = u.hostname === 'youtu.be' || /(^|\.)youtube\.com$/.test(u.hostname);
  if (!isYouTube) return q.trim();
  const vid = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
  const list = u.searchParams.get('list');
  const isRadio = u.searchParams.get('start_radio') === '1' || !!list?.startsWith('RD');
  return vid && isRadio ? `https://www.youtube.com/watch?v=${vid}` : q.trim();
}

const isUrl = (q: string) => /^https?:\/\//i.test(q);

/** Search Lavalink directly (no player needed), for autocomplete and before joining voice. */
async function search(query: string, source: SearchPlatform | undefined, req: Requester): Promise<SearchResult> {
  const node = manager.nodeManager.leastUsedNodes()[0];
  if (!node) throw new Error('the music server is not connected');
  return node.search(source ? { query, source } : { query }, req) as Promise<SearchResult>;
}

// ── Lyrics (LRCLIB, free and keyless) ────────────────────────────────────────

type LrcHit = { trackName: string; artistName: string; plainLyrics: string | null };

async function lrclib(params: Record<string, string>): Promise<LrcHit[]> {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v.trim()));
  try {
    const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams(clean)}`, {
      headers: { 'User-Agent': 'TMCBot music (https://github.com/Geckomacabre/Multi-Purpose-Discord-Bot)' },
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? await res.json() as LrcHit[] : [];
  } catch {
    return [];
  }
}

/** "Artist - Song (Official Video) [4K]" → "Artist - Song" */
const cleanTitle = (t: string) => t
  .replace(/\s*[([][^)\]]*(official|video|audio|lyric|visuali[sz]er|\bhd\b|4k|remaster|\bmv\b|m\/v)[^)\]]*[)\]]/gi, '')
  .replace(/\s*\|.*$/, '')
  .trim();

async function lyricsEmbed(query: string | AnyTrack) {
  const attempts: Record<string, string>[] = [];
  if (typeof query === 'string') {
    attempts.push({ q: query });
  } else {
    const title = cleanTitle(query.info.title);
    const artist = (query.info.author ?? '').replace(/\s+-\s+Topic$/i, '').trim();
    const dashed = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dashed) attempts.push({ track_name: dashed[2]!, artist_name: dashed[1]! });
    attempts.push({ track_name: title, artist_name: artist }, { q: `${artist} ${title}` }, { q: title });
  }
  for (const params of attempts) {
    const hit = (await lrclib(params)).find((r) => r.plainLyrics);
    if (!hit) continue;
    const text = hit.plainLyrics!.length > 4000 ? `${hit.plainLyrics!.slice(0, 4000)}\n…` : hit.plainLyrics!;
    return new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`🎤 ${hit.trackName}`.slice(0, 256))
      .setAuthor({ name: hit.artistName.slice(0, 256) })
      .setDescription(text)
      .setFooter({ text: 'Lyrics from LRCLIB' });
  }
  return null;
}

// ── Views ────────────────────────────────────────────────────────────────────

function queueView(p: Player, page: number) {
  const tracks = p.queue.tracks;
  const perPage = 10;
  const pages = Math.max(1, Math.ceil(tracks.length / perPage));
  page = Math.min(Math.max(page, 0), pages - 1);
  const start = page * perPage;
  const total = tracks.reduce((sum, t) => sum + (t.info.duration || 0), 0);
  const current = p.queue.current;
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle('📜 Queue')
    .setDescription(
      (current ? `**Now playing:** ${link(current)} — ${duration(current)}\n\n` : '') +
      (tracks.length
        ? tracks.slice(start, start + perPage).map((t, n) => `**${start + n + 1}.** ${link(t)} — ${duration(t)} · ${requester(t)}`).join('\n')
        : '*Nothing queued.* Add songs with `/play`.'),
    )
    .setFooter({ text: `${tracks.length} track(s) · ${formatMs(total)} total · Loop ${LOOP_LABEL[loopMode(p)]}${pages > 1 ? ` · Page ${page + 1}/${pages}` : ''}` });
  const components = pages > 1 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`music:qpage:${page - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`music:qpage:${page + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  )] : [];
  return { embeds: [embed], components };
}

// ── Shared actions (used by both slash commands and panel buttons) ───────────

/** Skip now for DJs, the track's requester, or anyone alone; otherwise count a vote. */
async function skipOrVote(i: Ctx, p: Player): Promise<string> {
  const member = i.member as GuildMember;
  const current = p.queue.current!;
  if (isDJ(member) || requesterOf(current)?.id === member.id) {
    await p.skip(0, false);
    return `⏭️ Skipped ${link(current)}.`;
  }
  const s = session(p.guildId);
  const ch = botChannel(i.guild!);
  const needed = Math.max(1, Math.ceil((ch ? listenerCount(ch) : 1) / 2));
  s.skipVotes.add(member.id);
  if (s.skipVotes.size >= needed) {
    await p.skip(0, false);
    return `⏭️ Vote passed. Skipped ${link(current)}.`;
  }
  return `🗳️ ${member} voted to skip ${link(current)} (**${s.skipVotes.size}/${needed}**).`;
}

async function stopPlayback(p: Player) {
  if (getMusicConfig(p.guildId).alwaysOn) {
    // 24/7: stop and clear, but stay in the channel.
    session(p.guildId).autoplay = false;
    await p.stopPlaying(true, false);
  } else {
    await p.destroy('Stopped');
  }
}

async function setLoop(p: Player, mode: LoopMode) {
  session(p.guildId).autoplay = mode === 'autoplay';
  await p.setRepeatMode(mode === 'autoplay' ? 'off' : mode);
}

async function cycleLoop(p: Player) {
  const order: LoopMode[] = ['off', 'queue', 'track', 'autoplay'];
  await setLoop(p, order[(order.indexOf(loopMode(p)) + 1) % order.length]!);
}

/** Play the previous track again; the current one goes back to the front of the queue. */
async function playPrevious(p: Player): Promise<boolean> {
  const prev = await p.queue.shiftPrevious();
  if (!prev) return false;
  if (p.queue.current) await p.queue.add(p.queue.current, 0);
  await p.play({ clientTrack: prev });
  return true;
}

async function togglePause(p: Player) {
  if (p.paused) await p.resume();
  else await p.pause();
}

// ── Adding tracks ────────────────────────────────────────────────────────────

/** Checks shared by every command that adds tracks. Replies and returns false when blocked. */
async function canAdd(i: ChatInputCommandInteraction, { djOnly = false } = {}): Promise<boolean> {
  const member = i.member as GuildMember;
  const vc = member.voice.channel;
  if (!vc) return !!(await deny(i, '❌ Join a voice channel first.'));
  const current = botChannel(i.guild!);
  if (current && current.id !== vc.id && listenerCount(current) > 0) {
    return !!(await deny(i, `❌ I'm already playing in <#${current.id}>. Join it to add songs.`));
  }
  if (djOnly && !isDJ(member)) return !!(await deny(i, '🎧 Only DJs can queue a song to play next.'));
  if (!manager.useable) return !!(await deny(i, '🎵 The music server is still starting. Try again in a few seconds.'));
  return true;
}

type Found = { tracks: AnyTrack[]; playlist: { name: string; url: string | null; artworkUrl: string | null } | null };

async function find(query: string, req: Requester): Promise<Found> {
  const linked = await resolveLink(query).catch((e: any) => { throw new Error(`I couldn't read that link: ${e?.message ?? e}`); });
  if (linked) {
    if (!linked.tracks.length) throw new Error('That link has no playable songs.');
    const tracks = linked.tracks.map((t) => toUnresolved(t, req));
    return {
      tracks,
      playlist: linked.tracks.length > 1 || linked.name ? { name: linked.name ?? 'Playlist', url: linked.url, artworkUrl: linked.artworkUrl } : null,
    };
  }
  if (SOUNDCLOUD.test(query)) {
    throw new Error('SoundCloud links don\'t work right now: SoundCloud changed how it streams, and the audio engine can\'t play it yet. Try the song name instead.');
  }

  let res: SearchResult;
  if (isUrl(query)) {
    res = await search(query, undefined, req);
  } else {
    // YouTube Music first (official audio), then regular YouTube for everything else.
    res = await search(query, 'ytmsearch', req);
    if (!res.tracks.length) res = await search(query, 'ytsearch', req);
  }
  if (res.loadType === 'error') throw new Error(res.exception?.message ?? 'the source returned an error');
  if (!res.tracks.length) throw new Error('No results found.');
  if (res.loadType === 'playlist') {
    return { tracks: res.tracks, playlist: { name: res.playlist?.name ?? 'Playlist', url: res.playlist?.uri ?? query, artworkUrl: res.playlist?.thumbnail ?? null } };
  }
  return { tracks: [res.tracks[0]!], playlist: null };
}

function addedEmbed({ tracks, playlist }: Found, title: string, position: number) {
  if (playlist) {
    const total = tracks.reduce((sum, t) => sum + (t.info.duration || 0), 0);
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor({ name: title })
      .setTitle(playlist.name.slice(0, 256))
      .setURL(playlist.url)
      .setThumbnail(playlist.artworkUrl || tracks[0]?.info.artworkUrl || null)
      .setDescription(`**${tracks.length}** tracks · ${formatMs(total)}`);
  }
  const t = tracks[0]!;
  const e = new EmbedBuilder()
    .setColor(Colors.Green)
    .setAuthor({ name: title })
    .setDescription(`**${link(t)}**\nby ${t.info.author || 'Unknown'}`)
    .setThumbnail(t.info.artworkUrl || null)
    .addFields(
      { name: 'Duration', value: duration(t), inline: true },
      { name: 'Requested by', value: requester(t), inline: true },
    );
  if (position > 0) e.addFields({ name: 'Position', value: `#${position}`, inline: true });
  return e;
}

async function play(i: ChatInputCommandInteraction, query: string, next: boolean) {
  const guildId = i.guildId!;
  const vc = (i.member as GuildMember).voice.channel!;
  const req: Requester = { id: i.user.id };

  // Search before joining, so a failed search doesn't leave the bot sitting in voice.
  const found = await find(normalizeQuery(query), req);

  let p = manager.getPlayer(guildId);
  if (!p) {
    p = manager.createPlayer({
      guildId, voiceChannelId: vc.id, textChannelId: i.channelId, selfDeaf: true,
      volume: getMusicConfig(guildId).volume,
      // Apply effects right away instead of after the 5 s audio buffer drains.
      instaUpdateFiltersFix: true,
    });
  }
  const s = session(guildId);
  if (!s.hostId) s.hostId = i.user.id;
  p.textChannelId = i.channelId;

  const here = botChannel(i.guild!);
  if (!here) {
    p.options.voiceChannelId = vc.id;
    await p.connect();
  } else if (here.id !== vc.id) {
    await p.changeVoiceState({ voiceChannelId: vc.id });
  }

  const wasPlaying = !!p.queue.current || s.starting;
  await p.queue.add(found.tracks, next && wasPlaying ? 0 : undefined);
  if (!p.queue.current && !s.starting) {
    s.starting = true;
    try { await p.play({ paused: false }); } finally { s.starting = false; }
  } else {
    refreshPanel(p);
  }
  checkIdle(p);

  const position = !wasPlaying ? 0 : next ? 1 : p.queue.tracks.length - found.tracks.length + 1;
  const title = !wasPlaying ? '▶️ Starting Playback' : next ? '⏩ Playing Next' : '➕ Added to Queue';
  return addedEmbed(found, title, position);
}

// ── Command definitions ──────────────────────────────────────────────────────

const guildOnly = <T extends SlashCommandBuilder>(b: T) => b
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
  .setContexts([InteractionContextType.Guild]);

const commandList: Command[] = [
  {
    data: guildOnly(new SlashCommandBuilder().setName('play').setDescription('Play a song or playlist, or add it to the queue'))
      .addStringOption((o) => o.setName('query').setDescription('Song name or link (YouTube, Spotify, Apple Music, Bandcamp, Twitch...)')
        .setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('next').setDescription('Play it next instead of at the end of the queue (DJ)')),
    async run(i) {
      const next = i.options.getBoolean('next') ?? false;
      if (!await canAdd(i, { djOnly: next })) return;
      const query = i.options.getString('query', true);
      await i.deferReply();
      try {
        await i.editReply({ embeds: [await play(i, query, next)] });
      } catch (e: any) {
        logger.warn(`[music] /play "${query}" failed: ${describeError(e)}`);
        await i.editReply(`❌ Couldn't play that: ${e?.message ?? e}`);
      }
    },
    async autocomplete(i) {
      const typed = i.options.getFocused().trim();
      if (typed.length < 2 || isUrl(typed) || !manager.useable) return i.respond([]).catch(() => {});
      try {
        // Discord gives autocomplete 3 seconds to answer.
        const res = await Promise.race([
          search(typed, 'ytmsearch', { id: i.user.id }),
          new Promise<null>((r) => setTimeout(() => r(null), 2_000)),
        ]);
        const choices = (res?.tracks ?? [])
          .filter((t) => t.info.uri && t.info.uri.length <= 100)
          .slice(0, 10)
          .map((t) => ({ name: `${t.info.title} — ${t.info.author} (${duration(t)})`.slice(0, 100), value: t.info.uri }));
        await i.respond(choices);
      } catch {
        await i.respond([]).catch(() => {});
      }
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('skip').setDescription('Skip the current song (starts a vote if you are not a DJ)')),
    async run(i) {
      const p = await controlPlayer(i, { dj: false }); if (!p) return;
      await i.reply({ content: await skipOrVote(i, p), flags: MessageFlags.SuppressEmbeds });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('stop').setDescription('Stop the music, clear the queue and leave (DJ)')),
    async run(i) {
      const p = await controlPlayer(i, { playing: false }); if (!p) return;
      await stopPlayback(p);
      await i.reply('⏹️ Stopped and cleared the queue.');
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('queue').setDescription('Show the queue'))
      .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
    async run(i) {
      const p = manager.getPlayer(i.guildId!);
      if (!p?.queue.current && !p?.queue.tracks.length) return deny(i, '❌ The queue is empty.');
      await i.reply(queueView(p, (i.options.getInteger('page') ?? 1) - 1));
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current song with a progress bar')),
    async run(i) {
      const p = manager.getPlayer(i.guildId!);
      if (!p?.queue.current) return deny(i, '❌ Nothing is playing.');
      await i.reply({ embeds: [nowPlayingEmbed(p, true)] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('volume').setDescription('Set the volume (DJ, saved for this server)'))
      .addIntegerOption((o) => o.setName('level').setDescription('Volume (1-200, 100 is normal)').setRequired(true).setMinValue(1).setMaxValue(200)),
    async run(i) {
      const level = i.options.getInteger('level', true);
      const p = manager.getPlayer(i.guildId!);
      if (p) {
        if (!await controlPlayer(i, { playing: false })) return;
        await p.setVolume(level);
        refreshPanel(p);
      } else if (!isDJ(i.member as GuildMember)) {
        return deny(i, NOT_DJ);
      }
      setMusicConfig(i.guildId!, { volume: level });
      await i.reply(`🔊 Volume set to **${level}%**.`);
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('loop').setDescription('Set the loop mode (DJ)'))
      .addStringOption((o) => o.setName('mode').setDescription('Loop mode').setRequired(true).setChoices(
        { name: 'Off', value: 'off' },
        { name: 'Song', value: 'track' },
        { name: 'Queue', value: 'queue' },
        { name: 'Autoplay (keep playing similar songs)', value: 'autoplay' },
      )),
    async run(i) {
      const p = await controlPlayer(i); if (!p) return;
      await setLoop(p, i.options.getString('mode', true) as LoopMode);
      refreshPanel(p);
      await i.reply(`🔁 Loop is now **${LOOP_LABEL[loopMode(p)]}**.`);
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue (DJ)')),
    async run(i) {
      const p = await controlPlayer(i); if (!p) return;
      if (p.queue.tracks.length < 2) return deny(i, '❌ There aren\'t enough songs queued to shuffle.');
      await p.queue.shuffle();
      refreshPanel(p);
      await i.reply(`🔀 Shuffled **${p.queue.tracks.length}** songs.`);
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('remove').setDescription('Remove a song from the queue (DJ, or a song you added)'))
      .addIntegerOption((o) => o.setName('position').setDescription('Queue position (see /queue)').setRequired(true).setMinValue(1)),
    async run(i) {
      const p = await controlPlayer(i, { dj: false, playing: false }); if (!p) return;
      const index = i.options.getInteger('position', true) - 1;
      const track = p.queue.tracks[index];
      if (!track) return deny(i, '❌ There\'s no song at that position.');
      if (!isDJ(i.member as GuildMember) && requesterOf(track)?.id !== i.user.id) return deny(i, '❌ You can only remove songs you added.');
      await p.queue.remove(index);
      refreshPanel(p);
      await i.reply({ content: `🗑️ Removed ${link(track)}.`, flags: MessageFlags.SuppressEmbeds });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('lyrics').setDescription('Show lyrics for the current song, or any song'))
      .addStringOption((o) => o.setName('query').setDescription('Song to look up (defaults to what is playing)')),
    async run(i) {
      const query = i.options.getString('query');
      const current = manager.getPlayer(i.guildId!)?.queue.current;
      if (!query && !current) return deny(i, '❌ Nothing is playing. Give me a song to look up.');
      await i.deferReply();
      const embed = await lyricsEmbed(query ?? current!);
      await i.editReply(embed ? { embeds: [embed] } : '❌ I couldn\'t find lyrics for that song.');
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('filter').setDescription('Audio effects (DJ)'))
      .addStringOption((o) => o.setName('effect').setDescription('Effect to turn on or off').setChoices(
        { name: 'Turn all effects off', value: 'off' },
        ...Object.entries(FILTERS).map(([value, name]) => ({ name, value })),
      ))
      .addNumberOption((o) => o.setName('speed').setDescription('Playback speed (0.5-2, 1 is normal)').setMinValue(0.5).setMaxValue(2)),
    async run(i) {
      const effect = i.options.getString('effect') as FilterName | 'off' | null;
      const speedOpt = i.options.getNumber('speed');
      if (!effect && speedOpt === null) {
        const p = manager.getPlayer(i.guildId!);
        const on = p && filterSummary(p);
        return deny(i, on ? `🎛️ Effects on: **${on}**.` : '🎛️ No effects are on. Pick one with `/filter effect:`.');
      }
      const p = await controlPlayer(i); if (!p) return;
      await i.deferReply();
      const fm = p.filterManager;
      const s = session(p.guildId);
      const msgs: string[] = [];
      if (effect === 'off') {
        await fm.resetFilters();
        if (s.bassBoost) await fm.clearEQ();
        s.bassBoost = false;
        msgs.push('🎛️ All effects are off.');
      } else if (effect) {
        const wasOn = activeFilters(p).includes(effect);
        if (effect === 'bassboost') {
          if (wasOn) await fm.clearEQ(); else await fm.setEQPreset('BassboostMedium');
          s.bassBoost = !wasOn;
        } else if (effect === 'nightcore') await fm.toggleNightcore();
        else if (effect === 'vaporwave') await fm.toggleVaporwave();
        else if (effect === '8d') await fm.toggleRotation(0.2);
        else if (effect === 'karaoke') await fm.toggleKaraoke();
        msgs.push(`🎛️ **${FILTERS[effect]}** is ${wasOn ? 'off' : 'on'}.`);
      }
      if (speedOpt !== null) {
        const speed = Math.round(speedOpt * 100) / 100;
        await fm.setSpeed(speed);
        msgs.push(speed === 1 ? '⏩ Speed is back to normal.' : `⏩ Playback speed is **${currentSpeed(p)}x**.`);
      }
      refreshPanel(p);
      await i.editReply(msgs.join('\n'));
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('music-settings').setDescription('Music settings for this server (Manage Server)'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('view').setDescription('Show the current music settings'))
      .addSubcommand((s) => s.setName('dj-role').setDescription('Set or clear the DJ role')
        .addRoleOption((o) => o.setName('role').setDescription('DJ role (leave empty so everyone listening is a DJ)')))
      .addSubcommand((s) => s.setName('24-7').setDescription('Stay in voice when the queue ends or everyone leaves')
        .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true)))
      .addSubcommand((s) => s.setName('sponsorblock').setDescription('Skip sponsor reads, intros and non-music parts of YouTube videos')
        .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true))),
    async run(i) {
      if (!isAdmin(i.member as GuildMember)) return deny(i, '❌ You need **Manage Server** to change music settings.');
      const guildId = i.guildId!;
      const sub = i.options.getSubcommand();
      const p = manager.getPlayer(guildId);

      if (sub === 'view') {
        const c = getMusicConfig(guildId);
        return i.reply({
          embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle('🎵 Music settings').addFields(
            { name: 'DJ role', value: c.djRoleId ? `<@&${c.djRoleId}>` : 'None (everyone listening is a DJ)', inline: true },
            { name: '24/7', value: c.alwaysOn ? 'On' : 'Off', inline: true },
            { name: 'SponsorBlock', value: c.sponsorBlock ? 'On' : 'Off', inline: true },
            { name: 'Volume', value: `${c.volume}%`, inline: true },
          )],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (sub === 'dj-role') {
        const role = i.options.getRole('role');
        setMusicConfig(guildId, { djRoleId: role?.id ?? null });
        return i.reply(role
          ? `🎧 DJ role set to ${role}. Members without it can still add songs and vote to skip.`
          : '🎧 DJ role cleared. Everyone listening has DJ controls.');
      }
      const enabled = i.options.getBoolean('enabled', true);
      if (sub === '24-7') {
        setMusicConfig(guildId, { alwaysOn: enabled });
        if (p) checkIdle(p);
        return i.reply(enabled ? '🌙 24/7 mode is **on**. I\'ll stay in voice even when the queue ends or everyone leaves.' : '🌙 24/7 mode is **off**.');
      }
      if (sub === 'sponsorblock') {
        setMusicConfig(guildId, { sponsorBlock: enabled });
        if (p) await syncSponsorBlock(p);
        return i.reply(enabled
          ? '⏭️ SponsorBlock is **on**. Sponsor reads, self-promotion and non-music parts of YouTube videos are skipped.'
          : '⏭️ SponsorBlock is **off**.');
      }
    },
  },
];

export const commands = new Map(commandList.map((c) => [c.data.name as string, c]));

// ── Panel buttons (custom IDs start with "music:") ───────────────────────────

export async function handleButton(i: ButtonInteraction) {
  const [, action, arg] = i.customId.split(':');

  if (action === 'qpage') {
    const p = manager.getPlayer(i.guildId!);
    if (!p) return i.update({ content: '❌ The queue is gone.', embeds: [], components: [] });
    return i.update(queueView(p, Number(arg) || 0));
  }
  if (action === 'queue') {
    const p = manager.getPlayer(i.guildId!);
    if (!p) return deny(i, '❌ The queue is empty.');
    return i.reply({ ...queueView(p, 0), flags: MessageFlags.Ephemeral });
  }
  if (action === 'lyrics') {
    const current = manager.getPlayer(i.guildId!)?.queue.current;
    if (!current) return deny(i, '❌ Nothing is playing.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const embed = await lyricsEmbed(current);
    return i.editReply(embed ? { embeds: [embed] } : '❌ I couldn\'t find lyrics for this song.');
  }

  switch (action) {
    case 'pause': {
      const p = await controlPlayer(i, { requesterOk: true }); if (!p) return;
      await togglePause(p);
      return i.update(panelPayload(p));
    }
    case 'loop': {
      const p = await controlPlayer(i); if (!p) return;
      await cycleLoop(p);
      return i.update(panelPayload(p));
    }
    case 'shuffle': {
      const p = await controlPlayer(i); if (!p) return;
      await p.queue.shuffle();
      return i.update(panelPayload(p));
    }
    case 'skip': {
      const p = await controlPlayer(i, { dj: false }); if (!p) return;
      const member = i.member as GuildMember;
      if (isDJ(member) || requesterOf(p.queue.current)?.id === member.id) {
        await i.deferUpdate();
        await p.skip(0, false); // trackStart replaces this panel
        return;
      }
      return i.reply({ content: await skipOrVote(i, p), flags: MessageFlags.SuppressEmbeds });
    }
    case 'prev': {
      const p = await controlPlayer(i); if (!p) return;
      if (!p.queue.previous.length) return deny(i, '❌ There\'s no previous song.');
      await i.deferUpdate();
      await playPrevious(p);
      return;
    }
    case 'stop': {
      const p = await controlPlayer(i, { playing: false }); if (!p) return;
      await i.deferUpdate();
      await stopPlayback(p);
      return;
    }
  }
}
