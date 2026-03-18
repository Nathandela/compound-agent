#!/usr/bin/env node

/**
 * CI fitness check: verify model-info.ts has zero native dependency overhead.
 *
 * Spawns a clean subprocess that measures RSS delta from importing model-info.ts.
 * If a transitive native import (e.g. onnxruntime-node) is accidentally introduced,
 * delta jumps from ~0 MB to ~45-55 MB.
 *
 * Fragile contract guard for Epics 3 + 5.
 *
 * Usage: node scripts/check-model-info-rss.mjs
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_DELTA_MB = 10; // model-info.ts should add <1 MB; native adds ~50 MB
// Use .mts extension so tsx treats the probe as ESM (required for top-level await)
const PROBE_PATH = join(tmpdir(), '.model-info-rss-probe.mts');

// Absolute path so the probe resolves correctly from tmpdir
const MODEL_INFO_PATH = join(process.cwd(), 'src/memory/embeddings/model-info.js').replace(/\\/g, '/');

const probeCode = `
const before = process.memoryUsage().rss;
await import(${JSON.stringify('file://' + MODEL_INFO_PATH)});
const after = process.memoryUsage().rss;
console.log(JSON.stringify({ deltaMB: (after - before) / 1024 / 1024, totalMB: after / 1024 / 1024 }));
`;

try {
  writeFileSync(PROBE_PATH, probeCode, 'utf-8');
  const result = execSync(`npx tsx ${PROBE_PATH}`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  }).trim();

  const { deltaMB, totalMB } = JSON.parse(result);

  if (deltaMB > MAX_DELTA_MB) {
    console.error(
      `FAIL: model-info.ts import delta = ${deltaMB.toFixed(1)} MB (total ${totalMB.toFixed(1)} MB), exceeds ${MAX_DELTA_MB} MB threshold.\n` +
      `A transitive native import (e.g. onnxruntime-node) was likely introduced.\n` +
      `Check src/memory/embeddings/model-info.ts for accidental imports.`
    );
    process.exit(1);
  }

  console.log(
    `PASS: model-info.ts import delta = ${deltaMB.toFixed(1)} MB (total ${totalMB.toFixed(1)} MB), under ${MAX_DELTA_MB} MB threshold.`
  );
} catch (err) {
  console.error('FAIL: could not measure RSS:', err.message);
  process.exit(1);
} finally {
  try { unlinkSync(PROBE_PATH); } catch { /* probe already removed */ }
}
