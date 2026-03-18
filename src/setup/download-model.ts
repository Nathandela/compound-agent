/**
 * Download-model command - Download the embedding model for semantic search.
 */

import type { Command } from 'commander';

import { isModelAvailable, DEFAULT_MODEL_DIR, MODEL_FILENAME, MODEL_URI, resolveModel } from '../memory/embeddings/index.js';

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
        const modelDir = `${DEFAULT_MODEL_DIR}/${MODEL_FILENAME}`;

        if (options.json) {
          console.log(JSON.stringify({ success: true, model: MODEL_URI, path: modelDir, alreadyExisted: true }));
        } else {
          console.log('Model already exists.');
          console.log(`Model: ${MODEL_URI}`);
          console.log(`Cache: ${modelDir}`);
        }
        return;
      }

      // Download the model
      if (!options.json) {
        console.log('Downloading embedding model...');
      }

      await resolveModel({ cli: !options.json });
      const modelDir = `${DEFAULT_MODEL_DIR}/${MODEL_FILENAME}`;

      if (options.json) {
        console.log(JSON.stringify({ success: true, model: MODEL_URI, path: modelDir, alreadyExisted: false }));
      } else {
        console.log(`\nModel downloaded successfully!`);
        console.log(`Model: ${MODEL_URI}`);
        console.log(`Cache: ${modelDir}`);
      }
    });
}
