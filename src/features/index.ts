import { Client } from 'discord.js';
import * as db from '../utils/db';
import countingModule from './counting';

const features = [countingModule];

export function registerFeatures(bot: Client) {
  for (const feature of features) {
    for (const [event, handler] of Object.entries(feature.handlers)) {
      bot.on(event as any, async (...args) => {
        try {
          await handler({
            data: args,
            bot,
            db,
          } as any);
        } catch (err) {
          console.error(`Error in feature ${feature.name} handling event ${event}: ${err}`);
        }
      });
    }
  }
}
