import {
  ApplicationIntegrationType, ChatInputCommandInteraction, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder, Colors, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} from 'discord.js';
import { Command } from '../../interfaces/command';

function decode(str: string): string {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
}

const CATEGORIES = [
  { name: 'General Knowledge', value: '9' },
  { name: 'Science', value: '17' },
  { name: 'Sports', value: '21' },
  { name: 'History', value: '23' },
  { name: 'Geography', value: '22' },
  { name: 'Entertainment: Music', value: '12' },
  { name: 'Entertainment: Video Games', value: '15' },
  { name: 'Entertainment: Film', value: '11' },
  { name: 'Mythology', value: '20' },
  { name: 'Technology', value: '18' },
];

const Trivia: Command = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Answer a trivia question')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addStringOption(o =>
      o.setName('category').setDescription('Question category')
        .addChoices(...CATEGORIES.map(c => ({ name: c.name, value: c.value }))))
    .addStringOption(o =>
      o.setName('difficulty').setDescription('Difficulty level')
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' },
        )) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const category = interaction.options.getString('category') ?? '';
    const difficulty = interaction.options.getString('difficulty') ?? '';
    await interaction.deferReply();

    let url = 'https://opentdb.com/api.php?amount=1&type=multiple';
    if (category) url += `&category=${category}`;
    if (difficulty) url += `&difficulty=${difficulty}`;

    const res = await fetch(url);
    const data: any = await res.json();
    if (data.response_code !== 0 || !data.results?.length) {
      await interaction.editReply('Could not fetch a trivia question. Try again.'); return;
    }

    const q = data.results[0];
    const question = decode(q.question);
    const correct = decode(q.correct_answer);
    const incorrect = q.incorrect_answers.map(decode);
    const answers = [...incorrect, correct].sort(() => Math.random() - 0.5);

    const labels = ['A', 'B', 'C', 'D'];
    const correctLabel = labels[answers.indexOf(correct)];

    const diffColors: Record<string, number> = { easy: Colors.Green, medium: Colors.Yellow, hard: Colors.Red };
    const embed = new EmbedBuilder()
      .setColor(diffColors[q.difficulty] ?? Colors.Blue)
      .setTitle(`📚 ${decode(q.category)}`)
      .setDescription(`**${question}**`)
      .addFields(answers.map((a, i) => ({ name: `${labels[i]}`, value: a, inline: true })))
      .setFooter({ text: `Difficulty: ${q.difficulty} • You have 30 seconds` });

    const buttons = answers.map((_, i) =>
      new ButtonBuilder().setCustomId(`trivia_${labels[i]}`).setLabel(labels[i]).setStyle(ButtonStyle.Primary),
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30_000, max: 1 });
    collector.on('collect', async btn => {
      const chosen = btn.customId.replace('trivia_', '');
      const correct_answer = answers[labels.indexOf(correctLabel)];
      const won = chosen === correctLabel;

      const result = embed
        .setColor(won ? Colors.Green : Colors.Red)
        .setDescription(`**${question}**\n\n${won ? '✅ Correct!' : `❌ Wrong! The answer was **${correctLabel}: ${correct_answer}**`}`)
        .setFooter({ text: `Answered by ${btn.user.username}` });

      await btn.update({ embeds: [result], components: [] });
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        const timeout = embed
          .setColor(Colors.Grey)
          .setDescription(`**${question}**\n\n⏰ Time's up! The answer was **${correctLabel}: ${answers[labels.indexOf(correctLabel)]}**`)
          .setFooter({ text: 'No one answered in time' });
        await interaction.editReply({ embeds: [timeout], components: [] }).catch(() => {});
      }
    });
  },
};

export default Trivia;
