import type { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';

// Minimal Command shape used by the standalone music bot (mirrors the main bot's
// interface, trimmed to what music.ts needs).
export interface Command {
  data: any;
  run?: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
  /** Handles buttons whose custom ID starts with `<command name>:`. */
  button?: (interaction: ButtonInteraction) => Promise<unknown>;
}
