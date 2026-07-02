import { getActiveBoost, consumeBoost, adjustBalance } from './db.js';

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
