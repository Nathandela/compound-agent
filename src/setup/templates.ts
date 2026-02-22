/**
 * Templates and constants for setup commands.
 */

import { VERSION } from '../index.js';

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
// Post-Commit Hook Constants
// ============================================================================

/** Post-commit hook shell script template */
export const POST_COMMIT_HOOK_TEMPLATE = `#!/bin/sh
# Compound Agent post-commit hook
# Auto-indexes docs/ when documentation files change

# Check if any docs/ files were modified in this commit
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q '^docs/'; then
  npx ca -q index-docs 2>/dev/null &
fi
`;

/** Marker comment for post-commit hook idempotency */
export const POST_COMMIT_HOOK_MARKER = '# Compound Agent post-commit hook';

/** Block to insert into existing post-commit hooks */
export const COMPOUND_AGENT_POST_COMMIT_BLOCK = `
# Compound Agent post-commit hook (appended)
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q '^docs/'; then
  npx ca -q index-docs 2>/dev/null &
fi
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
  'ca hooks run phase-guard',
  'ca hooks run read-tracker',
  'ca hooks run stop-audit',
  // v1.2.9 canonical names
  'ca hooks run post-read',
  'ca hooks run phase-audit',
  'ca index-docs',
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

/** Claude Code PreToolUse hook config for phase guard */
export const CLAUDE_PHASE_GUARD_HOOK_CONFIG = {
  matcher: 'Edit|Write',
  hooks: [
    {
      type: 'command',
      command: 'npx ca hooks run phase-guard 2>/dev/null || true',
    },
  ],
};

/** Claude Code PostToolUse hook config for skill-read tracking. */
export const CLAUDE_POST_READ_HOOK_CONFIG = {
  matcher: 'Read',
  hooks: [
    {
      type: 'command',
      command: 'npx ca hooks run post-read 2>/dev/null || true',
    },
  ],
};

/** Claude Code Stop hook config for phase gate verification. */
export const CLAUDE_PHASE_AUDIT_HOOK_CONFIG = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx ca hooks run phase-audit 2>/dev/null || true',
    },
  ],
};

// Back-compat aliases for test imports and older references.
export const CLAUDE_READ_TRACKER_HOOK_CONFIG = CLAUDE_POST_READ_HOOK_CONFIG;
export const CLAUDE_STOP_AUDIT_HOOK_CONFIG = CLAUDE_PHASE_AUDIT_HOOK_CONFIG;

// Note: PreCommit is NOT a valid Claude Code hook type.
// The remind-capture functionality is handled by git pre-commit hooks instead.
// See installPreCommitHook() in hooks.ts for git hook installation.

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

This project uses compound-agent for session memory via **CLI commands**.

### CLI Commands (ALWAYS USE THESE)

**You MUST use CLI commands for lesson management:**

| Command | Purpose |
|---------|---------|
| \`npx ca search "query"\` | Search lessons - use BEFORE architectural decisions |
| \`npx ca knowledge "query"\` | Search docs knowledge - use BEFORE architectural decisions |
| \`npx ca learn "insight"\` | Capture lessons - use AFTER corrections or discoveries |
| \`npx ca list\` | List all stored lessons |
| \`npx ca show <id>\` | Show details of a specific lesson |
| \`npx ca wrong <id>\` | Mark a lesson as incorrect |

### Mandatory Recall

You MUST call \`npx ca search\` and \`npx ca knowledge\` BEFORE:
- Architectural decisions or complex planning
- Patterns you've implemented before in this repo
- After user corrections ("actually...", "wrong", "use X instead")

**NEVER skip search for complex decisions.** Past mistakes will repeat.

### Capture Protocol

Run \`npx ca learn\` AFTER:
- User corrects you
- Test fail → fix → pass cycles
- You discover project-specific knowledge

**Workflow**: Search BEFORE deciding, capture AFTER learning.

### Quality Gate

Before capturing, verify the lesson is:
- **Novel** - Not already stored
- **Specific** - Clear guidance
- **Actionable** (preferred) - Obvious what to do

### Never Edit JSONL Directly

**WARNING: NEVER edit .claude/lessons/index.jsonl directly.**

The JSONL file requires proper ID generation, schema validation, and SQLite sync.
Use CLI (\`npx ca learn\`) — never manual edits.

See [documentation](https://github.com/Nathandela/learning_agent) for more details.
${AGENTS_SECTION_END_MARKER}
`;

// ============================================================================
// Legacy Slash Commands (removed in v1.1 — now in WORKFLOW_COMMANDS)
// ============================================================================

/** File names of slash commands that used to live at .claude/commands/ root level.
 * Used by --update to clean up stale files from v1.0 deployments. */
export const LEGACY_ROOT_SLASH_COMMANDS = [
  'learn.md', 'search.md', 'list.md', 'prime.md', 'show.md', 'wrong.md', 'stats.md',
];

// ============================================================================
// Plugin Configuration (ctv)
// ============================================================================

/** Plugin manifest for .claude/plugin.json */
export const PLUGIN_MANIFEST = {
  name: 'compound-agent',
  description: 'Session memory for Claude Code - capture and retrieve lessons',
  version: VERSION,
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
      {
        matcher: 'Read',
        hooks: [{ type: 'command', command: 'npx ca hooks run post-read 2>/dev/null || true' }],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: 'npx ca hooks run phase-guard 2>/dev/null || true' }],
      },
    ],
    Stop: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'npx ca hooks run phase-audit 2>/dev/null || true' }],
      },
    ],
    // Note: PreCommit is handled by git hooks, not Claude Code hooks
  },
};
