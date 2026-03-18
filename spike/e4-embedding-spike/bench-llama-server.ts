/**
 * E4 Spike — llama-server persistent subprocess benchmark.
 *
 * Runs llama-server as a persistent process with --embeddings flag,
 * queries via HTTP. This avoids the per-query cold-start of llama-embedding CLI.
 *
 * Usage: npx tsx spike/e4-embedding-spike/bench-llama-server.ts
 */

import { ChildProcess, execFileSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runBenchmark, type BenchmarkResult } from './bench-harness.js';

const MODEL_PATH = join(homedir(), '.node-llama-cpp', 'models', 'hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');
const PORT = 18923; // High port to avoid conflicts
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess: ChildProcess | null = null;

async function waitForServer(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('llama-server failed to start within timeout');
}

async function startServer(): Promise<void> {
  serverProcess = spawn('llama-server', [
    '-m', MODEL_PATH,
    '--port', String(PORT),
    '--embeddings',
    '--threads', '4',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to be ready
  await waitForServer();
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    // Wait for clean exit
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        serverProcess?.kill('SIGKILL');
        resolve();
      }, 5000);
      serverProcess!.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    serverProcess = null;
  }
}

async function embedViaServer(text: string): Promise<Float32Array> {
  const res = await fetch(`${BASE_URL}/embedding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text }),
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}: ${await res.text()}`);
  }

  // Response format: [{index: 0, embedding: [[0.1, 0.2, ...]]}]
  const data = await res.json() as Array<{ embedding: number[][] }>;
  const embedding = data[0]?.embedding?.[0];
  if (!embedding) throw new Error('No embedding in response');
  return new Float32Array(embedding);
}

export async function benchLlamaServer(): Promise<BenchmarkResult | null> {
  try {
    // Check if llama-server is available
    try {
      execFileSync('which', ['llama-server']);
    } catch {
      console.log('⚠ llama-server not found. Install llama.cpp.');
      return null;
    }

    return await runBenchmark(
      'llama-server (HTTP)',
      embedViaServer,
      startServer,
      stopServer,
    );
  } catch (err) {
    await stopServer(); // Cleanup on error
    console.log(`✗ Failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await benchLlamaServer();
  if (result) {
    console.log(JSON.stringify({ ...result, vectors: undefined }, null, 2));
  }
}
