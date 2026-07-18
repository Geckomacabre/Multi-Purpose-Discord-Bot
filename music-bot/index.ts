import { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags } from 'discord.js';
import Music from './music';
import logger from './logger';

const TOKEN = Bun.env.TOKEN;
const CLIENT_ID = Bun.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  logger.error('Missing TOKEN or CLIENT_ID in the environment (.env). See README.md.');
  process.exit(1);
}

process.on('uncaughtException', (err) => logger.error(`Uncaught exception: ${err?.stack ?? err}`));
process.on('unhandledRejection', (reason) => logger.error(`Unhandled rejection: ${reason}`));

// Only the intents music needs: guild info + voice states.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const commands = new Map<string, typeof Music>([[Music.data.name, Music]]);

client.once(Events.ClientReady, async (c) => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const body = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    logger.info(`Registered ${body.length} command(s).`);
  } catch (e) {
    logger.error(`Command registration failed: ${e}`);
  }
  logger.info(`Music bot logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.run?.(interaction);
  } catch (error) {
    logger.error(`Error executing ${interaction.commandName}: ${error}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'There was an error executing that command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'There was an error executing that command.' }).catch(() => {});
    }
  }
});

client.login(TOKEN);
