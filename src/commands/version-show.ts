/**
 * Version show command — display version with banner animation and recent changelog.
 *
 * Usage: ca version-show
 */

import type { Command } from 'commander';

import { VERSION } from '../version.js';
import { CHANGELOG_RECENT } from '../changelog-data.js';
import { playInstallBanner } from '../setup/index.js';

export function registerVersionShowCommand(program: Command): void {
  program
    .command('version-show')
    .description('Show version with animation and recent changelog')
    .action(async () => {
      if (process.stdout.isTTY) {
        await playInstallBanner();
      } else {
        console.log(`compound-agent v${VERSION}`);
      }
      console.log('');
      console.log(CHANGELOG_RECENT);
    });
}
