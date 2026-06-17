import { Message, PartialMessage, TextChannel } from 'discord.js';
import * as db from '../utils/db';

export const onMessageDelete = async (message: Message | PartialMessage) => {
  if (message.partial) {
    try {
      await message.fetch();
    } catch (error) {
      console.error('Error fetching the message:', error);
      return;
    }
  }

  if (!message.guild || message.author?.bot) return;

  const channelId = message.channelId;
  const counting = await db.getCounting(channelId);
  if (!counting) return;
  let latest = counting.last_msg;
  if (!latest || latest.message_id !== message.id) return;
  const channel = message.channel as TextChannel;
  if (!channel.isTextBased()) return;
  await channel.send(`<@${latest.author_id}> why u delete **"${latest.number.toLocaleString()}"**?`);
};
