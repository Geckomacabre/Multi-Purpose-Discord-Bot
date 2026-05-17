import type { Client } from "discord.js";
import { Events } from "discord.js";
import { onReady } from "./onReady";

export function registerEvents(bot: Client) {
  bot.once(Events.ClientReady, async () => {
    await onReady(bot);
  });
}
