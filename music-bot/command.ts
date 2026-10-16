import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

// Minimal Command shape used by the standalone music bot (mirrors the main bot's
// interface, trimmed to what commands.ts needs).
export interface Command {
  data: any;
  run?: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
}
