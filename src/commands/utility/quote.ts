import {
  ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { generateQuote } from '../../utils/quote.js';
import { selectedMessages } from '../../utils/messageSelection.js';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

async function replyWithQuote(interaction: ChatInputCommandInteraction, opts: {
  text: string;
  authorName: string;
  authorAvatarUrl: string | null;
  guildName?: string;
}) {
  try {
    const buf = await generateQuote(opts);
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
}

const MakeItAQuote: Command = {
  data: new SlashCommandBuilder()
    .setName('makeitaquote')
    .setDescription('Generate a quote image from the message you selected with "Make it a Quote"')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const stored = selectedMessages.get(interaction.user.id);
    if (!stored) {
      await interaction.reply(cv2Text('❌ No message selected. Right-click a message → Apps → **Make it a Quote** first.'));
      return;
    }
    await interaction.deferReply();
    await replyWithQuote(interaction, stored);
  },
};

export default MakeItAQuote;
