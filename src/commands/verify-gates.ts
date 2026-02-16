/**
 * Verify-gates command — check workflow gates before epic closure.
 *
 * Usage: ca verify-gates <epic-id>
 */

import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';

/** Strict pattern for valid beads epic IDs. */
const EPIC_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

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
 * Parse dependencies from `bd show --json` output.
 */
function parseDepsJson(raw: string): DepTask[] {
  const data = JSON.parse(raw);
  const issue = Array.isArray(data) ? data[0] : data;
  if (!issue) return [];
  const depsArray = issue.depends_on ?? issue.dependencies ?? [];
  return depsArray.map((dep: { title?: string; status?: string }) => ({
    closed: dep.status === 'closed',
    title: dep.title ?? '',
  }));
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

/**
 * Run all gate checks for the given epic and return results.
 */
export async function runVerifyGates(epicId: string): Promise<GateCheck[]> {
  if (!EPIC_ID_PATTERN.test(epicId)) {
    throw new Error(`Invalid epic ID: "${epicId}" (must be alphanumeric with hyphens/underscores)`);
  }

  const raw = execFileSync('bd', ['show', epicId, '--json'], { encoding: 'utf-8' });

  let deps: DepTask[];
  try {
    deps = parseDepsJson(raw);
  } catch {
    // Fallback to text parsing if --json output is not valid JSON
    const textRaw = execFileSync('bd', ['show', epicId], { encoding: 'utf-8' });
    deps = parseDepsText(textRaw);
  }

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
