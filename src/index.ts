import { Client, Events, GatewayIntentBits } from 'discord.js';
import Config from './config';
import * as db from './utils/db';
import { onReady } from './events/onReady';
import { onInteraction } from './events/onInteraction';
import { onMessageCreate } from './events/onMessageCreate';
import { onMessageDelete } from './events/onMessageDelete';
import { onMessageDeleteBulk } from './events/onMessageDeleteBulk';
import { onMessageUpdate } from './events/onMessageUpdate';
import { onChannelDelete } from './events/onChannelDelete';
import { registerFeatures } from './features';

export const Bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

db.initDb();

Bot.once(Events.ClientReady, async () => await onReady(Bot));

Bot.on(Events.MessageDelete, async (message) => await onMessageDelete(message));
Bot.on(Events.MessageCreate, async (message) => await onMessageCreate(message));
Bot.on(Events.MessageUpdate, async (oldMessage, newMessage) => await onMessageUpdate(oldMessage, newMessage));
Bot.on(Events.MessageBulkDelete, async (messages, channel) => await onMessageDeleteBulk(messages, channel));
Bot.on(Events.ChannelDelete, async (channel) => {
  await onChannelDelete(channel);
});

Bot.on(Events.InteractionCreate, async (interaction) => await onInteraction(interaction));

registerFeatures();

Bot.login(Config.DISCORD_TOKEN);
