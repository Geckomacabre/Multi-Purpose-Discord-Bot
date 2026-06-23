import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder,
  MediaGalleryItemBuilder, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const Cat: Command = {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setDescription('Get a random cat picture')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]),

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const res = await fetch('https://api.thecatapi.com/v1/images/search');
    const [data] = await res.json() as any[];
    const container = new ContainerBuilder().setAccentColor(0xffa500)
      .addMediaGalleryComponents(new MediaGalleryBuilder()
        .addItems(new MediaGalleryItemBuilder().setURL(data.url)));
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  },
};

export default Cat;
