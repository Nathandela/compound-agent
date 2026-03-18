/**
 * E4 Spike — node-llama-cpp baseline benchmark.
 *
 * Usage: npx tsx spike/e4-embedding-spike/bench-node-llama.ts
 */

import { getLlama, LlamaEmbeddingContext, LlamaLogLevel } from 'node-llama-cpp';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runBenchmark, type BenchmarkResult } from './bench-harness.js';

const MODEL_PATH = join(homedir(), '.node-llama-cpp', 'models', 'hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');

let ctx: LlamaEmbeddingContext | null = null;
let llamaRef: Awaited<ReturnType<typeof getLlama>> | null = null;
let modelRef: Awaited<ReturnType<typeof llamaRef.loadModel>> | null = null;

export async function benchNodeLlama(): Promise<BenchmarkResult> {
  return runBenchmark(
    'node-llama-cpp',
    async (text: string) => {
      const result = await ctx!.getEmbeddingFor(text);
      return new Float32Array(result.vector);
    },
    async () => {
      llamaRef = await getLlama({
        build: 'never',
        progressLogs: false,
        logLevel: LlamaLogLevel.error,
      });
      modelRef = await llamaRef.loadModel({ modelPath: MODEL_PATH });
      ctx = await modelRef.createEmbeddingContext();
    },
    async () => {
      if (ctx) { try { await ctx.dispose(); } catch { /* */ } }
      if (modelRef) { try { await modelRef.dispose(); } catch { /* */ } }
      if (llamaRef) { try { await llamaRef.dispose(); } catch { /* */ } }
      ctx = null;
      modelRef = null;
      llamaRef = null;
    },
  );
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await benchNodeLlama();
  console.log(JSON.stringify({ ...result, vectors: undefined }, null, 2));
}
