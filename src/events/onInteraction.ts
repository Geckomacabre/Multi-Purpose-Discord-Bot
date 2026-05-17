import { type Interaction } from "discord.js";
import { MessageFlags } from "discord.js";
import commands from "../handlers/commandHandler";
import logger from "../infrastructure/logger";

export const onInteraction = async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    if (typeof command.run === "function") {
      await command.run(interaction);
    }
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: "There was an error executing that command.",
          flags: MessageFlags.Ephemeral,
        })
        .catch((err) => logger.error("Error sending error response:", err));
      return;
    }
    if (interaction.deferred) {
      await interaction
        .editReply({
          content: "There was an error executing that command.",
        })
        .catch((err) => logger.error("Error editing error response:", err));
    }
  }
};
