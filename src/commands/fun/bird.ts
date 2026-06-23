import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder,
  MediaGalleryItemBuilder, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Bird: Command = {
  data: new SlashCommandBuilder()
    .setName('bird')
    .setDescription('Get a random bird picture')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]),

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const res = await fetch('https://some-random-api.com/animal/bird');
    const data = await res.json() as { image: string };
    const container = new ContainerBuilder().setAccentColor(0x87ceeb)
      .addMediaGalleryComponents(new MediaGalleryBuilder()
        .addItems(new MediaGalleryItemBuilder().setURL(data.image)));
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  },
};

export default Bird;
