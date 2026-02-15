/**
 * Verify-gates command — check workflow gates before epic closure.
 *
 * Usage: ca verify-gates <epic-id>
 */

import { execSync } from 'node:child_process';
import type { Command } from 'commander';

export interface GateCheck {
  name: string;
  status: 'pass' | 'fail';
  detail?: string;
}

interface DepTask {
  closed: boolean;
  title: string;
}

/**
 * Parse the DEPENDS ON section from `bd show` output.
 */
function parseDeps(output: string): DepTask[] {
  const deps: DepTask[] = [];
  const lines = output.split('\n');
  let inDeps = false;

  for (const line of lines) {
    if (line.trim() === 'DEPENDS ON') {
      inDeps = true;
      continue;
    }
    if (inDeps) {
      // Dependency lines start with "  ->" or similar arrow
      // Match any beads ID prefix (e.g., learning_agent-xxx, my-project-xxx)
      const match = line.match(
        /^\s+→\s+(✓|○)\s+\S+-\S+:\s+(.+?)\s+●/,
      );
      if (match && match[1] && match[2]) {
        deps.push({ closed: match[1] === '✓', title: match[2] });
      } else if (line.trim() !== '' && !line.startsWith('  ')) {
        // Left the DEPENDS ON section
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

/**
 * Run all gate checks for the given epic and return results.
 */
export async function runVerifyGates(epicId: string): Promise<GateCheck[]> {
  const raw = execSync(`bd show ${epicId}`, { encoding: 'utf-8' });
  const deps = parseDeps(raw);

  return [
    checkGate(deps, 'Review:', 'Review task'),
    checkGate(deps, 'Compound:', 'Compound task'),
  ];
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
        const checks = await runVerifyGates(epicId);

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
