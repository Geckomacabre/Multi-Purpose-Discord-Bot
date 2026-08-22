import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Colors, ComponentType, ContainerBuilder,
  EmbedBuilder, InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags, SlashCommandBuilder, TextDisplayBuilder,
  time, TimestampStyles,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import he from 'he';

const IS_CV2 = MessageFlags.IsComponentsV2;

// ── CAH State ────────────────────────────────────────────────────────────────

const BLACK_CARDS = [
  'I drink to forget ___.',
  'What ended my last relationship? ___.',
  'What\'s my secret power? ___.',
  'During sex I like to think about ___.',
  '___: good to the last drop.',
  'What do old people smell like? ___.',
  'What\'s that smell? ___.',
  'I got 99 problems but ___ ain\'t one.',
  '___ is now a competitive sport.',
  'What\'s the most emo? ___.',
  'Step 1: ___. Step 2: ___. Step 3: Profit.',
  'Studies show that ___ causes cancer.',
  '___ — kid-tested, mother-approved.',
  'What\'s the next Happy Meal toy? ___.',
  'What did I bring back from Mexico? ___.',
];

const WHITE_CARDS = [
  'A windmill full of corpses', 'Extremely tight pants',
  'Glenn Beck catching his scrotum in a mousetrap', 'Seppuku', 'Frolicking',
  'Dead babies', 'Home surgery', 'Kale', 'Prancing', 'A mopey zoo lion',
  'The profoundly handicapped', 'Amputees', 'Smegma', 'The clitoris',
  'Poorly-timed Holocaust jokes', 'A disappointing birthday party',
  'Forgetting the safe word', 'A sad handjob', 'My collection of high-tech sex toys',
  'Passive-aggressive Post-it notes', 'Inappropriate yodelling', 'Hot sauce',
  'Explosions', 'Puppies', 'Sunshine and rainbows', 'Inappropriate touching',
  'Genetically engineered super-soldiers', 'Pretzels', 'Getting drunk alone',
  'The Big Bang', 'Elderly Japanese men', 'An asymmetrical haircut',
];

interface CAHGame {
  hostId: string; players: string[]; round: number; blackCard: string;
  submissions: Map<string, string[]>; phase: 'joining' | 'submitting' | 'judging' | 'ended';
  judgeIndex: number; handSize: number; hands: Map<string, string[]>;
}
const cahGames = new Map<string, CAHGame>();

function deal(count: number) { return [...WHITE_CARDS].sort(() => Math.random() - 0.5).slice(0, count); }
function pickBlack() { return BLACK_CARDS[Math.floor(Math.random() * BLACK_CARDS.length)]; }
function blanksNeeded(card: string) { return (card.match(/___/g) ?? []).length || 1; }

// ── Trivia State ─────────────────────────────────────────────────────────────

const TRIVIA_CATEGORIES = [
  { id: 11, name: 'Film' }, { id: 12, name: 'Music' }, { id: 14, name: 'Television' },
  { id: 15, name: 'Video Games' }, { id: 18, name: 'Computers' }, { id: 21, name: 'Sports' },
  { id: 23, name: 'History' }, { id: 22, name: 'Geography' }, { id: 24, name: 'Politics' },
  { id: 26, name: 'Celebrities' }, { id: 27, name: 'Animals' }, { id: 29, name: 'Comics' },
] as const;

const TRIVIA_COOLDOWN = 10_000;
const triviaCooldowns = new Map<string, number>();
const triviaActive = new Set<string>();

function triviaTimeLimit(difficulty?: string) {
  const base = difficulty === 'easy' ? 20000 : difficulty === 'medium' ? 14000 : 9000;
  return base + Math.floor(Math.random() * 4000 - 2000);
}

function buildResultRow(answers: string[], correct: string, pickedIndex: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    answers.map((ans, i) => new ButtonBuilder()
      .setCustomId(`locked_${i}`).setLabel(ans.slice(0, 80))
      .setStyle(ans === correct ? ButtonStyle.Success : i === pickedIndex ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(true)
    ),
  );
}

// ── Command ──────────────────────────────────────────────────────────────────

const Fun: Command = {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Fun and entertainment commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addSubcommand(s => s.setName('cat').setDescription('Get a random cat picture'))
    .addSubcommand(s => s.setName('dog').setDescription('Get a random dog picture'))
    .addSubcommand(s => s.setName('bird').setDescription('Get a random bird picture'))
    .addSubcommand(s => s.setName('gif').setDescription('Search for a GIF using Tenor')
      .addStringOption(o => o.setName('query').setDescription('What to search for').setRequired(true)))
    .addSubcommand(s => s.setName('trivia').setDescription('Answer a random trivia question'))
    .addSubcommandGroup(g => g.setName('cah').setDescription('Cards Against Humanity')
      .addSubcommand(s => s.setName('create').setDescription('Start a new CAH game in this channel'))
      .addSubcommand(s => s.setName('join').setDescription('Join the current CAH game'))
      .addSubcommand(s => s.setName('start').setDescription('Start the game (host only, min 3 players)'))
      .addSubcommand(s => s.setName('hand').setDescription('View your current hand (private)'))
      .addSubcommand(s => s.setName('play').setDescription('Play a card from your hand')
        .addIntegerOption(o => o.setName('card').setDescription('Card number from your hand').setRequired(true).setMinValue(1).setMaxValue(10)))
      .addSubcommand(s => s.setName('pick').setDescription('Judge: pick the winning submission')
        .addIntegerOption(o => o.setName('submission').setDescription('Submission number').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('end').setDescription('End the current game (host only)'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    // ── /fun cat ──────────────────────────────────────────────────────────────
    if (sub === 'cat') {
      await interaction.deferReply();
      const res = await fetch('https://api.thecatapi.com/v1/images/search');
      const [data] = await res.json() as any[];
      const container = new ContainerBuilder().setAccentColor(0xffa500)
        .addMediaGalleryComponents(new MediaGalleryBuilder()
          .addItems(new MediaGalleryItemBuilder().setURL(data.url)));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
      return;
    }

    // ── /fun dog ──────────────────────────────────────────────────────────────
    if (sub === 'dog') {
      await interaction.deferReply();
      const res = await fetch('https://dog.ceo/api/breeds/image/random');
      const data = await res.json() as { message: string };
      const container = new ContainerBuilder().setAccentColor(0x8b4513)
        .addMediaGalleryComponents(new MediaGalleryBuilder()
          .addItems(new MediaGalleryItemBuilder().setURL(data.message)));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
      return;
    }

    // ── /fun bird ─────────────────────────────────────────────────────────────
    if (sub === 'bird') {
      await interaction.deferReply();
      const res = await fetch('https://some-random-api.com/animal/bird');
      const data = await res.json() as { image: string };
      const container = new ContainerBuilder().setAccentColor(0x87ceeb)
        .addMediaGalleryComponents(new MediaGalleryBuilder()
          .addItems(new MediaGalleryItemBuilder().setURL(data.image)));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
      return;
    }

    // ── /fun gif ──────────────────────────────────────────────────────────────
    if (sub === 'gif') {
      const apiKey = Bun.env.TENOR_API_KEY;
      if (!apiKey) {
        await interaction.reply({ ...cv2Text('⚠️ `TENOR_API_KEY` is not set in `.env`.'), flags: IS_CV2 | MessageFlags.Ephemeral }); return;
      }
      const query = interaction.options.getString('query', true);
      await interaction.deferReply();
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${apiKey}&limit=20&media_filter=gif&contentfilter=medium`);
      if (!res.ok) { await interaction.editReply(cv2Text('Failed to fetch GIFs. Try again later.')); return; }
      const data: any = await res.json();
      if (!data.results?.length) { await interaction.editReply(cv2Text(`No GIFs found for **${query}**.`)); return; }
      const result = data.results[Math.floor(Math.random() * data.results.length)];
      const gifUrl: string = result.media_formats?.gif?.url ?? result.media_formats?.tinygif?.url ?? '';
      if (!gifUrl) { await interaction.editReply(cv2Text('Could not extract GIF URL.')); return; }
      const container = new ContainerBuilder().setAccentColor(Colors.Purple)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🎞️ ${query}**`))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(gifUrl)));
      await interaction.editReply({ flags: IS_CV2, components: [container] });
      return;
    }

    // ── /fun trivia ───────────────────────────────────────────────────────────
    if (sub === 'trivia') {
      if (triviaActive.has(interaction.user.id)) {
        await interaction.reply({ content: 'You already have an active trivia game!', flags: MessageFlags.Ephemeral }); return;
      }
      const last = triviaCooldowns.get(interaction.user.id) ?? 0;
      const remaining = TRIVIA_COOLDOWN - (Date.now() - last);
      if (remaining > 0) {
        const retryAt = Math.floor((Date.now() + remaining) / 1000);
        const container = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Chill out!\nYou can use this again ${time(retryAt, TimestampStyles.RelativeTime)}`));
        await interaction.reply({ components: [container], flags: IS_CV2 }); return;
      }
      triviaActive.add(interaction.user.id);
      try {
        await interaction.deferReply();
        const category = TRIVIA_CATEGORIES[Math.floor(Math.random() * TRIVIA_CATEGORIES.length)];
        const res = await fetch(`https://opentdb.com/api.php?amount=1&type=multiple&category=${category.id}`);
        const data: any = await res.json();
        const question = data.results?.[0];
        if (!question) { await interaction.editReply('No trivia question found. Try again.'); triviaActive.delete(interaction.user.id); return; }
        const correct = he.decode(question.correct_answer);
        const answers = [correct, ...question.incorrect_answers.map((a: string) => he.decode(a))].sort(() => Math.random() - 0.5);
        const timeLimit = triviaTimeLimit(question.difficulty);
        const buttons = answers.map((ans, i) =>
          new ButtonBuilder().setCustomId(`trivia_${interaction.user.id}_${i}`).setLabel(ans.slice(0, 80)).setStyle(ButtonStyle.Primary)
        );
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        const diff = question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1).toLowerCase();
        const embed = new EmbedBuilder()
          .setDescription(`**${he.decode(question.question)}**\n*You have ${Math.floor(timeLimit / 1000)} seconds to answer*`)
          .addFields({ name: 'Difficulty', value: diff, inline: true }, { name: 'Category', value: category.name, inline: true });
        const msg = await interaction.editReply({ embeds: [embed], components: [row] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: timeLimit });
        collector.on('collect', async (btn) => {
          if (btn.user.id !== interaction.user.id) { await btn.reply({ content: "This isn't your game.", flags: MessageFlags.Ephemeral }); return; }
          const pickedIndex = parseInt(btn.customId.split('_').pop()!);
          const isCorrect = answers[pickedIndex] === correct;
          const nicknames = isCorrect ? ['wise guy', 'mega brain', 'smarty-pants'] : ['ninny', 'ignoramus', 'nitwit', 'moron'];
          const nickname = nicknames[Math.floor(Math.random() * nicknames.length)];
          await btn.update({
            embeds: [embed, new EmbedBuilder().setDescription(isCorrect ? `✅ You got that right, ${nickname}!` : `❌ Nope, ${nickname}. The correct answer was **${correct}**`)],
            components: [buildResultRow(answers, correct, pickedIndex)],
          });
          collector.stop();
        });
        collector.on('end', async (_c, reason) => {
          triviaActive.delete(interaction.user.id);
          triviaCooldowns.set(interaction.user.id, Date.now());
          if (reason !== 'time') return;
          await interaction.editReply({ content: "> Guess you didn't want to play trivia after all?", components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.map(b => b.setDisabled(true)))] }).catch(() => {});
        });
      } catch { triviaActive.delete(interaction.user.id); await interaction.editReply('Failed to fetch trivia question.').catch(() => {}); }
      return;
    }

    // ── /fun cah ──────────────────────────────────────────────────────────────
    if (group === 'cah') {
      const channelId = interaction.channelId;
      const game = cahGames.get(channelId);

      if (sub === 'create') {
        if (game && game.phase !== 'ended') {
          await interaction.reply({ content: '❌ A game is already running. Use `/fun cah end` to stop it.', flags: MessageFlags.Ephemeral }); return;
        }
        cahGames.set(channelId, {
          hostId: interaction.user.id, players: [interaction.user.id], round: 0,
          blackCard: pickBlack(), submissions: new Map(), phase: 'joining',
          judgeIndex: 0, handSize: 7, hands: new Map([[interaction.user.id, deal(7)]]),
        });
        await interaction.reply({ embeds: [
          new EmbedBuilder().setColor(Colors.DarkButNotBlack).setTitle('🃏 Cards Against Humanity')
            .setDescription(`**${interaction.user.username}** started a game!\nUse \`/fun cah join\` to join, then \`/fun cah start\` when ready (min. 3 players).`)
            .addFields({ name: 'Players', value: `<@${interaction.user.id}>` }),
        ] });
        return;
      }

      if (!game || game.phase === 'ended') {
        await interaction.reply({ content: '❌ No active CAH game. Use `/fun cah create` to start one.', flags: MessageFlags.Ephemeral }); return;
      }

      if (sub === 'join') {
        if (game.phase !== 'joining') { await interaction.reply({ content: '❌ The game has already started.', flags: MessageFlags.Ephemeral }); return; }
        if (game.players.includes(interaction.user.id)) { await interaction.reply({ content: "You're already in the game!", flags: MessageFlags.Ephemeral }); return; }
        game.players.push(interaction.user.id);
        game.hands.set(interaction.user.id, deal(game.handSize));
        await interaction.reply(`✅ <@${interaction.user.id}> joined! Players: ${game.players.map(p => `<@${p}>`).join(', ')}`);
        return;
      }
      if (sub === 'start') {
        if (interaction.user.id !== game.hostId) { await interaction.reply({ content: '❌ Only the host can start the game.', flags: MessageFlags.Ephemeral }); return; }
        if (game.phase !== 'joining') { await interaction.reply({ content: '❌ Game already started.', flags: MessageFlags.Ephemeral }); return; }
        if (game.players.length < 3) { await interaction.reply({ content: '❌ Need at least 3 players to start.', flags: MessageFlags.Ephemeral }); return; }
        game.phase = 'submitting'; game.round = 1;
        const judge = game.players[game.judgeIndex];
        const needed = blanksNeeded(game.blackCard);
        await interaction.reply({ embeds: [
          new EmbedBuilder().setColor(Colors.DarkButNotBlack).setTitle(`Round ${game.round} — CAH`)
            .addFields({ name: '⚫ Black Card', value: game.blackCard }, { name: '👑 Card Czar', value: `<@${judge}>` }, { name: 'Cards needed', value: `${needed}` })
            .setDescription('All non-judges: use `/fun cah hand` to see your cards, then `/fun cah play <number>` to submit.'),
        ] });
        return;
      }
      if (sub === 'hand') {
        const hand = game.hands.get(interaction.user.id);
        if (!hand) { await interaction.reply({ content: "❌ You're not in this game.", flags: MessageFlags.Ephemeral }); return; }
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.White).setTitle('Your Hand').setDescription(hand.map((c, i) => `**${i + 1}.** ${c}`).join('\n'))], flags: MessageFlags.Ephemeral });
        return;
      }
      if (sub === 'play') {
        if (game.phase !== 'submitting') { await interaction.reply({ content: '❌ Not in submission phase.', flags: MessageFlags.Ephemeral }); return; }
        const judge = game.players[game.judgeIndex];
        if (interaction.user.id === judge) { await interaction.reply({ content: '❌ Card Czar cannot play cards.', flags: MessageFlags.Ephemeral }); return; }
        if (!game.players.includes(interaction.user.id)) { await interaction.reply({ content: "❌ You're not in this game.", flags: MessageFlags.Ephemeral }); return; }
        const cardIdx = interaction.options.getInteger('card', true) - 1;
        const hand = game.hands.get(interaction.user.id) ?? [];
        if (cardIdx >= hand.length) { await interaction.reply({ content: '❌ Invalid card number.', flags: MessageFlags.Ephemeral }); return; }
        const needed = blanksNeeded(game.blackCard);
        const existing = game.submissions.get(interaction.user.id) ?? [];
        if (existing.length >= needed) { await interaction.reply({ content: '❌ You\'ve already submitted enough cards.', flags: MessageFlags.Ephemeral }); return; }
        const [card] = hand.splice(cardIdx, 1);
        existing.push(card);
        if (hand.length < game.handSize) hand.push(...deal(game.handSize - hand.length));
        game.hands.set(interaction.user.id, hand);
        game.submissions.set(interaction.user.id, existing);
        const activePlayers = game.players.filter(p => p !== judge);
        const submitted = activePlayers.filter(p => (game.submissions.get(p)?.length ?? 0) >= needed).length;
        await interaction.reply({ content: `✅ Card played! (${submitted}/${activePlayers.length} submitted)`, flags: MessageFlags.Ephemeral });
        if (submitted === activePlayers.length) {
          game.phase = 'judging';
          const entries = activePlayers.map((p, i) => `**${i + 1}.** ${(game.submissions.get(p) ?? []).join(' / ')}`).join('\n');
          await interaction.channel?.send({ embeds: [
            new EmbedBuilder().setColor(Colors.DarkButNotBlack).setTitle('All cards submitted!')
              .addFields({ name: '⚫ Black Card', value: game.blackCard }, { name: '🃏 Submissions', value: entries })
              .setDescription(`<@${judge}> — use \`/fun cah pick <number>\` to choose the winner!`),
          ] }).catch(() => {});
        }
        return;
      }
      if (sub === 'pick') {
        if (game.phase !== 'judging') { await interaction.reply({ content: '❌ Not in judging phase.', flags: MessageFlags.Ephemeral }); return; }
        const judge = game.players[game.judgeIndex];
        if (interaction.user.id !== judge) { await interaction.reply({ content: '❌ Only the Card Czar can pick.', flags: MessageFlags.Ephemeral }); return; }
        const pick = interaction.options.getInteger('submission', true) - 1;
        const activePlayers = game.players.filter(p => p !== judge);
        if (pick >= activePlayers.length) { await interaction.reply({ content: '❌ Invalid submission number.', flags: MessageFlags.Ephemeral }); return; }
        const winner = activePlayers[pick];
        const winningCards = game.submissions.get(winner) ?? [];
        await interaction.reply(`🏆 <@${judge}> picks **<@${winner}>**!\n> ${winningCards.join(' / ')}`);
        game.round++; game.judgeIndex = (game.judgeIndex + 1) % game.players.length;
        game.submissions.clear(); game.blackCard = pickBlack(); game.phase = 'submitting';
        const nextJudge = game.players[game.judgeIndex];
        const needed = blanksNeeded(game.blackCard);
        await interaction.channel?.send({ embeds: [
          new EmbedBuilder().setColor(Colors.DarkButNotBlack).setTitle(`Round ${game.round} — CAH`)
            .addFields({ name: '⚫ Black Card', value: game.blackCard }, { name: '👑 Card Czar', value: `<@${nextJudge}>` }, { name: 'Cards needed', value: `${needed}` })
            .setDescription('All non-judges: use `/fun cah play <number>` to submit!'),
        ] }).catch(() => {});
        return;
      }
      if (sub === 'end') {
        if (interaction.user.id !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) {
          await interaction.reply({ content: '❌ Only the host can end the game.', flags: MessageFlags.Ephemeral }); return;
        }
        game.phase = 'ended';
        cahGames.delete(channelId);
        await interaction.reply('🃏 CAH game ended. Thanks for playing!');
      }
    }
  },
};

function cv2Text(content: string) {
  return { flags: IS_CV2, components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))] };
}

export default Fun;
