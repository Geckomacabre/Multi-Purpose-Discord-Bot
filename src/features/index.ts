import { Client } from 'discord.js';
import * as db from '../utils/db';
import countingModule from './counting';
import autoroleModule from './autorole';
import voicerolesModule from './voiceroles';
import logsModule from './logs';
import moderationModule, { initModerationScheduler } from './moderation';
import automodModule from './automod';
import serverStatsModule from './serverstats';
import antiphishingModule from './antiphishing';
import streamingModule from './streaming';
import ticketsModule from './tickets';
import customCommandsModule from './customcommands';
import { startFeedsPollers } from './feeds';
import { startFreeGamesPoller } from './freegames';
import xpModule from './xp';
import welcomeModule from './welcome';
import reactionRolesModule from './reactionroles';
import giveawayModule, { startGiveawayChecker } from './giveaway';
import { startBirthdayChecker } from './birthday';
import { startStatChannelUpdater } from './statchannels';
import { startTopicPoller } from './topics';
import starboardModule from './starboard';
import guildActionsModule from './guild-actions';
import timezoneModule from './timezone';
import verifyModule from './verify';

const features = [
  countingModule,
  autoroleModule,
  voicerolesModule,
  logsModule,
  moderationModule,
  automodModule,
  serverStatsModule,
  antiphishingModule,
  streamingModule,
  ticketsModule,
  customCommandsModule,
  xpModule,
  welcomeModule,
  reactionRolesModule,
  giveawayModule,
  starboardModule,
  guildActionsModule,
  timezoneModule,
  verifyModule,
];

export function registerFeatures(bot: Client) {
  for (const feature of features) {
    for (const [event, handler] of Object.entries(feature.handlers)) {
      bot.on(event as any, async (...args) => {
        try {
          await (handler as any)({ data: args, bot, db });
        } catch (err) {
          console.error(`Error in feature ${feature.name} handling event ${event}: ${err}`);
        }
      });
    }
  }

  bot.once('clientReady', () => {
    initModerationScheduler(bot);
    startFeedsPollers(bot);
    startFreeGamesPoller(bot);
    startGiveawayChecker(bot);
    startBirthdayChecker(bot);
    startStatChannelUpdater(bot);
    startTopicPoller(bot);
  });
}
