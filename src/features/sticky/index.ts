import { Colors, EmbedBuilder, Message, TextChannel } from 'discord.js';
import { EventModule } from '../feature';
import logger from '../../utils/logger';

/**
 * Sticky messages — keeps a message pinned to the bottom of a channel by
 * deleting and re-posting it whenever someone else talks.
 *
 * Reposting is debounced per channel rather than done on every message: a busy
 * channel would otherwise mean one delete+post per message, which burns rate
 * limit and makes the sticky flicker. Waiting a beat also means a burst of
 * chatter only costs one repost.
 */
const REPOST_DELAY_MS = 3_000;

// channel_id -> pending repost timer
const pending = new Map<string, ReturnType<typeof setTimeout>>();
// channel_id -> true while a repost is in flight, so overlapping triggers don't
// double-post (which would leave an orphaned sticky above the new one).
const inFlight = new Set<string>();

function buildPayload(content: string, asEmbed: boolean) {
  if (!asEmbed) return { content };
  return {
    embeds: [new EmbedBuilder().setColor(Colors.Blurple).setDescription(content)],
  };
}

async function repost(channel: TextChannel, db: typeof import('../../utils/db')) {
  const id = channel.id;
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const sticky = await db.getSticky(id);
    if (!sticky) return;

    // Delete the previous copy first so only one sticky exists at a time.
    if (sticky.message_id) {
      await channel.messages.delete(sticky.message_id).catch(() => {
        // Already gone (deleted manually, purged, etc.) — nothing to clean up.
      });
    }

    const sent = await channel.send(buildPayload(sticky.content, sticky.embed === 1));
    await db.setStickyMessageId(id, sent.id);
  } catch (err: any) {
    logger.warn(`[sticky] repost failed in ${channel.id}: ${err?.message ?? err}`);
  } finally {
    inFlight.delete(id);
  }
}

function scheduleRepost(channel: TextChannel, db: typeof import('../../utils/db')) {
  const id = channel.id;
  const existing = pending.get(id);
  if (existing) clearTimeout(existing);
  pending.set(id, setTimeout(() => {
    pending.delete(id);
    void repost(channel, db);
  }, REPOST_DELAY_MS));
}

const stickyModule: EventModule = {
  name: 'sticky',
  handlers: {
    messageCreate: async ({ data: [message], db }) => {
      if (!message.guild || message.author.bot) return;
      const channel = message.channel;
      if (!channel.isTextBased() || channel.isDMBased()) return;

      const sticky = await db.getSticky(channel.id);
      if (!sticky) return;

      scheduleRepost(channel as TextChannel, db);
    },
  },
};

/** Posts (or re-posts) the sticky immediately — used right after /sticky set. */
export async function postStickyNow(channel: TextChannel, db: typeof import('../../utils/db')) {
  const timer = pending.get(channel.id);
  if (timer) { clearTimeout(timer); pending.delete(channel.id); }
  await repost(channel, db);
}

/** Clears any pending repost when a sticky is removed. */
export function cancelSticky(channelId: string) {
  const timer = pending.get(channelId);
  if (timer) { clearTimeout(timer); pending.delete(channelId); }
}

export default stickyModule;
