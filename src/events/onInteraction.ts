import { Interaction, MessageFlags } from 'discord.js';
import commands from '../handlers/commandHandler';
import logger from '../utils/logger';

export const onInteraction = async (interaction: Interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error(`Autocomplete error for ${interaction.commandName}:`, err);
      }
    }
    return;
  }

  if (interaction.isMessageContextMenuCommand()) {
    const command = commands.get(interaction.commandName);
    if (command?.runMessage) {
      try {
        await command.runMessage(interaction);
      } catch (err) {
        logger.error(`Context menu error for ${interaction.commandName}:`, err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    if (typeof command.run === 'function') {
      await command.run(interaction);
    }
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}:`, error);

    const errorMessage = { content: 'There was an error executing that command.', flags: MessageFlags.Ephemeral };
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(errorMessage).catch((err) => logger.error('Error sending error response:', err));
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'There was an error executing that command.' }).catch((err) => logger.error('Error editing error response:', err));
    }
  }
};
