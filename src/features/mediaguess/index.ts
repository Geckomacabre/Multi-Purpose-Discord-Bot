import { ButtonInteraction, Client, MessageFlags } from 'discord.js';
import { EventModule } from '../feature';
import { activeGames, castVoteSkip, checkGuess, requestHint, resolveGame, restoreActiveGames, startGame } from '../../utils/mediagame';
import { awardBonusXp } from '../../utils/xpBonus';
import * as db from '../../utils/db';
import { getActiveBoost, recordGameResult } from '../../utils/db';

// Patterns that indicate normal chat rather than a guess attempt.
// Movie/show titles virtually never match these.
const CHAT_PATTERNS: RegExp[] = [
  /\?$/,                                                       // ends with question mark
  /^(lol|lmao|lmfao|haha+|hehe+|omg|wtf|bruh|bro|gg|lmk|smh|ngl|fr|frl|frfr|imo|imho)\b/i,
  /^(yes|no|yeah|nah|yep|nope|ok|okay|sure|maybe|idk|same|true|facts|cap|no cap|based)$/i,
  /^(nice|cool|damn|dang|wow|woah|whoa|sick|fire|mid|lowkey|highkey)\b/i,
  /^i (think|know|don'?t|feel|heard|saw|watched|seen|remember|bet|guess|give up)/i,
  /^i'(m|ve|d|ll) /i,
  /^(do|did|have|has|can|could|would|should|will|is|are|was|were) (you|we|they|he|she|it)\b/i,
  /^(what|why|how|when|where|who|whose|which) /i,
  /^(this|that|it) (is|was|looks|seems|sounds|feels|has to|must)/i,
  /^(oh|ah|ugh|oof|yikes|damn|rip)\b/i,
  /^no (way|idea|clue|cap)\b/i,
  /^(never|always|literally|actually|honestly|obviously|definitely|probably)\b/i,
  /^(wait|hold on|omg wait)\b/i,
  /^(good|great|bad|awful|amazing|terrible|perfect|wrong)\b/i,
  /^(guys|everyone|somebody|anyone)\b/i,
  /^(i )?give up$/i,
];

function looksLikeChat(text: string): boolean {
  const t = text.trim();
  if (t.length > 80) return true;
  // No latin letters or digits = pure emoji / symbols, not a title guess
  if (!/[a-zA-Z0-9]/.test(t)) return true;
  return CHAT_PATTERNS.some(p => p.test(t));
}

// Full XP is 150 for a guess with zero hints; each hint used docks 25, down to
// a 50 floor. Buying ⚡ Hint Rush from the shop waives the penalty entirely.
const BASE_HINT_XP = 150;
const XP_PER_HINT = 25;
const MIN_HINT_XP = 50;

async function correctGuessXp(guildId: string, userId: string, hintsUsed: number): Promise<number> {
  const rush = await getActiveBoost(guildId, userId, 'guesscd').catch(() => null);
  if (rush) return BASE_HINT_XP;
  return Math.max(MIN_HINT_XP, BASE_HINT_XP - hintsUsed * XP_PER_HINT);
}

const mediaguessModule: EventModule = {
  name: 'mediaguess',
  handlers: {
    messageCreate: async ({ data: [message], bot }) => {
      if (!message.guildId || message.author.bot) return;
      if (!message.content || message.content.startsWith('/') || message.content.length < 2) return;

      const state = activeGames.get(message.channelId);
      if (!state || state.answered) return;

      // Let normal conversation through without reacting — except for music,
      // where real song titles ("Good 4 U", "Wow") collide with these chat
      // heuristics often enough that skipping the filter is the safer call.
      if (state.type !== 'music' && looksLikeChat(message.content)) return;

      const result = checkGuess(message.content.trim(), state.media.title);

      if (result === 'correct') {
        // Lock immediately before any await so concurrent correct guesses can't both win
        if (state.answered) return;
        state.answered = true;

        const hintsUsed = state.userHints.get(message.author.id) ?? 0;
        const baseAmount = await correctGuessXp(message.guildId, message.author.id, hintsUsed);
        const xpGained = await awardBonusXp({
          guildId: message.guildId,
          userId: message.author.id,
          baseAmount,
          client: bot,
          channelId: message.channelId,
          isGame: true,
        });

        recordGameResult(message.guildId, message.author.id, `mediaguess_${state.type}`, true, 0).catch(() => {});

        await message.react('✅').catch(() => {});
        if (xpGained > 0) {
          await message.reply(`+${xpGained} XP 🎉`).catch(() => {});
        }
        const winnerName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
        await resolveGame(state, bot, { id: message.author.id, name: winnerName }, 'correct');
      } else if (result === 'very_close') {
        await message.react('‼️').catch(() => {});
      } else if (result === 'close') {
        await message.react('❗').catch(() => {});
      }
    },

    interactionCreate: async ({ data: [interaction] }) => {
      if (!interaction.isButton()) return;
      const btn = interaction as ButtonInteraction;
      if (btn.customId !== 'mg_hint' && btn.customId !== 'mg_voteskip') return;

      if (btn.customId === 'mg_hint') {
        // Deferred — the music "Extended Snippet" hint downloads and trims
        // audio, which can take longer than Discord's 3-second interaction window.
        await btn.deferReply({ flags: MessageFlags.Ephemeral });
        const payload = await requestHint(btn.channelId, btn.user.id);
        if (!payload) {
          await btn.editReply({ content: '❌ There is no active guessing game in this channel.' });
          return;
        }
        await btn.editReply(payload as any);
        return;
      }

      // mg_voteskip
      const { content, ephemeral } = await castVoteSkip(btn.channelId, btn.user.id, btn.client);
      await btn.reply({ content, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    },
  },
};

export default mediaguessModule;

// Movie/TV need TMDB, games need RAWG — music (Deezer) needs no key at all.
// Each type is gated independently so a missing key only disables that one
// mode instead of blocking every guessing game in the server.
async function startIfConfigured(guildId: string, channelId: string | null, type: 'movie' | 'tv' | 'game' | 'music', client: Client): Promise<void> {
  if (!channelId || activeGames.has(channelId)) return;
  if ((type === 'movie' || type === 'tv') && !Bun.env.TMDB_API_KEY) {
    console.warn(`[mediaguess] TMDB_API_KEY not set — ${type} guessing disabled`);
    return;
  }
  if (type === 'game' && !Bun.env.RAWG_API_KEY) {
    console.warn('[mediaguess] RAWG_API_KEY not set — game guessing disabled');
    return;
  }
  await startGame(guildId, channelId, type, client).catch(console.error);
}

export async function startMediaGames(client: Client): Promise<void> {
  // Resume any round that was still in progress before the restart, so
  // configured channels don't get force-reset to a brand new round.
  await restoreActiveGames(client);

  const configs = await db.getAllMediaGuessConfigs();
  for (const cfg of configs) {
    await startIfConfigured(cfg.guild_id, cfg.movie_channel_id, 'movie', client);
    await startIfConfigured(cfg.guild_id, cfg.tv_channel_id, 'tv', client);
    await startIfConfigured(cfg.guild_id, cfg.game_channel_id, 'game', client);
    await startIfConfigured(cfg.guild_id, cfg.music_channel_id, 'music', client);
  }
}
