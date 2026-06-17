import { ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const QUESTIONS = [
  ['Always be 10 minutes late', 'Always be 20 minutes early'],
  ['Lose all your money', 'Lose all your photos and memories'],
  ['Be able to fly', 'Be able to be invisible'],
  ['Never be able to use your phone again', 'Never be able to watch TV again'],
  ['Live without music', 'Live without movies'],
  ['Always be too hot', 'Always be too cold'],
  ['Be famous but hated', 'Be unknown but loved'],
  ['Have unlimited money but no friends', 'Have amazing friends but always be broke'],
  ['Always have to speak in rhymes', 'Always have to sing what you say'],
  ['Be able to speak every language', 'Be able to play every instrument'],
  ['Never eat sweets again', 'Never eat savoury food again'],
  ['Go back in time 100 years', 'Travel to the future 100 years'],
  ['Have a photographic memory', 'Have an IQ of 200'],
  ['Always know when people are lying', 'Always get away with lying'],
  ['Be the funniest person in the room', 'Be the smartest person in the room'],
];

const Wouldyourather: Command = {
  data: new SlashCommandBuilder()
    .setName('wouldyourather')
    .setDescription('Get a would you rather question')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const [a, b] = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle('🤔 Would You Rather...')
      .addFields(
        { name: '🅰️ Option A', value: a, inline: true },
        { name: '🅱️ Option B', value: b, inline: true },
      );
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    await msg.react('🅰️').catch(() => {});
    await msg.react('🅱️').catch(() => {});
  },
};

export default Wouldyourather;
