/**
 * Read tracker hook for PostToolUse.
 *
 * Tracks when skill files are Read and appends them to the
 * phase state's skills_read array.
 */

// eslint-disable-next-line compound-agent/enforce-barrel-exports -- avoids setup<->commands barrel cycle during hook startup
import { getPhaseState, updatePhaseState } from '../commands/phase-check.js';

const SKILL_PATH_PATTERN = /(?:^|\/)\.claude\/skills\/compound\/([^/]+)\/SKILL\.md$/;

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

function toCanonicalSkillPath(filePath: string): string | null {
  const normalized = normalizePath(filePath);
  const match = SKILL_PATH_PATTERN.exec(normalized);
  if (!match?.[1]) return null;
  return `.claude/skills/compound/${match[1]}/SKILL.md`;
}

/**
 * Process a PostToolUse Read event and track skill file reads.
 *
 * Appends the file path to skills_read when a skill file is read.
 * Returns {} in all other cases.
 */
export function processReadTracker(
  repoRoot: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Record<string, never> {
  try {
    if (toolName !== 'Read') return {};

    const state = getPhaseState(repoRoot);
    if (state === null || !state.cookit_active) return {};

    const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : null;
    if (filePath === null) return {};

    const canonicalPath = toCanonicalSkillPath(filePath);
    if (canonicalPath === null) return {};

    if (!state.skills_read.includes(canonicalPath)) {
      updatePhaseState(repoRoot, {
        skills_read: [...state.skills_read, canonicalPath],
      });
    }

    return {};
  } catch {
    return {};
  }
}
