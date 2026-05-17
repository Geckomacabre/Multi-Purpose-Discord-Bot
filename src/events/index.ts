import type { Client } from "discord.js";
import { Events } from "discord.js";
import { onReady } from "./onReady";
import { onInteraction } from "./onInteraction";

export function registerEvents(bot: Client) {
  bot.once(Events.ClientReady, async () => {
    await onReady(bot);
  });

  bot.on(Events.InteractionCreate, async (interaction) => {
    await onInteraction(interaction);
  });
}
