/**
 * E4 Spike — Go + gollama.cpp (purego) benchmark.
 *
 * Builds a minimal Go binary that loads the GGUF model and outputs embeddings.
 * If Go is not installed, reports skip and documents what's needed.
 *
 * Usage: npx tsx spike/e4-embedding-spike/bench-go.ts
 *
 * Prerequisites: Go toolchain (brew install go)
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { runBenchmark, type BenchmarkResult } from './bench-harness.js';

const execFileAsync = promisify(execFile);

const MODEL_PATH = join(homedir(), '.node-llama-cpp', 'models', 'hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');
const GO_SPIKE_DIR = join(import.meta.dirname, 'go-embed');
const GO_BINARY = join(GO_SPIKE_DIR, 'embed');

/** Minimal Go program using go-skynet/go-llama.cpp for embeddings */
const GO_SOURCE = `package main

import (
	"encoding/json"
	"fmt"
	"os"

	llama "github.com/go-skynet/go-llama.cpp"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "Usage: embed <model-path> <text>\\n")
		os.Exit(1)
	}

	modelPath := os.Args[1]
	text := os.Args[2]

	model, err := llama.New(modelPath, llama.SetContext(512))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load model: %v\\n", err)
		os.Exit(1)
	}
	defer model.Free()

	embeddings, err := model.Embeddings(text)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to embed: %v\\n", err)
		os.Exit(1)
	}

	// Output as JSON array for easy parsing
	data, _ := json.Marshal(embeddings)
	fmt.Println(string(data))
}
`;

const GO_MOD = `module go-embed

go 1.22

require github.com/go-skynet/go-llama.cpp v0.0.0-20231027102322-ab34ee68dbf2
`;

function isGoInstalled(): boolean {
  try {
    execFileSync('go', ['version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function buildGoBinary(): Promise<boolean> {
  if (!isGoInstalled()) {
    console.log('⚠ Go not installed. Install with: brew install go');
    return false;
  }

  mkdirSync(GO_SPIKE_DIR, { recursive: true });
  writeFileSync(join(GO_SPIKE_DIR, 'main.go'), GO_SOURCE);
  writeFileSync(join(GO_SPIKE_DIR, 'go.mod'), GO_MOD);

  try {
    console.log('Building Go embedding binary...');
    // Get dependencies
    await execFileAsync('go', ['mod', 'tidy'], {
      cwd: GO_SPIKE_DIR,
      timeout: 120_000,
    });

    // Build
    await execFileAsync('go', ['build', '-o', 'embed', '.'], {
      cwd: GO_SPIKE_DIR,
      timeout: 300_000, // CGo compilation can be slow
      env: { ...process.env, CGO_ENABLED: '1' },
    });

    console.log('✓ Go binary built successfully');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`✗ Go build failed: ${msg}`);
    return false;
  }
}

export async function benchGo(): Promise<BenchmarkResult | null> {
  // Build if needed
  if (!existsSync(GO_BINARY)) {
    const built = await buildGoBinary();
    if (!built) return null;
  }

  return runBenchmark(
    'go-llama.cpp (CGo)',
    async (text: string) => {
      const { stdout } = await execFileAsync(GO_BINARY, [MODEL_PATH, text], {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const arr = JSON.parse(stdout.trim()) as number[];
      return new Float32Array(arr);
    },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await benchGo();
  if (result) {
    console.log(JSON.stringify({ ...result, vectors: undefined }, null, 2));
  }
}
