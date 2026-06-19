import {
  ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { generateQuote } from '../../utils/quote.js';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const Quote: Command = {
  data: new SlashCommandBuilder()
    .setName('quote')
    .setDescription('Generate a quote image')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addStringOption(o => o.setName('text').setDescription('The quote text').setRequired(true))
    .addUserOption(o => o.setName('author').setDescription('Who said it (defaults to you)')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const text = interaction.options.getString('text', true);
    const author = interaction.options.getUser('author') ?? interaction.user;

    let avatarUrl: string | null = null;
    if (interaction.inGuild()) {
      const member = await interaction.guild!.members.fetch(author.id).catch(() => null);
      avatarUrl = member?.displayAvatarURL({ size: 64, extension: 'png' }) ?? author.displayAvatarURL({ size: 64, extension: 'png' });
    } else {
      avatarUrl = author.displayAvatarURL({ size: 64, extension: 'png' });
    }

    try {
      const buf = await generateQuote({
        text,
        authorName: author.displayName ?? author.username,
        authorAvatarUrl: avatarUrl,
        guildName: interaction.guild?.name,
      });

      const container = new ContainerBuilder()
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://quote.png')));
      await interaction.editReply({
        flags: IS_CV2,
        files: [new AttachmentBuilder(buf, { name: 'quote.png' })],
        components: [container],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(cv2Text(`❌ Failed to generate quote: ${msg}`));
    }
  },
};

export default Quote;
