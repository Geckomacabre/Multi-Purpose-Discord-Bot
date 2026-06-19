import { ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Cat: Command = {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setDescription('Get a random cat picture')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,
  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const res = await fetch('https://api.thecatapi.com/v1/images/search');
    const [data] = await res.json() as any[];
    await interaction.editReply({ embeds: [new EmbedBuilder().setImage(data.url).setColor(0xffa500)] });
  },
};
export default Cat;
