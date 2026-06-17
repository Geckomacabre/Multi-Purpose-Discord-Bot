import { GuildTextBasedChannel, Message, PartialMessage, ReadonlyCollection } from 'discord.js';
import * as db from '../utils/db';

export const onMessageDeleteBulk = async (
  messages: ReadonlyCollection<string, Message | PartialMessage>,
  channel: GuildTextBasedChannel
) => {
  const counting = await db.getCounting(channel.id);
  if (!counting) return;

  const latest = counting.last_msg;
  if (!latest) return;

  const wasDeleted = messages.has(latest.message_id);
  if (!wasDeleted) return;

  await channel.send({
    content: `<@${latest.author_id}> why u delete **${latest.number.toLocaleString()}**?`,
    allowedMentions: { users: [latest.author_id] },
  });
};
