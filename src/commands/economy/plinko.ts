import {
  ApplicationIntegrationType, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Colors, ComponentType, ContainerBuilder,
  InteractionContextType, SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { rand } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';

const ROWS = 8;                 // 8 bounces -> 9 buckets
const WIDTH = 2 * ROWS + 1;     // board is 17 columns wide
const START = ROWS;             // ball enters dead centre (column 8)
const FRAME_MS = 700;           // pace of the falling animation

// Landing bucket k follows a binomial distribution: P(k) = C(8,k)/256, i.e.
// 0.39% 3.13% 10.94% 21.88% 27.34% 21.88% 10.94% 3.13% 0.39%.
// These multipliers are tuned against exactly those odds for an RTP of
// 1.00000 — the game is dead fair, no house edge (see the project's fairness
// rule). Don't change one of these without re-checking the expected value:
//   sum(P[k] * MULTS[k]) must stay 1.0.
const MULTS = [25, 5, 1.2, 0.4, 0.2, 0.4, 1.2, 5, 25];
const LEGEND = '*Buckets: 25x ｜ 5x ｜ 1.2x ｜ 0.4x ｜ 0.2x ｜ 0.4x ｜ 1.2x ｜ 5x ｜ 25x*';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Drops the ball, bouncing left/right at each row. Crypto RNG (project rule:
// never Math.random() for gambling). Final column is 2*bucket, so the ball
// visibly comes to rest in the bucket that actually pays out.
function dropBall(): { path: number[]; bucket: number } {
  const path: number[] = [];
  let x = START;
  let rights = 0;
  for (let r = 0; r < ROWS; r++) {
    if (rand() < 0.5) { x += 1; rights++; } else { x -= 1; }
    path.push(x);
  }
  return { path, bucket: rights };
}

// Renders the peg triangle with the ball at whatever row it has reached.
// Monospace code block so the columns line up on every client.
function renderBoard(path: number[], step: number): string {
  const lines: string[] = [];
  const top = Array<string>(WIDTH).fill(' ');
  if (step === 0) top[START] = '●';
  lines.push(top.join('').trimEnd());

  for (let r = 1; r <= ROWS; r++) {
    const row = Array<string>(WIDTH).fill(' ');
    for (let x = START - r; x <= START + r; x += 2) row[x] = '·';
    if (step === r) row[path[r - 1]!] = '●';
    lines.push(row.join('').trimEnd());
  }
  return lines.join('\n');
}

function frame(sym: string, bet: number, path: number[], step: number, footer: string): string {
  return `**🎲 Plinko** — Bet: ${sym} ${bet.toLocaleString()}\n\`\`\`\n${renderBoard(path, step)}\n\`\`\`\n${footer}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPanel(content: string, accentColor: number, disabled = false): any {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addActionRowComponents(row => row.addComponents(
      new ButtonBuilder().setCustomId('plinko_again').setLabel('🎲 Drop Again').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    ));
  return { flags: IS_CV2, components: [container] };
}

type DropResult = { content: string; accentColor: number };

// Plays one drop, animating the ball down the board via `edit` (the button is
// held disabled until it lands so a drop can't be started mid-fall).
async function playDrop(
  bet: number, guildId: string, userId: string,
  cfg: Awaited<ReturnType<typeof getEconomyConfig>>,
  client: ChatInputCommandInteraction['client'], channelId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  edit: (payload: any) => Promise<unknown>,
): Promise<DropResult> {
  const sym = cfg.currency_symbol;
  const { path, bucket } = dropBall();

  for (let step = 0; step <= ROWS; step++) {
    await edit(buildPanel(frame(sym, bet, path, step, `Dropping…\n${LEGEND}`), Colors.Blurple, true));
    if (step < ROWS) await sleep(FRAME_MS);
  }

  const multiplier = MULTS[bucket]!;
  const luckMult = await getGambleMultiplier(guildId, userId);
  const winnings = Math.floor(bet * multiplier * luckMult);
  const delta = winnings - bet;
  const profit = winnings > bet;
  const { newBalance } = await adjustBalance(guildId, userId, delta);
  recordGameResult(guildId, userId, 'plinko', winnings >= bet, bet).catch(() => {});
  // Partial losses count — the worst bucket still returns 0.2x, so insurance
  // covers whatever was actually lost rather than the whole bet.
  const refund = winnings < bet ? await applyLossInsurance(guildId, userId, bet - winnings) : 0;

  let xpLine = '';
  if (profit) {
    const baseXp = Math.min(50 + Math.floor(multiplier * 20), 200);
    const xpGiven = await awardBonusXp({ guildId, userId, baseAmount: baseXp, client, channelId, isGame: true });
    xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
  }

  const label = multiplier >= 25 ? '**JACKPOT!** Dead on the edge!'
    : multiplier >= 5 ? '**Big hit!**'
    : multiplier > 1 ? 'Nice — that pays.'
    : 'Straight down the middle…';
  const resultLine = winnings > bet
    ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}`
    : winnings === bet
      ? `**${multiplier}x** — you broke even.`
      : `**${multiplier}x** — you got **${sym} ${winnings.toLocaleString()}** back, losing **${sym} ${(bet - winnings).toLocaleString()}**.${insuranceLine(sym, refund)}`;

  const content = frame(sym, bet, path, ROWS,
    `${label}\n${resultLine}\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**\n${LEGEND}${xpLine}`);
  const accentColor = profit ? Colors.Gold : winnings === bet ? Colors.Yellow : Colors.Red;
  return { content, accentColor };
}

const Plinko: Command = {
  data: new SlashCommandBuilder()
    .setName('plinko')
    .setDescription('Drop a ball down the Plinko board — the edges pay 25x!')
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

    await interaction.deferReply();
    let last = await playDrop(bet, guildId, userId, cfg, interaction.client, interaction.channelId,
      (payload) => interaction.editReply(payload));
    const msg = await interaction.editReply(buildPanel(last.content, last.accentColor));

    // Keeps the session in one message, like /slots — idle-based so an actively
    // playing user isn't cut off after a fixed window.
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: btn => btn.user.id === userId && btn.customId === 'plinko_again',
      idle: 5 * 60_000,
      time: 30 * 60_000,
    });

    collector.on('collect', async (btn) => {
      await btn.deferUpdate();
      const eco2 = await getOrCreateEconomy(guildId, userId);
      if (eco2.balance < bet) {
        collector.stop('broke');
        // Not cv2Err() — that bakes in the Ephemeral flag, which can't apply
        // after deferUpdate() already committed to a public message edit.
        const container = new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`❌ Not enough ${cfg.currency_name} to drop again — need **${cfg.currency_symbol} ${bet.toLocaleString()}**, you have **${cfg.currency_symbol} ${eco2.balance.toLocaleString()}**.`),
        );
        await btn.editReply({ flags: IS_CV2, components: [container] }).catch(() => {});
        return;
      }
      last = await playDrop(bet, guildId, userId, cfg, interaction.client, interaction.channelId,
        (payload) => btn.editReply(payload));
      await btn.editReply(buildPanel(last.content, last.accentColor)).catch(() => {});
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'broke') return;
      await interaction.editReply(buildPanel(last.content, last.accentColor, true)).catch(() => {});
    });
  },
};

export default Plinko;
