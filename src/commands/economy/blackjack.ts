import {
  ActionRowBuilder, ApplicationIntegrationType, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Colors, ComponentType, ContainerBuilder, InteractionContextType,
  MediaGalleryBuilder, MediaGalleryItemBuilder, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { randInt } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';
import { newDeck, shuffleDeck, handStr, bjHandValue, type Card } from '../../utils/cards.js';
import { applyLossInsurance, insuranceLine, settleJackpot, jackpotLine } from '../../utils/gamble.js';
import { renderTable } from '../../utils/cardRender.js';

type Outcome = 'win' | 'blackjack' | 'push' | 'lose';

const TABLE_NAME = 'blackjack.jpg';

/**
 * Renders the felt as an image alongside the text. Blackjack is interactive, so
 * a fresh table is drawn per decision (2–5 per hand) rather than one animation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bjPanel(
  playerHand: Card[], dealerHand: Card[], hideHole: boolean,
  content: string, color: number, rows?: ActionRowBuilder<ButtonBuilder>,
): any {
  const png = renderTable([
    {
      label: 'Dealer', cards: dealerHand,
      hideFrom: hideHole ? 1 : undefined,
      note: hideHole ? `${bjHandValue([dealerHand[0]!])}+` : `${bjHandValue(dealerHand)}`,
    },
    { label: 'You', cards: playerHand, note: `${bjHandValue(playerHand)}` },
  ], '🃏 BLACKJACK');

  const c = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${TABLE_NAME}`),
    ));
  if (rows) c.addActionRowComponents(rows);
  return { flags: IS_CV2, components: [c], files: [new AttachmentBuilder(png, { name: TABLE_NAME })] };
}

function buildButtons(canDouble: boolean, sym: string, bet: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('bj_double')
      .setLabel(`Double Down (${sym} ${bet.toLocaleString()})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canDouble),
  );
}

function gameContent(
  playerHand: Card[], dealerHand: Card[], activeBet: number,
  sym: string, hideHole: boolean,
): string {
  const dealerDisplay = hideHole
    ? `${handStr([dealerHand[0]!])} ??  *(${bjHandValue([dealerHand[0]!])}+)*`
    : `${handStr(dealerHand)}  *(${bjHandValue(dealerHand)})*`;
  return (
    `**🃏 Blackjack** — Bet: ${sym} ${activeBet.toLocaleString()}\n\n` +
    `**Dealer:** ${dealerDisplay}\n` +
    `**You:** ${handStr(playerHand)}  *(${bjHandValue(playerHand)})*`
  );
}

const Blackjack: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play blackjack — Hit, Stand, or Double Down against the dealer')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);

    const cfg = await getEconomyConfig(guildId);
    // Take the stake now, in one atomic step, and pay stake + winnings at the end.
    // Charging only on a loss let several all-in hands share one balance: a loss
    // the balance couldn't cover was skipped, so losses were free and wins real.
    const stake = await adjustBalance(guildId, userId, -bet);
    if (!stake.success) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Balance: **${cfg.currency_symbol} ${stake.newBalance.toLocaleString()}**.`)); return;
    }

    let settled = false;
    let luckMult = 1;
    try {
      luckMult = await getGambleMultiplier(guildId, userId);
      await interaction.deferReply();
    } catch (err) {
      settled = true;
      await adjustBalance(guildId, userId, bet); // the hand never started
      throw err;
    }

    const deck = shuffleDeck(newDeck());
    let di = 0;
    const draw = (): Card => deck[di++]!;

    const playerHand: Card[] = [draw(), draw()];
    const dealerHand: Card[] = [draw(), draw()];
    const sym = cfg.currency_symbol;
    let activeBet = bet;
    let canDouble = true;

    async function endGame(outcome: Outcome, msg: string): Promise<void> {
      // Pay out once. Two fast Stand clicks (or Stand racing the timeout) each
      // reached here and paid the hand twice.
      if (settled) return;
      settled = true;

      // activeBet is already off the balance, so this is the whole return.
      let credit = 0;
      if (outcome === 'win')       credit = activeBet + Math.floor(activeBet * luckMult);
      if (outcome === 'blackjack') credit = activeBet + Math.floor(activeBet * 1.5 * luckMult);
      if (outcome === 'push')      credit = activeBet;

      const { newBalance } = credit > 0
        ? await adjustBalance(guildId, userId, credit)
        : { newBalance: (await getOrCreateEconomy(guildId, userId)).balance };
      if (outcome !== 'push') {
        recordGameResult(guildId, userId, 'blackjack', outcome === 'win' || outcome === 'blackjack', activeBet).catch(() => {});
      }
      const refund = outcome === 'lose' ? await applyLossInsurance(guildId, userId, activeBet) : 0;
      const jp = await settleJackpot(guildId, userId, activeBet, outcome === 'lose' ? activeBet : 0);

      let xpLine = '';
      if (outcome === 'win' || outcome === 'blackjack') {
        const base = outcome === 'blackjack' ? 150 : randInt(75, 125);
        const xpGiven = await awardBonusXp({
          guildId, userId, baseAmount: base,
          client: interaction.client, channelId: interaction.channelId, isGame: true,
        });
        xpLine = xpGiven > 0 ? ` +**${xpGiven} XP**!` : '';
      }

      const icon = outcome === 'win' || outcome === 'blackjack' ? '✅' : outcome === 'push' ? '🤝' : '❌';
      const color = outcome === 'win' || outcome === 'blackjack' ? Colors.Green : outcome === 'push' ? Colors.Yellow : Colors.Red;
      await interaction.editReply(bjPanel(
        playerHand, dealerHand, false,
        gameContent(playerHand, dealerHand, activeBet, sym, false) +
          `\n\n${icon} ${msg}${insuranceLine(sym, refund)}${xpLine}\n**Balance:** ${sym} **${(newBalance + refund + jp.won).toLocaleString()}**${jackpotLine(sym, jp.won)}`,
        color,
      )).catch(() => {});
    }

    // Fair shoe: the dealer draws straight off the shuffled deck, stands on 17+.
    function playDealer(): void {
      while (bjHandValue(dealerHand) < 17) dealerHand.push(draw());
    }

    async function resolveStand(): Promise<void> {
      playDealer();
      const pv = bjHandValue(playerHand);
      const dv = bjHandValue(dealerHand);
      const winPayout = Math.floor(activeBet * luckMult);
      const boostTag = luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : '';
      if (dv > 21) {
        await endGame('win', `Dealer busted with **${dv}**! You win **${sym} ${winPayout.toLocaleString()}**!${boostTag}`);
      } else if (pv > dv) {
        await endGame('win', `You win **${pv}** vs **${dv}**! You win **${sym} ${winPayout.toLocaleString()}**!${boostTag}`);
      } else if (dv > pv) {
        await endGame('lose', `Dealer wins **${dv}** vs **${pv}**. You lost **${sym} ${activeBet.toLocaleString()}**.`);
      } else {
        await endGame('push', `Push! Both **${pv}** — bet refunded.`);
      }
    }

    // Check opening blackjack
    const playerBJ = bjHandValue(playerHand) === 21;
    const dealerBJ = bjHandValue(dealerHand) === 21;
    if (playerBJ || dealerBJ) {
      if (playerBJ && dealerBJ) {
        await endGame('push', '**Both Blackjack!** Push — bet refunded.');
      } else if (playerBJ) {
        const bjPayout = Math.floor(activeBet * 1.5 * luckMult);
        const bjBoost = luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : '';
        await endGame('blackjack', `**Blackjack! 🃏** You win **${sym} ${bjPayout.toLocaleString()}**!${bjBoost}`);
      } else {
        await endGame('lose', `**Dealer Blackjack!** You lost **${sym} ${activeBet.toLocaleString()}**.`);
      }
      return;
    }

    let msg;
    try {
      msg = await interaction.editReply(bjPanel(
        playerHand, dealerHand, true,
        gameContent(playerHand, dealerHand, activeBet, sym, true),
        Colors.Blurple, buildButtons(true, sym, activeBet),
      ));
    } catch (err) {
      settled = true;
      await adjustBalance(guildId, userId, bet); // no table to play on
      throw err;
    }

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId,
      time: 60_000,
    });

    collector.on('collect', async (btn) => {
      await btn.deferUpdate().catch(() => {});
      if (settled) return;

      if (btn.customId === 'bj_stand') {
        collector.stop('stand');
        await resolveStand();
        return;
      }

      if (btn.customId === 'bj_double') {
        // A stale Double button can still be clicked after the first card.
        if (!canDouble) return;
        canDouble = false;
        const extra = await adjustBalance(guildId, userId, -activeBet);
        if (!extra.success) {
          canDouble = true;
          await interaction.followUp(cv2Err(`❌ Not enough ${cfg.currency_name} to double down.`));
          return;
        }
        activeBet *= 2;
      }

      canDouble = false;
      playerHand.push(draw());
      const pv = bjHandValue(playerHand);

      if (pv > 21) {
        collector.stop('bust');
        playDealer();
        await endGame('lose', `**Bust! (${pv})** You lost **${sym} ${activeBet.toLocaleString()}**.`);
      } else if (pv === 21 || btn.customId === 'bj_double') {
        collector.stop('stand');
        await resolveStand();
      } else {
        await interaction.editReply(bjPanel(
          playerHand, dealerHand, true,
          gameContent(playerHand, dealerHand, activeBet, sym, true),
          Colors.Blurple, buildButtons(false, sym, activeBet),
        )).catch(() => {});
      }
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'time' && !settled) await resolveStand();
    });
  },
};

export default Blackjack;
