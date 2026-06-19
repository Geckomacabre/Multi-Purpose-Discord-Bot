import {
  ActionRowBuilder, ApplicationCommandType, ApplicationIntegrationType,
  AttachmentBuilder, ButtonBuilder, ButtonStyle,
  ContextMenuCommandBuilder, InteractionContextType,
  MessageContextMenuCommandInteraction, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { generateQuote } from '../../utils/quote.js';

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
      avatarUrl = member?.displayAvatarURL({ size: 256, extension: 'png' })
        ?? author.displayAvatarURL({ size: 256, extension: 'png' });
    } else {
      avatarUrl = author.displayAvatarURL({ size: 256, extension: 'png' });
    }

    const buf = await generateQuote({
      text,
      authorName: msg.member?.displayName ?? author.globalName ?? author.username,
      authorUsername: author.username,
      authorAvatarUrl: avatarUrl,
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`remove_quote:${interaction.user.id}`)
        .setLabel('Remove my Quote')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );

    await interaction.editReply({
      files: [new AttachmentBuilder(buf, { name: 'quote.png' })],
      components: [row],
    });
  },
};

export default MakeAQuote;
