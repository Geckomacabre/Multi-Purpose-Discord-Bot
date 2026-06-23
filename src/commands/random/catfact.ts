import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

const CatFact: Command = {
  data: new SlashCommandBuilder()
    .setName('catfact')
    .setDescription('Get a random cat fact')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]),

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const res = await fetch('https://catfact.ninja/fact', { signal: AbortSignal.timeout(8000) });
      const json: any = await res.json();
      await interaction.editReply(cv2Text(`🐱 ${json.fact}`, Colors.Orange));
    } catch {
      await interaction.editReply(cv2Text('❌ Could not fetch a cat fact right now.'));
    }
  },
};

export default CatFact;
