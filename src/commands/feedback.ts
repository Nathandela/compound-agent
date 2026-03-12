/**
 * Feedback command — surface the GitHub Discussions link.
 *
 * Usage: ca feedback [--open]
 */

import { spawn } from 'node:child_process';
import type { Command } from 'commander';

const REPO_URL = 'https://github.com/Nathandela/compound-agent';
const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

function openUrl(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
}

export function registerFeedbackCommand(program: Command): void {
  program
    .command('feedback')
    .description('Open GitHub Discussions to share feedback or report issues')
    .option('--open', 'Open the Discussions page in your browser')
    .action((opts: { open?: boolean }) => {
      console.log(`Feedback & discussions: ${DISCUSSIONS_URL}`);
      console.log(`Repository:             ${REPO_URL}`);

      if (opts.open && process.stdout.isTTY) {
        openUrl(DISCUSSIONS_URL);
        console.log('Opening in browser...');
      } else if (!opts.open) {
        console.log('');
        console.log('Run `ca feedback --open` to open in your browser.');
      }
    });
}
