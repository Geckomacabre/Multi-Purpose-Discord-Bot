// All audio is fetched with yt-dlp rather than discord-player's own extraction,
// which breaks constantly as YouTube changes. Normal-length tracks are downloaded
// whole into memory and played from that complete copy (no source-side gaps, and
// the next track is prefetched while the current one plays, so transitions are
// seamless). Long mixes and live streams are piped straight through instead.
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import type { Track } from 'discord-player';
import logger from './logger';

// Don't hold tracks longer than this in memory: a normal song is ~3-4 MB, but a
// multi-hour mix would be unbounded. Longer tracks (and live, durationMS 0) stream.
const MAX_BUFFER_MS = 30 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;
// Recently used tracks stay cached, so loop-track, /music previous, seeking and
// filter changes replay from memory instead of downloading again.
const CACHE_SIZE = 8;

const YTDLP_ARGS = ['-f', 'bestaudio/best', '--no-playlist', '--quiet', '--no-warnings', '-o', '-'];

/** What yt-dlp should fetch for a track, or null to let discord-player play it itself. */
export function ytdlpTarget(track: Track): string | null {
  switch (track.source) {
    case 'youtube':
    case 'soundcloud':
      return track.url;
    // Spotify and Apple Music only provide metadata (their audio is DRM-protected),
    // so play the same song from YouTube.
    case 'spotify':
    case 'apple_music':
      return `ytsearch1:${track.author} - ${track.cleanTitle || track.title}`;
    default:
      return null; // direct stream URLs and attachments
  }
}

function download(target: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const dl = spawn('yt-dlp', [...YTDLP_ARGS, target], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => { dl.kill(); reject(new Error('yt-dlp timed out')); }, DOWNLOAD_TIMEOUT_MS);
    dl.stdout.on('data', (c) => chunks.push(c));
    dl.stderr.on('data', (c) => { err += c.toString(); });
    dl.on('error', (e) => { clearTimeout(timer); reject(e); }); // e.g. yt-dlp not installed
    dl.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`yt-dlp exited ${code}: ${err.trim().slice(0, 300)}`));
    });
  });
}

function streamFrom(target: string): Readable {
  const proc = spawn('yt-dlp', [...YTDLP_ARGS, target], { stdio: ['ignore', 'pipe', 'ignore'] });
  proc.on('error', (e) => logger.warn(`[music] yt-dlp stream failed: ${e.message}`));
  // Stop downloading as soon as playback stops reading (skip, stop, seek).
  proc.stdout.once('close', () => proc.kill());
  return proc.stdout;
}

const cache = new Map<string, Promise<Buffer | null>>();

function remember(key: string, p: Promise<Buffer | null>) {
  cache.delete(key);
  cache.set(key, p);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

/** Start (or reuse) a background download of a track. Resolves null if it can't be buffered. */
export function prefetch(track: Track | undefined | null): Promise<Buffer | null> {
  if (!track?.id) return Promise.resolve(null);
  const target = ytdlpTarget(track);
  const dur = track.durationMS ?? 0;
  if (!target || !dur || dur > MAX_BUFFER_MS) return Promise.resolve(null);

  const hit = cache.get(track.id);
  if (hit) { remember(track.id, hit); return hit; }

  const p = download(target).catch((e) => {
    logger.warn(`[music] download failed for "${track.title}": ${e?.message ?? e}`);
    cache.delete(track.id); // allow a retry next time
    return null;
  });
  remember(track.id, p);
  return p;
}

/**
 * discord-player's onBeforeCreateStream hook: runs whenever a track starts, and
 * again on seek or filter changes. Returning null falls back to discord-player's
 * own extraction.
 */
export async function openStream(track: Track): Promise<Readable | null> {
  const buf = await prefetch(track);
  if (buf) return Readable.from(buf);
  const target = ytdlpTarget(track);
  if (target && (!track.durationMS || track.durationMS > MAX_BUFFER_MS)) return streamFrom(target);
  return null;
}

/** Installed tool versions, for the startup log. */
export function toolVersions(): string {
  const v = (cmd: string, args: string[]) => {
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000 });
      return r.status === 0 ? r.stdout.split('\n')[0]!.trim() : 'MISSING';
    } catch { return 'MISSING'; }
  };
  const ffmpeg = v('ffmpeg', ['-version']).replace(/^ffmpeg version (\S+).*$/, '$1');
  return `yt-dlp ${v('yt-dlp', ['--version'])}, ffmpeg ${ffmpeg}`;
}
