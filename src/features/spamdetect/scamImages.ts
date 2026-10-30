import type { Message } from 'discord.js';
import * as db from '../../utils/db';
import type { IScamImageHash } from '../../utils/db';
import { hammingDistance, pHash } from '../../utils/phash';
import logger from '../../utils/logger';

// Known scam images, matched by perceptual hash (pHash, see utils/phash). Scam accounts reuse the same few
// screenshots, so once one is on the list, any later post of it (resized,
// re-compressed, any account, even a single channel) is caught on sight. Images
// get on the list when spam detection catches someone posting them across
// channels, or when a mod adds them with /config scamimages add.

const MATCH_DISTANCE = 6;      // of 64 bits; a resized, re-compressed copy measured 4, unrelated images ~28-32
const MAX_IMAGES = 4;          // per message
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

// Someone posting the scam to warn people about it
export const WARNING_RE = /\b(scam\w*|hack(ed|er|s)?|fake|phish\w*|warning|beware|careful)\b|don'?t\s+(click|fall|trust|use)/i;

let known: IScamImageHash[] | null = null;
async function knownHashes() {
  known ??= await db.getScamImageHashes();
  return known;
}

/** Perceptual hashes of a message's image attachments. Images that fail to download or decode are skipped. */
export async function hashMessageImages(message: Message): Promise<string[]> {
  const images = [...message.attachments.values()]
    .filter(a => a.contentType?.startsWith('image/') && a.size <= MAX_BYTES)
    .slice(0, MAX_IMAGES);
  const hashes: string[] = [];
  for (const image of images) {
    try {
      // Discord's media proxy shrinks it first (the hash only needs 32x32), and turns GIFs into a still
      const url = `${image.proxyURL}${image.proxyURL.includes('?') ? '&' : '?'}width=256&height=256&format=png`;
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;
      const hash = await pHash(Buffer.from(await res.arrayBuffer()));
      if (hash) hashes.push(hash);
    } catch (err) {
      logger.debug(`[scamimages] couldn't hash ${image.name}: ${err}`);
    }
  }
  return hashes;
}

/** The listed scam image closest to any of these hashes, if one is close enough. */
export async function findScamImage(hashes: string[]): Promise<{ entry: IScamImageHash; distance: number } | null> {
  let best: { entry: IScamImageHash; distance: number } | null = null;
  for (const entry of await knownHashes()) {
    for (const hash of hashes) {
      const distance = hammingDistance(hash, entry.hash);
      if (distance <= MATCH_DISTANCE && (!best || distance < best.distance)) best = { entry, distance };
    }
  }
  return best;
}

/** Adds hashes to the list, skipping ones that already match a listed image. Returns the new entries. */
export async function addScamImages(
  hashes: string[], source: 'auto' | 'manual', guildId: string | null, addedBy: string | null = null,
): Promise<IScamImageHash[]> {
  const added: IScamImageHash[] = [];
  for (const hash of new Set(hashes)) {
    if (await findScamImage([hash])) continue;
    const row = await db.addScamImageHash(hash, source, guildId, addedBy);
    if (row) {
      added.push(row);
      known?.unshift(row);
    }
  }
  if (added.length) logger.info(`[scamimages] added ${added.length} ${source} scam image(s): ${added.map(a => `#${a.id}`).join(', ')}`);
  return added;
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
