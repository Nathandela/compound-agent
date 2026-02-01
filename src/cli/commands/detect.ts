/**
 * Detect command - Detect learning triggers from input
 */

import type { Command } from 'commander';

import { detectAndPropose, parseInputFile } from '../../capture/index.js';
import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson } from '../../storage/index.js';
import { generateId } from '../../types.js';
import type { Lesson } from '../../types.js';
import { out } from '../shared.js';

/**
 * Register the detect command with the program.
 */
export function registerDetectCommand(program: Command): void {
  program
    .command('detect')
    .description('Detect learning triggers from input')
    .requiredOption('--input <file>', 'Path to JSON input file')
    .option('--save', 'Save proposed lesson (requires --yes)')
    .option('-y, --yes', 'Confirm save (required with --save)')
    .option('--json', 'Output result as JSON')
    .action(
      async (options: { input: string; save?: boolean; yes?: boolean; json?: boolean }) => {
        const repoRoot = getRepoRoot();

        // --save requires --yes
        if (options.save && !options.yes) {
          if (options.json) {
            console.log(JSON.stringify({ error: '--save requires --yes flag for confirmation' }));
          } else {
            out.error('--save requires --yes flag for confirmation');
            console.log('Use: detect --input <file> --save --yes');
          }
          process.exit(1);
        }

        const input = await parseInputFile(options.input);
        const result = await detectAndPropose(repoRoot, input);

        if (!result) {
          if (options.json) {
            console.log(JSON.stringify({ detected: false }));
          } else {
            console.log('No learning trigger detected.');
          }
          return;
        }

        if (options.json) {
          console.log(JSON.stringify({ detected: true, ...result }));
          return;
        }

        console.log('Learning trigger detected!');
        console.log(`  Trigger: ${result.trigger}`);
        console.log(`  Source: ${result.source}`);
        console.log(`  Proposed: ${result.proposedInsight}`);

        if (options.save && options.yes) {
          const lesson: Lesson = {
            id: generateId(result.proposedInsight),
            type: 'quick',
            trigger: result.trigger,
            insight: result.proposedInsight,
            tags: [],
            source: result.source,
            context: { tool: 'detect', intent: 'auto-capture' },
            created: new Date().toISOString(),
            confirmed: true,  // --yes confirms the lesson
            supersedes: [],
            related: [],
          };

          await appendLesson(repoRoot, lesson);
          console.log(`\nSaved as lesson: ${lesson.id}`);
        }
      }
    );
}
