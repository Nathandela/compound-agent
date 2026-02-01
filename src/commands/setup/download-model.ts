/**
 * Download-model command - Download the embedding model for semantic search.
 */

import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatBytes } from '../../cli-utils.js';
import { isModelAvailable, MODEL_FILENAME, resolveModel } from '../../index.js';

/**
 * Register the download-model command on the program.
 */
export function registerDownloadModelCommand(program: Command): void {
  program
    .command('download-model')
    .description('Download the embedding model for semantic search')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const alreadyExisted = isModelAvailable();

      if (alreadyExisted) {
        // Model already exists - get path and size
        const modelPath = join(homedir(), '.node-llama-cpp', 'models', MODEL_FILENAME);
        const size = statSync(modelPath).size;

        if (options.json) {
          console.log(JSON.stringify({ success: true, path: modelPath, size, alreadyExisted: true }));
        } else {
          console.log('Model already exists.');
          console.log(`Path: ${modelPath}`);
          console.log(`Size: ${formatBytes(size)}`);
        }
        return;
      }

      // Download the model
      if (!options.json) {
        console.log('Downloading embedding model...');
      }

      const modelPath = await resolveModel({ cli: !options.json });
      const size = statSync(modelPath).size;

      if (options.json) {
        console.log(JSON.stringify({ success: true, path: modelPath, size, alreadyExisted: false }));
      } else {
        console.log(`\nModel downloaded successfully!`);
        console.log(`Path: ${modelPath}`);
        console.log(`Size: ${formatBytes(size)}`);
      }
    });
}
