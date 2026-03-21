/**
 * Subprocess-based model usability probe.
 *
 * Runs the ONNX initialization in a child process so that the ~370-460MB RSS
 * is fully reclaimed on process exit. Use this instead of isModelUsable()
 * in long-lived processes (Vitest workers, watch mode).
 *
 * The model file on disk is ~23MB, but the ONNX runtime inflates RSS to
 * ~370-460MB during pipeline initialization. Even after dispose(), the
 * resident memory is never fully reclaimed within the same process.
 * Spawning a child process ensures the OS recovers all memory on exit.
 */

import { execFile } from 'node:child_process';

import { isModelAvailable, MODEL_URI } from './model-info.js';
import type { UsabilityResult } from './model.js';

/** Timeout for the probe subprocess (10 seconds). */
export const PROBE_TIMEOUT_MS = 10_000;

/**
 * Inline probe script executed in the child process.
 *
 * Dynamically imports @huggingface/transformers, creates a feature-extraction
 * pipeline with the model, disposes it, and exits with code 0 on success
 * or code 1 on any error.
 *
 * IMPORTANT: This script must NOT import the full CLI bundle — only the
 * transformers library directly, to keep subprocess overhead minimal.
 */
const PROBE_SCRIPT = `
import('@huggingface/transformers')
  .then(m => m.pipeline('feature-extraction', '${MODEL_URI}', { dtype: 'q8' }))
  .then(p => { if (p.dispose) p.dispose(); process.exit(0); })
  .catch(() => process.exit(1));
`;

/**
 * Probe model usability via a subprocess.
 *
 * Spawns `node -e "..."` that imports @huggingface/transformers, runs the
 * pipeline initialization, and exits with code 0 (usable) or 1 (not usable).
 * The subprocess's memory (~370-460MB RSS) is fully reclaimed by the OS on exit.
 *
 * Fast path: if the model files are not present on disk (checked via
 * isModelAvailable), returns immediately without spawning a subprocess.
 *
 * @returns UsabilityResult — usable:true on exit 0, usable:false otherwise
 */
export async function probeModelUsability(): Promise<UsabilityResult> {
  // Fast path: skip subprocess if model files don't exist
  if (!isModelAvailable()) {
    return {
      usable: false,
      reason: 'Embedding model not found in HuggingFace cache',
      action: 'Run: npx ca download-model',
    };
  }

  return new Promise<UsabilityResult>((resolve) => {
    execFile(
      process.execPath,
      ['-e', PROBE_SCRIPT],
      {
        timeout: PROBE_TIMEOUT_MS,
        // Suppress stdout/stderr noise from the child process
        encoding: 'utf-8',
      },
      (error) => {
        if (!error) {
          resolve({ usable: true });
          return;
        }

        // Check if the process was killed (timeout)
        const killed = (error as NodeJS.ErrnoException & { killed?: boolean }).killed;
        if (killed) {
          resolve({
            usable: false,
            reason: 'Embedding model probe timed out (subprocess killed)',
            action: 'Check system resources or reinstall: npx ca download-model',
          });
          return;
        }

        // Non-zero exit or other error
        resolve({
          usable: false,
          reason: `Embedding model runtime initialization failed: ${error.message}`,
          action: 'Check system compatibility or reinstall: npx ca download-model',
        });
      },
    );
  });
}
