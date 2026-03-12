/**
 * Install-beads command — install the beads CLI via the official install script.
 *
 * Usage: ca install-beads [--yes]
 */

import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';

const INSTALL_SCRIPT_URL =
  'https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh';
const INSTALL_CMD = `curl -sSL ${INSTALL_SCRIPT_URL} | bash`;

export function registerInstallBeadsCommand(program: Command): void {
  program
    .command('install-beads')
    .description('Install the beads CLI via the official install script')
    .option('--yes', 'Skip confirmation prompt and install immediately')
    .action((opts: { yes?: boolean }) => {
      if (process.platform === 'win32') {
        console.error('Beads installation is not supported on Windows.');
        return;
      }

      console.log(`Install script: ${INSTALL_SCRIPT_URL}`);

      if (!opts.yes && !process.stdout.isTTY) {
        console.log(`Run manually: ${INSTALL_CMD}`);
        return;
      }

      if (!opts.yes) {
        // Interactive TTY without --yes: print hint and return
        // (no readline prompt implemented — use --yes to proceed)
        console.log(`Run manually: ${INSTALL_CMD}`);
        return;
      }

      // --yes flag: proceed with installation
      const result = spawnSync('bash', ['-c', INSTALL_CMD], {
        stdio: 'inherit',
        timeout: 60_000,
      });

      if (result.error) {
        console.error(`Installation error: ${result.error.message}`);
        return;
      }

      if (result.status !== 0) {
        console.error(`Install error: process exited with code ${result.status}.`);
        return;
      }

      console.log('Restart your shell or run: source ~/.bashrc');
    });
}
