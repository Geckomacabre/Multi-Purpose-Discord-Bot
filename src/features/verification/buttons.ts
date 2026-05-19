import type { ButtonInteraction } from "discord.js";
import { createBirthdayModal } from "./modals";

export const buttonHandlers: Record<
  string,
  (interaction: ButtonInteraction) => Promise<void>
> = {
  trigger_birthday_modal: async (interaction) => {
    await interaction.showModal(createBirthdayModal());
  },
};

export default buttonHandlers;
