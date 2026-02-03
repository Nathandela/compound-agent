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
export const CLAUDE_HOOK_MARKERS = ['lna prime', 'lna load-session', 'learning-agent load-session'];

/** Claude Code SessionStart hook configuration (v0.2.4: uses prime for trust language) */
export const CLAUDE_HOOK_CONFIG = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx lna prime 2>/dev/null || true',
    },
  ],
};

/** Claude Code PreCompact hook configuration */
export const CLAUDE_PRECOMPACT_HOOK_CONFIG = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx lna prime 2>/dev/null || true',
    },
  ],
};

// Note: PreCommit is NOT a valid Claude Code hook type.
// The remind-capture functionality is handled by git pre-commit hooks instead.
// See installPreCommitHook() in hooks.ts for git hook installation.

/** MCP server configuration for Claude Code settings */
export const MCP_SERVER_CONFIG = {
  'learning-agent': {
    command: 'npx',
    args: ['learning-agent-mcp'],
  },
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

This project uses learning-agent for session memory with MCP tools.

### CRITICAL RULES

#### Never Edit JSONL Directly

**WARNING: NEVER edit .claude/lessons/index.jsonl directly.**

The JSONL file is the source of truth and requires:
- Proper ID generation
- Schema validation
- SQLite index sync

Always use the \`lesson_capture\` tool or CLI commands:
- \`npx lna learn "insight"\` - Add a lesson
- \`npx lna update <id> --insight "new"\` - Modify a lesson
- \`npx lna delete <id>\` - Remove a lesson

Manual edits will break validation and corrupt the SQLite sync.

### Mandatory Recall

You MUST use \`lesson_search\` tool BEFORE:
- Architectural decisions or complex planning
- Patterns you've implemented before in this repo
- After user corrections ("actually...", "wrong", "use X instead")

**NEVER skip lesson search for complex decisions.** Past mistakes will repeat.

### Capture Protocol

Use \`lesson_capture\` tool AFTER:
- User corrects you
- Test fail → fix → pass cycles
- You discover project-specific knowledge

**Workflow**: Search BEFORE deciding, capture AFTER learning.

### MCP Tools

| Tool | When to Use |
|------|-------------|
| \`lesson_search\` | Before architectural decisions, after corrections |
| \`lesson_capture\` | After mistakes, corrections, or discoveries |

### CLI Commands (manual use)

\`\`\`bash
npx lna search "query"  # Find relevant lessons
npx lna learn "insight"  # Capture a lesson
npx lna list  # Show recent lessons
npx lna stats  # Database health
\`\`\`

### Quality Gate

Before capturing, verify the lesson is:
- **Novel** - Not already stored
- **Specific** - Clear guidance
- **Actionable** - Obvious what to do

See [documentation](https://github.com/Nathandela/learning_agent) for more details.
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
  'search.md': `Search lessons for relevant context.

Usage: /search <query>

Examples:
- /search "API authentication"
- /search "data processing patterns"

\`\`\`bash
npx lna search "$ARGUMENTS"
\`\`\`

Note: You can also use the \`lesson_search\` MCP tool directly.
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
  version: '0.2.5',
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
        ],
      },
    ],
    PreCompact: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'npx lna prime 2>/dev/null || true' }],
      },
    ],
    // Note: PreCommit is handled by git hooks, not Claude Code hooks
  },
};
