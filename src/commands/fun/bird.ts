import { ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Bird: Command = {
  data: new SlashCommandBuilder()
    .setName('bird')
    .setDescription('Get a random bird picture')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const res = await fetch('https://some-random-api.com/animal/bird');
    const data = await res.json() as { image: string };
    await interaction.editReply({ embeds: [new EmbedBuilder().setImage(data.image).setColor(0x87ceeb)] });
  },
};
export default Bird;
