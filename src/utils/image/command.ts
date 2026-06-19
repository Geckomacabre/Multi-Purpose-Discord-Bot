import {
  ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType,
  SlashCommandBuilder, SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, getOutputType, imageReply, normalizeImage } from './index';

type EffectFn = (buffer: Buffer, ...args: any[]) => Promise<Buffer>;

interface ImageCommandOptions {
  name: string;
  description: string;
  effect: EffectFn;
  forceGif?: boolean;
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
      const raw = await getImageBuffer(interaction);
      const buf = await normalizeImage(raw);
      const args = opts.getArgs ? opts.getArgs(interaction) : [];
      const result = await opts.effect(buf, ...args);
      const ext = await getOutputType(buf, opts.forceGif);
      await interaction.editReply(imageReply(result, ext));
    },
  };
}

export function makeTextImageCommand(opts: {
  name: string;
  description: string;
  effect: (buffer: Buffer, text: string) => Promise<Buffer>;
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
      const raw = await getImageBuffer(interaction);
      const buf = await normalizeImage(raw);
      const result = await opts.effect(buf, text);
      const ext = await getOutputType(buf);
      await interaction.editReply(imageReply(result, ext));
    },
  };
}

export function makeNoImageCommand(opts: {
  name: string;
  description: string;
  buildOptions?: (builder: SlashCommandBuilder) => any;
  run: (interaction: ChatInputCommandInteraction) => Promise<Buffer>;
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
      await interaction.editReply(imageReply(result, 'png'));
    },
  };
}
