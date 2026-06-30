const buf = new Uint32Array(1);

/** Returns a float in [0, 1) using cryptographic randomness */
export function rand(): number {
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
}

/** Returns a random integer in [min, max] inclusive */
export function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/**
 * Returns the probability that a game win is converted to a loss based on bet size.
 * Scales logarithmically: 0% at ≤10k, ~15% at 100k, ~30% at 1M, capped at 45%.
 * Call after the game determines a win: `if (rand() < getHouseCut(bet)) treat as loss`.
 */
export function getHouseCut(bet: number): number {
  const THRESHOLD = 10_000;
  if (bet <= THRESHOLD) return 0;
  return Math.min(0.45, Math.log10(bet / THRESHOLD) * 0.15);
}
