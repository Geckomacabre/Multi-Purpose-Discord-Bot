import {
  ApplicationCommandType, ApplicationIntegrationType, AttachmentBuilder,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageContextMenuCommandInteraction, MessageFlags,
} from 'discord.js';
import { ContextMenuCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';
import { generateQuote } from '../../utils/quote.js';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

const MakeAQuote: Command = {
  data: new ContextMenuCommandBuilder()
    .setName('Make it a Quote')
    .setType(ApplicationCommandType.Message)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async runMessage(interaction: MessageContextMenuCommandInteraction) {
    const msg = interaction.targetMessage;
    const text = msg.content.trim();

    if (!text) {
      await interaction.reply({ content: '❌ That message has no text to quote.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    const author = msg.author;
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
        authorName: msg.member?.displayName ?? author.username,
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
      const msg2 = err instanceof Error ? err.message : String(err);
      await interaction.editReply(cv2Text(`❌ Failed to generate quote: ${msg2}`));
    }
  },
};

export default MakeAQuote;
