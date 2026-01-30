/**
 * Embedding model download system
 *
 * Downloads nomic-embed-text-v1.5 model to ~/.cache/learning-agent/models/
 * on first use. Model is ~500MB and cached for reuse.
 */

import { homedir } from 'os';
import { join } from 'path';
import { access, mkdir, writeFile } from 'fs/promises';

/** Model filename */
export const MODEL_FILENAME = 'nomic-embed-text-v1.5.Q4_K_M.gguf';

/** Hugging Face URL for the model */
export const MODEL_URL =
  'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf';

/** Default model directory */
const DEFAULT_MODEL_DIR = join(homedir(), '.cache', 'learning-agent', 'models');

/** Overridable model directory for testing */
let modelDir = DEFAULT_MODEL_DIR;

/**
 * Set custom model directory (for testing).
 */
export function setModelDir(dir: string): void {
  modelDir = dir;
}

/**
 * Reset model directory to default.
 */
export function resetModelDir(): void {
  modelDir = DEFAULT_MODEL_DIR;
}

/**
 * Get the full path to the model file.
 */
export function getModelPath(): string {
  return join(modelDir, MODEL_FILENAME);
}

/**
 * Check if model file exists.
 */
async function modelExists(): Promise<boolean> {
  try {
    await access(getModelPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Download file with progress reporting.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    receivedBytes += value.length;

    // Progress reporting (simple console output)
    if (totalBytes > 0) {
      const percent = Math.round((receivedBytes / totalBytes) * 100);
      process.stdout.write(`\rDownloading model: ${percent}% (${formatBytes(receivedBytes)}/${formatBytes(totalBytes)})`);
    } else {
      process.stdout.write(`\rDownloading model: ${formatBytes(receivedBytes)}`);
    }
  }

  console.log('\nDownload complete.');

  // Combine chunks and write to file
  const allChunks = new Uint8Array(receivedBytes);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  await writeFile(destPath, allChunks);
}

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Ensure the embedding model is downloaded.
 * Downloads from Hugging Face if not present.
 * Returns the path to the model file.
 */
export async function ensureModel(): Promise<string> {
  const modelPath = getModelPath();

  if (await modelExists()) {
    return modelPath;
  }

  // Create directory
  await mkdir(modelDir, { recursive: true });

  // Download model
  console.log(`Downloading embedding model to ${modelPath}...`);
  console.log(`This is a one-time download (~500MB).`);

  await downloadFile(MODEL_URL, modelPath);

  return modelPath;
}
