import type { Message } from 'discord.js';
import * as db from '../../utils/db';
import type { IScamImageHash } from '../../utils/db';
import { fingerprintImage, hammingDistance, type ImageFingerprint } from '../../utils/phash';
import { rememberImage } from '../../utils/recentImages';
import logger from '../../utils/logger';

// Known scam images, matched by perceptual hash (see utils/phash). Scam accounts
// reuse the same few screenshots, so a post of a known one is caught on sight:
// resized, re-compressed, any account, even in a single channel. Two sources:
//  • the shared list behind github.com/SomewhatDamaged/Scam-Images, checked live
//    through its API the way SomewhatDamaged/SentryBot does it: each image (and
//    each half of a wide side-by-side one) goes to /v1/scamscore with its size,
//    and a score of 4+ out of 10 is a scam. Only the hash and size are sent.
//  • our own list, learned when spam detection catches someone posting the same
//    image across channels, or added by mods with /config scamimages add

const SCAMSCORE_URL = 'https://api.excessive.space/v1/scamscore';
const SCAM_SCORE = 4;          // SentryBot's HOW_CLOSE: 10 = exact, 8 = within 4 bits, 4 = close with similar dimensions
const OUR_MATCH_DISTANCE = 6;  // of 256 bits, for our own list; a re-compressed copy measured 2, unrelated images ~118
const MAX_IMAGES = 4;          // per message
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const API_TIMEOUT_MS = 8_000;
const CACHE_MS = 30 * 60_000;  // a scam wave posts the same files in many channels
const USER_AGENT = 'TMCBot (+https://github.com/Geckomacabre/Multi-Purpose-Discord-Bot)';

// Someone posting the scam to warn people about it
export const WARNING_RE = /\b(scam\w*|hack(ed|er|s)?|fake|phish\w*|warning|beware|careful)\b|don'?t\s+(click|fall|trust|use)/i;

let known: IScamImageHash[] | null = null;
async function knownHashes() {
  known ??= await db.getScamImageHashes();
  return known;
}

/** Fingerprints of a message's image attachments (the original files, as the shared list hashes originals). */
export async function fingerprintMessage(message: Message): Promise<ImageFingerprint[]> {
  const images = [...message.attachments.values()]
    .filter(a => a.contentType?.startsWith('image/') && a.size <= MAX_BYTES)
    .slice(0, MAX_IMAGES);
  const out: ImageFingerprint[] = [];
  for (const image of images) {
    try {
      const res = await fetch(image.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;
      const data = Buffer.from(await res.arrayBuffer());
      rememberImage(message.id, image.name, data); // so a delete log can still show it
      out.push(...(await fingerprintImage(data)) ?? []);
    } catch (err) {
      logger.debug(`[scamimages] couldn't fingerprint ${image.name}: ${err}`);
    }
  }
  return out;
}

const scoreCache = new Map<string, { score: number; at: number }>();
let apiErrorLogged = 0;

/** The shared list's score for one image (0-10), or 0 if the API can't be reached. */
async function sharedScore(fp: ImageFingerprint): Promise<number> {
  const key = `${fp.hash}:${fp.width},${fp.height}`;
  const cached = scoreCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.score;
  try {
    const res = await fetch(`${SCAMSCORE_URL}?hash=${fp.hash}&dimensions=${fp.width},${fp.height}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    // 404 means "not a known scam" (score 0); anything else besides 200 is an error
    if (res.status !== 200 && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { result?: number };
    const score = Number(data.result) || 0;
    scoreCache.set(key, { score, at: Date.now() });
    if (scoreCache.size > 5000) scoreCache.delete(scoreCache.keys().next().value!);
    return score;
  } catch (err) {
    if (Date.now() - apiErrorLogged > 10 * 60_000) { // don't flood the log during an outage
      apiErrorLogged = Date.now();
      logger.warn(`[scamimages] the shared scam list API isn't answering, so only our own list is checked: ${err}`);
    }
    return 0;
  }
}

/** The closest image on our own list, if one is close enough. */
async function findInOurList(hashes: string[]) {
  let best: { entry: IScamImageHash; distance: number } | null = null;
  for (const entry of await knownHashes()) {
    for (const hash of hashes) {
      const distance = hammingDistance(hash, entry.hash);
      if (distance <= OUR_MATCH_DISTANCE && (!best || distance < best.distance)) best = { entry, distance };
    }
  }
  return best;
}

export type ScamImageMatch =
  | { list: 'ours'; entry: IScamImageHash; distance: number }
  | { list: 'shared'; score: number; part: ImageFingerprint['part'] };

/** Checks fingerprints against our own list (instant), then the shared list's API. */
export async function findScamImage(fingerprints: ImageFingerprint[]): Promise<ScamImageMatch | null> {
  if (!fingerprints.length) return null;
  const ours = await findInOurList(fingerprints.map(f => f.hash));
  if (ours) return { list: 'ours', ...ours };
  const scores = await Promise.all(fingerprints.map(sharedScore));
  const best = scores.reduce((b, s, i) => (s > scores[b]! ? i : b), 0);
  return scores[best]! >= SCAM_SCORE ? { list: 'shared', score: scores[best]!, part: fingerprints[best]!.part } : null;
}

/** Adds hashes to our list, skipping ones already on it. Returns the new entries. */
export async function addScamImages(
  hashes: string[], source: 'auto' | 'manual', guildId: string | null, addedBy: string | null = null,
): Promise<{ added: IScamImageHash[]; alreadyKnown: number }> {
  const added: IScamImageHash[] = [];
  let alreadyKnown = 0;
  for (const hash of new Set(hashes)) {
    const row = (await findInOurList([hash])) ? null : await db.addScamImageHash(hash, source, guildId, addedBy);
    if (!row) {
      alreadyKnown++;
      continue;
    }
    added.push(row);
    known?.unshift(row);
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
 * Whole-image hashes seen in at least two different channels. When the cross-channel
 * image rule fires, only these get learned: a scam bot posts the same screenshots
 * everywhere, while someone who posted three different photos shouldn't have those
 * photos blacklisted.
 */
export function repeatedAcrossChannels(posts: { channelId: string; hashes: string[] }[]): string[] {
  const repeated: string[] = [];
  for (const [i, post] of posts.entries()) {
    for (const hash of post.hashes) {
      const elsewhere = posts.some((other, j) => j !== i && other.channelId !== post.channelId
        && other.hashes.some(h => hammingDistance(h, hash) <= OUR_MATCH_DISTANCE));
      if (elsewhere && !repeated.some(h => hammingDistance(h, hash) <= OUR_MATCH_DISTANCE)) repeated.push(hash);
    }
  }
  return repeated;
}
