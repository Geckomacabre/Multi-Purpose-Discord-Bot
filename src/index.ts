import { Client, GatewayIntentBits } from 'discord.js';
import Config from './config';
import { registerEvents } from './events';
import { registerFeatures } from './features';
import * as db from './utils/db';

export const Bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,          // autorole, logs (privileged — enable in Dev Portal)
    GatewayIntentBits.GuildPresences,        // streaming detection (privileged)
    GatewayIntentBits.GuildVoiceStates,      // voice roles
    GatewayIntentBits.GuildModeration,       // ban/unban events
    GatewayIntentBits.GuildMessageReactions, // polls, reaction roles
    GatewayIntentBits.DirectMessages,        // reminder DMs
  ],
});

db.initDb();
registerEvents(Bot);
registerFeatures(Bot);

Bot.login(Config.DISCORD_TOKEN);
