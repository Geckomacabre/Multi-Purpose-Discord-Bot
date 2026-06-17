import { Client, GatewayIntentBits } from 'discord.js';
import Config from './config';
import { registerEvents } from './events';
import { registerFeatures } from './features';
import * as db from './utils/db';

export const Bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

db.initDb();
registerEvents(Bot);
registerFeatures(Bot);

Bot.login(Config.DISCORD_TOKEN);
