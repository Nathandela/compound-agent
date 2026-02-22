/**
 * UserPromptSubmit hook: pattern detection and memory tool reminders.
 */

/** Patterns that suggest user is correcting Claude */
const CORRECTION_PATTERNS = [
  /\bactually\b/i,
  /\bno[,.]?\s/i,
  /\bwrong\b/i,
  /\bthat'?s not right\b/i,
  /\bthat'?s incorrect\b/i,
  /\buse .+ instead\b/i,
  /\bi told you\b/i,
  /\bi already said\b/i,
  /\bnot like that\b/i,
  /\byou forgot\b/i,
  /\byou missed\b/i,
  /\bstop\s*(,\s*)?(doing|using|that)\b/i,
  /\bwait\s*(,\s*)?(that|no|wrong)\b/i,
];

/** High-confidence planning patterns (single match sufficient) */
const HIGH_CONFIDENCE_PLANNING = [
  /\bdecide\b/i,
  /\bchoose\b/i,
  /\bpick\b/i,
  /\bwhich approach\b/i,
  /\bwhat do you think\b/i,
  /\bshould we\b/i,
  /\bwould you\b/i,
  /\bhow should\b/i,
  /\bwhat'?s the best\b/i,
  /\badd feature\b/i,
  /\bset up\b/i,
];

/** Low-confidence planning patterns (need 2+ matches) */
const LOW_CONFIDENCE_PLANNING = [
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\brefactor\b/i,
  /\bfix\b/i,
  /\bwrite\b/i,
  /\bdevelop\b/i,
];

/** Reminder messages */
const CORRECTION_REMINDER =
  'Remember: You have memory tools available - `npx ca learn` to save insights, `npx ca search` to find past solutions.';

const PLANNING_REMINDER =
  'If you\'re uncertain or hesitant, remember your memory tools: `npx ca search` may have relevant context from past sessions.';

/** Check if prompt matches correction patterns */
export function detectCorrection(prompt: string): boolean {
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(prompt));
}

/** Check if prompt matches planning patterns */
export function detectPlanning(prompt: string): boolean {
  if (HIGH_CONFIDENCE_PLANNING.some((pattern) => pattern.test(prompt))) {
    return true;
  }
  const lowMatches = LOW_CONFIDENCE_PLANNING.filter((pattern) => pattern.test(prompt));
  return lowMatches.length >= 2;
}

/**
 * UserPromptSubmit hook output format.
 * Claude Code expects this structure for additionalContext injection.
 */
export interface UserPromptHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit';
    additionalContext?: string;
  };
}

/**
 * Process a user prompt and determine if a reminder should be injected.
 *
 * @param prompt - The user's message text
 * @returns Hook output with optional additionalContext
 */
export function processUserPrompt(prompt: string): UserPromptHookOutput {
  // Priority: corrections first, then planning
  if (detectCorrection(prompt)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: CORRECTION_REMINDER,
      },
    };
  }

  if (detectPlanning(prompt)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: PLANNING_REMINDER,
      },
    };
  }

  // No reminder needed
  return {};
}
