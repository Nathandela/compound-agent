/**
 * E4 Spike — Benchmark harness for embedding alternatives.
 *
 * Measures RSS delta, cold-start latency, per-query latency, and vector dimensions.
 * Usage: npx tsx spike/e4-embedding-spike/bench-harness.ts
 */

export interface BenchmarkResult {
  candidate: string;
  rssDeltaMB: number;
  coldStartMs: number;
  perQueryMs: number[];
  avgQueryMs: number;
  dimensions: number;
  vectors: Map<string, Float32Array>;
}

/** Standard test queries for vector compatibility comparison. */
export const TEST_QUERIES = [
  'TypeScript error handling patterns',
  'Go CGo llama.cpp embedding binary',
  'vector similarity cosine distance',
  'semantic search for code lessons',
  'memory pressure in Node.js native addons',
] as const;

/**
 * Measure RSS delta (MB) from a callback.
 * Forces GC before measurement if available.
 */
export async function measureRss<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; deltaMB: number }> {
  if (global.gc) global.gc();
  const before = process.memoryUsage().rss;
  const result = await fn();
  if (global.gc) global.gc();
  const after = process.memoryUsage().rss;
  return { result, deltaMB: (after - before) / 1024 / 1024 };
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Run a full benchmark for a candidate.
 */
export async function runBenchmark(
  candidate: string,
  embedFn: (text: string) => Promise<Float32Array>,
  setupFn?: () => Promise<void>,
  teardownFn?: () => Promise<void>,
): Promise<BenchmarkResult> {
  // Cold start: includes setup + first embed
  const coldStart = performance.now();
  const { deltaMB } = await measureRss(async () => {
    if (setupFn) await setupFn();
    await embedFn(TEST_QUERIES[0]);
  });
  const coldStartMs = performance.now() - coldStart;

  // Per-query latency (warm)
  const perQueryMs: number[] = [];
  const vectors = new Map<string, Float32Array>();

  for (const query of TEST_QUERIES) {
    const t0 = performance.now();
    const vec = await embedFn(query);
    perQueryMs.push(performance.now() - t0);
    vectors.set(query, vec);
  }

  if (teardownFn) await teardownFn();

  const avgQueryMs = perQueryMs.reduce((a, b) => a + b, 0) / perQueryMs.length;
  const dimensions = vectors.get(TEST_QUERIES[0])?.length ?? 0;

  return { candidate, rssDeltaMB: deltaMB, coldStartMs, perQueryMs, avgQueryMs, dimensions, vectors };
}

/**
 * Print benchmark results in a table.
 */
export function printResults(results: BenchmarkResult[]): void {
  console.log('\n=== E4 Embedding Spike — Benchmark Results ===\n');
  console.log(
    '| Candidate | RSS Delta (MB) | Cold Start (ms) | Avg Query (ms) | Dims |',
  );
  console.log(
    '|-----------|---------------|-----------------|----------------|------|',
  );
  for (const r of results) {
    console.log(
      `| ${r.candidate.padEnd(25)} | ${r.rssDeltaMB.toFixed(1).padStart(13)} | ${r.coldStartMs.toFixed(0).padStart(15)} | ${r.avgQueryMs.toFixed(1).padStart(14)} | ${String(r.dimensions).padStart(4)} |`,
    );
  }
}

/**
 * Print vector compatibility matrix (cosine similarity vs baseline).
 */
export function printCompatibilityMatrix(
  baseline: BenchmarkResult,
  candidates: BenchmarkResult[],
): void {
  console.log('\n=== Vector Compatibility Matrix (cosine sim vs baseline) ===\n');
  console.log(`Baseline: ${baseline.candidate}`);
  console.log(
    `| Query | ${candidates.map((c) => c.candidate.padEnd(15)).join(' | ')} |`,
  );
  console.log(
    `|-------|${candidates.map(() => '-'.repeat(17)).join('|')}|`,
  );

  for (const query of TEST_QUERIES) {
    const baseVec = baseline.vectors.get(query);
    if (!baseVec) continue;

    const sims = candidates.map((c) => {
      const vec = c.vectors.get(query);
      if (!vec) return 'N/A'.padStart(15);
      return cosineSimilarity(baseVec, vec).toFixed(6).padStart(15);
    });

    const shortQuery = query.substring(0, 35).padEnd(35);
    console.log(`| ${shortQuery} | ${sims.join(' | ')} |`);
  }
}
