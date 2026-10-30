// Discord deletes a message's attachments the moment the message is deleted, so a
// delete log can't download them afterwards. The scam image check already
// downloads every image members post, so it hands them here and the delete log
// can show the real images. Kept in memory for a couple of hours, capped in size.

const TTL_MS = 2 * 60 * 60_000;
const MAX_TOTAL_BYTES = 96 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // Discord's upload limit for bots without boosts

export type RememberedImage = { name: string; data: Buffer };

const images = new Map<string, { files: RememberedImage[]; at: number; bytes: number }>(); // message id -> its images
let totalBytes = 0;

function evict(id: string) {
  const entry = images.get(id);
  if (!entry) return;
  totalBytes -= entry.bytes;
  images.delete(id);
}

/** Remembers an image posted in a message. */
export function rememberImage(messageId: string, name: string, data: Buffer) {
  if (data.length > MAX_FILE_BYTES) return;
  const entry = images.get(messageId) ?? { files: [], at: Date.now(), bytes: 0 };
  if (entry.files.some(f => f.name === name)) return;
  entry.files.push({ name, data });
  entry.bytes += data.length;
  totalBytes += data.length;
  images.set(messageId, entry);

  // Oldest first: drop expired entries, then whatever it takes to fit the cap
  for (const [id, e] of images) {
    if (totalBytes <= MAX_TOTAL_BYTES && Date.now() - e.at < TTL_MS) break;
    evict(id);
  }
}

/**
 * The images remembered for a message. Doesn't forget them: a spam purge's report
 * and the delete log can both want the same images; they expire on their own.
 */
export function peekImages(messageId: string): RememberedImage[] {
  const entry = images.get(messageId);
  return entry && Date.now() - entry.at < TTL_MS ? entry.files : [];
}
