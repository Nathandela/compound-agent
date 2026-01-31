/**
 * Embedding model download system
 *
 * Downloads nomic-embed-text-v1.5 model to ~/.cache/learning-agent/models/
 * on first use. Model is ~500MB and cached for reuse.
 */

import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

/** Write chunk to stream with backpressure handling */
async function writeChunkToStream(
  stream: ReturnType<typeof createWriteStream>,
  chunk: Uint8Array
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const canContinue = stream.write(chunk, (err) => {
      if (err) reject(err);
    });
    if (canContinue) {
      resolve();
    } else {
      stream.once('drain', resolve);
    }
  });
}

/** Report download progress to stdout */
function reportProgress(receivedBytes: number, totalBytes: number): void {
  if (totalBytes > 0) {
    const percent = Math.round((receivedBytes / totalBytes) * 100);
    process.stdout.write(
      `\rDownloading model: ${percent}% (${formatBytes(receivedBytes)}/${formatBytes(totalBytes)})`
    );
  } else {
    process.stdout.write(`\rDownloading model: ${formatBytes(receivedBytes)}`);
  }
}

/** Close write stream and wait for completion */
async function closeWriteStream(
  stream: ReturnType<typeof createWriteStream>
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null | undefined) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Clean up temp file on error */
async function cleanupTempFile(
  stream: ReturnType<typeof createWriteStream>,
  tmpPath: string
): Promise<void> {
  await new Promise<void>((resolve) => {
    stream.on('close', resolve);
    stream.destroy();
  });
  try {
    await unlink(tmpPath);
  } catch {
    // Ignore if .tmp doesn't exist
  }
}

/**
 * Download file with streaming to disk (O(chunk_size) memory).
 * Uses .tmp file with atomic rename for safety.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  const tmpPath = destPath + '.tmp';
  const writeStream = createWriteStream(tmpPath);
  const reader = response.body.getReader();
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await writeChunkToStream(writeStream, value);
      receivedBytes += value.length;
      reportProgress(receivedBytes, totalBytes);
    }

    await closeWriteStream(writeStream);
    console.log('\nDownload complete.');
    await rename(tmpPath, destPath);
  } catch (error) {
    await cleanupTempFile(writeStream, tmpPath);
    throw error;
  }
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
