/**
 * Phase guard hook for PreToolUse.
 *
 * Warns when Edit or Write tools are used without having read
 * the current phase skill file.
 */

// eslint-disable-next-line compound-agent/enforce-barrel-exports -- avoids setup<->commands barrel cycle during hook startup
import { getPhaseState } from '../commands/phase-check.js';

export interface PhaseGuardOutput {
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    additionalContext?: string;
  };
}

/**
 * Process a PreToolUse event and check phase compliance.
 *
 * Returns a warning if Edit/Write is attempted without reading
 * the current phase skill. Returns {} in all other cases.
 */
export function processPhaseGuard(
  repoRoot: string,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _toolInput: Record<string, unknown>
): PhaseGuardOutput {
  try {
    if (toolName !== 'Edit' && toolName !== 'Write') return {};

    const state = getPhaseState(repoRoot);
    if (state === null || !state.lfg_active) return {};

    const expectedSkillPath = `.claude/skills/compound/${state.current_phase}/SKILL.md`;
    const skillRead = state.skills_read.includes(expectedSkillPath);

    if (!skillRead) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext:
            `PHASE GUARD WARNING: You are in LFG phase ${state.phase_index}/5 (${state.current_phase}) ` +
            `but have NOT read the skill file yet. Read ${expectedSkillPath} before continuing.`,
        },
      };
    }

    return {};
  } catch {
    return {};
  }
}
