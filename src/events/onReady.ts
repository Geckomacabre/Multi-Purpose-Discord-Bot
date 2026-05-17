import type { Client } from "discord.js";

export const onReady = async (Bot: Client) => {
  console.log(`Logged in as ${Bot.user?.tag}`);
};
