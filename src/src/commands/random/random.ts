import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { cv2Text } from '../../utils/components.js';

const IS_CV2 = MessageFlags.IsComponentsV2;

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

function imgContainer(url: string, caption: string, color?: number) {
  const c = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url))
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(caption));
  if (color !== undefined) c.setAccentColor(color);
  return { flags: IS_CV2, components: [c] };
}

const RESPONSES_8BALL = [
  '🟢 It is certain.', '🟢 It is decidedly so.', '🟢 Without a doubt.',
  '🟢 Yes, definitely.', '🟢 You may rely on it.', '🟢 As I see it, yes.',
  '🟢 Most likely.', '🟢 Outlook good.', '🟢 Yes.', '🟢 Signs point to yes.',
  '🟡 Reply hazy, try again.', '🟡 Ask again later.', '🟡 Better not tell you now.',
  '🟡 Cannot predict now.', '🟡 Concentrate and ask again.',
  '🔴 Don\'t count on it.', '🔴 My reply is no.', '🔴 My sources say no.',
  '🔴 Outlook not so good.', '🔴 Very doubtful.',
];

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
  'Somewhere out there, a tree is working overtime producing oxygen for you. Apologize to it.',
  'I\'d call you a tool, but that would imply you were useful.',
];

const WYR_QUESTIONS = [
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

const TOPICS = [
  'What\'s the most underrated movie of the last decade?',
  'If you could have any superpower, what would it be and why?',
  'What\'s the best advice you\'ve ever received?',
  'What would you do if you won the lottery?',
  'What technology from sci-fi do you wish existed today?',
  'If you could travel to any time period, where would you go?',
  'What\'s a skill you\'ve always wanted to learn?',
  'What\'s the most interesting place you\'ve ever visited?',
  'If you could have dinner with any historical figure, who would it be?',
  'What\'s your favourite book and why should others read it?',
  'What hobby do you think everyone should try at least once?',
  'What\'s a controversial opinion you\'re willing to defend?',
  'If you could redesign one thing about how society works, what would it be?',
  'What\'s the most valuable lesson you\'ve learned from a failure?',
  'If you had to live in a different country for a year, where would you choose?',
  'What game — board, video, or otherwise — do you think is the most fun?',
  'If you could only listen to one artist for the rest of your life, who would it be?',
  'What\'s the most impressive thing a human has ever built?',
  'What\'s a common misconception people have?',
];

const QUOTES = [
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Life is what happens when you\'re busy making other plans.', author: 'John Lennon' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
  { text: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
];

const Random: Command = {
  data: new SlashCommandBuilder()
    .setName('random')
    .setDescription('Random fun commands')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    .addSubcommand(s => s.setName('8ball').setDescription('Ask the magic 8-ball a question')
      .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)))
    .addSubcommand(s => s.setName('catfact').setDescription('Get a random cat fact'))
    .addSubcommand(s => s.setName('dogfact').setDescription('Get a random dog fact'))
    .addSubcommand(s => s.setName('dadjoke').setDescription('Get a random dad joke'))
    .addSubcommand(s => s.setName('advice').setDescription('Get a random piece of advice'))
    .addSubcommand(s => s.setName('inspire').setDescription('Get an inspirational quote'))
    .addSubcommand(s => s.setName('topic').setDescription('Get a random conversation topic'))
    .addSubcommand(s => s.setName('wouldyourather').setDescription('Get a would you rather question'))
    .addSubcommand(s => s.setName('xkcd').setDescription('Get a random or specific xkcd comic')
      .addIntegerOption(o => o.setName('number').setDescription('Comic number (omit for random)').setMinValue(1)))
    .addSubcommand(s => s.setName('roast').setDescription('Roast a user (all in good fun!)')
      .addUserOption(o => o.setName('user').setDescription('User to roast (defaults to you)'))) as any,

  async run(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === '8ball') {
      const question = interaction.options.getString('question', true);
      const response = pick(RESPONSES_8BALL);
      await interaction.reply(cv2Text(`**🎱 Magic 8-Ball**\n**Question:** ${question}\n**Answer:** ${response}`, Colors.DarkPurple));
      return;
    }

    if (sub === 'catfact') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://catfact.ninja/fact', { signal: AbortSignal.timeout(8000) });
        const json: any = await res.json();
        await interaction.editReply(cv2Text(`🐱 ${json.fact}`, Colors.Orange));
      } catch {
        await interaction.editReply(cv2Text('❌ Could not fetch a cat fact right now.'));
      }
      return;
    }

    if (sub === 'dogfact') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://dogapi.dog/api/v2/facts?limit=1', { signal: AbortSignal.timeout(8000) });
        const json: any = await res.json();
        const fact = json?.data?.[0]?.attributes?.body ?? 'Dogs are awesome!';
        await interaction.editReply(cv2Text(`🐶 ${fact}`, 0x8b4513));
      } catch {
        await interaction.editReply(cv2Text('❌ Could not fetch a dog fact right now.'));
      }
      return;
    }

    if (sub === 'dadjoke') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://icanhazdadjoke.com/', {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        const json: any = await res.json();
        await interaction.editReply(cv2Text(`😂 ${json.joke}`, Colors.Yellow));
      } catch {
        await interaction.editReply(cv2Text('❌ Could not fetch a joke right now.'));
      }
      return;
    }

    if (sub === 'advice') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://api.adviceslip.com/advice', { signal: AbortSignal.timeout(8000) });
        const json: any = await res.json();
        await interaction.editReply(cv2Text(`💡 *"${json.slip.advice}"*`, Colors.Gold));
      } catch {
        await interaction.editReply(cv2Text('❌ Could not fetch advice right now.'));
      }
      return;
    }

    if (sub === 'inspire') {
      const quote = pick(QUOTES);
      await interaction.reply(cv2Text(`*"${quote.text}"*\n\n— **${quote.author}**`, Colors.Gold));
      return;
    }

    if (sub === 'topic') {
      await interaction.reply(cv2Text(`💬 **Topic:** ${pick(TOPICS)}`));
      return;
    }

    if (sub === 'wouldyourather') {
      const [a, b] = pick(WYR_QUESTIONS);
      const msg = await interaction.reply({
        ...cv2Text(`**🤔 Would You Rather...**\n\n🅰️ **Option A:** ${a}\n🅱️ **Option B:** ${b}`, Colors.Purple),
        fetchReply: true,
      });
      await msg.react('🅰️').catch(() => {});
      await msg.react('🅱️').catch(() => {});
      return;
    }

    if (sub === 'xkcd') {
      await interaction.deferReply();
      try {
        const latest: any = await fetch('https://xkcd.com/info.0.json', { signal: AbortSignal.timeout(8000) }).then(r => r.json());
        const num = interaction.options.getInteger('number') ?? Math.floor(Math.random() * latest.num) + 1;
        const comic: any = num === latest.num ? latest : await fetch(`https://xkcd.com/${num}/info.0.json`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
        await interaction.editReply(imgContainer(
          comic.img,
          `**#${comic.num}: ${comic.title}**\n*${comic.alt.slice(0, 500)}*`,
          Colors.White,
        ));
      } catch {
        await interaction.editReply(cv2Text('❌ Could not fetch xkcd comic.'));
      }
      return;
    }

    if (sub === 'roast') {
      const user = interaction.options.getUser('user') ?? interaction.user;
      await interaction.reply(cv2Text(`🔥 <@${user.id}> — ${pick(ROASTS)}`));
      return;
    }
  },
};

export default Random;
