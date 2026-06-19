import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { getImageBuffer, imageReply } from '../../utils/image/index.js';
import { spotify } from '../../utils/image/effects.js';

const Spotify: Command = {
  data: new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Create a fake Spotify now playing card')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('song').setDescription('Song name').setRequired(true))
    .addAttachmentOption(o => o.setName('image').setDescription('Album art image')) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const song = interaction.options.getString('song', true);
    const buf = await getImageBuffer(interaction);
    const result = await spotify(buf, song);
    await interaction.editReply(imageReply(result.data, result.type));
  },
};
export default Spotify;
