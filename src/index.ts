import { Client, GatewayIntentBits, Partials } from "discord.js";
import Config from "./config";
import { registerEvents } from "./events";
import { registerFeatures } from "./features";
import { initDb } from "./infrastructure/db";

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  bot.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Termination signal received, shutting down...");
  bot.destroy();
  process.exit(0);
});

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

initDb()
registerEvents(bot);
await registerFeatures(bot);

bot.login(Config.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to login:", error);
  process.exit(1);
});
