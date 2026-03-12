/**
 * About command — display version with banner animation and recent changelog.
 *
 * Usage: ca about
 */

import type { Command } from 'commander';

import { VERSION } from '../version.js';
import { CHANGELOG_RECENT } from '../changelog-data.js';
import { playInstallBanner } from '../setup/index.js';

const REPO_URL = 'https://github.com/Nathandela/compound-agent';
const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

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

      if (process.stdout.isTTY) {
        console.log('');
        console.log(`Find this useful? Star us: ${REPO_URL}`);
        console.log(`Feedback & discussions:    ${DISCUSSIONS_URL}`);
      }
    });
}
