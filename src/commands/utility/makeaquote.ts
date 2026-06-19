import {
  ApplicationCommandType, ApplicationIntegrationType, ContextMenuCommandBuilder,
  InteractionContextType, MessageContextMenuCommandInteraction, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { selectedMessages } from '../../utils/messageSelection.js';

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

    const author = msg.author;
    let avatarUrl: string | null = null;
    if (interaction.inGuild()) {
      const member = await interaction.guild!.members.fetch(author.id).catch(() => null);
      avatarUrl = member?.displayAvatarURL({ size: 64, extension: 'png' }) ?? author.displayAvatarURL({ size: 64, extension: 'png' });
    } else {
      avatarUrl = author.displayAvatarURL({ size: 64, extension: 'png' });
    }

    selectedMessages.set(interaction.user.id, {
      text,
      authorName: msg.member?.displayName ?? author.username,
      authorAvatarUrl: avatarUrl,
      guildName: interaction.guild?.name,
    });

    await interaction.reply({
      content: '✅ Message selected! Now run `/makeitaquote` to generate the quote image.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default MakeAQuote;
