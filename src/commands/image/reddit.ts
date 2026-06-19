import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, imageReply, normalizeImage } from '../../utils/image/index';
import { reddit } from '../../utils/image/effects';

const Reddit: Command = {
  data: new SlashCommandBuilder()
    .setName('redditpost')
    .setDescription('Create a fake Reddit post with an image')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('title').setDescription('Post title').setRequired(true))
    .addAttachmentOption(o => o.setName('image').setDescription('Image for the post')) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const title = interaction.options.getString('title', true);
    const raw = await getImageBuffer(interaction);
    const buf = await normalizeImage(raw);
    const result = await reddit(buf, title);
    await interaction.editReply(imageReply(result, 'png'));
  },
};
export default Reddit;
