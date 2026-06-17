import { ComponentType, Interaction, MessageFlags } from 'discord.js';
import commands from '../handlers/commandHandler';
import logger from '../utils/logger';
import * as db from '../utils/db';

export const onInteraction = async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      if (typeof command.run === 'function') {
        await command.run(interaction);
      }
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: 'There was an error executing that command.',
            flags: MessageFlags.Ephemeral,
          })
          .catch((err) => {
            logger.error('Error sending error response:', err);
          });
      } else if (interaction.deferred) {
        await interaction
          .editReply({
            content: 'There was an error executing that command.',
          })
          .catch((err) => {
            logger.error('Error editing error response:', err);
          });
      }
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('counting_modal:')) {
      const channelId = interaction.channel?.id;
      if (!channelId) return;

      let newCount = 0;
      let newHighScore = 0;
      let resetMessages = false;

      for (const label of interaction.components) {
        if (label.type !== ComponentType.Label) continue;
        const c = label.component ?? label;
        if (!c) continue;
        if (c.type === ComponentType.TextInput) {
          if (c.customId === 'current_count' && c.value) newCount = Number(c.value.replaceAll(',', ''));
          if (c.customId === 'high_score' && c.value) newHighScore = Number(c.value.replaceAll(',', ''));
        } else if (c.type === ComponentType.Checkbox) {
          if (c.customId === 'reset_messages') resetMessages = c.value;
        }
      }

      if (isNaN(newCount) || isNaN(newHighScore)) {
        await interaction.reply({
          content: `❌ Please enter valid numbers for count and high score.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (resetMessages) {
        await db.unsetCounting(channelId);
        await interaction.reply({
          content: `🚫 Counting has been disabled for this channel and all data has been reset.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!interaction.guildId) return;

      await db.setCounting(channelId, interaction.guildId, newCount, Math.max(newHighScore, newCount), undefined);
      await interaction.reply({
        content: `✅ Counting has been updated for this channel! The current count is now **${newCount.toLocaleString()}** with a high score of **${newHighScore.toLocaleString()}**.`,
      });
    }
  }
};
