/**
 * CLI command for managing external reviewers.
 *
 * Usage:
 *   ca reviewer enable gemini
 *   ca reviewer disable codex
 *   ca reviewer list
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import {
  enableReviewer,
  disableReviewer,
  getExternalReviewers,
  VALID_REVIEWERS,
} from '../config/index.js';

export function registerReviewerCommand(program: Command): void {
  const reviewer = program
    .command('reviewer')
    .description('Manage external code reviewers (gemini, codex)');

  reviewer
    .command('enable <name>')
    .description(`Enable an external reviewer (${VALID_REVIEWERS.join(', ')})`)
    .action(async (name: string) => {
      const repoRoot = getRepoRoot();
      try {
        const added = await enableReviewer(repoRoot, name);
        if (added) {
          console.log(`Enabled external reviewer: ${name}`);
        } else {
          console.log(`${name} is already enabled`);
        }
      } catch (err) {
        console.error((err as Error).message);
        process.exitCode = 1;
      }
    });

  reviewer
    .command('disable <name>')
    .description('Disable an external reviewer')
    .action(async (name: string) => {
      try {
        const repoRoot = getRepoRoot();
        const removed = await disableReviewer(repoRoot, name);
        if (removed) {
          console.log(`Disabled external reviewer: ${name}`);
        } else {
          console.log(`${name} is not enabled`);
        }
      } catch (err) {
        console.error((err as Error).message);
        process.exitCode = 1;
      }
    });

  reviewer
    .command('list')
    .description('List enabled external reviewers')
    .action(async () => {
      try {
        const repoRoot = getRepoRoot();
        const reviewers = await getExternalReviewers(repoRoot);
        if (reviewers.length === 0) {
          console.log('No external reviewers enabled');
          console.log(`Available: ${VALID_REVIEWERS.join(', ')}`);
          console.log('Enable with: ca reviewer enable <name>');
        } else {
          console.log('Enabled external reviewers:');
          for (const r of reviewers) {
            console.log(`  - ${r}`);
          }
        }
      } catch (err) {
        console.error((err as Error).message);
        process.exitCode = 1;
      }
    });
}
