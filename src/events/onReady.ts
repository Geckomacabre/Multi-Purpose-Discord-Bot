import { Client } from 'discord.js';
import logger from '../utils/logger';

export const onReady = async (Bot: Client) => {
  try {
    logger.info(`Logged in as ${Bot.user?.tag}!`);
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
};
