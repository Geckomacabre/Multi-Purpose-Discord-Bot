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
import { startReactionRoles } from './reactionroles';
import giveawayModule, { startGiveawayChecker } from './giveaway';
import { startBirthdayChecker } from './birthday';
import { startStatChannelUpdater } from './statchannels';
import { startTopicPoller } from './topics';
import starboardModule from './starboard';
import guildActionsModule from './guild-actions';
import timezoneModule from './timezone';
import verifyModule, { startVerifyGate } from './verify';
import spamDetectModule from './spamdetect';
import mediaguessModule, { startMediaGames } from './mediaguess';
import streamVcModule from './streamvc';
import { startLottery } from './lottery';
import raidguardModule from './raidguard';
import stickyModule, { startStickyRefresh } from './sticky';
import pollArchiveModule, { startPollArchiveSweeper } from './pollarchive';
import tempVoiceModule, { startTempVoice } from './tempvoice';
import globalBanModule, { startGlobalBans } from './globalban';

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
  giveawayModule,
  starboardModule,
  guildActionsModule,
  timezoneModule,
  verifyModule,
  spamDetectModule,
  mediaguessModule,
  streamVcModule,
  raidguardModule,
  stickyModule,
  pollArchiveModule,
  tempVoiceModule,
  globalBanModule,
];

export function registerFeatures(bot: Client) {
  startReactionRoles(bot);

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
    startMediaGames(bot);
    startLottery(bot);
    startStickyRefresh(bot);
    startPollArchiveSweeper(bot);
    startVerifyGate(bot).catch(err => console.error(`Verify gate startup failed: ${err}`));
    startTempVoice(bot).catch(err => console.error(`Temp voice startup failed: ${err}`));
    startGlobalBans(bot).catch(err => console.error(`Global ban startup failed: ${err}`));
  });
}
