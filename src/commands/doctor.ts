/**
 * Doctor command — verify external dependencies and project health.
 *
 * Usage: ca doctor
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { isModelAvailable } from '../memory/embeddings/index.js';
import { LESSONS_PATH } from '../memory/storage/index.js';
import {
  getClaudeSettingsPath,
  hasClaudeHook,
  hasMcpServerInMcpJson,
  readClaudeSettings,
} from '../setup/index.js';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  fix?: string;
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
    hooksOk = hasClaudeHook(settings);
  } catch {
    // settings.json may not exist
  }
  checks.push(hooksOk
    ? { name: 'Claude hooks', status: 'pass' }
    : { name: 'Claude hooks', status: 'fail', fix: 'Run: npx ca setup' });

  // 6. MCP server
  const mcpOk = await hasMcpServerInMcpJson(repoRoot);
  checks.push(mcpOk
    ? { name: 'MCP server', status: 'pass' }
    : { name: 'MCP server', status: 'fail', fix: 'Run: npx ca setup' });

  // 7. Embedding model
  let modelOk = false;
  try {
    modelOk = isModelAvailable();
  } catch {
    // model check may fail
  }
  checks.push(modelOk
    ? { name: 'Embedding model', status: 'pass' }
    : { name: 'Embedding model', status: 'warn', fix: 'Run: npx ca download-model' });

  return checks;
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
