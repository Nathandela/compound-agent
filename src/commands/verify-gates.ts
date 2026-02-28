/**
 * Verify-gates command — check workflow gates before epic closure.
 *
 * Usage: ca verify-gates <epic-id>
 */

import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';

import { getRepoRoot, parseBdShowDeps, validateEpicId } from '../cli-utils.js';
import { cleanPhaseState, getPhaseState } from './phase-check.js';

export interface GateCheck {
  name: string;
  status: 'pass' | 'fail';
  detail?: string;
}

interface DepTask {
  closed: boolean;
  title: string;
}

interface VerifyGatesOptions {
  repoRoot?: string;
}

/**
 * Parse dependencies from `bd show --json` output into DepTask format.
 */
function parseDepsJson(raw: string): DepTask[] {
  return parseBdShowDeps(raw).map(d => ({ closed: d.status === 'closed', title: d.title }));
}

/**
 * Fallback: parse the DEPENDS ON section from `bd show` text output.
 */
function parseDepsText(output: string): DepTask[] {
  const deps: DepTask[] = [];
  const lines = output.split('\n');
  let inDeps = false;

  for (const line of lines) {
    if (line.trim() === 'DEPENDS ON') {
      inDeps = true;
      continue;
    }
    if (inDeps) {
      const match = line.match(
        /^\s+→\s+(✓|○)\s+\S+-\S+:\s+(.+?)\s+●/,
      );
      if (match && match[1] && match[2]) {
        deps.push({ closed: match[1] === '✓', title: match[2] });
      } else if (line.trim() !== '' && !line.startsWith('  ')) {
        break;
      }
    }
  }

  return deps;
}

/**
 * Check a single gate: find a dep whose title starts with the given prefix.
 */
function checkGate(
  deps: DepTask[],
  prefix: string,
  gateName: string,
): GateCheck {
  const task = deps.find(d => d.title.startsWith(prefix));

  if (!task) {
    return { name: gateName, status: 'fail', detail: `No ${gateName.toLowerCase()} found (missing)` };
  }
  if (!task.closed) {
    return { name: gateName, status: 'fail', detail: `${gateName} exists but is not closed` };
  }
  return { name: gateName, status: 'pass' };
}

export async function runVerifyGates(
  epicId: string,
  options: VerifyGatesOptions = {}
): Promise<GateCheck[]> {
  validateEpicId(epicId);

  const repoRoot = options.repoRoot ?? getRepoRoot();
  const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });

  let deps: DepTask[];
  try {
    deps = parseDepsJson(raw);
  } catch {
    // Fallback to text parsing if --json output is not valid JSON
    const textRaw = execFileSync('bd', ['show', epicId], { encoding: 'utf-8' });
    deps = parseDepsText(textRaw);
  }

  const checks = [
    checkGate(deps, 'Review:', 'Review task'),
    checkGate(deps, 'Compound:', 'Compound task'),
  ];

  const allPassed = checks.every((check) => check.status === 'pass');
  if (allPassed) {
    const state = getPhaseState(repoRoot);
    if (state !== null && state.lfg_active && state.gates_passed.includes('final')) {
      cleanPhaseState(repoRoot);
    }
  }

  return checks;
}

const STATUS_LABEL: Record<string, string> = {
  pass: 'PASS',
  fail: 'FAIL',
};

export function registerVerifyGatesCommand(program: Command): void {
  program
    .command('verify-gates <epic-id>')
    .description('Verify workflow gates are satisfied before epic closure')
    .action(async (epicId: string) => {
      try {
        const checks = await runVerifyGates(epicId, { repoRoot: getRepoRoot() });

        console.log(`Gate checks for epic ${epicId}:\n`);
        for (const check of checks) {
          const label = STATUS_LABEL[check.status];
          console.log(`  [${label}] ${check.name}`);
          if (check.detail) {
            console.log(`          ${check.detail}`);
          }
        }

        const failures = checks.filter(c => c.status === 'fail');
        console.log('');
        if (failures.length === 0) {
          console.log('All gates passed.');
        } else {
          console.log(`${failures.length} gate(s) failed.`);
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
