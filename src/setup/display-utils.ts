/**
 * Shared display/print utilities for setup commands.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { runFullBeadsCheck, type BeadsFullCheck } from './beads-check.js';
import {
  getClaudeSettingsPath,
  hasAllCompoundAgentHooks,
  readClaudeSettings,
} from './claude-helpers.js';
import { ensureSqliteAvailable } from '../memory/storage/index.js';
import type { GitignoreResult } from './gitignore.js';
import type { HookInstallResult } from './hooks.js';
import type { PnpmConfigResult, SqliteVerifyResult } from './primitives.js';
import { checkUserScope, type ScopeCheckResult } from './scope-check.js';

export function printGitignoreStatus(result: GitignoreResult): void {
  if (result.added.length > 0) {
    console.log(`  .gitignore: Added [${result.added.join(', ')}]`);
  } else {
    console.log('  .gitignore: Already configured');
  }
}

export function printSetupGitHooksStatus(gitHooks: HookInstallResult['status'] | 'skipped'): void {
  if (gitHooks === 'skipped') {
    console.log('  Git hooks: Skipped (--skip-hooks)');
    return;
  }
  if (gitHooks === 'not_git_repo') {
    console.log('  Git hooks: Skipped (not a git repository)');
    return;
  }
  if (gitHooks === 'installed') {
    console.log('  Git hooks: Installed');
    return;
  }
  if (gitHooks === 'appended') {
    console.log('  Git hooks: Appended to existing pre-commit hook');
    return;
  }
  console.log('  Git hooks: Already configured');
}

export function printPnpmConfigStatus(result: PnpmConfigResult): void {
  if (!result.isPnpm) return;
  if (result.alreadyConfigured) {
    console.log('  pnpm config: onlyBuiltDependencies already configured');
  } else if (result.added.length > 0) {
    console.log(`  pnpm config: Added onlyBuiltDependencies [${result.added.join(', ')}]`);
  }
}

const SQLITE_STATUS_MSG: Record<SqliteVerifyResult['action'], string> = {
  already_ok: 'OK',
  rebuilt: 'OK (rebuilt native module)',
  installed_and_rebuilt: 'OK (installed + rebuilt native module)',
  failed: 'FAILED',
};

export function printSqliteStatus(result: SqliteVerifyResult): void {
  const msg = SQLITE_STATUS_MSG[result.action];
  console.log(`  SQLite:             ${msg}`);
  if (result.error) {
    console.log(`                      ${result.error}`);
  }
}

export function printBeadsFullStatus(check: BeadsFullCheck): void {
  console.log(`  Beads CLI:          ${check.cliAvailable ? 'OK' : 'not found'}`);
  if (check.cliAvailable) {
    console.log(`  Beads repo:         ${check.initialized ? 'OK' : 'not initialized (run: bd init)'}`);
    if (check.initialized) {
      console.log(`  Beads health:       ${check.healthy ? 'OK' : `issues found${check.healthMessage ? ` — ${check.healthMessage}` : ''}`}`);
    }
  }
}

export function printScopeStatus(scope: ScopeCheckResult): void {
  if (scope.isUserScope) {
    console.log('  Scope:              user-scope (reduced compounding value)');
  } else {
    console.log('  Scope:              OK (repository scope)');
  }
}

/**
 * Show installation status (used by `ca setup --status`).
 */
export async function runStatus(repoRoot: string): Promise<void> {
  const agentsDir = join(repoRoot, '.claude', 'agents', 'compound');
  const commandsDir = join(repoRoot, '.claude', 'commands', 'compound');
  const skillsDir = join(repoRoot, '.claude', 'skills', 'compound');
  const pluginPath = join(repoRoot, '.claude', 'plugin.json');

  console.log('Compound Agent Status:');
  console.log(`  Agent templates:    ${existsSync(agentsDir) ? 'installed' : 'not installed'}`);
  console.log(`  Workflow commands:  ${existsSync(commandsDir) ? 'installed' : 'not installed'}`);
  console.log(`  Phase skills:       ${existsSync(skillsDir) ? 'installed' : 'not installed'}`);
  console.log(`  Plugin manifest:    ${existsSync(pluginPath) ? 'installed' : 'not installed'}`);

  const settingsPath = getClaudeSettingsPath(false);
  let hooksInstalled = false;
  try {
    const settings = await readClaudeSettings(settingsPath);
    hooksInstalled = hasAllCompoundAgentHooks(settings);
  } catch {
    // No settings
  }
  console.log(`  Hooks:              ${hooksInstalled ? 'installed' : 'not installed'}`);

  let sqliteOk = false;
  try {
    ensureSqliteAvailable();
    sqliteOk = true;
  } catch { /* not loadable */ }
  console.log(`  SQLite:             ${sqliteOk ? 'OK' : 'not available (run: pnpm rebuild better-sqlite3)'}`);

  const fullBeads = runFullBeadsCheck(repoRoot);
  printBeadsFullStatus(fullBeads);
  const scope = checkUserScope(repoRoot);
  printScopeStatus(scope);
}
