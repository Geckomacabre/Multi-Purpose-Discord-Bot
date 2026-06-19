import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, imageReply, normalizeImage } from '../../utils/image/index';
import { gamexplain } from '../../utils/image/effects';

const Gamexplain: Command = {
  data: new SlashCommandBuilder()
    .setName('gamexplain')
    .setDescription('Create a Gamexplain-style thumbnail')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('text').setDescription('Title text').setRequired(true))
    .addAttachmentOption(o => o.setName('image').setDescription('Image to use')) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const text = interaction.options.getString('text', true);
    const raw = await getImageBuffer(interaction);
    const buf = await normalizeImage(raw);
    const result = await gamexplain(buf, text);
    await interaction.editReply(imageReply(result, 'png'));
  },
};
export default Gamexplain;
