/**
 * E4 Spike — Run all benchmarks and produce comparison report.
 *
 * Usage: npx tsx spike/e4-embedding-spike/run-all.ts
 */

import { printCompatibilityMatrix, printResults, type BenchmarkResult } from './bench-harness.js';
import { benchNodeLlama } from './bench-node-llama.js';

const results: BenchmarkResult[] = [];

// === 1. Baseline: node-llama-cpp ===
console.log('\n--- Benchmark: node-llama-cpp (baseline) ---');
try {
  const baseline = await benchNodeLlama();
  results.push(baseline);
  console.log(`  RSS delta: ${baseline.rssDeltaMB.toFixed(1)} MB`);
  console.log(`  Cold start: ${baseline.coldStartMs.toFixed(0)} ms`);
  console.log(`  Avg query: ${baseline.avgQueryMs.toFixed(1)} ms`);
  console.log(`  Dimensions: ${baseline.dimensions}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
}

// === 2. llama-embedding CLI ===
console.log('\n--- Benchmark: llama-embedding CLI ---');
try {
  const { benchLlamaCli } = await import('./bench-llama-cli.js');
  const result = await benchLlamaCli();
  if (result) {
    results.push(result);
    console.log(`  RSS delta: ${result.rssDeltaMB.toFixed(1)} MB`);
    console.log(`  Cold start: ${result.coldStartMs.toFixed(0)} ms`);
    console.log(`  Avg query: ${result.avgQueryMs.toFixed(1)} ms`);
    console.log(`  Dimensions: ${result.dimensions}`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
}

// === 3. Transformers.js ===
console.log('\n--- Benchmark: Transformers.js ---');
try {
  const { benchTransformersJs } = await import('./bench-transformers-js.js');
  const result = await benchTransformersJs();
  if (result) {
    results.push(result);
    console.log(`  RSS delta: ${result.rssDeltaMB.toFixed(1)} MB`);
    console.log(`  Cold start: ${result.coldStartMs.toFixed(0)} ms`);
    console.log(`  Avg query: ${result.avgQueryMs.toFixed(1)} ms`);
    console.log(`  Dimensions: ${result.dimensions}`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
}

// === 4. llama-server (persistent HTTP) ===
console.log('\n--- Benchmark: llama-server (HTTP) ---');
try {
  const { benchLlamaServer } = await import('./bench-llama-server.js');
  const result = await benchLlamaServer();
  if (result) {
    results.push(result);
    console.log(`  RSS delta: ${result.rssDeltaMB.toFixed(1)} MB`);
    console.log(`  Cold start: ${result.coldStartMs.toFixed(0)} ms`);
    console.log(`  Avg query: ${result.avgQueryMs.toFixed(1)} ms`);
    console.log(`  Dimensions: ${result.dimensions}`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
}

// === 5. Go (skipped - CGo build failure documented) ===
console.log('\n--- Benchmark: Go + go-llama.cpp ---');
console.log('  ⚠ SKIPPED: go-skynet/go-llama.cpp CGo build fails (missing vendored llama.cpp headers).');
console.log('  See REPORT.md for details. Go path requires either:');
console.log('  - Manual llama.cpp source vendoring + build system setup');
console.log('  - Using gollama.cpp (purego) which needs prebuilt shared libs');

// === Print results ===
if (results.length > 0) {
  printResults(results);

  // Vector compatibility matrix (if we have a baseline and at least one other)
  if (results.length > 1) {
    const baseline = results[0]!;
    const candidates = results.slice(1);
    printCompatibilityMatrix(baseline, candidates);
  }
}

// === Summary ===
console.log('\n=== Decision Input Summary ===');
console.log(`Candidates evaluated: ${results.length}`);
console.log(`Candidates skipped: ${4 - results.length} (missing dependencies)`);

const baseline = results.find((r) => r.candidate === 'node-llama-cpp');
if (baseline) {
  for (const r of results) {
    if (r === baseline) continue;
    const rssDiff = ((r.rssDeltaMB - baseline.rssDeltaMB) / baseline.rssDeltaMB * 100).toFixed(0);
    const latDiff = ((r.avgQueryMs - baseline.avgQueryMs) / baseline.avgQueryMs * 100).toFixed(0);
    console.log(`\n${r.candidate}:`);
    console.log(`  RSS: ${rssDiff}% vs baseline`);
    console.log(`  Latency: ${latDiff}% vs baseline`);
  }
}

console.log('\nDone. See spike/e4-embedding-spike/REPORT.md for full analysis.');
