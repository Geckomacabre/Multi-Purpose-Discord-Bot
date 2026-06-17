import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Dogfact: Command = {
  data: new SlashCommandBuilder()
    .setName('dogfact')
    .setDescription('Get a random dog fact')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const res = await fetch('https://dogapi.dog/api/v2/facts?limit=1', { signal: AbortSignal.timeout(8000) });
      const json: any = await res.json();
      const fact = json?.data?.[0]?.attributes?.body ?? 'Dogs are awesome!';
      await interaction.editReply(`🐶 ${fact}`);
    } catch {
      await interaction.editReply('❌ Could not fetch a dog fact right now.');
    }
  },
};

export default Dogfact;
