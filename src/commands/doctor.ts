/**
 * Doctor command — verify external dependencies and project health.
 *
 * Usage: ca doctor
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { isModelAvailable } from '../memory/embeddings/index.js';
import { ensureSqliteAvailable } from '../memory/storage/index.js';
import { LESSONS_PATH } from '../memory/storage/index.js';
import {
  checkBeadsAvailable,
  checkUserScope,
  getClaudeSettingsPath,
  hasAllCompoundAgentHooks,
  readClaudeSettings,
} from '../setup/index.js';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  fix?: string;
}

function checkGitignoreHealth(repoRoot: string): boolean {
  const gitignorePath = join(repoRoot, '.gitignore');
  if (!existsSync(gitignorePath)) return false;
  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = new Set(content.split('\n').map(l => l.trim()));
    return ['node_modules/', '.claude/.cache/', '.claude/.ca-*.json'].every(p => lines.has(p));
  } catch {
    return false;
  }
}

/**
 * Run all health checks and return results.
 */
export async function runDoctor(repoRoot: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  // 1. .claude/ directory
  const claudeDir = join(repoRoot, '.claude');
  checks.push(existsSync(claudeDir)
    ? { name: '.claude directory', status: 'pass' }
    : { name: '.claude directory', status: 'fail', fix: 'Run: npx ca setup' });

  // 2. Lessons index
  const lessonsPath = join(repoRoot, LESSONS_PATH);
  checks.push(existsSync(lessonsPath)
    ? { name: 'Lessons index', status: 'pass' }
    : { name: 'Lessons index', status: 'warn', fix: 'Run: npx ca setup' });

  // 3. Agent templates
  const agentsDir = join(repoRoot, '.claude', 'agents', 'compound');
  checks.push(existsSync(agentsDir)
    ? { name: 'Agent templates', status: 'pass' }
    : { name: 'Agent templates', status: 'fail', fix: 'Run: npx ca setup' });

  // 4. Workflow commands
  const commandsDir = join(repoRoot, '.claude', 'commands', 'compound');
  checks.push(existsSync(commandsDir)
    ? { name: 'Workflow commands', status: 'pass' }
    : { name: 'Workflow commands', status: 'fail', fix: 'Run: npx ca setup' });

  // 5. Hooks
  const settingsPath = getClaudeSettingsPath(false);
  let hooksOk = false;
  try {
    const settings = await readClaudeSettings(settingsPath);
    hooksOk = hasAllCompoundAgentHooks(settings);
  } catch {
    // settings.json may not exist
  }
  checks.push(hooksOk
    ? { name: 'Claude hooks', status: 'pass' }
    : { name: 'Claude hooks', status: 'fail', fix: 'Run: npx ca setup' });

  // 6. Embedding model
  checks.push(checkEmbeddingModel());

  // 7. SQLite (better-sqlite3)
  checks.push(checkSqliteHealth());

  // 8. pnpm onlyBuiltDependencies config
  const pnpmCheck = checkPnpmBuildConfig(repoRoot);
  if (pnpmCheck !== null) {
    checks.push(pnpmCheck);
  }

  // 9. Beads CLI available
  const beadsResult = checkBeadsAvailable();
  checks.push(beadsResult.available
    ? { name: 'Beads CLI', status: 'pass' }
    : { name: 'Beads CLI', status: 'warn', fix: 'Install beads: https://github.com/Nathandela/beads' });

  // 10. .gitignore health
  checks.push(checkGitignoreHealth(repoRoot)
    ? { name: '.gitignore health', status: 'pass' }
    : { name: '.gitignore health', status: 'warn', fix: 'Run: npx ca setup --update' });

  // 11. Usage documentation
  const docPath = join(repoRoot, 'docs', 'compound', 'README.md');
  checks.push(existsSync(docPath)
    ? { name: 'Usage documentation', status: 'pass' }
    : { name: 'Usage documentation', status: 'warn', fix: 'Run: npx ca setup' });

  // 12. Beads initialized
  const beadsDir = join(repoRoot, '.beads');
  checks.push(existsSync(beadsDir)
    ? { name: 'Beads initialized', status: 'pass' }
    : { name: 'Beads initialized', status: 'warn', fix: 'Run: bd init' });

  // 13. Beads healthy
  if (beadsResult.available && existsSync(beadsDir)) {
    try {
      execSync('bd doctor', { cwd: repoRoot, shell: '/bin/sh', stdio: 'pipe' });
      checks.push({ name: 'Beads healthy', status: 'pass' });
    } catch {
      checks.push({ name: 'Beads healthy', status: 'warn', fix: 'Run: bd doctor' });
    }
  }

  // 14. Codebase scope
  const scope = checkUserScope(repoRoot);
  checks.push(!scope.isUserScope
    ? { name: 'Codebase scope', status: 'pass' }
    : { name: 'Codebase scope', status: 'warn', fix: 'Install in a specific repository, not home directory' });

  return checks;
}

function checkEmbeddingModel(): DoctorCheck {
  try {
    return isModelAvailable()
      ? { name: 'Embedding model', status: 'pass' }
      : { name: 'Embedding model', status: 'warn', fix: 'Run: npx ca download-model' };
  } catch {
    return { name: 'Embedding model', status: 'warn', fix: 'Run: npx ca download-model' };
  }
}

function checkSqliteHealth(): DoctorCheck {
  try {
    ensureSqliteAvailable();
    return { name: 'SQLite (better-sqlite3)', status: 'pass' };
  } catch {
    return { name: 'SQLite (better-sqlite3)', status: 'fail', fix: 'Run: pnpm rebuild better-sqlite3 (or npm rebuild better-sqlite3)' };
  }
}

/**
 * Check if a pnpm project has onlyBuiltDependencies configured for native addons.
 * Returns null for non-pnpm projects (check is irrelevant).
 *
 * NOTE: The required deps list must stay in sync with
 * src/setup/primitives.ts REQUIRED_BUILD_DEPS and scripts/postinstall.mjs.
 */
export function checkPnpmBuildConfig(repoRoot: string): DoctorCheck | null {
  const lockPath = join(repoRoot, 'pnpm-lock.yaml');
  const pkgPath = join(repoRoot, 'package.json');

  // Single read of package.json, reused for both pnpm detection and config check
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch { return null; }

  const hasLockfile = existsSync(lockPath);
  const hasPmField = typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm');
  if (!hasLockfile && !hasPmField) return null;

  const pnpmConfig = pkg.pnpm as Record<string, unknown> | undefined;
  const deps = pnpmConfig?.onlyBuiltDependencies;
  if (!Array.isArray(deps)) {
    return { name: 'pnpm build config', status: 'fail', fix: 'Run: npx ca setup (or add "pnpm.onlyBuiltDependencies" to package.json)' };
  }
  // Wildcard "*" means all builds are allowed
  if (deps.includes('*')) return { name: 'pnpm build config', status: 'pass' };
  const required = ['better-sqlite3', 'node-llama-cpp'];
  const missing = required.filter(d => !deps.includes(d));
  if (missing.length > 0) {
    return { name: 'pnpm build config', status: 'fail', fix: `Missing from onlyBuiltDependencies: [${missing.join(', ')}]. Run: npx ca setup` };
  }
  return { name: 'pnpm build config', status: 'pass' };
}

const STATUS_ICONS: Record<string, string> = {
  pass: 'OK',
  fail: 'FAIL',
  warn: 'WARN',
};

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Verify external dependencies and project health')
    .action(async () => {
      const repoRoot = getRepoRoot();
      const checks = await runDoctor(repoRoot);

      console.log('Compound Agent Health Check:\n');
      for (const check of checks) {
        const icon = STATUS_ICONS[check.status];
        const line = `  [${icon}] ${check.name}`;
        console.log(line);
        if (check.fix) {
          console.log(`        Fix: ${check.fix}`);
        }
      }

      const failures = checks.filter(c => c.status === 'fail');
      const warnings = checks.filter(c => c.status === 'warn');
      console.log('');
      if (failures.length === 0 && warnings.length === 0) {
        console.log('All checks passed.');
      } else {
        if (failures.length > 0) console.log(`${failures.length} check(s) failed.`);
        if (warnings.length > 0) console.log(`${warnings.length} warning(s).`);
      }
    });
}
