import {
  ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, ChatInputCommandInteraction, Colors, EmbedBuilder,
  InteractionContextType, SlashCommandBuilder, TextChannel,
} from 'discord.js';
import { Command } from '../../interfaces/command';

// Simplified card packs
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
  'A windmill full of corpses', 'Extremely tight pants', 'Glenn Beck catching his scrotum in a mousetrap',
  'Seppuku', 'Frolicking', 'Dead babies', 'Home surgery', 'Kale', 'Prancing',
  'A mopey zoo lion', 'The profoundly handicapped', 'Amputees', 'Smegma',
  'The clitoris', 'Poorly-timed Holocaust jokes', 'A disappointing birthday party',
  'Forgetting the safe word', 'A sad handjob', 'My collection of high-tech sex toys',
  'Passive-aggressive Post-it notes', 'Inappropriate yodelling', 'Hot sauce',
  'Explosions', 'Puppies', 'Sunshine and rainbows', 'Inappropriate touching',
  'Genetically engineered super-soldiers', 'Pretzels', 'Getting drunk alone',
  'The Big Bang', 'Elderly Japanese men', 'An asymmetrical haircut',
];

interface CAHGame {
  guildId: string;
  channelId: string;
  hostId: string;
  players: string[];
  round: number;
  blackCard: string;
  submissions: Map<string, string[]>; // userId -> chosen cards
  phase: 'joining' | 'submitting' | 'judging' | 'ended';
  judgeIndex: number;
  handSize: number;
  hands: Map<string, string[]>; // userId -> hand
  messageId: string | null;
}

const games = new Map<string, CAHGame>(); // channelId -> game

function deal(count: number): string[] {
  const shuffled = [...WHITE_CARDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickBlack(): string {
  return BLACK_CARDS[Math.floor(Math.random() * BLACK_CARDS.length)];
}

function blanksNeeded(card: string): number {
  return (card.match(/___/g) ?? []).length || 1;
}

const Cah: Command = {
  data: new SlashCommandBuilder()
    .setName('cah')
    .setDescription('Play Cards Against Humanity')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Start a new CAH game in this channel')
    )
    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Join the current CAH game')
    )
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Start the game (host only)')
    )
    .addSubcommand(sub => sub
      .setName('hand')
      .setDescription('View your current hand')
    )
    .addSubcommand(sub => sub
      .setName('play')
      .setDescription('Play a card from your hand')
      .addIntegerOption(o => o.setName('card').setDescription('Card number from your hand (1-10)').setRequired(true).setMinValue(1).setMaxValue(10))
    )
    .addSubcommand(sub => sub
      .setName('pick')
      .setDescription('Judge: pick the winning submission (by number)')
      .addIntegerOption(o => o.setName('submission').setDescription('Submission number').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('end')
      .setDescription('End the current game (host only)')
    ) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channelId;
    const game = games.get(channelId);

    if (sub === 'create') {
      if (game && game.phase !== 'ended') {
        await interaction.reply({ content: '❌ A game is already running in this channel. Use `/cah end` to stop it.', ephemeral: true }); return;
      }
      const newGame: CAHGame = {
        guildId: interaction.guildId!,
        channelId,
        hostId: interaction.user.id,
        players: [interaction.user.id],
        round: 0,
        blackCard: pickBlack(),
        submissions: new Map(),
        phase: 'joining',
        judgeIndex: 0,
        handSize: 7,
        hands: new Map([[interaction.user.id, deal(7)]]),
        messageId: null,
      };
      games.set(channelId, newGame);

      const embed = new EmbedBuilder()
        .setColor(Colors.DarkButNotBlack)
        .setTitle('🃏 Cards Against Humanity')
        .setDescription(`**${interaction.user.username}** started a game!\nUse \`/cah join\` to join, then \`/cah start\` when ready (min. 3 players).`)
        .addFields({ name: 'Players', value: `<@${interaction.user.id}>` });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (!game || game.phase === 'ended') {
      await interaction.reply({ content: '❌ No active CAH game. Use `/cah create` to start one.', ephemeral: true }); return;
    }

    if (sub === 'join') {
      if (game.phase !== 'joining') { await interaction.reply({ content: '❌ The game has already started.', ephemeral: true }); return; }
      if (game.players.includes(interaction.user.id)) { await interaction.reply({ content: 'You\'re already in the game!', ephemeral: true }); return; }
      game.players.push(interaction.user.id);
      game.hands.set(interaction.user.id, deal(game.handSize));
      await interaction.reply(`✅ <@${interaction.user.id}> joined! Players: ${game.players.map(p => `<@${p}>`).join(', ')}`);
      return;
    }

    if (sub === 'start') {
      if (interaction.user.id !== game.hostId) { await interaction.reply({ content: '❌ Only the host can start the game.', ephemeral: true }); return; }
      if (game.phase !== 'joining') { await interaction.reply({ content: '❌ Game already started.', ephemeral: true }); return; }
      if (game.players.length < 3) { await interaction.reply({ content: '❌ Need at least 3 players to start.', ephemeral: true }); return; }
      game.phase = 'submitting';
      game.round = 1;
      const judge = game.players[game.judgeIndex];
      const needed = blanksNeeded(game.blackCard);
      const embed = new EmbedBuilder()
        .setColor(Colors.DarkButNotBlack)
        .setTitle(`Round ${game.round} — CAH`)
        .addFields(
          { name: '⚫ Black Card', value: game.blackCard },
          { name: '👑 Card Czar', value: `<@${judge}>` },
          { name: 'Cards needed', value: `${needed} white card${needed > 1 ? 's' : ''}` },
        )
        .setDescription('All non-judges: use `/cah hand` to see your cards, then `/cah play <number>` to submit.');
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'hand') {
      const hand = game.hands.get(interaction.user.id);
      if (!hand) { await interaction.reply({ content: '❌ You\'re not in this game.', ephemeral: true }); return; }
      const embed = new EmbedBuilder()
        .setColor(Colors.White)
        .setTitle('Your Hand')
        .setDescription(hand.map((c, i) => `**${i + 1}.** ${c}`).join('\n'));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'play') {
      if (game.phase !== 'submitting') { await interaction.reply({ content: '❌ Not in submission phase.', ephemeral: true }); return; }
      const judge = game.players[game.judgeIndex];
      if (interaction.user.id === judge) { await interaction.reply({ content: '❌ Card Czar cannot play cards.', ephemeral: true }); return; }
      if (!game.players.includes(interaction.user.id)) { await interaction.reply({ content: '❌ You\'re not in this game.', ephemeral: true }); return; }

      const cardIdx = interaction.options.getInteger('card', true) - 1;
      const hand = game.hands.get(interaction.user.id) ?? [];
      if (cardIdx >= hand.length) { await interaction.reply({ content: '❌ Invalid card number.', ephemeral: true }); return; }

      const needed = blanksNeeded(game.blackCard);
      const existing = game.submissions.get(interaction.user.id) ?? [];
      if (existing.length >= needed) { await interaction.reply({ content: '❌ You\'ve already submitted enough cards.', ephemeral: true }); return; }

      const [card] = hand.splice(cardIdx, 1);
      existing.push(card);
      // Refill hand
      if (hand.length < game.handSize) hand.push(...deal(game.handSize - hand.length));
      game.hands.set(interaction.user.id, hand);
      game.submissions.set(interaction.user.id, existing);

      const activePlayers = game.players.filter(p => p !== judge);
      const submitted = activePlayers.filter(p => (game.submissions.get(p)?.length ?? 0) >= needed).length;

      await interaction.reply({ content: `✅ Card played! (${submitted}/${activePlayers.length} submitted)`, ephemeral: true });

      // All submitted — reveal to judge
      if (submitted === activePlayers.length) {
        game.phase = 'judging';
        const entries = activePlayers.map((p, i) => `**${i + 1}.** ${(game.submissions.get(p) ?? []).join(' / ')}`).join('\n');
        const embed = new EmbedBuilder()
          .setColor(Colors.DarkButNotBlack)
          .setTitle('All cards submitted!')
          .addFields(
            { name: '⚫ Black Card', value: game.blackCard },
            { name: '🃏 Submissions', value: entries },
          )
          .setDescription(`<@${judge}> — use \`/cah pick <number>\` to choose the winner!`);
        await interaction.channel?.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (sub === 'pick') {
      if (game.phase !== 'judging') { await interaction.reply({ content: '❌ Not in judging phase.', ephemeral: true }); return; }
      const judge = game.players[game.judgeIndex];
      if (interaction.user.id !== judge) { await interaction.reply({ content: '❌ Only the Card Czar can pick.', ephemeral: true }); return; }

      const pick = interaction.options.getInteger('submission', true) - 1;
      const activePlayers = game.players.filter(p => p !== judge);
      if (pick >= activePlayers.length) { await interaction.reply({ content: '❌ Invalid submission number.', ephemeral: true }); return; }

      const winner = activePlayers[pick];
      const winningCards = game.submissions.get(winner) ?? [];

      await interaction.reply(`🏆 <@${judge}> picks **<@${winner}>**!\n> ${winningCards.join(' / ')}`);

      // Next round
      game.round++;
      game.judgeIndex = (game.judgeIndex + 1) % game.players.length;
      game.submissions.clear();
      game.blackCard = pickBlack();
      game.phase = 'submitting';

      const nextJudge = game.players[game.judgeIndex];
      const needed = blanksNeeded(game.blackCard);
      const embed = new EmbedBuilder()
        .setColor(Colors.DarkButNotBlack)
        .setTitle(`Round ${game.round} — CAH`)
        .addFields(
          { name: '⚫ Black Card', value: game.blackCard },
          { name: '👑 Card Czar', value: `<@${nextJudge}>` },
          { name: 'Cards needed', value: `${needed}` },
        )
        .setDescription('All non-judges: use `/cah play <number>` to submit!');
      await interaction.channel?.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    if (sub === 'end') {
      if (interaction.user.id !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: '❌ Only the host can end the game.', ephemeral: true }); return;
      }
      game.phase = 'ended';
      games.delete(channelId);
      await interaction.reply('🃏 CAH game ended. Thanks for playing!');
    }
  },
};

export default Cah;
