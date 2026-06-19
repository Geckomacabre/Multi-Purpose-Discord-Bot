import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, imageReply } from '../../utils/image/index.js';
import { motivate } from '../../utils/image/effects.js';

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
    const buf = await getImageBuffer(interaction);
    const result = await motivate(buf, top, bottom);
    await interaction.editReply(imageReply(result.data, result.type));
  },
};
export default Motivate;
