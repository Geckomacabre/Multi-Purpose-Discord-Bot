// Failsafe for YouTube playback. Lavalink's YouTube plugin breaks whenever YouTube
// changes something, and it also depends on the YouTube sign-in and a remote cipher
// server. When a YouTube song fails to load, yt-dlp (kept up to date by start.ps1)
// finds its audio instead, and Lavalink plays that link through its plain HTTP source.
import { spawn } from 'node:child_process';
import type { Player, SearchResult, Track, UnresolvedTrack } from 'lavalink-client';
import logger from './logger';

const YTDLP_TIMEOUT_MS = 45_000;
// Plain HTTPS formats only: Lavalink's HTTP source can't play YouTube's HLS playlists.
const YTDLP_ARGS = ['-f', 'bestaudio[protocol^=http]/best[protocol^=http]', '--get-url', '--no-playlist', '--no-warnings', '--quiet'];

/** Tracks a fallback was already queued for, so a failing fallback can't loop. */
const tried = new WeakSet<object>();

/** The direct audio URL yt-dlp finds for a YouTube page. */
function audioUrl(pageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [...YTDLP_ARGS, pageUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timed out')); }, YTDLP_TIMEOUT_MS);
    proc.stdout.on('data', (c) => { out += c; });
    proc.stderr.on('data', (c) => { err += c; });
    proc.on('error', (e) => { clearTimeout(timer); reject(new Error(`yt-dlp could not start: ${e.message}`)); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const url = out.split('\n').map((l) => l.trim()).find((l) => /^https?:\/\//.test(l));
      if (code === 0 && url) resolve(url);
      else reject(new Error(`yt-dlp exited ${code}: ${err.trim().split('\n').filter((l) => !/deprecat/i.test(l)).join(' ').slice(0, 300)}`));
    });
  });
}

/** Whether a failed track can be retried through yt-dlp. */
export function canFallBack(track: Track | UnresolvedTrack | null | undefined): track is Track {
  return !!track && track.info.sourceName === 'youtube' && !!track.info.uri && !track.info.isStream
    && !tried.has(track) && !track.userData?.ytdlp;
}

/**
 * Put a stand-in for `failed` at the front of the queue. Call it from the trackError
 * listener: lavalink-client handles the error before the track-end event, so the
 * stand-in is what it moves to next, and resolving it runs yt-dlp.
 */
export function queueFallback(player: Player, failed: Track): UnresolvedTrack {
  tried.add(failed);
  // Resume where it broke if it failed partway through, not on the first seconds.
  const startAt = player.position > 10_000 ? player.position : 0;
  const standIn: any = {
    info: { ...failed.info },
    pluginInfo: failed.pluginInfo ?? {},
    requester: failed.requester,
    userData: { ...failed.userData, ytdlp: true, ...(startAt ? { startAt } : {}) },
    async resolve(p: Player) {
      const url = await audioUrl(failed.info.uri);
      const res = await p.search({ query: url }, failed.requester) as SearchResult;
      const track = res.tracks[0];
      if (!track?.encoded) throw new Error(`Lavalink couldn't load the yt-dlp link (${res.exception?.message ?? res.loadType})`);
      logger.info(`[music] playing "${failed.info.title}" through yt-dlp`);
      delete standIn.resolve;
      Object.assign(standIn, {
        encoded: track.encoded,
        pluginInfo: track.pluginInfo,
        // Keep the YouTube title, link and thumbnail for the panel and queue.
        info: {
          ...track.info,
          title: failed.info.title,
          author: failed.info.author,
          artworkUrl: failed.info.artworkUrl,
          uri: failed.info.uri,
          duration: track.info.duration || failed.info.duration,
        },
      });
    },
  };
  player.queue.tracks.unshift(standIn as UnresolvedTrack);
  return standIn;
}
