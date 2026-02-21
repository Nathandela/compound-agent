/**
 * About command — display version with banner animation and recent changelog.
 *
 * Usage: ca about
 */

import type { Command } from 'commander';

import { VERSION } from '../version.js';
import { CHANGELOG_RECENT } from '../changelog-data.js';
import { playInstallBanner } from '../setup/index.js';

export function registerAboutCommand(program: Command): void {
  program
    .command('about')
    .description('Show version, animation, and recent changelog')
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
