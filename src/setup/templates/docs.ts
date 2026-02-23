/* eslint-disable max-lines -- template data file; multiline string constant */
/**
 * Documentation templates deployed to consumer repos.
 * Written to docs/compound/ during setup.
 *
 * Split into 5 files for maintainability:
 *   README.md, WORKFLOW.md, CLI_REFERENCE.md, SKILLS.md, INTEGRATION.md
 */

export const DOC_TEMPLATES: Record<string, string> = {
  'README.md': `---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "Overview and getting started guide for compound-agent"
---

# Compound Agent

A learning system for Claude Code that captures, indexes, and retrieves lessons learned during development sessions -- so the same mistakes are not repeated.

---

## What is compound-agent?

Compound-agent is a TypeScript CLI plugin for Claude Code. When Claude makes a mistake and gets corrected, or discovers a useful pattern, that knowledge is stored as a **memory item** in \`.claude/lessons/index.jsonl\`. Future sessions search this memory before planning and implementing.

The system uses:

- **JSONL storage** (\`.claude/lessons/index.jsonl\`) as the git-tracked source of truth
- **SQLite + FTS5** (\`.claude/.cache/lessons.sqlite\`) as a rebuildable search index
- **Semantic embeddings** (EmbeddingGemma-300M via node-llama-cpp) for vector similarity search
- **Claude Code hooks** to inject memory at session start, before compaction, and on tool failures

Memory items have four types: \`lesson\`, \`solution\`, \`pattern\`, and \`preference\`. Each has a trigger, an insight, tags, severity, and optional citations.

---

## Quick start

\`\`\`bash
# Initialize in your project:
npx ca init

# Full setup (includes embedding model download):
npx ca setup

# Verify installation:
npx ca doctor
\`\`\`

### What \`init\` does

1. Creates \`.claude/lessons/\` directory and empty \`index.jsonl\`
2. Updates \`AGENTS.md\` with a compound-agent section
3. Adds a reference to \`.claude/CLAUDE.md\`
4. Creates \`.claude/plugin.json\` manifest
5. Installs agent templates, workflow commands, phase skills, and agent role skills
6. Installs a git pre-commit hook (lesson capture reminder)
7. Installs Claude Code hooks (SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse)
8. For pnpm projects: auto-configures \`onlyBuiltDependencies\` for native addons

\`setup\` does everything \`init\` does, plus downloads the EmbeddingGemma-300M model (~278MB). Use \`--skip-model\` to skip the download.

---

## Directory structure

\`\`\`
.claude/
  CLAUDE.md                    # Project instructions (always loaded)
  compound-agent.json          # Config (created by \`npx ca reviewer enable\`)
  settings.json                # Claude Code hooks
  plugin.json                  # Plugin manifest
  agents/compound/             # Subagent definitions
  commands/compound/           # Slash commands (brainstorm, plan, work, review, compound, lfg)
  skills/compound/             # Phase skills + agent role skills
  lessons/
    index.jsonl                # Memory items (git-tracked source of truth)
  .cache/
    lessons.sqlite             # Rebuildable search index (.gitignore)
docs/compound/
  research/                    # PhD-level research docs for agent knowledge
\`\`\`

---

## Quick reference

| Task | Command |
|------|---------|
| Capture a lesson | \`npx ca learn "insight" --trigger "what happened"\` |
| Search memory | \`npx ca search "keywords"\` |
| Search docs knowledge | \`npx ca knowledge "query"\` |
| Check plan against memory | \`npx ca check-plan --plan "description"\` |
| View stats | \`npx ca stats\` |
| Run full workflow | \`/compound:lfg <epic-id>\` |
| Health check | \`npx ca doctor\` |

---

## Further reading

- [WORKFLOW.md](WORKFLOW.md) -- The 5-phase development workflow and LFG orchestrator
- [CLI_REFERENCE.md](CLI_REFERENCE.md) -- Complete CLI command reference
- [SKILLS.md](SKILLS.md) -- Phase skills and agent role skills
- [INTEGRATION.md](INTEGRATION.md) -- Memory system, hooks, beads, and agent guidance
`,

  'WORKFLOW.md': `---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "The 5-phase compound-agent workflow and LFG orchestrator"
---

# Workflow

Every feature or epic follows five phases. The \`/compound:lfg\` skill chains them with enforcement gates.

---

## Phase 1: Brainstorm

Explore the problem space before committing to a solution.

- Ask "why" before "how"
- Search memory for similar past features
- Generate multiple approaches, then converge
- Create a beads epic: \`bd create --title="..." --type=epic\`

## Phase 2: Plan

Decompose work into small, testable tasks with dependencies.

- Review brainstorm output
- Create beads tasks: \`bd create --title="..." --type=task\`
- Create Review and Compound blocking tasks (these survive compaction)
- Run \`npx ca worktree wire-deps <epic-id>\` if using worktrees

## Phase 3: Work

Execute implementation through agent teams using TDD.

- Pick tasks from \`bd ready\`
- Delegate to test-writer and implementer agents
- Commit incrementally as tests pass
- Run \`/implementation-reviewer\` before closing tasks

## Phase 4: Review

Multi-agent code review with severity classification.

- Run quality gates: \`pnpm test && pnpm lint\`
- Spawn specialized reviewers (security, architecture, performance, etc.)
- Classify findings as P0 (blocks merge) / P1/P2/P3
- Fix all P0/P1 findings before proceeding

## Phase 5: Compound

Extract and store lessons learned. This is what makes the system compound.

- Analyze what happened during the cycle
- Capture lessons via \`npx ca learn\`
- Cluster patterns via \`npx ca compound\`
- Update outdated docs and ADRs

---

## LFG orchestrator

\`/compound:lfg\` chains all 5 phases with enforcement gates.

### Invocation

\`\`\`
/compound:lfg <epic-id>
/compound:lfg <epic-id> from plan
\`\`\`

### Phase execution protocol

For each phase, LFG:

1. Announces progress: \`[Phase N/5] PHASE_NAME\`
2. Initializes state: \`npx ca phase-check start <phase>\`
3. Reads the phase skill file (non-negotiable -- never from memory)
4. Runs \`npx ca search\` with the current goal
5. Executes the phase following skill instructions
6. Updates epic notes: \`bd update <epic-id> --notes="Phase: NAME COMPLETE | Next: NEXT"\`
7. Verifies the phase gate before proceeding

### Phase gates

| Gate | When | Verification |
|------|------|-------------|
| Post-plan | After Plan | \`bd list --status=open\` shows Review + Compound tasks |
| Gate 3 | After Work | \`bd list --status=in_progress\` returns empty |
| Gate 4 | After Review | \`/implementation-reviewer\` returned APPROVED |
| Final | After Compound | \`npx ca verify-gates <epic-id>\` passes, \`pnpm test\` and \`pnpm lint\` pass |

If any gate fails, LFG stops. You must fix the issue before proceeding.

### Resumption

If interrupted, LFG can resume:

1. Run \`bd show <epic-id>\` and read the notes for phase state
2. Re-invoke with \`from <phase>\` to skip completed phases

### Phase state tracking

LFG persists state in \`.claude/.ca-phase-state.json\`. Useful commands:

\`\`\`bash
npx ca phase-check status      # See current phase state
npx ca phase-check clean       # Reset phase state (escape hatch)
\`\`\`

### Session close

Before saying "done", LFG runs this inviolable checklist:

\`\`\`bash
git status
git add <files>
bd sync
git commit -m "..."
bd sync
git push
\`\`\`
`,

  'CLI_REFERENCE.md': `---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "Complete CLI command reference for compound-agent"
---

# CLI Reference

All commands use \`npx ca\` (or \`npx compound-agent\`). Global flags: \`-v, --verbose\` and \`-q, --quiet\`.

---

## Capture commands

\`\`\`bash
# Capture a lesson (primary command)
npx ca learn "Always validate epic IDs before shell execution" \\
  --trigger "Shell injection via bd show" \\
  --tags "security,validation" \\
  --severity high \\
  --type lesson

# Capture a pattern (requires --pattern-bad and --pattern-good)
npx ca learn "Use execFileSync instead of execSync" \\
  --type pattern \\
  --pattern-bad "execSync(\\\`bd show \\\${id}\\\`)" \\
  --pattern-good "execFileSync('bd', ['show', id])"

# Capture from trigger/insight flags
npx ca capture --trigger "Tests failed after refactor" --insight "Run full suite after moving files" --yes

# Detect learning triggers from input file
npx ca detect --input corrections.json
npx ca detect --input corrections.json --save --yes
\`\`\`

**Types**: \`lesson\` (default), \`solution\`, \`pattern\`, \`preference\`
**Severity**: \`high\`, \`medium\`, \`low\`

## Retrieval commands

\`\`\`bash
npx ca search "sqlite validation"           # Keyword search
npx ca search "security" --limit 5
npx ca list                                  # List all memory items
npx ca list --limit 20
npx ca list --invalidated                    # Show only invalidated items
npx ca check-plan --plan "Implement git worktree integration"
echo "Add caching layer" | npx ca check-plan # Semantic search against a plan
npx ca load-session                          # Load high-severity lessons
npx ca load-session --json
\`\`\`

## Management commands

\`\`\`bash
npx ca show <id>                             # View a specific item
npx ca show <id> --json
npx ca update <id> --insight "Updated text"  # Update item fields
npx ca update <id> --severity high --tags "security,input-validation"
npx ca delete <id>                           # Soft delete (creates tombstone)
npx ca delete <id1> <id2> <id3>
npx ca wrong <id> --reason "Incorrect"       # Mark as invalid
npx ca validate <id>                         # Re-enable an invalidated item
npx ca export                                # Export as JSON
npx ca export --since 2026-01-01 --tags "security"
npx ca import lessons-backup.jsonl           # Import from JSONL file
npx ca compact                               # Remove tombstones and archive old items
npx ca compact --dry-run
npx ca compact --force
npx ca rebuild                               # Rebuild SQLite index from JSONL
npx ca rebuild --force
npx ca stats                                 # Show database health and statistics
npx ca prime                                 # Reload workflow context after compaction
\`\`\`

## Setup commands

\`\`\`bash
npx ca init                    # Initialize in current repo
npx ca init --skip-agents      # Skip AGENTS.md and template installation
npx ca init --skip-hooks       # Skip git hook installation
npx ca init --skip-claude      # Skip Claude Code hooks
npx ca init --json             # Output result as JSON
npx ca setup                   # Full setup (init + model download)
npx ca setup --update          # Regenerate templates (preserves user files)
npx ca setup --uninstall       # Remove compound-agent integration
npx ca setup --status          # Show installation status
npx ca setup --skip-model      # Skip embedding model download
npx ca setup claude            # Install Claude Code hooks only
npx ca setup claude --status   # Check hook status
npx ca hooks                   # Install git hooks
npx ca download-model          # Download embedding model (~278MB)
\`\`\`

## Reviewer commands

\`\`\`bash
npx ca reviewer enable gemini  # Enable Gemini as external reviewer
npx ca reviewer enable codex   # Enable Codex as external reviewer
npx ca reviewer disable gemini # Disable a reviewer
npx ca reviewer list           # List enabled reviewers
\`\`\`

## Loop command

\`\`\`bash
npx ca loop                    # Generate infinity loop script for autonomous processing
npx ca loop --epics epic-1 epic-2
npx ca loop --output my-loop.sh
npx ca loop --max-retries 5
npx ca loop --model claude-opus-4-6
npx ca loop --force            # Overwrite existing script
\`\`\`

## Health, audit, and verification commands

\`\`\`bash
npx ca about                    # Show version, animation, and recent changelog
npx ca doctor                  # Check external dependencies and project health
npx ca audit                   # Run pattern, rule, and lesson quality checks
npx ca rules check             # Check codebase against .claude/rules.json
npx ca test-summary            # Run tests and output compact pass/fail summary
npx ca verify-gates <epic-id>  # Verify workflow gates before epic closure
npx ca phase-check init <epic-id>
npx ca phase-check status
npx ca phase-check start <phase>
npx ca phase-check gate <gate-name>   # post-plan, gate-3, gate-4, final
npx ca phase-check clean
\`\`\`

## Worktree commands

\`\`\`bash
npx ca worktree create <epic-id>              # Create isolated worktree
npx ca worktree wire-deps <epic-id>           # Connect merge dependencies
npx ca worktree merge <epic-id>               # Merge worktree back to main
npx ca worktree list                          # List active worktrees
npx ca worktree cleanup <epic-id>             # Remove worktree and clean up
npx ca worktree cleanup <epic-id> --force     # Force cleanup of dirty worktrees
\`\`\`

## Compound command

\`\`\`bash
npx ca compound                # Synthesize cross-cutting patterns from accumulated lessons
\`\`\`
`,

  'SKILLS.md': `---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "Phase skills and agent role skills reference"
---

# Skills Reference

Skills are instructions that Claude reads before executing each phase. They live in \`.claude/skills/compound/\` and are auto-installed by \`npx ca setup\`.

---

## Phase skills

### \`/compound:brainstorm\`

**Purpose**: Divergent-then-convergent thinking to explore the solution space.

**When invoked**: At the start of a new feature or epic, before any planning.

**What it does**: Spawns research subagents, searches memory for similar past features, generates multiple approaches, converges on a decision with documented rationale, and creates a beads epic.

### \`/compound:plan\`

**Purpose**: Decompose work into small testable tasks with dependencies.

**When invoked**: After brainstorm, before any implementation.

**What it does**: Reviews brainstorm output, spawns analysts, decomposes into tasks with acceptance criteria, creates beads issues, and creates Review + Compound blocking tasks. Runs \`npx ca worktree wire-deps\` if a worktree is active.

### \`/compound:work\`

**Purpose**: Team-based TDD execution with adaptive complexity.

**When invoked**: After plan, when tasks are ready in beads.

**What it does**: Picks tasks from \`bd ready\`, deploys an AgentTeam with test-writers and implementers, coordinates agent work, commits incrementally, runs \`/implementation-reviewer\` as mandatory gate.

### \`/compound:review\`

**Purpose**: Multi-agent review with parallel specialized reviewers.

**When invoked**: After all work tasks are closed.

**What it does**: Runs quality gates, selects reviewer tier based on diff size (4-11 reviewers), spawns reviewers in an AgentTeam, classifies findings by severity, fixes all P1s, runs \`/implementation-reviewer\`.

### \`/compound:compound\`

**Purpose**: Reflect on the cycle and capture lessons for future sessions.

**When invoked**: After review is approved.

**What it does**: Spawns an analysis pipeline (context-analyzer, lesson-extractor, pattern-matcher, solution-writer, compounding), applies quality filters, classifies items by type and severity, stores via \`npx ca learn\`, runs \`npx ca verify-gates\`.

### \`/compound:lfg\`

**Purpose**: Full-cycle orchestrator chaining all five phases.

**When invoked**: When you want to run an entire epic end-to-end.

**What it does**: Sequences all 5 phases with mandatory gates between them, tracks progress in beads notes, handles resumption after interruption. See [WORKFLOW.md](WORKFLOW.md) for full details.

### \`/compound:set-worktree\`

**Purpose**: Set up an isolated git worktree before running LFG.

**When invoked**: Before \`/compound:lfg\` when you want parallel epic execution.

**What it does**: Validates the epic, runs \`npx ca worktree create <epic-id>\`, verifies output, and informs the user they can proceed with \`/compound:lfg\`.

### \`/compound:get-a-phd\`

**Purpose**: Conduct deep, PhD-level research to build knowledge for working subagents.

**When invoked**: When agents need domain knowledge not yet covered in \`docs/compound/research/\`.

**What it does**: Analyzes beads epics for knowledge gaps, checks existing docs coverage, proposes research topics for user confirmation, spawns parallel researcher subagents, and stores output at \`docs/compound/research/<topic>/<slug>.md\`.

---

## Skill invocation

Skills are invoked as Claude Code slash commands:

\`\`\`
/compound:brainstorm       # Start brainstorm phase
/compound:plan             # Start plan phase
/compound:work             # Start work phase
/compound:review           # Start review phase
/compound:compound         # Start compound phase
/compound:lfg <epic-id>    # Run all phases end-to-end
/compound:set-worktree <epic-id>  # Set up worktree before LFG
/compound:get-a-phd <focus>       # Deep research for agent knowledge
\`\`\`

Each skill reads its SKILL.md file from \`.claude/skills/compound/<phase>/SKILL.md\` at invocation time. Skills are never executed from memory.
`,

  'INTEGRATION.md': `---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "Memory system, hooks, beads integration, and agent guidance"
---

# Integration

Deep integration topics for compound-agent: memory system internals, Claude Code hooks, beads workflow, worktree integration, and agent guidance.

---

## Memory system

### Storage format

Memory items are stored as newline-delimited JSON in \`.claude/lessons/index.jsonl\`. Each line is a complete JSON object:

\`\`\`json
{"id":"L-abc123","type":"lesson","trigger":"Shell injection via execSync","insight":"Use execFileSync with array args","tags":["security"],"source":"manual","context":{"tool":"cli","intent":"manual learning"},"created":"2026-02-15T10:00:00Z","confirmed":true,"severity":"high","supersedes":[],"related":[]}
\`\`\`

### Indexing

The SQLite index at \`.claude/.cache/lessons.sqlite\` provides:

- **FTS5 full-text search** for keyword queries (\`npx ca search\`)
- **Embedding cache** for vector similarity (avoids re-computing embeddings)
- **Retrieval count tracking** for usage statistics

The index is rebuilt automatically when the JSONL changes. Force rebuild with \`npx ca rebuild --force\`.

### Search mechanisms

**Keyword search** (\`npx ca search\`): Uses SQLite FTS5 to match words in trigger, insight, and tags.

**Semantic search** (\`npx ca check-plan\`): Embeds the query text and compares cosine similarity against stored lesson embeddings. Results are ranked with configurable boosts for severity, recency, and confirmation status.

**Session loading** (\`npx ca load-session\`): Returns high-severity confirmed lessons for injection at session start.

### Data lifecycle

| Operation | Effect |
|-----------|--------|
| \`npx ca learn\` | Appends a new item to JSONL |
| \`npx ca update\` | Appends an updated version (last-write-wins) |
| \`npx ca delete\` | Appends with \`deleted: true\` flag |
| \`npx ca wrong\` | Sets \`invalidatedAt\` (excluded from retrieval, preserved in storage) |
| \`npx ca compact\` | Removes tombstones and archives old items, then rebuilds index |

---

## Claude Code hooks

Compound-agent installs five hooks into \`.claude/settings.json\`:

| Hook | Trigger | Action |
|------|---------|--------|
| **SessionStart** | New session or resume | Runs \`npx ca prime\` to load workflow context and high-severity lessons |
| **PreCompact** | Before context compaction | Runs \`npx ca prime\` to preserve context across compaction |
| **UserPromptSubmit** | Every user message | Detects correction/planning language, injects memory reminders |
| **PostToolUseFailure** | Bash/Edit/Write failures | After 2 failures on same file or 3 total, suggests \`npx ca search\` |
| **PostToolUse** | After successful tool use | Resets failure tracking; tracks skill file reads for phase guard |

### Memory usage during sessions

**At session start**: High-severity lessons are automatically loaded via the SessionStart hook.

**Before planning**: Search memory for relevant context:

\`\`\`bash
npx ca search "feature area keywords"
npx ca knowledge "architecture topic"
npx ca check-plan --plan "description of what you are about to implement"
\`\`\`

**After corrections**: Capture what you learned:

\`\`\`bash
npx ca learn "The insight" --trigger "What happened" --severity medium
\`\`\`

**At session end**: Run the compound phase to extract patterns:

\`\`\`bash
npx ca compound
\`\`\`

---

## Beads integration

Compound-agent works with beads (\`bd\`) for issue tracking:

\`\`\`bash
bd ready                          # Find available tasks
bd show <id>                      # View task details
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>
bd sync                           # Sync with git remote
\`\`\`

The plan phase creates Review and Compound blocking tasks that depend on work tasks. This ensures these phases surface via \`bd ready\` after work completes, surviving context compaction.

### Verification gates

Before closing an epic, verify all gates pass:

\`\`\`bash
npx ca verify-gates <epic-id>
\`\`\`

This checks that a Review task, Compound task, and (if applicable) Merge task all exist and are closed.

---

## Worktree integration

Worktrees let you run epics in isolation, enabling parallel execution across multiple Claude Code sessions.

\`\`\`bash
npx ca worktree create <epic-id>   # Creates worktree + installs deps + copies lessons
npx ca worktree merge <epic-id>    # Two-phase merge back to main
npx ca worktree cleanup <epic-id>  # Remove worktree, delete branch, close Merge task
npx ca worktree list               # Show active worktrees
\`\`\`

See [CLI_REFERENCE.md](CLI_REFERENCE.md) for full worktree command details.

---

## For AI agents

### Integrating into CLAUDE.md

Add a reference to compound-agent in your project's \`.claude/CLAUDE.md\`:

\`\`\`markdown
## References

- docs/compound/README.md -- Compound-agent overview and getting started
\`\`\`

The \`npx ca init\` command does this automatically.

### Session completion checklist

\`\`\`bash
npx ca verify-gates <epic-id>    # Verify review + compound tasks closed
git status                        # Check what changed
git add <files>                   # Stage code changes
bd sync                           # Commit beads changes
git commit -m "..."               # Commit code
bd sync                           # Commit any new beads changes
git push                          # Push to remote
\`\`\`

Work is not complete until \`git push\` succeeds.
`,
};
