import { ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Dog: Command = {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setDescription('Get a random dog picture')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const res = await fetch('https://dog.ceo/api/breeds/image/random');
    const data = await res.json() as { message: string };
    await interaction.editReply({ embeds: [new EmbedBuilder().setImage(data.message).setColor(0x8b4513)] });
  },
};
export default Dog;
