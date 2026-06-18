import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  ContainerBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
  time,
  TimestampStyles,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import he from 'he';

const CATEGORIES = [
  { id: 11, name: 'Film' },
  { id: 12, name: 'Music' },
  { id: 14, name: 'Television' },
  { id: 15, name: 'Video Games' },
  { id: 18, name: 'Computers' },
  { id: 21, name: 'Sports' },
  { id: 23, name: 'History' },
  { id: 22, name: 'Geography' },
  { id: 24, name: 'Politics' },
  { id: 26, name: 'Celebrities' },
  { id: 27, name: 'Animals' },
  { id: 29, name: 'Comics' },
] as const;

const COOLDOWN_MS = 10_000;
const cooldowns = new Map<string, number>();
const activeGames = new Set<string>();

const nicknames = {
  correct: ['wise guy', 'mega brain', 'smarty-pants'],
  wrong: ['ninny', 'ignoramus', 'nitwit', 'moron'],
} as const;

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

function shuffle<T>(arr: T[]) {
  return arr.sort(() => Math.random() - 0.5);
}

function getTimeLimit(difficulty?: string) {
  const base = difficulty === 'easy' ? 20000 : difficulty === 'medium' ? 14000 : difficulty === 'hard' ? 9000 : 12000;
  return base + Math.floor(Math.random() * 4000 - 2000);
}

function buildResultRow(answers: string[], correct: string, pickedIndex: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    answers.map((ans, i) => {
      const isCorrect = ans === correct;
      const isPicked = i === pickedIndex;
      let style = ButtonStyle.Secondary;
      if (isCorrect) style = ButtonStyle.Success;
      else if (isPicked && !isCorrect) style = ButtonStyle.Danger;
      return new ButtonBuilder()
        .setCustomId(`locked_${i}`)
        .setLabel(ans.slice(0, 80))
        .setStyle(style)
        .setDisabled(true);
    }),
  );
}

const Trivia: Command = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Answer a trivia question')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild]) as any,

  async run(interaction: ChatInputCommandInteraction) {
    if (activeGames.has(interaction.user.id)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Hold Tight!')
            .setDescription(
              'You already have an active trivia game. Finish it or wait ~30 seconds for it to expire.',
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const last = cooldowns.get(interaction.user.id) ?? 0;
    const remaining = COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      const retryAt = Math.floor((Date.now() + remaining) / 1000);
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Chill out!'),
        new TextDisplayBuilder().setContent(`You can use this again ${time(retryAt, TimestampStyles.RelativeTime)}`),
      );
      await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    activeGames.add(interaction.user.id);

    try {
      await interaction.deferReply();

      const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      const res = await fetch(`https://opentdb.com/api.php?amount=1&type=multiple&category=${category.id}`);
      const data: any = await res.json();
      const question = data.results?.[0];

      if (!question) {
        await interaction.editReply('No trivia question found. Try again.');
        activeGames.delete(interaction.user.id);
        return;
      }

      const correct = he.decode(question.correct_answer);
      const incorrect: string[] = question.incorrect_answers.map((a: string) => he.decode(a));
      const answers = shuffle([correct, ...incorrect]);
      const timeLimit = getTimeLimit(question.difficulty);

      const buttons = answers.map((ans, i) =>
        new ButtonBuilder()
          .setCustomId(`trivia_${interaction.user.id}_${i}`)
          .setLabel(ans.slice(0, 80))
          .setStyle(ButtonStyle.Primary),
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      const embed = new EmbedBuilder()
        .setDescription(`**${he.decode(question.question)}**\n*You have ${Math.floor(timeLimit / 1000)} seconds to answer*`)
        .addFields(
          { name: 'Difficulty', value: capitalize(question.difficulty), inline: true },
          { name: 'Category', value: category.name, inline: true },
        );

      const msg = await interaction.editReply({ embeds: [embed], components: [row] });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: timeLimit,
      });

      collector.on('collect', async (btn) => {
        if (btn.user.id !== interaction.user.id) {
          await btn.reply({ content: "This isn't your game.", flags: MessageFlags.Ephemeral });
          return;
        }

        const pickedIndex = parseInt(btn.customId.split('_').pop()!);
        const isCorrect = answers[pickedIndex] === correct;
        const pool = isCorrect ? nicknames.correct : nicknames.wrong;
        const nickname = pool[Math.floor(Math.random() * pool.length)];

        await btn.update({
          embeds: [
            embed,
            new EmbedBuilder().setDescription(
              isCorrect
                ? `✅ You got that right, ${nickname}!`
                : `❌ Nope, ${nickname}. The correct answer was **${correct}**`,
            ),
          ],
          components: [buildResultRow(answers, correct, pickedIndex)],
        });

        collector.stop();
      });

      collector.on('end', async (_collected, reason) => {
        activeGames.delete(interaction.user.id);
        cooldowns.set(interaction.user.id, Date.now());
        if (reason !== 'time') return;
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.map((b) => b.setDisabled(true)),
        );
        await interaction.editReply({
          content: "> Guess you didn't want to play trivia after all?",
          components: [disabledRow],
        }).catch(() => {});
      });
    } catch (err) {
      console.error(err);
      activeGames.delete(interaction.user.id);
      await interaction.editReply('Failed to fetch trivia question.').catch(() => {});
    }
  },
};

export default Trivia;
