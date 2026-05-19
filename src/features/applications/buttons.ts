import type { ButtonInteraction } from "discord.js";
import { createApplicationModal } from "./modals";
import { Positions } from "../../constants";

export const buttonHandlers: Record<
  string,
  (interaction: ButtonInteraction) => Promise<void>
> = {};

for (const position of Positions) {
  buttonHandlers[position.custom_id] = async (interaction) => {
    await interaction.showModal(createApplicationModal(position));
  };
}

export default buttonHandlers;
