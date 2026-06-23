import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder,
  MediaGalleryItemBuilder, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Dog: Command = {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setDescription('Get a random dog picture')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]),

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const res = await fetch('https://dog.ceo/api/breeds/image/random');
    const data = await res.json() as { message: string };
    const container = new ContainerBuilder().setAccentColor(0x8b4513)
      .addMediaGalleryComponents(new MediaGalleryBuilder()
        .addItems(new MediaGalleryItemBuilder().setURL(data.message)));
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  },
};

export default Dog;
