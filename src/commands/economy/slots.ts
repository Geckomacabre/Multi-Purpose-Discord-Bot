import {
  ApplicationIntegrationType, ChatInputCommandInteraction, Colors,
  ContainerBuilder, InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { randInt, rand, getHouseCut } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

const REEL = ['🍒','🍒','🍒','🍒','🍒','🍋','🍋','🍋','🍋','🔔','🔔','🔔','💎','💎','7️⃣'];
const SLOT_MULTIPLIERS: Record<string, number> = { '7️⃣': 10, '💎': 5, '🔔': 3, '🍋': 2, '🍒': 1.5 };
function spinReel() { return REEL[randInt(0, REEL.length - 1)]; }

const Slots: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine — match 3 to win!')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);
    const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
    if (eco.balance < bet) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Your balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`)); return;
    }
    const sym = cfg.currency_symbol;
    const reels = [spinReel(), spinReel(), spinReel()];
    // Apply house cut before showing result: re-spin middle reel to visually break the match
    if (reels[0] === reels[1] && reels[1] === reels[2] && rand() < getHouseCut(bet)) {
      do { reels[1] = spinReel(); } while (reels[1] === reels[0]);
    }
    const isJackpot = reels[0] === reels[1] && reels[1] === reels[2];
    const multiplier = isJackpot ? (SLOT_MULTIPLIERS[reels[0]] ?? 1) : 0;
    const luckMult = multiplier > 0 ? await getGambleMultiplier(guildId, userId) : 1;
    const winnings = Math.floor(bet * multiplier * luckMult);
    const delta = winnings > 0 ? winnings - bet : -bet;
    const { newBalance } = await adjustBalance(guildId, userId, delta);
    recordGameResult(guildId, userId, 'slots', multiplier > 0, bet).catch(() => {});
    const refund = multiplier > 0 ? 0 : await applyLossInsurance(guildId, userId, bet);
    let xpLine = '';
    if (multiplier > 0) {
      const baseXp = Math.min(50 + Math.floor(multiplier * 20), 200);
      const xpGiven = await awardBonusXp({
        guildId, userId, baseAmount: baseXp,
        client: interaction.client, channelId: interaction.channelId, isGame: true,
      });
      xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
    }
    const label = isJackpot ? `**JACKPOT!** Triple ${reels[0]}` : 'No match — better luck next time!';
    const container = new ContainerBuilder()
      .setAccentColor(multiplier > 0 ? Colors.Gold : Colors.Red)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**🎰 Slots**\n${reels.join(' ｜ ')}\n${label}\n${multiplier > 0 ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}` : `You lost **${sym} ${bet.toLocaleString()}**.`}${insuranceLine(sym, refund)}\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**\n*🍒×3=1.5x | 🍋×3=2x | 🔔×3=3x | 💎×3=5x | 7️⃣×3=10x*${xpLine}`
      ));
    await interaction.reply({ flags: IS_CV2, components: [container] });
  },
};

export default Slots;
