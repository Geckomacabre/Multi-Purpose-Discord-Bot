import { Client, Events } from 'discord.js';
import { onInteraction } from './onInteraction';
import { onReady } from './onReady';

export function registerEvents(Bot: Client) {
  Bot.once(Events.ClientReady, async () => await onReady(Bot));

  Bot.on(Events.InteractionCreate, async (interaction) => await onInteraction(interaction));
}
