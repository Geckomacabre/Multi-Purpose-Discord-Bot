import type { Message } from 'discord.js';
import * as db from '../../utils/db';
import type { IScamImageHash } from '../../utils/db';
import { hammingDistance, pHash } from '../../utils/phash';
import logger from '../../utils/logger';

// Known scam images, matched by perceptual hash (see utils/phash). Scam accounts
// reuse the same few screenshots, so a post of a known one is caught on sight:
// resized, re-compressed, any account, even in a single channel. Two lists:
//  • the shared list at github.com/SomewhatDamaged/Scam-Images, synced every
//    hour (same hash recipe as ours, updated every few days with new scams)
//  • our own, learned when spam detection catches someone posting the same
//    image across channels, or added by mods with /config scamimages add

const MATCH_DISTANCE = 6;      // of 256 bits; their API counts <= 4 as a match, a re-compressed copy measured 2, unrelated ~118
const MAX_IMAGES = 4;          // per message
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

const UPSTREAM_URL = 'https://raw.githubusercontent.com/SomewhatDamaged/Scam-Images/main/hashes.json';
const UPSTREAM_CACHE_KEY = 'scam_images_upstream'; // last good copy, in case GitHub is down at startup
const SYNC_EVERY_MS = 60 * 60_000;

// Someone posting the scam to warn people about it
export const WARNING_RE = /\b(scam\w*|hack(ed|er|s)?|fake|phish\w*|warning|beware|careful)\b|don'?t\s+(click|fall|trust|use)/i;

const isHash = (h: unknown): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);

let known: IScamImageHash[] | null = null;
async function knownHashes() {
  known ??= await db.getScamImageHashes();
  return known;
}

let upstream: string[] = [];
let upstreamSyncedAt: number | null = null;

async function syncUpstream() {
  try {
    const res = await fetch(UPSTREAM_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const hashes = Array.isArray(list) ? list.filter(isHash) : [];
    if (!hashes.length) throw new Error('no hashes in the response');
    upstream = hashes;
    upstreamSyncedAt = Date.now();
    await db.setBotConfig(UPSTREAM_CACHE_KEY, JSON.stringify({ synced_at: upstreamSyncedAt, hashes }));
  } catch (err) {
    logger.warn(`[scamimages] couldn't sync the shared scam image list, keeping the last copy (${upstream.length}): ${err}`);
  }
}

/** Loads the cached shared list, then syncs it now and every hour. */
export async function startScamImageSync() {
  try {
    const cached = JSON.parse((await db.getBotConfig(UPSTREAM_CACHE_KEY)) ?? 'null');
    if (cached?.hashes) {
      upstream = cached.hashes.filter(isHash);
      upstreamSyncedAt = cached.synced_at ?? null;
    }
  } catch {}
  await syncUpstream();
  setInterval(syncUpstream, SYNC_EVERY_MS);
}

export const upstreamStatus = () => ({ count: upstream.length, syncedAt: upstreamSyncedAt });

/** Perceptual hashes of a message's image attachments. Images that fail to download or decode are skipped. */
export async function hashMessageImages(message: Message): Promise<string[]> {
  const images = [...message.attachments.values()]
    .filter(a => a.contentType?.startsWith('image/') && a.size <= MAX_BYTES)
    .slice(0, MAX_IMAGES);
  const hashes: string[] = [];
  for (const image of images) {
    try {
      // The original file, not a resized preview, so hashes line up with the shared list's
      const res = await fetch(image.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;
      const hash = await pHash(Buffer.from(await res.arrayBuffer()));
      if (hash) hashes.push(hash);
    } catch (err) {
      logger.debug(`[scamimages] couldn't hash ${image.name}: ${err}`);
    }
  }
  return hashes;
}

export type ScamImageMatch =
  | { list: 'ours'; entry: IScamImageHash; distance: number }
  | { list: 'shared'; distance: number };

/** The closest known scam image to any of these hashes, if one is close enough. */
export async function findScamImage(hashes: string[]): Promise<ScamImageMatch | null> {
  let best: ScamImageMatch | null = null;
  for (const hash of hashes) {
    for (const entry of await knownHashes()) {
      const distance = hammingDistance(hash, entry.hash);
      if (distance <= MATCH_DISTANCE && (!best || distance < best.distance)) best = { list: 'ours', entry, distance };
    }
    for (const listed of upstream) {
      const distance = hammingDistance(hash, listed);
      if (distance <= MATCH_DISTANCE && (!best || distance < best.distance)) best = { list: 'shared', distance };
    }
  }
  return best;
}

/** Adds hashes to our list, skipping ones that already match a known scam image. Returns the new entries. */
export async function addScamImages(
  hashes: string[], source: 'auto' | 'manual', guildId: string | null, addedBy: string | null = null,
): Promise<{ added: IScamImageHash[]; alreadyKnown: number }> {
  const added: IScamImageHash[] = [];
  let alreadyKnown = 0;
  for (const hash of new Set(hashes)) {
    if (await findScamImage([hash])) {
      alreadyKnown++;
      continue;
    }
    const row = await db.addScamImageHash(hash, source, guildId, addedBy);
    if (row) {
      added.push(row);
      known?.unshift(row);
    } else {
      alreadyKnown++;
    }
  }
  if (added.length) logger.info(`[scamimages] added ${added.length} ${source} scam image(s): ${added.map(a => `#${a.id}`).join(', ')}`);
  return { added, alreadyKnown };
}

export async function removeScamImage(id: number): Promise<boolean> {
  const removed = await db.removeScamImageHash(id);
  if (removed && known) known = known.filter(k => k.id !== id);
  return removed;
}

export async function listScamImages() {
  return knownHashes();
}

/**
 * Hashes seen in at least two different channels. When the cross-channel image
 * rule fires, only these get learned: a scam bot posts the same screenshots
 * everywhere, while someone who posted three different photos shouldn't have
 * those photos blacklisted.
 */
export function repeatedAcrossChannels(posts: { channelId: string; hashes: string[] }[]): string[] {
  const repeated: string[] = [];
  for (const [i, post] of posts.entries()) {
    for (const hash of post.hashes) {
      const elsewhere = posts.some((other, j) => j !== i && other.channelId !== post.channelId
        && other.hashes.some(h => hammingDistance(h, hash) <= MATCH_DISTANCE));
      if (elsewhere && !repeated.some(h => hammingDistance(h, hash) <= MATCH_DISTANCE)) repeated.push(hash);
    }
  }
  return repeated;
}
