import { Channel, TextChannel } from 'discord.js';
import * as db from '../utils/db';

export const onChannelDelete = async (channel: Channel) => {
  if (!channel.isTextBased()) return;

  const textChannel = channel as TextChannel;

  if (!textChannel.guildId || !textChannel.id) return;
  await db.removeCountingByChannelId(textChannel.guildId, textChannel.id);
};
