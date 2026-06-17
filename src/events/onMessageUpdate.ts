import { Message, PartialMessage, TextChannel } from 'discord.js';
import * as db from '../utils/db';

export const onMessageUpdate = async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
  const counting = await db.getCounting(newMessage.channelId);
  if (!counting) return;

  const latest = counting.last_msg;
  if (!latest || latest.message_id !== newMessage.id) return;

  const newNumber = Number.parseInt(newMessage.content ?? '', 10);
  if (isNaN(newNumber) || newNumber === latest.number) return;

  const channel = newMessage.channel as TextChannel;
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    content: `<@${latest.author_id}> why change your message from **"${latest.number.toLocaleString()}"**?`,
  });
};
