/**
 * Stop audit hook.
 *
 * Verifies required phase gates before allowing Claude to stop.
 */

// eslint-disable-next-line compound-agent/enforce-barrel-exports -- avoids setup<->commands barrel cycle during hook startup
import { expectedGateForPhase, getPhaseState, PHASES } from '../commands/phase-check.js';

export interface StopAuditOutput {
  continue?: false;
  stopReason?: string;
}

function hasTransitionEvidence(state: {
  phase_index: number;
  skills_read: string[];
}): boolean {
  // Final phase requires explicit final-gate verification.
  if (state.phase_index === 5) return true;

  // For phases 2-4, only block when there is evidence Claude moved on:
  // reading the next phase skill file.
  const nextPhase = PHASES[state.phase_index];
  if (nextPhase === undefined) return false;
  const nextSkillPath = `.claude/skills/compound/${nextPhase}/SKILL.md`;
  return state.skills_read.includes(nextSkillPath);
}

/**
 * Process a Stop event and check if the expected gate is passed.
 *
 * Returns { continue: false, stopReason } when stop is blocked.
 * Returns {} in all other cases (no state, lfg inactive, gate passed, etc.).
 */
export function processStopAudit(repoRoot: string, stopHookActive = false): StopAuditOutput {
  try {
    // Prevent recursive blocking loops from Stop hook retries.
    if (stopHookActive) return {};

    const state = getPhaseState(repoRoot);
    if (state === null || !state.lfg_active) return {};

    const expectedGate = expectedGateForPhase(state.phase_index);
    if (expectedGate === null) return {};

    if (state.gates_passed.includes(expectedGate)) return {};
    if (!hasTransitionEvidence(state)) return {};

    return {
      continue: false,
      stopReason: `PHASE GATE NOT VERIFIED: ${state.current_phase} requires gate '${expectedGate}'. Run: npx ca phase-check gate ${expectedGate}`,
    };
  } catch {
    return {};
  }
}
