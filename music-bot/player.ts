import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, PermissionFlagsBits, escapeMarkdown,
  type Client, type Guild, type GuildMember, type Message, type VoiceBasedChannel,
} from 'discord.js';
import { Player, QueueRepeatMode, TrackSkipReason, onBeforeCreateStream, type GuildQueue, type Track } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { openStream, prefetch } from './audio';
import { getMusicConfig } from './store';
import logger from './logger';

// Discord ENFORCES the DAVE (E2EE) voice protocol for all non-stage voice calls
// as of 2026-03-01: connecting with DAVE disabled is rejected with close code 4017,
// so the bot joins but no audio flows. DAVE support comes from the @snazzah/davey
// native package; with it installed the defaults negotiate DAVE correctly, so no
// special connection options are passed. The package must stay installed.
export const VOICE_CONNECT_OPTIONS = {} as const;

// Native Error objects serialize to "{}", which silently swallows the real error.
export function describeError(err: any): string {
  if (!(err instanceof Error)) return typeof err === 'object' ? JSON.stringify(err) : String(err);
  return `${err.name}: ${err.message}\n${err.stack ?? ''}`;
}

// ── Per-guild session state (lives as long as the bot is in voice) ───────────

export type Session = {
  /** Who started this session. Gets DJ controls; can be handed over with /music dj host. */
  hostId: string | null;
  /** User the bot follows between voice channels. */
  followId: string | null;
  speed: number;
  skipVotes: Set<string>;
  /** The live Now Playing message with the control buttons. */
  panel: Message | null;
};

const sessions = new Map<string, Session>();

export function session(guildId: string): Session {
  let s = sessions.get(guildId);
  if (!s) {
    s = { hostId: null, followId: null, speed: 1, skipVotes: new Set(), panel: null };
    sessions.set(guildId, s);
  }
  return s;
}

// IDs of messages this bot posted outside of command replies, so /music clean can
// tell music messages apart from the main bot's (both post as the same user).
export const musicMessageIds = new Set<string>();
function trackMessage(m: Message | null) {
  if (!m) return;
  musicMessageIds.add(m.id);
  if (musicMessageIds.size > 300) musicMessageIds.delete(musicMessageIds.values().next().value!);
}

// ── Permissions ──────────────────────────────────────────────────────────────

export const isAdmin = (m: GuildMember) => m.permissions.has(PermissionFlagsBits.ManageGuild);

export function botChannel(guild: Guild): VoiceBasedChannel | null {
  return guild.members.me?.voice.channel ?? null;
}

/** Humans in a voice channel (members missing from cache count as humans). */
export function listenerCount(channel: VoiceBasedChannel): number {
  return channel.guild.voiceStates.cache.filter((vs) => vs.channelId === channel.id && !vs.member?.user.bot).size;
}

/**
 * Full playback control. With no DJ role configured, everyone listening is a DJ.
 * Otherwise: Manage Server, the DJ role, the session host, or anyone alone with the bot.
 */
export function isDJ(member: GuildMember): boolean {
  if (isAdmin(member)) return true;
  if (sessions.get(member.guild.id)?.hostId === member.id) return true;
  const { djRoleId } = getMusicConfig(member.guild.id);
  if (!djRoleId || member.roles.cache.has(djRoleId)) return true;
  const ch = botChannel(member.guild);
  return !!ch && member.voice.channelId === ch.id && listenerCount(ch) <= 1;
}

/** Why this member can't control playback from where they are, or null if they can. */
export function sameChannelError(member: GuildMember): string | null {
  const ch = botChannel(member.guild);
  if (!ch || isAdmin(member) || member.voice.channelId === ch.id) return null;
  return `❌ Join <#${ch.id}> to control the music.`;
}

// ── Queue options ────────────────────────────────────────────────────────────

export function nodeOptions(guildId: string, channel: unknown) {
  const { volume, alwaysOn } = getMusicConfig(guildId);
  return {
    metadata: channel,
    volume,
    selfDeaf: true,
    leaveOnEmpty: !alwaysOn,       // leave when no humans remain in the channel...
    leaveOnEmptyCooldown: 30_000,
    leaveOnEnd: !alwaysOn,         // ...or 5 minutes after the queue runs out
    leaveOnEndCooldown: 5 * 60_000,
    leaveOnStop: false,
  };
}

/** Apply 24/7 mode to a queue that's already running. */
export function applyAlwaysOn(queue: GuildQueue, on: boolean) {
  queue.options.leaveOnEmpty = !on;
  queue.options.leaveOnEnd = !on;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export const FILTERS: Record<string, string> = {
  bassboost: 'Bass Boost', nightcore: 'Nightcore', vaporwave: 'Vaporwave', '8D': '8D', lofi: 'Lo-fi',
  karaoke: 'Vocal Remover', treble: 'Treble', normalizer: 'Normalizer', surrounding: 'Surround',
  pulsator: 'Pulsator', chorus: 'Chorus',
};

/** Named effects currently on (speed is tracked separately as an atempo filter). */
export function namedFilters(queue: GuildQueue): string[] {
  return (queue.filters.ffmpeg.filters as string[]).filter((f) => !f.startsWith('atempo='));
}

/** Set the named effects plus the session's speed in one go (each change restarts the stream). */
export async function applyFilters(queue: GuildQueue, named: string[]) {
  const { speed } = session(queue.guild.id);
  const all = speed !== 1 ? [...named, `atempo=${speed}`] : named;
  await queue.filters.ffmpeg.setFilters(all as any);
}

function filterSummary(queue: GuildQueue): string | null {
  const parts = namedFilters(queue).map((f) => FILTERS[f] ?? f);
  const { speed } = session(queue.guild.id);
  if (speed !== 1) parts.push(`${speed}x speed`);
  return parts.length ? parts.join(', ') : null;
}

// ── Embeds & the Now Playing panel ───────────────────────────────────────────

export const LOOP_LABEL: Record<number, string> = {
  [QueueRepeatMode.OFF]: 'Off', [QueueRepeatMode.TRACK]: 'Track',
  [QueueRepeatMode.QUEUE]: 'Queue', [QueueRepeatMode.AUTOPLAY]: 'Autoplay',
};

export function link(t: Track): string {
  const title = t.title.replace(/[[\]]/g, '').slice(0, 80);
  return `[${escapeMarkdown(title)}](${t.url})`;
}

export function requester(t: Track): string {
  return t.requestedBy ? `<@${t.requestedBy.id}>` : 'Autoplay';
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function nowPlayingEmbed(queue: GuildQueue, withProgress = false) {
  const track = queue.currentTrack!;
  const paused = queue.node.isPaused();
  const next = queue.tracks.at(0);
  const filters = filterSummary(queue);
  const progress = withProgress ? queue.node.createProgressBar({ length: 16 }) : null;
  return new EmbedBuilder()
    .setColor(paused ? Colors.Grey : Colors.Blurple)
    .setAuthor({ name: paused ? '⏸️ Paused' : '🎶 Now Playing' })
    .setTitle(track.title.slice(0, 256))
    .setURL(track.url)
    .setThumbnail(track.thumbnail || null)
    .setDescription(`by **${escapeMarkdown(track.author)}**${progress ? `\n\n${progress}` : ''}`)
    .addFields(
      { name: 'Duration', value: track.durationMS ? track.duration : '🔴 Live', inline: true },
      { name: 'Requested by', value: requester(track), inline: true },
      { name: 'Up next', value: next ? link(next) : 'Nothing queued', inline: true },
    )
    .setFooter({
      text: [
        `🔊 ${queue.node.volume}%`,
        `🔁 ${LOOP_LABEL[queue.repeatMode]}`,
        `${queue.tracks.size} queued`,
        filters ? `🎛️ ${filters}` : null,
      ].filter(Boolean).join('  ·  '),
    });
}

export function panelButtons(queue: GuildQueue) {
  const btn = (id: string, emoji: string, style = ButtonStyle.Secondary, label?: string) => {
    const b = new ButtonBuilder().setCustomId(`music:${id}`).setEmoji(emoji).setStyle(style);
    return label ? b.setLabel(label) : b;
  };
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('prev', '⏮️').setDisabled(!queue.history.previousTrack),
      btn('pause', queue.node.isPaused() ? '▶️' : '⏸️', ButtonStyle.Primary),
      btn('skip', '⏭️'),
      btn('stop', '⏹️', ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('loop', '🔁', ButtonStyle.Secondary, LOOP_LABEL[queue.repeatMode]),
      btn('shuffle', '🔀').setDisabled(queue.tracks.size < 2),
      btn('queue', '📜', ButtonStyle.Secondary, 'Queue'),
      btn('lyrics', '🎤', ButtonStyle.Secondary, 'Lyrics'),
    ),
  ];
}

export function panelPayload(queue: GuildQueue) {
  return { embeds: [nowPlayingEmbed(queue)], components: panelButtons(queue) };
}

async function sendToQueueChannel(queue: GuildQueue, payload: any): Promise<Message | null> {
  const ch = queue.metadata as { send?: (p: any) => Promise<Message> } | null;
  if (!ch?.send) return null;
  const m = await ch.send(payload).catch(() => null);
  trackMessage(m);
  return m;
}

/** Delete the old panel so the channel doesn't fill up with Now Playing messages. */
async function retirePanel(guildId: string) {
  const s = sessions.get(guildId);
  const old = s?.panel;
  if (!s || !old) return;
  s.panel = null;
  await old.delete().catch(() => {});
}

async function postPanel(queue: GuildQueue) {
  await retirePanel(queue.guild.id);
  session(queue.guild.id).panel = await sendToQueueChannel(queue, panelPayload(queue));
}

/** Re-render the panel in place after a change (pause, volume, loop, queue edits...). */
export async function refreshPanel(queue: GuildQueue | null | undefined) {
  const panel = queue && sessions.get(queue.guild.id)?.panel;
  if (!panel || !queue.currentTrack) return;
  await panel.edit(panelPayload(queue)).catch(() => {});
}

// ── Player ───────────────────────────────────────────────────────────────────

let player: Player | null = null;
let extractorsReady: Promise<unknown> = Promise.resolve();

export const waitForExtractors = () => extractorsReady;
export const activePlayer = () => player;

export function getPlayer(client: Client): Player {
  if (player) return player;
  const p = new Player(client as any, { skipFFmpeg: false });
  player = p;

  // Every track is played through yt-dlp (see audio.ts); null falls back to
  // discord-player's own extraction.
  onBeforeCreateStream(async (track: Track) => openStream(track));

  // discord-player swallows extractor activation errors (register() resolves null),
  // so without this a broken YouTube extractor only shows up as "no results found".
  p.extractors.on('error', (_ctx: any, extractor: any, err: any) =>
    logger.error(`[music] extractor "${extractor?.identifier}" failed to activate: ${err?.message ?? err}`),
  );
  const loadDefaults = p.extractors.loadMulti(DefaultExtractors)
    .catch((e) => logger.error(`Failed to load extractors: ${describeError(e)}`));
  // discord-player v7 dropped YouTube from @discord-player/extractor, so this one
  // provides YouTube search/metadata. YOUTUBE_COOKIE is optional and helps with
  // rate limiting on busy bots.
  const cookie = Bun.env.YOUTUBE_COOKIE ? { cookie: Bun.env.YOUTUBE_COOKIE } : {};
  const loadYoutube = p.extractors.register(YoutubeExtractor, cookie as any)
    .catch((e) => logger.error(`Failed to load YouTube extractor: ${describeError(e)}`));
  // Registration does real network round-trips; searches must wait for it, or the
  // first command after a restart finds no extractors ready.
  extractorsReady = Promise.allSettled([loadDefaults, loadYoutube]);

  const ev = p.events as any;
  ev.on('playerError', (_q: GuildQueue, err: any) => logger.error(`Player error: ${describeError(err)}`));
  ev.on('error', (_q: GuildQueue, err: any) => logger.error(`Queue error: ${describeError(err)}`));

  ev.on('playerStart', (queue: GuildQueue) => {
    session(queue.guild.id).skipVotes.clear();
    postPanel(queue);
    prefetch(queue.tracks.at(0)); // download the next track while this one plays
  });

  const onAdd = (queue: GuildQueue) => {
    if (!queue.currentTrack) return;
    prefetch(queue.tracks.at(0));
    refreshPanel(queue);
  };
  ev.on('audioTrackAdd', onAdd);
  ev.on('audioTracksAdd', onAdd);
  ev.on('playerPause', refreshPanel);
  ev.on('playerResume', refreshPanel);

  ev.on('playerSkip', (queue: GuildQueue, track: Track, reason: string) => {
    if (reason !== TrackSkipReason.NoStream) return;
    sendToQueueChannel(queue, { content: `⚠️ Couldn't play ${link(track)}, so I skipped it.`, flags: 4 /* suppress embeds */ });
  });

  ev.on('emptyQueue', async (queue: GuildQueue) => {
    const s = sessions.get(queue.guild.id);
    const panel = s?.panel;
    if (!s || !panel) return;
    s.panel = null;
    const { alwaysOn } = getMusicConfig(queue.guild.id);
    await panel.edit({
      embeds: [new EmbedBuilder().setColor(Colors.Grey).setDescription(
        `✅ **Queue finished.** Add more with \`/music play\`.${alwaysOn ? '' : '\nI\'ll leave in 5 minutes if nothing else is queued.'}`,
      )],
      components: [],
    }).catch(() => {});
  });

  const endSession = async (queue: GuildQueue) => {
    await retirePanel(queue.guild.id);
    sessions.delete(queue.guild.id);
  };
  ev.on('disconnect', endSession);
  ev.on('queueDelete', endSession);

  client.on('voiceStateUpdate', (oldState, newState) => {
    const followId = sessions.get(newState.guild.id)?.followId;
    if (!followId || newState.member?.id !== followId) return;
    if (oldState.channelId === newState.channelId || !newState.channel) return;
    const q = p.queues.get(newState.guild.id);
    q?.connect(newState.channel, VOICE_CONNECT_OPTIONS).catch((e: any) =>
      logger.warn(`[music] failed to follow user between channels: ${e.message}`),
    );
  });

  return p;
}
