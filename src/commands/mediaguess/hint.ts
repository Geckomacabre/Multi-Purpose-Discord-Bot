import {
  ApplicationIntegrationType, ChatInputCommandInteraction,
  InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { requestHint } from '../../utils/mediagame';

const Hint: Command = {
  data: new SlashCommandBuilder()
    .setName('hint')
    .setDescription('Reveal your next clue for the guessing game — private, only you see it')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]),

  async run(interaction: ChatInputCommandInteraction) {
    // Deferred — the music "Extended Snippet" hint downloads and trims audio,
    // which can take longer than Discord's 3-second interaction window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await requestHint(interaction.channelId, interaction.user.id);
    if (!payload) {
      await interaction.editReply({ content: '❌ There is no active guessing game in this channel.' });
      return;
    }
    await interaction.editReply(payload as any);
  },
};

export default Hint;
