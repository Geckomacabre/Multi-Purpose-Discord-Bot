import {
  AutocompleteInteraction,
  CacheType,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export interface Command {
  data:
    | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'>
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | ContextMenuCommandBuilder;
  category?: string;
  run?: (interaction: ChatInputCommandInteraction<CacheType>) => Promise<void>;
  runMessage?: (interaction: MessageContextMenuCommandInteraction<CacheType>) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction<CacheType>) => Promise<void>;
}