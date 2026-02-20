/**
 * Deterministic random subset selection for test sampling.
 *
 * Used by `pnpm test:random <pct>` to run a reproducible subset of tests.
 * The seed (from CA_AGENT_SEED env var or fallback) ensures different agents
 * cover different subsets while keeping runs repeatable.
 */

/**
 * Simple string hash producing a non-negative integer.
 * Not cryptographic -- only needs to be deterministic and well-distributed.
 */
export function seedHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    // djb2-style hash
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Select a deterministic random subset of items.
 *
 * @param items - Full list of items to sample from
 * @param pct - Percentage to select (0-100, capped at 100)
 * @param seed - Seed string for deterministic selection
 * @returns Subset of items, deterministic for a given seed
 */
export function selectRandomSubset<T>(items: readonly T[], pct: number, seed: string): T[] {
  if (items.length === 0) return [];

  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const count = clampedPct === 0 ? 0 : Math.max(1, Math.round((clampedPct / 100) * items.length));

  if (count === 0) return [];
  if (count >= items.length) return [...items];

  // Fisher-Yates shuffle with seeded PRNG, then take first `count`
  const indices = items.map((_, i) => i);
  let h = seedHash(seed);

  for (let i = indices.length - 1; i > 0; i--) {
    // Simple LCG step to advance the pseudo-random state
    h = ((h * 1664525 + 1013904223) >>> 0);
    const j = h % (i + 1);
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }

  return indices.slice(0, count).map(i => items[i]!);
}
