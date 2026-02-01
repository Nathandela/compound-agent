/**
 * Hooks command - Git hooks management
 */

import type { Command } from 'commander';

import { out, PRE_COMMIT_MESSAGE } from '../shared.js';

/**
 * Register the hooks command with the program.
 */
export function registerHooksCommand(program: Command): void {
  const hooksCommand = program.command('hooks').description('Git hooks management');

  hooksCommand
    .command('run <hook>')
    .description('Run a hook script (called by git hooks)')
    .option('--json', 'Output as JSON')
    .action((hook: string, options: { json?: boolean }) => {
      if (hook === 'pre-commit') {
        if (options.json) {
          console.log(JSON.stringify({ hook: 'pre-commit', message: PRE_COMMIT_MESSAGE }));
        } else {
          console.log(PRE_COMMIT_MESSAGE);
        }
      } else {
        if (options.json) {
          console.log(JSON.stringify({ error: `Unknown hook: ${hook}` }));
        } else {
          out.error(`Unknown hook: ${hook}`);
        }
        process.exit(1);
      }
    });
}
