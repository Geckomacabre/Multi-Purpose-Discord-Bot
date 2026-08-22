import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';

const REACTIONS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const Poll: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option 3'))
    .addStringOption(o => o.setName('option4').setDescription('Option 4'))
    .addStringOption(o => o.setName('option5').setDescription('Option 5')) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString('question', true);
    const options = [1, 2, 3, 4, 5]
      .map(i => interaction.options.getString(`option${i}`))
      .filter(Boolean) as string[];

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('📊 ' + question)
      .setDescription(options.map((o, i) => `${REACTIONS[i]} ${o}`).join('\n'))
      .setFooter({ text: `Poll by ${interaction.user.tag}` })
      .setTimestamp();

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    for (let i = 0; i < options.length; i++) {
      await msg.react(REACTIONS[i]).catch(() => {});
    }
  },
};

export default Poll;
