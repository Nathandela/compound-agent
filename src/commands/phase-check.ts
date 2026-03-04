/**
 * Phase check state machine.
 *
 * Manages LFG phase state in .claude/.ca-phase-state.json.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { EPIC_ID_PATTERN, getRepoRoot } from '../cli-utils.js';

const STATE_DIR = '.claude';
const STATE_FILE = '.ca-phase-state.json';

/** Max age for phase state before it's considered stale (72 hours). */
export const PHASE_STATE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export const PHASES = ['spec-dev', 'plan', 'work', 'review', 'compound'] as const;
export type PhaseName = (typeof PHASES)[number];

export const GATES = ['post-plan', 'gate-3', 'gate-4', 'final'] as const;
export type GateName = (typeof GATES)[number];

const PHASE_INDEX: Record<PhaseName, number> = {
  'spec-dev': 1,
  plan: 2,
  work: 3,
  review: 4,
  compound: 5,
};

export interface PhaseState {
  lfg_active: boolean;
  epic_id: string;
  current_phase: PhaseName;
  phase_index: number;
  skills_read: string[];
  gates_passed: GateName[];
  started_at: string;
}

function getStatePath(repoRoot: string): string {
  return join(repoRoot, STATE_DIR, STATE_FILE);
}

function isPhaseName(value: unknown): value is PhaseName {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}

function isGateName(value: unknown): value is GateName {
  return typeof value === 'string' && (GATES as readonly string[]).includes(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return !Number.isNaN(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validatePhaseState(raw: unknown): raw is PhaseState {
  if (typeof raw !== 'object' || raw === null) return false;
  const state = raw as Record<string, unknown>;

  return (
    typeof state.lfg_active === 'boolean' &&
    typeof state.epic_id === 'string' &&
    isPhaseName(state.current_phase) &&
    typeof state.phase_index === 'number' &&
    state.phase_index >= 1 &&
    state.phase_index <= 5 &&
    isStringArray(state.skills_read) &&
    Array.isArray(state.gates_passed) &&
    state.gates_passed.every((gate) => isGateName(gate)) &&
    isIsoDate(state.started_at)
  );
}

export function expectedGateForPhase(phaseIndex: number): GateName | null {
  if (phaseIndex === 2) return 'post-plan';
  if (phaseIndex === 3) return 'gate-3';
  if (phaseIndex === 4) return 'gate-4';
  if (phaseIndex === 5) return 'final';
  return null;
}

export function initPhaseState(repoRoot: string, epicId: string): PhaseState {
  const dir = join(repoRoot, STATE_DIR);
  mkdirSync(dir, { recursive: true });

  const state: PhaseState = {
    lfg_active: true,
    epic_id: epicId,
    current_phase: 'spec-dev',
    phase_index: PHASE_INDEX['spec-dev'],
    skills_read: [],
    gates_passed: [],
    started_at: new Date().toISOString(),
  };
  writeFileSync(getStatePath(repoRoot), JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

export function getPhaseState(repoRoot: string): PhaseState | null {
  try {
    const path = getStatePath(repoRoot);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!validatePhaseState(parsed)) return null;
    // TTL check: discard and clean up stale state from abandoned LFG runs
    const age = Date.now() - new Date(parsed.started_at).getTime();
    if (age > PHASE_STATE_MAX_AGE_MS) {
      cleanPhaseState(repoRoot);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function updatePhaseState(repoRoot: string, partial: Partial<PhaseState>): PhaseState | null {
  const current = getPhaseState(repoRoot);
  if (current === null) return null;

  const updated: PhaseState = {
    ...current,
    ...partial,
  };

  if (!validatePhaseState(updated)) return null;

  writeFileSync(getStatePath(repoRoot), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export function startPhase(repoRoot: string, phase: PhaseName): PhaseState | null {
  return updatePhaseState(repoRoot, {
    current_phase: phase,
    phase_index: PHASE_INDEX[phase],
  });
}

export function cleanPhaseState(repoRoot: string): void {
  try {
    const path = getStatePath(repoRoot);
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Silent cleanup
  }
}

export function recordGatePassed(repoRoot: string, gate: GateName): PhaseState | null {
  const current = getPhaseState(repoRoot);
  if (current === null) return null;

  const gatesPassed = current.gates_passed.includes(gate)
    ? current.gates_passed
    : [...current.gates_passed, gate];
  const updated: PhaseState = { ...current, gates_passed: gatesPassed };

  // Final gate closes the active loop state.
  if (gate === 'final') {
    cleanPhaseState(repoRoot);
    return updated;
  }

  writeFileSync(getStatePath(repoRoot), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

function printStatusHuman(state: PhaseState | null): void {
  if (state === null) {
    console.log('No active LFG session.');
    return;
  }
  console.log('Active LFG Session');
  console.log(`  Epic: ${state.epic_id}`);
  console.log(`  Phase: ${state.current_phase} (${state.phase_index}/5)`);
  console.log(`  Skills read: ${state.skills_read.length === 0 ? '(none)' : state.skills_read.join(', ')}`);
  console.log(`  Gates passed: ${state.gates_passed.length === 0 ? '(none)' : state.gates_passed.join(', ')}`);
  console.log(`  Started: ${state.started_at}`);
}

// eslint-disable-next-line max-lines-per-function -- command router registers multiple subcommands
function registerPhaseSubcommands(
  phaseCheck: Command,
  getDryRun: () => boolean,
  repoRoot: () => string
): void {
  phaseCheck
    .command('init <epic-id>')
    .description('Initialize phase state for an epic')
    .action((epicId: string) => {
      if (!EPIC_ID_PATTERN.test(epicId)) {
        console.error(`Invalid epic ID: "${epicId}"`);
        process.exitCode = 1;
        return;
      }
      if (getDryRun()) { console.log(`[dry-run] Would initialize phase state for epic ${epicId} in ${repoRoot()}`); return; }
      initPhaseState(repoRoot(), epicId);
      console.log(`Phase state initialized for ${epicId}. Current phase: spec-dev (1/5).`);
    });

  phaseCheck
    .command('start <phase>')
    .description('Start or resume a phase')
    .action((phase: string) => {
      if (!isPhaseName(phase)) {
        console.error(`Invalid phase: "${phase}". Valid phases: ${PHASES.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      if (getDryRun()) { console.log(`[dry-run] Would start phase ${phase}`); return; }
      const state = startPhase(repoRoot(), phase);
      if (state === null) {
        console.error('No active phase state. Run: ca phase-check init <epic-id>');
        process.exitCode = 1;
        return;
      }
      console.log(`Phase updated: ${state.current_phase} (${state.phase_index}/5).`);
    });

  phaseCheck
    .command('gate <gate-name>')
    .description('Record a phase gate as passed')
    .action((gateName: string) => {
      if (!isGateName(gateName)) {
        console.error(`Invalid gate: "${gateName}". Valid gates: ${GATES.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      if (getDryRun()) { console.log(`[dry-run] Would record gate ${gateName}`); return; }
      const state = recordGatePassed(repoRoot(), gateName);
      if (state === null) {
        console.error('No active phase state. Run: ca phase-check init <epic-id>');
        process.exitCode = 1;
        return;
      }
      if (gateName === 'final') {
        console.log('Final gate recorded. Phase state cleaned.');
        return;
      }
      console.log(`Gate recorded: ${gateName}.`);
    });

  phaseCheck
    .command('status')
    .description('Show current phase state')
    .option('--json', 'Output raw JSON')
    .action((options: { json?: boolean }) => {
      const state = getPhaseState(repoRoot());
      if (options.json) { console.log(JSON.stringify(state ?? { lfg_active: false })); return; }
      printStatusHuman(state);
    });

  phaseCheck
    .command('clean')
    .description('Remove phase state file')
    .action(() => {
      if (getDryRun()) { console.log('[dry-run] Would delete phase state file'); return; }
      cleanPhaseState(repoRoot());
      console.log('Phase state cleaned.');
    });
}

export function registerPhaseCheckCommand(program: Command): void {
  const phaseCheck = program
    .command('phase-check')
    .description('Manage LFG phase state')
    .option('--dry-run', 'Show what would be done without making changes');

  const getDryRun = (): boolean => phaseCheck.opts<{ dryRun?: boolean }>().dryRun ?? false;
  const repoRoot = (): string => getRepoRoot();

  registerPhaseSubcommands(phaseCheck, getDryRun, repoRoot);

  program
    .command('phase-clean')
    .description('Remove phase state file (alias for `phase-check clean`)')
    .action(() => { cleanPhaseState(repoRoot()); console.log('Phase state cleaned.'); });
}
