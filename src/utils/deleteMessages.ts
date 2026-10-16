import type { GuildTextBasedChannel, Message } from 'discord.js';

// Discord's bulk delete only accepts messages under 14 days old. Anything older
// has to be deleted with one request per message, which Discord rate limits to
// roughly one per second per channel — slow, but it works on any age.
const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 5 * 60_000; // 5 min margin for clock skew

// Messages currently being deleted one at a time by the bot. The message-log
// feature skips these so wiping old history doesn't post one log entry each.
const deleting = new Set<string>();
export const isBotDeleting = (messageId: string) => deleting.has(messageId);

/** Fetch up to `limit` messages before `before` (newest first), paging past Discord's 100-per-request cap. */
export async function fetchMessages(channel: GuildTextBasedChannel, limit: number, before?: string): Promise<Message[]> {
  const out: Message[] = [];
  while (out.length < limit) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, limit - out.length), ...(before ? { before } : {}) });
    if (!batch.size) break;
    out.push(...batch.values());
    before = batch.lastKey();
    if (batch.size < 100) break;
  }
  return out;
}

/**
 * Delete messages of any age: bulk-delete the recent ones, then delete older ones
 * individually. Returns how many were deleted. `onProgress` fires after each
 * individual delete, for long-running wipes.
 */
export async function deleteMessages(
  channel: GuildTextBasedChannel,
  messages: Message[],
  onProgress?: (deleted: number, total: number) => void,
): Promise<number> {
  const cutoff = Date.now() - BULK_MAX_AGE_MS;
  const recent = messages.filter(m => m.createdTimestamp > cutoff);
  const old = messages.filter(m => m.createdTimestamp <= cutoff);
  let deleted = 0;

  for (let i = 0; i < recent.length; i += 100) {
    const chunk = recent.slice(i, i + 100);
    if (chunk.length === 1) {
      if (await chunk[0]!.delete().then(() => true, () => false)) deleted++;
      continue;
    }
    const res = await channel.bulkDelete(chunk, true).catch(() => null);
    deleted += res?.size ?? 0;
  }

  for (const m of old) {
    deleting.add(m.id);
    if (await m.delete().then(() => true, () => false)) deleted++;
    setTimeout(() => deleting.delete(m.id), 30_000); // the delete event can arrive after the request resolves
    onProgress?.(deleted, messages.length);
  }
  return deleted;
}
