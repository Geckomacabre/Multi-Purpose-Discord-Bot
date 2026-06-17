import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Command } from '../../interfaces/command';

const ROASTS = [
  'You\'re the reason they put instructions on shampoo.',
  'You\'re proof that evolution can go in reverse.',
  'I\'d agree with you, but then we\'d both be wrong.',
  'You bring everyone so much joy... when you leave the room.',
  'You\'re not stupid; you just have bad luck thinking.',
  'If laughter is the best medicine, your face must be curing diseases.',
  'I\'ve seen people like you before, but I had to pay an admission fee.',
  'You\'re as useless as the \'ueue\' in \'queue\'.',
  'I could eat a bowl of alphabet soup and spit out a smarter sentence than you.',
  'You\'re the human equivalent of a participation trophy.',
  'You\'re not the dumbest person alive, but you\'d better hope they don\'t die.',
  'Somewhere out there, a tree is working overtime producing oxygen for you. Apologize to it.',
  'I\'d call you a tool, but that would imply you were useful.',
];

const Roast: Command = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Roast a user (all in good fun!)')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addUserOption(o => o.setName('user').setDescription('User to roast (defaults to you)')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
    await interaction.reply(`🔥 <@${user.id}> — ${roast}`);
  },
};

export default Roast;
