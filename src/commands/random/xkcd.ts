import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, ContainerBuilder,
  InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

function imgContainer(url: string, caption: string, color?: number) {
  const c = new ContainerBuilder()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(caption));
  if (color !== undefined) c.setAccentColor(color);
  return { flags: MessageFlags.IsComponentsV2, components: [c] };
}

const Xkcd: Command = {
  data: new SlashCommandBuilder()
    .setName('xkcd')
    .setDescription('Get a random or specific xkcd comic')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addIntegerOption(o => o.setName('number').setDescription('Comic number (omit for random)').setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const latest: any = await fetch('https://xkcd.com/info.0.json', { signal: AbortSignal.timeout(8000) }).then(r => r.json());
      const num = interaction.options.getInteger('number') ?? Math.floor(Math.random() * latest.num) + 1;
      const comic: any = num === latest.num ? latest : await fetch(`https://xkcd.com/${num}/info.0.json`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
      await interaction.editReply(imgContainer(
        comic.img,
        `**#${comic.num}: ${comic.title}**\n*${comic.alt.slice(0, 500)}*`,
        Colors.White,
      ));
    } catch {
      await interaction.editReply(cv2Text('❌ Could not fetch xkcd comic.'));
    }
  },
};

export default Xkcd;
