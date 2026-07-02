import {
  ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, ComponentType, InteractionContextType,
  MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { rand, randInt, getHouseCut } from '../../utils/random.js';
import { cv2Err } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

const SYMBOLS = [
  { emoji: '🍒', mult: 1.0,  weight: 30 },
  { emoji: '🍋', mult: 1.5,  weight: 25 },
  { emoji: '🍊', mult: 2.0,  weight: 20 },
  { emoji: '🍇', mult: 3.0,  weight: 12 },
  { emoji: '⭐', mult: 5.0,  weight: 8  },
  { emoji: '💎', mult: 10.0, weight: 5  },
];
const TOTAL_WEIGHT = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
const LEGEND = '*🍒×3=1x | 🍋×3=1.5x | 🍊×3=2x | 🍇×3=3x | ⭐×3=5x | 💎×3=10x*';

function pickSymbol(): string {
  let r = randInt(1, TOTAL_WEIGHT);
  for (const sym of SYMBOLS) { r -= sym.weight; if (r <= 0) return sym.emoji; }
  return SYMBOLS[0]!.emoji;
}

function generateGrid(forceLoss = false): string[] {
  if (!forceLoss) return Array.from({ length: 9 }, () => pickSymbol());
  // Keep re-rolling until the grid has no 3-of-a-kind — house cut is invisible
  let grid: string[];
  do { grid = Array.from({ length: 9 }, () => pickSymbol()); }
  while (checkWin(grid) !== null);
  return grid;
}

function buildGrid(symbols: string[], revealed: boolean[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      Array.from({ length: 3 }, (_, c) => {
        const i = r * 3 + c;
        return new ButtonBuilder()
          .setCustomId(`sc_${i}`)
          .setLabel(revealed[i] ? (symbols[i] ?? '❓') : '❓')
          .setStyle(revealed[i] ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(revealed[i]);
      })
    ));
  }
  return rows;
}

function checkWin(symbols: string[]): { emoji: string; count: number; mult: number } | null {
  const counts = new Map<string, number>();
  for (const s of symbols) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: { emoji: string; count: number; mult: number } | null = null;
  for (const [emoji, count] of counts) {
    if (count < 3) continue;
    const mult = SYMBOLS.find(s => s.emoji === emoji)?.mult ?? 0;
    if (!best || mult > best.mult) best = { emoji, count, mult };
  }
  return best;
}

async function resolveGame(
  symbols: string[], bet: number,
  guildId: string, userId: string, cfg: Awaited<ReturnType<typeof getEconomyConfig>>,
  client: ChatInputCommandInteraction['client'], channelId: string,
): Promise<{ content: string }> {
  const win = checkWin(symbols);
  const sym = cfg.currency_symbol;
  let line = '';
  if (win) {
    const luckMult = await getGambleMultiplier(guildId, userId);
    const winAmount = Math.floor(bet * win.mult * luckMult);
    await adjustBalance(guildId, userId, winAmount);
    recordGameResult(guildId, userId, 'scratch', true, bet).catch(() => {});
    const xpGiven = await awardBonusXp({
      guildId, userId, baseAmount: Math.floor(50 * win.mult),
      client, channelId, isGame: true,
    });
    const xpLine = xpGiven > 0 ? ` +**${xpGiven} XP**!` : '';
    const boostLine = luckMult > 1.0 ? ` *(🍀 ${luckMult}x boost!)*` : '';
    line = `\n🎉 **${win.emoji} × ${win.count}!** You won **${sym} ${winAmount.toLocaleString()}**!${boostLine}${xpLine}`;
  } else {
    recordGameResult(guildId, userId, 'scratch', false, bet).catch(() => {});
    // Insurance runs before the balance refetch below, so the shown total is right.
    const refund = await applyLossInsurance(guildId, userId, bet);
    line = `\n😢 No match — better luck next time!${insuranceLine(sym, refund)}`;
  }
  const eco2 = await getOrCreateEconomy(guildId, userId);
  return { content: `🎟️ **Scratch Card** — ${sym} ${bet.toLocaleString()}${line}\n**Balance:** ${sym} ${eco2.balance.toLocaleString()}\n${LEGEND}` };
}

const Scratch: Command = {
  data: new SlashCommandBuilder()
    .setName('scratch')
    .setDescription('Buy a scratch card — reveal all 9 symbols and match 3 to win!')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.Guild])
    .addIntegerOption(o => o.setName('bet').setDescription('Cost of the scratch card').setRequired(true).setMinValue(1)),

  async run(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);

    const [eco, cfg] = await Promise.all([getOrCreateEconomy(guildId, userId), getEconomyConfig(guildId)]);
    if (eco.balance < bet) {
      await interaction.reply(cv2Err(`❌ Not enough ${cfg.currency_name}. Balance: **${cfg.currency_symbol} ${eco.balance.toLocaleString()}**.`)); return;
    }

    await adjustBalance(guildId, userId, -bet);

    const symbols = generateGrid(rand() < getHouseCut(bet));
    const revealed = new Array<boolean>(9).fill(false);

    await interaction.deferReply();
    const msg = await interaction.editReply({
      content: `🎟️ **Scratch Card** — ${cfg.currency_symbol} ${bet.toLocaleString()}\nClick cells to reveal! Match 3 of the same symbol to win.\n${LEGEND}`,
      components: buildGrid(symbols, revealed),
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId,
      time: 120_000,
    });

    collector.on('collect', async (btn) => {
      await btn.deferUpdate();
      const i = parseInt(btn.customId.split('_')[1] ?? '0');
      revealed[i] = true;

      if (revealed.every(r => r)) {
        collector.stop('done');
        const { content } = await resolveGame(symbols, bet, guildId, userId, cfg, interaction.client, interaction.channelId);
        await interaction.editReply({ content, components: buildGrid(symbols, revealed) }).catch(() => {});
      } else {
        await interaction.editReply({ components: buildGrid(symbols, revealed) }).catch(() => {});
      }
    });

    collector.on('end', async (_c, reason) => {
      if (reason !== 'done') {
        revealed.fill(true);
        const { content } = await resolveGame(symbols, bet, guildId, userId, cfg, interaction.client, interaction.channelId);
        await interaction.editReply({ content: `*(Timed out — auto-revealed)*\n${content}`, components: buildGrid(symbols, revealed) }).catch(() => {});
      }
    });
  },
};

export default Scratch;
