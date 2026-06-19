import {
  ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType,
  SlashCommandBuilder, SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, imageReply } from './index.js';
import type { NativeResult } from './native.js';

type EffectFn = (buffer: Buffer, ...args: any[]) => Promise<NativeResult>;

interface ImageCommandOptions {
  name: string;
  description: string;
  effect: EffectFn;
  extraOptions?: (builder: SlashCommandBuilder) => SlashCommandOptionsOnlyBuilder | SlashCommandBuilder;
  getArgs?: (interaction: ChatInputCommandInteraction) => any[];
}

export function makeImageCommand(opts: ImageCommandOptions): Command {
  let builder: any = new SlashCommandBuilder()
    .setName(opts.name)
    .setDescription(opts.description)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addAttachmentOption(o => o.setName('image').setDescription('Image to process'));
  if (opts.extraOptions) builder = opts.extraOptions(builder);

  return {
    data: builder,
    async run(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();
      const buf = await getImageBuffer(interaction);
      const args = opts.getArgs ? opts.getArgs(interaction) : [];
      const result = await opts.effect(buf, ...args);
      await interaction.editReply(imageReply(result.data, result.type));
    },
  };
}

export function makeTextImageCommand(opts: {
  name: string;
  description: string;
  effect: (buffer: Buffer, text: string) => Promise<NativeResult>;
  textOption?: string;
  textDesc?: string;
}): Command {
  const builder: any = new SlashCommandBuilder()
    .setName(opts.name)
    .setDescription(opts.description)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName(opts.textOption ?? 'text').setDescription(opts.textDesc ?? 'Text to add').setRequired(true))
    .addAttachmentOption(o => o.setName('image').setDescription('Image to process'));

  return {
    data: builder,
    async run(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();
      const text = interaction.options.getString(opts.textOption ?? 'text', true);
      const buf = await getImageBuffer(interaction);
      const result = await opts.effect(buf, text);
      await interaction.editReply(imageReply(result.data, result.type));
    },
  };
}

export function makeNoImageCommand(opts: {
  name: string;
  description: string;
  buildOptions?: (builder: SlashCommandBuilder) => any;
  run: (interaction: ChatInputCommandInteraction) => Promise<NativeResult>;
}): Command {
  let builder: any = new SlashCommandBuilder()
    .setName(opts.name)
    .setDescription(opts.description)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]);
  if (opts.buildOptions) builder = opts.buildOptions(builder);

  return {
    data: builder,
    async run(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();
      const result = await opts.run(interaction);
      await interaction.editReply(imageReply(result.data, result.type));
    },
  };
}
