import { Client, Events, GatewayIntentBits } from 'discord.js';
import Config from './config';
import * as db from './utils/db';
import { onReady } from './events/onReady';
import { onInteraction } from './events/onInteraction';
import { onMessageDeleteBulk } from './events/onMessageDeleteBulk';
import { onMessageUpdate } from './events/onMessageUpdate';
import { registerFeatures } from './features';

export const Bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

db.initDb();

Bot.once(Events.ClientReady, async () => await onReady(Bot));

Bot.on(Events.MessageUpdate, async (oldMessage, newMessage) => await onMessageUpdate(oldMessage, newMessage));
Bot.on(Events.MessageBulkDelete, async (messages, channel) => await onMessageDeleteBulk(messages, channel));

Bot.on(Events.InteractionCreate, async (interaction) => await onInteraction(interaction));

registerFeatures(Bot);

Bot.login(Config.DISCORD_TOKEN);
