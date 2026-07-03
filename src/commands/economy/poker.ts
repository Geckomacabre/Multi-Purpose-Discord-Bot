import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, ComponentType, InteractionContextType, MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';

import { cv2Err } from '../../utils/components.js';
import { newDeck, shuffleDeck, cardStr, evaluatePokerHand, type Card } from '../../utils/cards.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

const PAYTABLE =
  '**Paytable** (multiplier × bet):\n' +
  '`Royal Flush 250x | Straight Flush 50x | Four of a Kind 25x`\n' +
  '`Full House 9x | Flush 6x | Straight 4x | Three of a Kind 3x`\n' +
  '`Two Pair 2x | Jacks or Better 1x`';

function cardLabel(card: Card, held: boolean): string {
  return held ? `[${cardStr(card)}]` : cardStr(card);
}

function buildHoldRows(hand: Card[], held: boolean[]): ActionRowBuilder<ButtonBuilder>[] {
  const cardRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    hand.map((card, i) =>
      new ButtonBuilder()
        .setCustomId(`poker_hold_${i}`)
        .setLabel(cardStr(card))
        .setStyle(held[i] ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );
  const drawRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('poker_draw').setLabel('Draw').setStyle(ButtonStyle.Primary)
  );
  return [cardRow, drawRow];
}

function heldSummary(hand: Card[], held: boolean[]): string {
  return hand.map((c, i) => held[i] ? `**[${cardStr(c)}]**` : cardStr(c)).join('  ');
}

const Poker: Command = {
  data: new SlashCommandBuilder()
    .setName('poker')
    .setDescription('Video Poker (Jacks or Better) — select cards to hold, then draw')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);

    const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
    if (eco.balance < bet) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`)); return;
    }

    const luckMult = await getGambleMultiplier(guildId, userId);

    await interaction.deferReply();

    const deck = shuffleDeck(newDeck());
    let di = 0;
    const draw = (): Card => deck[di++]!;

    const hand: Card[] = Array.from({ length: 5 }, () => draw());
    const held: boolean[] = new Array(5).fill(false);
    const sym = cfg.currency_symbol;

    const msg = await interaction.editReply({
      content:
        `**🃏 Video Poker** — Bet: ${sym} ${bet.toLocaleString()}\n\n` +
        `${heldSummary(hand, held)}\n\n` +
        `Toggle cards to **Hold**, then click **Draw** to replace the rest.\n${PAYTABLE}`,
      components: buildHoldRows(hand, held),
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId,
      time: 60_000,
    });

    collector.on('collect', async (btn) => {
      await btn.deferUpdate();

      if (btn.customId === 'poker_draw') {
        collector.stop('draw');

        // Replace non-held cards straight off the shuffled deck — fair draw.
        for (let i = 0; i < 5; i++) {
          if (!held[i]) hand[i] = draw();
        }

        const result = evaluatePokerHand(hand);
        const isWin = result.multiplier > 0;
        const winAmount = Math.floor(bet * result.multiplier * (isWin ? luckMult : 1));
        const delta = isWin ? winAmount - bet : -bet;
        const { newBalance } = await adjustBalance(guildId, userId, delta);
        recordGameResult(guildId, userId, 'poker', isWin, bet).catch(() => {});
        const refund = isWin ? 0 : await applyLossInsurance(guildId, userId, bet);

        let xpLine = '';
        if (isWin) {
          const xpGiven = await awardBonusXp({
            guildId, userId, baseAmount: Math.min(50 * result.multiplier, 200),
            client: interaction.client, channelId: interaction.channelId, isGame: true,
          });
          xpLine = xpGiven > 0 ? ` +**${xpGiven} XP**!` : '';
        }

        await interaction.editReply({
          content:
            `**🃏 Video Poker** — Bet: ${sym} ${bet.toLocaleString()}\n\n` +
            `${hand.map(cardStr).join('  ')}\n\n` +
            (isWin
              ? `✅ **${result.name}!** You won **${sym} ${winAmount.toLocaleString()}**! *(${result.multiplier}x${luckMult > 1 ? ' 🍀' : ''})*${xpLine}`
              : `❌ **${result.name}** — You lost **${sym} ${bet.toLocaleString()}**.${insuranceLine(sym, refund)}`) +
            `\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**\n${PAYTABLE}`,
          components: [],
        }).catch(() => {});
        return;
      }

      // Toggle hold
      const idx = parseInt(btn.customId.split('_')[2] ?? '0');
      held[idx] = !held[idx];
      await interaction.editReply({
        content:
          `**🃏 Video Poker** — Bet: ${sym} ${bet.toLocaleString()}\n\n` +
          `${heldSummary(hand, held)}\n\n` +
          `Toggle cards to **Hold**, then click **Draw** to replace the rest.\n${PAYTABLE}`,
        components: buildHoldRows(hand, held),
      }).catch(() => {});
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          content:
            `**🃏 Video Poker** — Bet: ${sym} ${bet.toLocaleString()}\n\n` +
            `${hand.map(cardStr).join('  ')}\n\n` +
            `⏰ Timed out — you lost **${sym} ${bet.toLocaleString()}**.`,
          components: [],
        }).catch(() => {});
        await adjustBalance(guildId, userId, -bet);
      }
    });
  },
};

export default Poker;
