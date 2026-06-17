import { Client, Events } from 'discord.js';
import { onInteraction } from './onInteraction';
import { onMessageDeleteBulk } from './onMessageDeleteBulk';
import { onMessageUpdate } from './onMessageUpdate';
import { onReady } from './onReady';

export function registerEvents(Bot: Client) {
  Bot.once(Events.ClientReady, async () => await onReady(Bot));

  Bot.on(Events.MessageUpdate, async (oldMessage, newMessage) => await onMessageUpdate(oldMessage, newMessage));
  Bot.on(Events.MessageBulkDelete, async (messages, channel) => await onMessageDeleteBulk(messages, channel));

  Bot.on(Events.InteractionCreate, async (interaction) => await onInteraction(interaction));
}
