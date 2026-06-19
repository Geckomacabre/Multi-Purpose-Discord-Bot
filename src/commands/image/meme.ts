import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, getOutputType, imageReply, normalizeImage } from '../../utils/image/index';
import { meme } from '../../utils/image/effects';

const Meme: Command = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Add Impact meme text to an image')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('top').setDescription('Top text'))
    .addStringOption(o => o.setName('bottom').setDescription('Bottom text'))
    .addAttachmentOption(o => o.setName('image').setDescription('Image to use')) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const top = interaction.options.getString('top') ?? '';
    const bottom = interaction.options.getString('bottom') ?? '';
    if (!top && !bottom) { await interaction.editReply('Please provide at least top or bottom text.'); return; }
    const raw = await getImageBuffer(interaction);
    const buf = await normalizeImage(raw);
    const result = await meme(buf, top, bottom);
    const ext = await getOutputType(buf);
    await interaction.editReply(imageReply(result, ext));
  },
};
export default Meme;
