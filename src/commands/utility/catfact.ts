import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Catfact: Command = {
  data: new SlashCommandBuilder()
    .setName('catfact')
    .setDescription('Get a random cat fact')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const res = await fetch('https://catfact.ninja/fact', { signal: AbortSignal.timeout(8000) });
      const json: any = await res.json();
      await interaction.editReply(`🐱 ${json.fact}`);
    } catch {
      await interaction.editReply('❌ Could not fetch a cat fact right now.');
    }
  },
};

export default Catfact;
