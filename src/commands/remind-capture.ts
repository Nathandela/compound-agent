/**
 * Remind-capture command: PreCommit hook reminder for lesson capture.
 *
 * Invariants (from doc/verification/remind-capture-invariants.md):
 * - Safety S1: Never block commits (exit 0 always)
 * - Safety S2: Silent exit when no staged changes or not a git repo
 * - Safety S3: Output bounded (< 800 characters)
 * - Liveness L1: Output reminder when staged changes present
 * - Liveness L2: Command completes quickly (< 500ms)
 */

import type { Command } from 'commander';
import { execSync } from 'node:child_process';

/** Maximum output length in characters (conservative token estimate: ~200 tokens) */
const OUTPUT_MAX_CHARS = 800;

/** Reminder template shown when staged changes are present */
const REMIND_TEMPLATE = `# Lesson Capture Reminder

Before committing, consider:

**Did you learn anything this session?**
- Were you corrected by the user?
- Did you fix a failing test after multiple attempts?
- Did you discover something project-specific?

If yes, capture it now:
\`\`\`
ca learn "<what you learned>"
\`\`\`

Or use the \`lesson_capture\` tool directly.
`;

/**
 * Check if there are staged changes in the current git repository.
 *
 * @param cwd - Working directory to run git commands in
 * @returns true if staged changes exist, false otherwise (including errors)
 */
export function hasStagedChanges(cwd?: string): boolean {
  try {
    const staged = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 1000, // 1 second max
      cwd,
    });
    return staged.trim().length > 0;
  } catch {
    // Not a git repo, git not installed, or error - silent exit
    return false;
  }
}

/**
 * Get the remind-capture output (for testing).
 *
 * @param cwd - Working directory to check
 * @returns reminder string if staged changes present, empty string otherwise
 */
export function getRemindCaptureOutput(cwd?: string): string {
  // Safety S2: Silent exit if no staged changes
  if (!hasStagedChanges(cwd)) {
    return '';
  }

  // Liveness L1: Output reminder when staged changes present
  // Safety S3: Verify output is bounded
  if (REMIND_TEMPLATE.length > OUTPUT_MAX_CHARS) {
    // This should never happen - template is static
    // But if it does, truncate to maintain safety property
    return REMIND_TEMPLATE.slice(0, OUTPUT_MAX_CHARS);
  }

  return REMIND_TEMPLATE;
}

/**
 * Register the remind-capture command on the program.
 *
 * @param program - Commander program instance
 */
export function registerRemindCaptureCommand(program: Command): void {
  program
    .command('remind-capture')
    .description('PreCommit hook: remind to capture lessons')
    .action(() => {
      // Safety S1: Never block commits - exit 0 always
      try {
        const output = getRemindCaptureOutput();
        if (output) {
          console.log(output);
        }
      } catch {
        // Safety S1: Any error -> silent exit 0
      }

      // Safety S1: Always exit 0
      process.exit(0);
    });
}
