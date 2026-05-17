import { type Client } from "discord.js";
import logger from "../infrastructure/logger";

export const onReady = async (Bot: Client) => {
  logger.info(`Logged in as ${Bot.user?.tag}`);
};
