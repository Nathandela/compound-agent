/**
 * E4 Spike — llama-embedding CLI binary benchmark.
 *
 * Delegates to the llama-embedding binary via subprocess.
 * This tests the simplest possible alternative: no Go, no ONNX,
 * just llama.cpp's own embedding CLI.
 *
 * Usage: npx tsx spike/e4-embedding-spike/bench-llama-cli.ts
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { runBenchmark, type BenchmarkResult } from './bench-harness.js';

const execFileAsync = promisify(execFile);

const MODEL_PATH = join(homedir(), '.node-llama-cpp', 'models', 'hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');

/** Possible locations for llama-embedding binary */
const BINARY_CANDIDATES = [
  '/opt/homebrew/bin/llama-embedding',
  '/usr/local/bin/llama-embedding',
  join(homedir(), '.local', 'bin', 'llama-embedding'),
  'llama-embedding', // PATH lookup
];

function findBinary(): string | null {
  for (const path of BINARY_CANDIDATES) {
    if (path === 'llama-embedding' || existsSync(path)) return path;
  }
  return null;
}

/**
 * Parse embedding vector from llama-embedding stdout.
 * llama-embedding outputs one float per line after the header.
 */
function parseEmbedding(stdout: string): Float32Array {
  // Format: "embedding 0:  0.063198  0.033703 -0.026918 ..."
  // All floats on one line after "embedding N:"
  const match = stdout.match(/embedding\s+\d+:\s+([\s\S]+)/);
  if (match) {
    const floats = match[1]!.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (floats.length > 0) return new Float32Array(floats);
  }

  // Fallback: try JSON array format
  const jsonMatch = stdout.match(/\[[\d\s,.\-e+]+\]/);
  if (jsonMatch) {
    const arr = JSON.parse(jsonMatch[0]) as number[];
    return new Float32Array(arr);
  }

  throw new Error(`Failed to parse embedding from output (${stdout.length} chars)`);
}

export async function benchLlamaCli(): Promise<BenchmarkResult | null> {
  const binary = findBinary();
  if (!binary) {
    console.log('⚠ llama-embedding binary not found. Install llama.cpp to benchmark.');
    console.log('  brew install llama.cpp  OR  build from source');
    return null;
  }

  // Verify binary works
  try {
    await execFileAsync(binary, ['--help'], { timeout: 5000 });
  } catch {
    // --help may return non-zero, that's fine as long as binary exists
  }

  return runBenchmark(
    'llama-embedding CLI',
    async (text: string) => {
      const { stdout } = await execFileAsync(binary, [
        '-m', MODEL_PATH,
        '-p', text,
        '--embd-normalize', '2', // L2 normalization
      ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      return parseEmbedding(stdout);
    },
    // No setup needed — each call is a fresh subprocess
    undefined,
    undefined,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await benchLlamaCli();
  if (result) {
    console.log(JSON.stringify({ ...result, vectors: undefined }, null, 2));
  }
}
