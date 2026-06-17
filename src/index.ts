import { Client, Events, GatewayIntentBits } from 'discord.js';
import Config from './config';
import { onReady } from './events/onReady';
import * as db from './utils/db';
import { onInteraction } from './events/onInteraction';
import { onMessageCreate } from './events/onMessageCreate';
import { onMessageDelete } from './events/onMessageDelete';

export const Bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

db.initDb();

Bot.once(Events.ClientReady, async () => await onReady(Bot));

Bot.on(Events.MessageDelete, async (message) => await onMessageDelete(message));
Bot.on(Events.MessageCreate, async (message) => await onMessageCreate(message));
Bot.on(Events.InteractionCreate, async (interaction) => await onInteraction(interaction));

Bot.login(Config.DISCORD_TOKEN);
