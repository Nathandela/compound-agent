/**
 * E4 Spike — Transformers.js / ONNX Runtime benchmark.
 *
 * Uses @huggingface/transformers to run embedding models in pure JS/ONNX.
 * Falls back to a small model (all-MiniLM-L6-v2) if EmbeddingGemma ONNX not available.
 *
 * Usage: npx tsx spike/e4-embedding-spike/bench-transformers-js.ts
 *
 * Prerequisites: pnpm add -D @huggingface/transformers (spike dependency)
 */

import type { FeatureExtractionPipeline, pipeline as PipelineFn } from '@huggingface/transformers';

import { runBenchmark, type BenchmarkResult } from './bench-harness.js';

/** Models to try, in preference order */
const MODELS = [
  { name: 'nomic-ai/nomic-embed-text-v1.5', dims: 768 },
  { name: 'Xenova/all-MiniLM-L6-v2', dims: 384 },
] as const;

export async function benchTransformersJs(): Promise<BenchmarkResult | null> {
  let pipelineFn: typeof PipelineFn;

  try {
    // Dynamic import — may not be installed
    const transformers = await import('@huggingface/transformers');
    pipelineFn = transformers.pipeline;
  } catch {
    console.log('⚠ @huggingface/transformers not installed.');
    console.log('  pnpm add -D @huggingface/transformers');
    return null;
  }

  // Find first working model (pre-check, then dispose and re-load inside benchmark)
  let modelName = '';
  for (const model of MODELS) {
    try {
      console.log(`Checking model availability: ${model.name}...`);
      const test = await pipelineFn('feature-extraction', model.name, { dtype: 'q8' });
      if (test?.dispose) await test.dispose();
      modelName = model.name;
      console.log(`✓ ${model.name} available`);
      break;
    } catch (err) {
      console.log(`✗ ${model.name}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
  }

  if (!modelName) {
    console.log('⚠ No compatible Transformers.js model available.');
    return null;
  }

  // Now benchmark with model loading inside setupFn for accurate RSS measurement
  let extractor: FeatureExtractionPipeline | null = null;

  const result = await runBenchmark(
    `transformers.js (${modelName.split('/').pop()})`,
    async (text: string) => {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return new Float32Array(output.data);
    },
    async () => {
      // Load model inside setup so RSS delta captures it
      extractor = await pipelineFn('feature-extraction', modelName, { dtype: 'q8' });
    },
    async () => {
      if (extractor?.dispose) await extractor.dispose();
      extractor = null;
    },
  );

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await benchTransformersJs();
  if (result) {
    console.log(JSON.stringify({ ...result, vectors: undefined }, null, 2));
  }
}
