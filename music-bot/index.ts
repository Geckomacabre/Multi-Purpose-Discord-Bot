import { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags } from 'discord.js';
import Music from './music';
import { activePlayer, getPlayer } from './player';
import { toolVersions } from './audio';
import logger from './logger';

const TOKEN = Bun.env.TOKEN;
const CLIENT_ID = Bun.env.CLIENT_ID;
// /music is registered as a GUILD command in this server. That's required when
// sharing the main bot's application: the main bot replaces its GLOBAL commands
// on every startup, so a global /music would be wiped. Guild commands also show
// up instantly instead of taking up to an hour to propagate.
const GUILD_ID = Bun.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  logger.error('Missing TOKEN or CLIENT_ID in the environment (.env). See README.md.');
  process.exit(1);
}
if (!GUILD_ID) {
  logger.warn('GUILD_ID is not set, so /music is registered globally. If this bot shares the main bot\'s token, '
    + 'the main bot will delete it on every restart (it comes back within 5 minutes). Set GUILD_ID to avoid that.');
}

process.on('uncaughtException', (err) => logger.error(`Uncaught exception: ${err?.stack ?? err}`));
process.on('unhandledRejection', (reason) => logger.error(`Unhandled rejection: ${reason}`));

// Only the intents music needs: guild info + voice states.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const rest = new REST({ version: '10' }).setToken(TOKEN);
const commandsRoute = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);

// POST creates or updates /music on its own. Never PUT: this bot can share its
// application with the main bot, and a PUT replaces every command in that scope.
async function registerCommand() {
  await rest.post(commandsRoute, { body: Music.data.toJSON() });
  logger.info(`Registered /music${GUILD_ID ? ` in guild ${GUILD_ID}` : ' globally'}.`);
}

// The main bot can remove /music when it re-syncs its own commands, so check
// every few minutes and put it back if it's gone (a GET is cheap; creates are
// limited per day, so only POST when it's actually missing).
async function ensureCommand() {
  try {
    const existing = await rest.get(commandsRoute) as { name: string }[];
    if (!existing.some((c) => c.name === Music.data.name)) {
      logger.warn('/music was missing, re-registering it.');
      await registerCommand();
    }
  } catch (e) {
    logger.warn(`Command check failed: ${e}`);
  }
}

client.once(Events.ClientReady, async (c) => {
  logger.info(`Music bot logged in as ${c.user.tag} (${toolVersions()})`);
  getPlayer(client); // load extractors now, not on the first /music command
  try {
    await registerCommand();
  } catch (e) {
    logger.error(`Command registration failed: ${e}`);
  }
  setInterval(ensureCommand, 5 * 60 * 1000);
});

const replyError = async (interaction: any) => {
  const content = 'There was an error running that. Please try again.';
  if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
};

// When sharing the main bot's token, both processes receive every interaction.
// Each one only answers its own: the main bot ignores /music and music:* buttons,
// and this bot ignores everything else.
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === Music.data.name) await Music.autocomplete?.(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('music:')) await Music.button?.(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === Music.data.name) {
      await Music.run?.(interaction);
    }
  } catch (error: any) {
    logger.error(`Error handling ${interaction.isChatInputCommand() ? `/${interaction.commandName}` : 'interaction'}: ${error?.stack ?? error}`);
    if (interaction.isRepliable()) await replyError(interaction);
  }
});

// Leave voice channels cleanly instead of leaving a ghost bot behind.
async function shutdown(signal: string) {
  logger.info(`${signal} received, leaving voice channels and shutting down.`);
  for (const queue of activePlayer()?.queues.cache.values() ?? []) queue.delete();
  await client.destroy();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.login(TOKEN);
