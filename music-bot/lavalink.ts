// Playback runs in Lavalink, a separate Java program (see lavalink/), so nothing
// this bot does (searches, autocomplete, playlist lookups) can delay the voice
// packets. This file owns the connection to it, the per-guild session state,
// the Now Playing panel and leaving when idle. The approach (Lavalink 4 with
// lavalink-client) follows BeatDock: https://github.com/albertgmz/BeatDock
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, escapeMarkdown,
  type Client, type Guild, type GuildMember, type Message, type VoiceBasedChannel,
} from 'discord.js';
import {
  LavalinkManager, type Player, type SearchResult, type SponsorBlockSegment, type Track, type UnresolvedTrack,
} from 'lavalink-client';
import type { LinkTrack } from './links';
import { getMusicConfig } from './store';
import logger from './logger';

export type AnyTrack = Track | UnresolvedTrack;
/** What a track's `requester` holds (see requesterTransformer below). */
export type Requester = { id: string; autoplay?: boolean };

const QUEUE_END_LEAVE_MS = 5 * 60_000;
const EMPTY_CHANNEL_LEAVE_MS = 30_000;
const LAVALINK_DOWN_EXIT_MS = 30_000;
// Sponsor reads, self-promotion, "like and subscribe" and non-music parts of music videos.
const SPONSORBLOCK_CATEGORIES: SponsorBlockSegment[] = ['sponsor', 'selfpromo', 'interaction', 'music_offtopic'];

export function describeError(err: any): string {
  if (!(err instanceof Error)) return typeof err === 'object' ? JSON.stringify(err) : String(err);
  return `${err.name}: ${err.message}\n${err.stack ?? ''}`;
}

// ── Per-guild session state (lives as long as the bot is in voice) ───────────

export type Session = {
  /** Who started this session. Gets DJ controls. */
  hostId: string | null;
  skipVotes: Set<string>;
  /** The live Now Playing message with the control buttons. */
  panel: Message | null;
  /** Keep playing related songs when the queue runs out. */
  autoplay: boolean;
  bassBoost: boolean;
  /** Whether SponsorBlock categories are currently set on the Lavalink player. */
  sponsorBlockSet: boolean;
  /** Set while the first track is being started, so two quick /play calls don't both start one. */
  starting: boolean;
  leaveTimer: ReturnType<typeof setTimeout> | null;
  leaveReason: 'idle' | 'empty' | null;
};

const sessions = new Map<string, Session>();

export function session(guildId: string): Session {
  let s = sessions.get(guildId);
  if (!s) {
    s = {
      hostId: null, skipVotes: new Set(), panel: null, autoplay: false, bassBoost: false,
      sponsorBlockSet: false, starting: false, leaveTimer: null, leaveReason: null,
    };
    sessions.set(guildId, s);
  }
  return s;
}

async function endSession(guildId: string) {
  const s = sessions.get(guildId);
  if (!s) return;
  if (s.leaveTimer) clearTimeout(s.leaveTimer);
  sessions.delete(guildId);
  await s.panel?.delete().catch(() => {});
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

export const requesterOf = (t: AnyTrack | null | undefined) => t?.requester as Requester | undefined;

// ── Display helpers ──────────────────────────────────────────────────────────

export const LOOP_LABEL = { off: 'Off', track: 'Track', queue: 'Queue', autoplay: 'Autoplay' } as const;
export type LoopMode = keyof typeof LOOP_LABEL;

export function loopMode(player: Player): LoopMode {
  return session(player.guildId).autoplay ? 'autoplay' : player.repeatMode;
}

export function link(t: AnyTrack): string {
  const title = escapeMarkdown(t.info.title.replace(/[[\]]/g, '').slice(0, 80));
  return t.info.uri ? `[${title}](${t.info.uri})` : `**${title}**`;
}

export function requester(t: AnyTrack): string {
  const r = requesterOf(t);
  return !r || r.autoplay ? 'Autoplay' : `<@${r.id}>`;
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function duration(t: AnyTrack): string {
  if (t.info.isStream) return '🔴 Live';
  return t.info.duration ? formatMs(t.info.duration) : '?';
}

function progressBar(player: Player): string {
  const t = player.queue.current!;
  if (t.info.isStream || !t.info.duration) return '🔴 Live';
  const pos = Math.min(player.position, t.info.duration);
  const at = Math.round((pos / t.info.duration) * 16);
  return `\`${formatMs(pos)}\` ${'▬'.repeat(at)}🔘${'▬'.repeat(16 - at)} \`${formatMs(t.info.duration)}\``;
}

export const FILTERS = {
  bassboost: 'Bass Boost', nightcore: 'Nightcore', vaporwave: 'Vaporwave', '8d': '8D', karaoke: 'Vocal Remover',
} as const;
export type FilterName = keyof typeof FILTERS;

/** The named effects currently on. */
export function activeFilters(player: Player): FilterName[] {
  const f = player.filterManager.filters;
  const on: FilterName[] = [];
  if (session(player.guildId).bassBoost) on.push('bassboost');
  if (f.nightcore) on.push('nightcore');
  if (f.vaporwave) on.push('vaporwave');
  if (f.rotation) on.push('8d');
  if (f.karaoke) on.push('karaoke');
  return on;
}

export function currentSpeed(player: Player): number {
  const fm = player.filterManager;
  return fm.filters.custom ? (fm.data.timescale?.speed ?? 1) : 1;
}

export function filterSummary(player: Player): string | null {
  const parts: string[] = activeFilters(player).map((f) => FILTERS[f]);
  const speed = currentSpeed(player);
  if (speed !== 1) parts.push(`${speed}x speed`);
  return parts.length ? parts.join(', ') : null;
}

export function nowPlayingEmbed(player: Player, withProgress = false) {
  const track = player.queue.current!;
  const next = player.queue.tracks[0];
  const filters = filterSummary(player);
  const e = new EmbedBuilder()
    .setColor(player.paused ? Colors.Grey : Colors.Blurple)
    .setAuthor({ name: player.paused ? '⏸️ Paused' : '🎶 Now Playing' })
    .setTitle(track.info.title.slice(0, 256))
    .setURL(track.info.uri || null)
    .setThumbnail(track.info.artworkUrl || null)
    .setDescription(`by **${escapeMarkdown(track.info.author || 'Unknown')}**${withProgress ? `\n\n${progressBar(player)}` : ''}`)
    .addFields(
      { name: 'Duration', value: duration(track), inline: true },
      { name: 'Requested by', value: requester(track), inline: true },
      { name: 'Up next', value: next ? link(next) : 'Nothing queued', inline: true },
    )
    .setFooter({
      text: [
        `🔊 ${player.volume}%`,
        `🔁 ${LOOP_LABEL[loopMode(player)]}`,
        `${player.queue.tracks.length} queued`,
        filters ? `🎛️ ${filters}` : null,
      ].filter(Boolean).join('  ·  '),
    });
  return e;
}

export function panelButtons(player: Player) {
  const btn = (id: string, emoji: string, style = ButtonStyle.Secondary, label?: string) => {
    const b = new ButtonBuilder().setCustomId(`music:${id}`).setEmoji(emoji).setStyle(style);
    return label ? b.setLabel(label) : b;
  };
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('prev', '⏮️').setDisabled(!player.queue.previous.length),
      btn('pause', player.paused ? '▶️' : '⏸️', ButtonStyle.Primary),
      btn('skip', '⏭️'),
      btn('stop', '⏹️', ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('loop', '🔁', ButtonStyle.Secondary, LOOP_LABEL[loopMode(player)]),
      btn('shuffle', '🔀').setDisabled(player.queue.tracks.length < 2),
      btn('queue', '📜', ButtonStyle.Secondary, 'Queue'),
      btn('lyrics', '🎤', ButtonStyle.Secondary, 'Lyrics'),
    ),
  ];
}

export function panelPayload(player: Player) {
  return { embeds: [nowPlayingEmbed(player)], components: panelButtons(player) };
}

let discord: Client;

async function sendToTextChannel(player: Player, payload: any): Promise<Message | null> {
  const ch = player.textChannelId ? discord.channels.cache.get(player.textChannelId) : null;
  if (!ch?.isSendable()) return null;
  return ch.send(payload).catch(() => null);
}

/** Post a fresh panel and delete the old one, so the channel doesn't fill up with them. */
async function postPanel(player: Player) {
  const s = session(player.guildId);
  const old = s.panel;
  s.panel = await sendToTextChannel(player, panelPayload(player));
  await old?.delete().catch(() => {});
}

/** Re-render the panel in place after a change (pause, volume, loop, queue edits...). */
export async function refreshPanel(player: Player | null | undefined) {
  const panel = player && sessions.get(player.guildId)?.panel;
  if (!panel || !player.queue.current) return;
  await panel.edit(panelPayload(player)).catch(() => {});
}

// ── Leaving when idle ────────────────────────────────────────────────────────

function cancelLeave(guildId: string, reason?: Session['leaveReason']) {
  const s = sessions.get(guildId);
  if (!s?.leaveTimer || (reason && s.leaveReason !== reason)) return;
  clearTimeout(s.leaveTimer);
  s.leaveTimer = null;
  s.leaveReason = null;
}

function scheduleLeave(player: Player, reason: 'idle' | 'empty', ms: number) {
  const s = session(player.guildId);
  if (s.leaveTimer && s.leaveReason === reason) return;
  if (s.leaveTimer) clearTimeout(s.leaveTimer);
  s.leaveReason = reason;
  s.leaveTimer = setTimeout(() => {
    s.leaveTimer = null;
    logger.info(`[music] leaving voice in ${player.guildId}: ${reason === 'idle' ? 'queue ended' : 'channel empty'}`);
    player.destroy(reason === 'idle' ? 'QueueEndedIdle' : 'ChannelEmpty').catch(() => {});
  }, ms);
}

/** Start or cancel the leave timers to match the current state. Call after anything changes. */
export function checkIdle(player: Player) {
  const guild = discord.guilds.cache.get(player.guildId);
  const ch = guild && botChannel(guild);
  if (getMusicConfig(player.guildId).alwaysOn) {
    cancelLeave(player.guildId);
    return;
  }
  if (ch && listenerCount(ch) === 0) scheduleLeave(player, 'empty', EMPTY_CHANNEL_LEAVE_MS);
  else cancelLeave(player.guildId, 'empty');
  if (!player.queue.current && !session(player.guildId).leaveTimer) scheduleLeave(player, 'idle', QUEUE_END_LEAVE_MS);
}

// ── SponsorBlock ─────────────────────────────────────────────────────────────

/** Make the Lavalink player's SponsorBlock categories match this server's setting. */
export async function syncSponsorBlock(player: Player) {
  const s = session(player.guildId);
  const want = getMusicConfig(player.guildId).sponsorBlock;
  if (want === s.sponsorBlockSet) return;
  try {
    if (want) await player.setSponsorBlock(SPONSORBLOCK_CATEGORIES);
    else await player.deleteSponsorBlock();
    s.sponsorBlockSet = want;
  } catch (e) {
    logger.warn(`[music] couldn't ${want ? 'enable' : 'disable'} SponsorBlock: ${describeError(e)}`);
  }
}

// ── Autoplay ─────────────────────────────────────────────────────────────────

/**
 * Called by lavalink-client when the queue runs out. With autoplay on, queue a song
 * from YouTube's "Mix" for the last track (the same source as YouTube's own autoplay).
 */
async function autoplay(player: Player, last: Track) {
  if (!sessions.get(player.guildId)?.autoplay || !last) return;
  const me: Requester = { id: discord.user!.id, autoplay: true };
  try {
    let id = last.info.sourceName === 'youtube' ? last.info.identifier : null;
    if (!id) {
      const found = await player.search({ query: `${last.info.author} ${last.info.title}`, source: 'ytmsearch' }, me) as SearchResult;
      id = found.tracks[0]?.info.identifier ?? null;
    }
    if (!id) return;
    const mix = await player.search({ query: `https://www.youtube.com/watch?v=${id}&list=RD${id}` }, me) as SearchResult;
    const recent = new Set([last.info.identifier, ...player.queue.previous.slice(0, 25).map((t) => t.info.identifier)]);
    const next = mix.tracks.find((t) => !recent.has(t.info.identifier) && !t.info.isStream && t.info.duration < 15 * 60_000);
    if (next) await player.queue.add(next);
  } catch (e) {
    logger.warn(`[music] autoplay failed: ${describeError(e)}`);
  }
}

// ── Manager ──────────────────────────────────────────────────────────────────

export let manager: LavalinkManager;

/** Track metadata from a Spotify/Apple Music page, matched on YouTube Music when it's about to play. */
export function toUnresolved(t: LinkTrack, req: Requester): UnresolvedTrack {
  return manager.utils.buildUnresolvedTrack(
    { title: t.title, author: t.author, duration: t.duration, artworkUrl: t.artworkUrl ?? null },
    req,
  );
}

export function createManager(client: Client, password: string) {
  discord = client;
  manager = new LavalinkManager({
    nodes: [{
      id: 'local',
      host: '127.0.0.1',
      port: Number(Bun.env.LAVALINK_PORT || 2333),
      authorization: password,
      // start.ps1 restarts Lavalink if it dies, so keep trying to reconnect.
      retryAmount: 10_000,
      retryDelay: 3_000,
    }],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    autoSkipOnResolveError: true,
    playerOptions: {
      // Plain searches and Spotify/Apple Music songs are looked up on YouTube Music,
      // which returns the official audio rather than music videos with intros.
      defaultSearchPlatform: 'ytmsearch',
      // Keep the Spotify/Apple Music title, artist and cover when a song is matched on YouTube.
      useUnresolvedData: true,
      requesterTransformer: (r: any): Requester => ({ id: String(r?.id ?? ''), ...(r?.autoplay ? { autoplay: true } : {}) }),
      onDisconnect: { autoReconnect: false, destroyPlayer: true },
      onEmptyQueue: { autoPlayFunction: autoplay },
      maxErrorsPerTime: { threshold: 10_000, maxAmount: 3 },
      enforceSponsorBlockRequestForEventEnablement: false,
    },
    queueOptions: { maxPreviousTracks: 25 },
  });

  client.on('raw', (d) => { manager.sendRawData(d).catch(() => {}); });

  manager.nodeManager.on('connect', (node) =>
    logger.info(`Connected to Lavalink ${node.info?.version?.semver ?? ''} at ${node.options.host}:${node.options.port}`));
  manager.nodeManager.on('disconnect', (_node, reason) =>
    logger.warn(`Lost the Lavalink connection (${reason?.code ?? '?'} ${reason?.reason ?? ''}). Retrying...`));
  manager.nodeManager.on('error', (_node, err) => logger.warn(`Lavalink connection error: ${err?.message ?? err}`));

  // If Lavalink stays unreachable, exit: start.ps1 then restarts Lavalink and the bot together.
  let downSince: number | null = null;
  setInterval(() => {
    if (!manager.initiated || manager.useable) { downSince = null; return; }
    downSince ??= Date.now();
    if (Date.now() - downSince > LAVALINK_DOWN_EXIT_MS) {
      logger.error(`Lavalink has been unreachable for ${LAVALINK_DOWN_EXIT_MS / 1000} seconds. Exiting so the launcher restarts it.`);
      process.exit(3);
    }
  }, 5_000);

  manager.on('trackStart', async (player) => {
    const s = session(player.guildId);
    s.skipVotes.clear();
    cancelLeave(player.guildId, 'idle');
    await syncSponsorBlock(player);
    await postPanel(player);
  });

  manager.on('trackError', (player, track, payload: any) => {
    const why = payload?.exception?.message ?? payload?.message ?? payload?.error ?? 'unknown error';
    logger.warn(`[music] couldn't play "${track?.info?.title}": ${why}`);
    if (track) sendToTextChannel(player, { content: `⚠️ Couldn't play ${link(track)} (${why}), so I skipped it.`, flags: MessageFlags.SuppressEmbeds });
  });

  manager.on('trackStuck', (player, track) => {
    logger.warn(`[music] "${track?.info?.title}" got stuck`);
    if (track) sendToTextChannel(player, { content: `⚠️ ${link(track)} stopped loading, so I skipped it.`, flags: MessageFlags.SuppressEmbeds });
  });

  manager.on('queueEnd', async (player) => {
    const s = sessions.get(player.guildId);
    const panel = s?.panel;
    if (s && panel) {
      s.panel = null;
      const { alwaysOn } = getMusicConfig(player.guildId);
      await panel.edit({
        embeds: [new EmbedBuilder().setColor(Colors.Grey).setDescription(
          `✅ **Queue finished.** Add more with \`/play\`.${alwaysOn ? '' : '\nI\'ll leave in 5 minutes if nothing else is queued.'}`,
        )],
        components: [],
      }).catch(() => {});
    }
    checkIdle(player);
  });

  manager.on('playerDestroy', (player) => { endSession(player.guildId); });
  manager.on('playerSocketClosed', (player, payload) => {
    if (payload.code !== 1000) logger.warn(`[music] voice connection closed in ${player.guildId}: ${payload.code} ${payload.reason}`);
  });

  // Leave (after a short delay) when everyone else leaves the channel.
  client.on('voiceStateUpdate', (oldState, newState) => {
    const player = manager.getPlayer(newState.guild.id);
    if (!player || (newState.member?.user.bot && newState.id !== client.user?.id)) return;
    if (oldState.channelId === newState.channelId) return;
    checkIdle(player);
  });

  return manager;
}
