import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { getActiveBoost, consumeBoost, adjustBalance } from './db.js';
import { IS_CV2 } from './components.js';

/**
 * Gambling Insurance (shop one-shot): if the user holds an unused policy,
 * consume it and refund half the lost bet. Returns the refund amount (0 when
 * no policy was active). Call AFTER the loss has been applied to the balance;
 * add the returned amount to any balance figure you display.
 */
export async function applyLossInsurance(guildId: string, userId: string, lostAmount: number): Promise<number> {
  const policy = await getActiveBoost(guildId, userId, 'insurance');
  if (!policy) return 0;
  await consumeBoost(guildId, userId, 'insurance');
  const refund = Math.floor(lostAmount / 2);
  if (refund > 0) await adjustBalance(guildId, userId, refund);
  return refund;
}

/** Message line appended to a loss when insurance paid out. */
export function insuranceLine(sym: string, refund: number): string {
  return refund > 0 ? `\n🛡️ **Gambling Insurance** paid out — **${sym} ${refund.toLocaleString()}** refunded.` : '';
}

/**
 * Shared Components-V2 game panel: an accent-colored card with the game's
 * text, optionally with a button row nested inside the same card (rather
 * than a separate plain-content message) so every gambling game has the
 * same polished look — win/loss color coding, no bare-text messages.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildGamePanel(content: string, accentColor: number, rows?: ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<ButtonBuilder>[]): any {
  const container = new ContainerBuilder().setAccentColor(accentColor).addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  if (rows) container.addActionRowComponents(...(Array.isArray(rows) ? rows : [rows]));
  return { flags: IS_CV2, components: [container] };
}
