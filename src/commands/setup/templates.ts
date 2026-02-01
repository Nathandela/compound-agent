/**
 * Templates and constants for setup commands.
 */

// ============================================================================
// Hooks Constants
// ============================================================================

/** Pre-commit hook reminder message */
export const PRE_COMMIT_MESSAGE = `Before committing, have you captured any valuable lessons from this session?
Consider: corrections, mistakes, or insights worth remembering.

To capture a lesson:
  npx lna capture --trigger "what happened" --insight "what to do" --yes`;

/** Pre-commit hook shell script template */
export const PRE_COMMIT_HOOK_TEMPLATE = `#!/bin/sh
# Learning Agent pre-commit hook
# Reminds Claude to consider capturing lessons before commits

npx lna hooks run pre-commit
`;

/** Marker comment to identify our hook */
export const HOOK_MARKER = '# Learning Agent pre-commit hook';

/** Block to insert into existing hooks */
export const LEARNING_AGENT_HOOK_BLOCK = `
# Learning Agent pre-commit hook (appended)
npx lna hooks run pre-commit
`;

// ============================================================================
// Claude Code Hooks Configuration
// ============================================================================

/** Markers to identify our hook in Claude Code settings (current and legacy) */
export const CLAUDE_HOOK_MARKERS = ['lna load-session', 'learning-agent load-session'];

/** Claude Code SessionStart hook configuration */
export const CLAUDE_HOOK_CONFIG = {
  matcher: 'startup|resume|compact',
  hooks: [
    {
      type: 'command',
      command: 'npx lna load-session 2>/dev/null || true',
    },
  ],
};

// ============================================================================
// Init Command Constants
// ============================================================================

/** Section header to check for idempotency */
export const LEARNING_AGENT_SECTION_HEADER = '## Learning Agent Integration';

// ============================================================================
// CLAUDE.md Reference Constants (lfy)
// ============================================================================

/** Start marker for CLAUDE.md reference section */
export const CLAUDE_REF_START_MARKER = '<!-- learning-agent:claude-ref:start -->';

/** End marker for CLAUDE.md reference section */
export const CLAUDE_REF_END_MARKER = '<!-- learning-agent:claude-ref:end -->';

/** Reference content to add to CLAUDE.md */
export const CLAUDE_MD_REFERENCE = `
${CLAUDE_REF_START_MARKER}
## Learning Agent
See AGENTS.md for lesson capture workflow.
${CLAUDE_REF_END_MARKER}
`;

// ============================================================================
// AGENTS.md Section Markers (e2r)
// ============================================================================

/** Start marker for AGENTS.md Learning Agent section */
export const AGENTS_SECTION_START_MARKER = '<!-- learning-agent:start -->';

/** End marker for AGENTS.md Learning Agent section */
export const AGENTS_SECTION_END_MARKER = '<!-- learning-agent:end -->';

/** Template content for AGENTS.md */
export const AGENTS_MD_TEMPLATE = `
${AGENTS_SECTION_START_MARKER}
## Learning Agent Integration

This project uses learning-agent for session memory.

### CRITICAL RULES

#### Never Edit JSONL Directly

**WARNING: NEVER edit .claude/lessons/index.jsonl directly.**

The JSONL file is the source of truth and requires:
- Proper ID generation
- Schema validation
- SQLite index sync

Always use CLI commands:
- \`npx lna learn "insight"\` - Add a lesson
- \`npx lna update <id> --insight "new"\` - Modify a lesson
- \`npx lna delete <id>\` - Remove a lesson

Manual edits will break validation and corrupt the SQLite sync.

### Retrieval Points

- **Session start**: High-severity lessons loaded automatically
- **Plan-time**: BEFORE implementing a plan, run check-plan to retrieve relevant lessons

### Plan-Time Retrieval (Explicit Step)

**BEFORE implementing any plan**, run:

\`\`\`bash
npx lna check-plan --plan "your plan description" --json
\`\`\`

Display results as a **Lessons Check** section after your plan:

\`\`\`
## Lessons Check
1. [insight from lesson 1] (relevance: 0.85)
2. [insight from lesson 2] (relevance: 0.72)
\`\`\`

Consider each lesson while implementing.

### When to Capture Lessons (Detection Triggers)

Watch for these patterns and propose \`lna learn\`:

**User correction**: User says "no", "wrong", "actually..."
- Action: Propose a lesson capturing the correct approach

**Self-correction**: You fix after multiple attempts (edit -> fail -> re-edit)
- Action: Propose a lesson about what finally worked

**Test failure fix**: Test fails -> you diagnose -> fix -> passes
- Action: Propose a lesson about the root cause and solution

### Auto-Invoke Trigger Phrases

**Capture triggers** (propose \`lna learn\`):
- "that worked" - User confirms a solution worked
- "fixed it" - Problem was resolved
- "my mistake" - User acknowledges an error
- "actually use X" - User specifies a preference

**Retrieval triggers** (run \`lna check-plan\` or \`lna search\`):
- "similar issue" - User recalls a past problem
- "we had this before" - Reference to previous experience
- "seen this" - Pattern recognition
- "remember when" - Memory recall request

### Proposing Lessons

Propose when: user correction, self-correction, test failure fix, or manual request.

**Quality gate (ALL must pass):**

- Novel (not already stored)
- Specific (clear guidance)
- Actionable (obvious what to do)

**Confirmation format:**

\`\`\`
Learned: [insight]. Save? [y/n]
\`\`\`

### Session-End Protocol

Before closing a session, reflect on lessons learned:

1. **Review**: What mistakes or corrections happened?
2. **Quality gate**: Is it novel, specific, actionable?
3. **Propose**: "Learned: [insight]. Save? [y/n]"
4. **Capture**: \`npx lna capture --trigger "..." --insight "..." --yes\`

### CLI Commands

\`\`\`bash
npx lna load-session --json  # Session start
npx lna check-plan --plan "..." --json  # Before implementing
npx lna learn "insight"  # Capture a lesson
npx lna capture --trigger "..." --insight "..." --yes
\`\`\`

See [AGENTS.md](https://github.com/Nathandela/learning_agent/blob/main/AGENTS.md) for full documentation.
${AGENTS_SECTION_END_MARKER}
`;

// ============================================================================
// Slash Commands (8lp, 6nw)
// ============================================================================

/** Slash command templates for .claude/commands/ */
export const SLASH_COMMANDS: Record<string, string> = {
  'learn.md': `Capture a lesson from this session.

Usage: /learn <insight>

Examples:
- /learn "Always use Polars for large CSV files"
- /learn "API requires X-Request-ID header"

\`\`\`bash
npx lna learn "$ARGUMENTS"
\`\`\`
`,
  'check-plan.md': `Retrieve relevant lessons for a plan before implementing.

Usage: /check-plan <plan description>

\`\`\`bash
npx lna check-plan --plan "$ARGUMENTS" --json
\`\`\`
`,
  'list.md': `Show all stored lessons.

\`\`\`bash
npx lna list
\`\`\`
`,
  'prime.md': `Load learning-agent workflow context after compaction or context loss.

\`\`\`bash
npx lna prime
\`\`\`
`,
  'show.md': `Show details of a specific lesson.

Usage: /show <lesson-id>

\`\`\`bash
npx lna show "$ARGUMENTS"
\`\`\`
`,
  'wrong.md': `Mark a lesson as incorrect or invalid.

Usage: /wrong <lesson-id>

\`\`\`bash
npx lna wrong "$ARGUMENTS"
\`\`\`
`,
  'stats.md': `Show learning-agent database statistics and health.

\`\`\`bash
npx lna stats
\`\`\`
`,
};

// ============================================================================
// Plugin Configuration (ctv)
// ============================================================================

/** Plugin manifest for .claude/plugin.json */
export const PLUGIN_MANIFEST = {
  name: 'learning-agent',
  description: 'Session memory for Claude Code - capture and retrieve lessons',
  version: '0.2.3',
  author: {
    name: 'Nathan Delacrétaz',
    url: 'https://github.com/Nathandela',
  },
  repository: 'https://github.com/Nathandela/learning_agent',
  license: 'MIT',
  hooks: {
    SessionStart: [
      {
        matcher: '',
        hooks: [
          { type: 'command', command: 'npx lna prime 2>/dev/null || true' },
          { type: 'command', command: 'npx lna load-session 2>/dev/null || true' },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'npx lna prime 2>/dev/null || true' }],
      },
    ],
  },
};
