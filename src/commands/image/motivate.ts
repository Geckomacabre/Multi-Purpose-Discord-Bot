import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, getOutputType, imageReply, normalizeImage } from '../../utils/image/index';
import { motivate } from '../../utils/image/effects';

const Motivate: Command = {
  data: new SlashCommandBuilder()
    .setName('motivate')
    .setDescription('Create a motivational poster')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('top').setDescription('Title text').setRequired(true))
    .addStringOption(o => o.setName('bottom').setDescription('Subtitle text'))
    .addAttachmentOption(o => o.setName('image').setDescription('Image to use')) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const top = interaction.options.getString('top', true);
    const bottom = interaction.options.getString('bottom') ?? '';
    const raw = await getImageBuffer(interaction);
    const buf = await normalizeImage(raw);
    const result = await motivate(buf, top, bottom);
    const ext = await getOutputType(buf);
    await interaction.editReply(imageReply(result, ext));
  },
};
export default Motivate;
