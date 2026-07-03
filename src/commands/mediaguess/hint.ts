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
    const payload = requestHint(interaction.channelId, interaction.user.id);
    if (!payload) {
      await interaction.reply({ content: '❌ There is no active guessing game in this channel.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral } as any);
  },
};

export default Hint;
