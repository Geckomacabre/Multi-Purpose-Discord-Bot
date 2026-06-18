import { ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const Advice: Command = {
  data: new SlashCommandBuilder()
    .setName('advice')
    .setDescription('Get a random piece of advice')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const res = await fetch('https://api.adviceslip.com/advice', { signal: AbortSignal.timeout(8000) });
      const json: any = await res.json();
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('💡 Advice')
        .setDescription(`*"${json.slip.advice}"*`);
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Could not fetch advice right now.');
    }
  },
};

export default Advice;
