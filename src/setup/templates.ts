/**
 * Templates and constants for setup commands.
 */

// ============================================================================
// Hooks Constants
// ============================================================================

/** Pre-commit hook reminder message */
export const PRE_COMMIT_MESSAGE = `
╔══════════════════════════════════════════════════════════════╗
║                    LESSON CAPTURE CHECKPOINT                 ║
╠══════════════════════════════════════════════════════════════╣
║ STOP. Before this commit, take a moment to reflect:          ║
║                                                              ║
║ [ ] Did I learn something relevant during this session?      ║
║ [ ] Is there anything worth remembering for next time?       ║
║                                                              ║
║ If so, consider capturing a lesson:                          ║
║   npx ca learn "<insight>" --trigger "<what happened>"       ║
╚══════════════════════════════════════════════════════════════╝`;

/** Pre-commit hook shell script template */
export const PRE_COMMIT_HOOK_TEMPLATE = `#!/bin/sh
# Compound Agent pre-commit hook
# Reminds Claude to consider capturing lessons before commits

npx ca hooks run pre-commit
`;

/** Marker comment to identify our hook */
export const HOOK_MARKER = '# Compound Agent pre-commit hook';

/** Block to insert into existing hooks */
export const COMPOUND_AGENT_HOOK_BLOCK = `
# Compound Agent pre-commit hook (appended)
npx ca hooks run pre-commit
`;

// ============================================================================
// Claude Code Hooks Configuration
// ============================================================================

/** Markers to identify our hook in Claude Code settings (current and legacy) */
export const CLAUDE_HOOK_MARKERS = [
  'ca prime',
  'ca load-session',
  'compound-agent load-session',
  'ca hooks run user-prompt',
  'ca hooks run post-tool-failure',
  'ca hooks run post-tool-success',
];

/** Claude Code SessionStart hook configuration (v0.2.4: uses prime for trust language) */
export const CLAUDE_HOOK_CONFIG = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx ca prime 2>/dev/null || true',
    },
  ],
};

/** Claude Code PreCompact hook configuration */
export const CLAUDE_PRECOMPACT_HOOK_CONFIG = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx ca prime 2>/dev/null || true',
    },
  ],
};

/** Claude Code UserPromptSubmit hook configuration */
export const CLAUDE_USER_PROMPT_HOOK_CONFIG = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx ca hooks run user-prompt 2>/dev/null || true',
    },
  ],
};

/** Claude Code PostToolUseFailure hook configuration */
export const CLAUDE_POST_TOOL_FAILURE_HOOK_CONFIG = {
  matcher: 'Bash|Edit|Write',
  hooks: [
    {
      type: 'command',
      command: 'npx ca hooks run post-tool-failure 2>/dev/null || true',
    },
  ],
};

/** Claude Code PostToolUse hook configuration (for success reset) */
export const CLAUDE_POST_TOOL_SUCCESS_HOOK_CONFIG = {
  matcher: 'Bash|Edit|Write',
  hooks: [
    {
      type: 'command',
      command: 'npx ca hooks run post-tool-success 2>/dev/null || true',
    },
  ],
};

// Note: PreCommit is NOT a valid Claude Code hook type.
// The remind-capture functionality is handled by git pre-commit hooks instead.
// See installPreCommitHook() in hooks.ts for git hook installation.

/** MCP server configuration for Claude Code settings */
export const MCP_SERVER_CONFIG = {
  'compound-agent': {
    command: 'npx',
    args: ['compound-agent-mcp'],
  },
};

// ============================================================================
// Init Command Constants
// ============================================================================

/** Section header to check for idempotency */
export const COMPOUND_AGENT_SECTION_HEADER = '## Compound Agent Integration';

// ============================================================================
// CLAUDE.md Reference Constants (lfy)
// ============================================================================

/** Start marker for CLAUDE.md reference section */
export const CLAUDE_REF_START_MARKER = '<!-- compound-agent:claude-ref:start -->';

/** End marker for CLAUDE.md reference section */
export const CLAUDE_REF_END_MARKER = '<!-- compound-agent:claude-ref:end -->';

/** Reference content to add to CLAUDE.md */
export const CLAUDE_MD_REFERENCE = `
${CLAUDE_REF_START_MARKER}
## Compound Agent
See AGENTS.md for lesson capture workflow.
${CLAUDE_REF_END_MARKER}
`;

// ============================================================================
// AGENTS.md Section Markers (e2r)
// ============================================================================

/** Start marker for AGENTS.md Learning Agent section */
export const AGENTS_SECTION_START_MARKER = '<!-- compound-agent:start -->';

/** End marker for AGENTS.md Learning Agent section */
export const AGENTS_SECTION_END_MARKER = '<!-- compound-agent:end -->';

/** Template content for AGENTS.md */
export const AGENTS_MD_TEMPLATE = `
${AGENTS_SECTION_START_MARKER}
## Compound Agent Integration

This project uses compound-agent for session memory via **MCP tools** (preferred).

### MCP Tools (ALWAYS USE THESE)

**You MUST use MCP tools, NOT CLI commands:**

| Tool | Purpose |
|------|---------|
| \`memory_search\` | Search lessons - use BEFORE architectural decisions |
| \`memory_capture\` | Capture lessons - use AFTER corrections or discoveries |

### Mandatory Recall

You MUST call \`memory_search\` BEFORE:
- Architectural decisions or complex planning
- Patterns you've implemented before in this repo
- After user corrections ("actually...", "wrong", "use X instead")

**NEVER skip memory_search for complex decisions.** Past mistakes will repeat.

### Capture Protocol

Call \`memory_capture\` AFTER:
- User corrects you
- Test fail → fix → pass cycles
- You discover project-specific knowledge

**Workflow**: Search BEFORE deciding, capture AFTER learning.

### Quality Gate

Before capturing, verify the lesson is:
- **Novel** - Not already stored
- **Specific** - Clear guidance
- **Actionable** - Obvious what to do

### Never Edit JSONL Directly

**WARNING: NEVER edit .claude/lessons/index.jsonl directly.**

The JSONL file requires proper ID generation, schema validation, and SQLite sync.
Use \`memory_capture\` MCP tool or CLI (\`npx ca learn\`) - never manual edits.

### CLI (fallback only)

CLI commands are for manual/terminal use when MCP is unavailable:
\`npx ca search "query"\`, \`npx ca learn "insight"\`, \`npx ca list\`

See [documentation](https://github.com/Nathandela/compound_agent) for more details.
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
npx ca learn "$ARGUMENTS"
\`\`\`
`,
  'search.md': `Search lessons for relevant context.

Usage: /search <query>

Examples:
- /search "API authentication"
- /search "data processing patterns"

\`\`\`bash
npx ca search "$ARGUMENTS"
\`\`\`

Note: You can also use the \`memory_search\` MCP tool directly.
`,
  'list.md': `Show all stored lessons.

\`\`\`bash
npx ca list
\`\`\`
`,
  'prime.md': `Load compound-agent workflow context after compaction or context loss.

\`\`\`bash
npx ca prime
\`\`\`
`,
  'show.md': `Show details of a specific lesson.

Usage: /show <lesson-id>

\`\`\`bash
npx ca show "$ARGUMENTS"
\`\`\`
`,
  'wrong.md': `Mark a lesson as incorrect or invalid.

Usage: /wrong <lesson-id>

\`\`\`bash
npx ca wrong "$ARGUMENTS"
\`\`\`
`,
  'stats.md': `Show compound-agent database statistics and health.

\`\`\`bash
npx ca stats
\`\`\`
`,
};

// ============================================================================
// Plugin Configuration (ctv)
// ============================================================================

/** Plugin manifest for .claude/plugin.json */
export const PLUGIN_MANIFEST = {
  name: 'compound-agent',
  description: 'Session memory for Claude Code - capture and retrieve lessons',
  version: '0.2.8',
  author: {
    name: 'Nathan Delacrétaz',
    url: 'https://github.com/Nathandela',
  },
  repository: 'https://github.com/Nathandela/compound_agent',
  license: 'MIT',
  hooks: {
    SessionStart: [
      {
        matcher: '',
        hooks: [
          { type: 'command', command: 'npx ca prime 2>/dev/null || true' },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'npx ca prime 2>/dev/null || true' }],
      },
    ],
    UserPromptSubmit: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'npx ca hooks run user-prompt 2>/dev/null || true' }],
      },
    ],
    PostToolUseFailure: [
      {
        matcher: 'Bash|Edit|Write',
        hooks: [{ type: 'command', command: 'npx ca hooks run post-tool-failure 2>/dev/null || true' }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Bash|Edit|Write',
        hooks: [{ type: 'command', command: 'npx ca hooks run post-tool-success 2>/dev/null || true' }],
      },
    ],
    // Note: PreCommit is handled by git hooks, not Claude Code hooks
  },
};
