import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Dadjoke: Command = {
  data: new SlashCommandBuilder()
    .setName('dadjoke')
    .setDescription('Get a random dad joke')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const res = await fetch('https://icanhazdadjoke.com/', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const json: any = await res.json();
      await interaction.editReply(`😂 ${json.joke}`);
    } catch {
      await interaction.editReply('❌ Could not fetch a joke right now.');
    }
  },
};

export default Dadjoke;
