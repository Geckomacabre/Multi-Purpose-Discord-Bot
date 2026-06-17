import { Client, Events, GatewayIntentBits } from 'discord.js';
import Config from './config';
import { onReady } from './events/onReady';
import * as db from './utils/db';

export const Bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

db.initDb();

Bot.once(Events.ClientReady, async () => await onReady(Bot));

Bot.login(Config.DISCORD_TOKEN);
