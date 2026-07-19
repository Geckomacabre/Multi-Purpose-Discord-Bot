import {
  ApplicationIntegrationType, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, Colors, ComponentType, ContainerBuilder,
  InteractionContextType, MediaGalleryBuilder, MediaGalleryItemBuilder,
  SlashCommandBuilder, TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../../interfaces/command';
import { getOrCreateEconomy, getEconomyConfig, adjustBalance, getGambleMultiplier, recordGameResult } from '../../utils/db';
import { awardBonusXp } from '../../utils/xpBonus.js';
import { rand } from '../../utils/random.js';
import { cv2Err, IS_CV2 } from '../../utils/components.js';
import { applyLossInsurance, insuranceLine } from '../../utils/gamble.js';
import { renderPlinkoGif, ROWS } from '../../utils/plinkoBoard.js';

// Landing bucket k follows a binomial distribution: P(k) = C(12,k)/4096, i.e.
// 0.024% 0.293% 1.611% 5.371% 12.085% 19.336% 22.559% (then mirrored).
// These multipliers are tuned against exactly those odds for an RTP of
// 1.00000 — dead fair, no house edge (see the project's fairness rule).
// Don't change one without re-checking that sum(P[k] * MULTS[k]) stays 1.0.
const MULTS = [120, 25, 4, 2, 1.2, 0.3, 0.2, 0.3, 1.2, 2, 4, 25, 120];
const GIF_NAME = 'plinko.gif';

// Decides the drop with crypto RNG (project rule: never Math.random() for
// gambling). Returns the per-row ±1 bounces; the renderer animates a path that
// is guaranteed to end in `bucket`, so what you watch is what pays.
function dropBall(): { steps: number[]; bucket: number } {
  const steps: number[] = [];
  let bucket = 0;
  for (let r = 0; r < ROWS; r++) {
    if (rand() < 0.5) { steps.push(1); bucket++; } else { steps.push(-1); }
  }
  return { steps, bucket };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPanel(gif: Buffer, content: string, accentColor: number, disabled = false): any {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${GIF_NAME}`),
    ))
    .addActionRowComponents(row => row.addComponents(
      new ButtonBuilder().setCustomId('plinko_again').setLabel('🎲 Drop Again').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    ));
  return { flags: IS_CV2, files: [new AttachmentBuilder(gif, { name: GIF_NAME })], components: [container] };
}

type DropResult = { gif: Buffer; content: string; accentColor: number };

async function playDrop(
  bet: number, guildId: string, userId: string,
  cfg: Awaited<ReturnType<typeof getEconomyConfig>>,
  client: ChatInputCommandInteraction['client'], channelId: string,
): Promise<DropResult> {
  const sym = cfg.currency_symbol;
  const { steps, bucket } = dropBall();
  const multiplier = MULTS[bucket]!;

  const gif = await renderPlinkoGif(steps, MULTS, bucket);

  const luckMult = await getGambleMultiplier(guildId, userId);
  const winnings = Math.floor(bet * multiplier * luckMult);
  const profit = winnings > bet;
  const { newBalance } = await adjustBalance(guildId, userId, winnings - bet);
  recordGameResult(guildId, userId, 'plinko', winnings >= bet, bet).catch(() => {});
  // Partial losses count — the worst bucket still returns 0.2x, so insurance
  // covers what was actually lost rather than the whole bet.
  const refund = winnings < bet ? await applyLossInsurance(guildId, userId, bet - winnings) : 0;

  let xpLine = '';
  if (profit) {
    const baseXp = Math.min(50 + Math.floor(multiplier * 5), 200);
    const xpGiven = await awardBonusXp({ guildId, userId, baseAmount: baseXp, client, channelId, isGame: true });
    xpLine = xpGiven > 0 ? `\n+**${xpGiven} XP** earned!` : '\n*(Daily XP cap reached)*';
  }

  const label = multiplier >= 120 ? '🚨 **JACKPOT!** Dead on the edge!'
    : multiplier >= 25 ? '🔥 **Huge hit!**'
    : multiplier >= 4 ? '**Big hit!**'
    : multiplier > 1 ? 'Nice — that pays.'
    : 'Straight down the middle…';
  const resultLine = winnings > bet
    ? `**${multiplier}x** — you won **${sym} ${winnings.toLocaleString()}**!${luckMult > 1 ? ' *(🍀 Lucky Charm!)*' : ''}`
    : winnings === bet
      ? `**${multiplier}x** — you broke even.`
      : `**${multiplier}x** — you got **${sym} ${winnings.toLocaleString()}** back, losing **${sym} ${(bet - winnings).toLocaleString()}**.${insuranceLine(sym, refund)}`;

  const content = `**🎲 Plinko** — Bet: ${sym} ${bet.toLocaleString()}\n${label}\n${resultLine}\n**Balance:** ${sym} **${(newBalance + refund).toLocaleString()}**${xpLine}`;
  const accentColor = profit ? Colors.Gold : winnings === bet ? Colors.Yellow : Colors.Red;
  return { gif, content, accentColor };
}

const Plinko: Command = {
  data: new SlashCommandBuilder()
    .setName('plinko')
    .setDescription('Drop a ball down the Plinko board — the edges pay 120x!')
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
    let last = await playDrop(bet, guildId, userId, cfg, interaction.client, interaction.channelId);
    const msg = await interaction.editReply(buildPanel(last.gif, last.content, last.accentColor));

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
        await btn.editReply({ flags: IS_CV2, components: [container], files: [] }).catch(() => {});
        return;
      }
      last = await playDrop(bet, guildId, userId, cfg, interaction.client, interaction.channelId);
      await btn.editReply(buildPanel(last.gif, last.content, last.accentColor)).catch(() => {});
    });

    collector.on('end', async (_c, reason) => {
      if (reason === 'broke') return;
      await interaction.editReply(buildPanel(last.gif, last.content, last.accentColor, true)).catch(() => {});
    });
  },
};

export default Plinko;
