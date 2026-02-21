/* eslint-disable max-lines -- template data file; multiline string constant */
/**
 * Documentation templates deployed to consumer repos.
 * Written to docs/compound/ during setup.
 */

export const DOC_TEMPLATES: Record<string, string> = {
  'HOW_TO_COMPOUND.md': `---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "Usage guide for compound-agent CLI, skills, and workflows"
---

# How to Compound

A usage guide for humans and AI agents working with compound-agent -- the learning system that helps Claude Code avoid repeating mistakes across sessions.

---

## 1. What is compound-agent

Compound-agent is a TypeScript CLI plugin for Claude Code that captures, indexes, and retrieves lessons learned during development sessions. When Claude makes a mistake and gets corrected, or discovers a useful pattern, that knowledge is stored as a **memory item** in \`.claude/lessons/index.jsonl\`. Future sessions search this memory before planning and implementing, so the same mistakes are not repeated.

The system uses:

- **JSONL storage** (\`.claude/lessons/index.jsonl\`) as the git-tracked source of truth
- **SQLite + FTS5** (\`.claude/.cache/lessons.sqlite\`) as a rebuildable search index
- **Semantic embeddings** (EmbeddingGemma-300M via node-llama-cpp) for vector similarity search
- **Claude Code hooks** to inject memory at session start, before compaction, and on tool failures

Memory items have four types: \`lesson\`, \`solution\`, \`pattern\`, and \`preference\`. Each has a trigger (what happened), an insight (what to do differently), tags, severity, and optional citations linking back to source code.

---

## 2. Installation

### Quick start

\`\`\`bash
# In your project root:
npx ca init
\`\`\`

### What \`init\` does

1. Creates \`.claude/lessons/\` directory and empty \`index.jsonl\`
2. Updates \`AGENTS.md\` with a compound-agent section
3. Adds a reference to \`.claude/CLAUDE.md\`
4. Creates \`.claude/plugin.json\` manifest
5. Installs agent templates to \`.claude/agents/compound/\`
6. Installs workflow slash commands to \`.claude/commands/compound/\`
7. Installs phase skills to \`.claude/skills/compound/\`
8. Installs agent role skills to \`.claude/skills/compound/agents/\`
9. Installs a git pre-commit hook (lesson capture reminder)
10. Installs Claude Code hooks (SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse)
11. For pnpm projects: auto-configures \`onlyBuiltDependencies\` for native addons

### Full setup (with embedding model)

\`\`\`bash
npx ca setup
\`\`\`

\`setup\` does everything \`init\` does, plus downloads the EmbeddingGemma-300M model (~278MB) for semantic search. Use \`--skip-model\` to skip the download.

### Verify installation

\`\`\`bash
npx ca doctor
\`\`\`

This checks for \`.claude/\` directory, lessons index, embedding model, Claude hooks, and beads (\`bd\`) availability.

### Directory structure after install

\`\`\`
.claude/
  CLAUDE.md                    # Project instructions (always loaded)
  compound-agent.json          # Config (external reviewers, etc.)
  settings.json                # Claude Code hooks
  plugin.json                  # Plugin manifest
  agents/compound/             # Subagent definitions
  commands/compound/           # Slash commands (brainstorm, plan, work, review, compound, lfg)
  skills/compound/             # Phase skills + agent role skills
  lessons/
    index.jsonl                # Memory items (git-tracked source of truth)
  .cache/
    lessons.sqlite             # Rebuildable search index (.gitignore)
\`\`\`

---

## 3. The 5-phase workflow

Every feature or epic follows five phases:

### Phase 1: Brainstorm

Explore the problem space before committing to a solution. Produce a structured brainstorm document with decisions, open questions, and a beads epic.

- Ask "why" before "how"
- Search memory for similar past features
- Generate multiple approaches, then converge
- Create a beads epic: \`bd create --title="..." --type=epic\`

### Phase 2: Plan

Decompose work into small, testable tasks with dependencies and acceptance criteria.

- Review brainstorm output
- Create beads tasks: \`bd create --title="..." --type=task\`
- Create Review and Compound blocking tasks (these survive compaction)
- Run \`npx ca worktree wire-deps <epic-id>\` if using worktrees

### Phase 3: Work

Execute implementation through agent teams using TDD.

- Pick tasks from \`bd ready\`
- Delegate to test-writer and implementer agents
- Commit incrementally as tests pass
- Run \`/implementation-reviewer\` before closing tasks

### Phase 4: Review

Multi-agent code review with severity classification.

- Run quality gates: \`pnpm test && pnpm lint\`
- Spawn specialized reviewers (security, architecture, performance, etc.)
- Classify findings as P1/P2/P3
- Fix all P1 findings before proceeding

### Phase 5: Compound

Extract and store lessons learned. This is what makes the system compound.

- Analyze what happened during the cycle
- Capture lessons via \`npx ca learn\`
- Cluster patterns via \`npx ca compound\`
- Update outdated docs and ADRs

---

## 4. CLI reference

All commands use \`npx ca\` (or \`npx compound-agent\`). Global flags: \`-v, --verbose\` and \`-q, --quiet\`.

### Capture commands

\`\`\`bash
# Capture a lesson (primary command for storing knowledge)
npx ca learn "Always validate epic IDs before shell execution" \\
  --trigger "Shell injection via bd show" \\
  --tags "security,validation" \\
  --severity high \\
  --type lesson

# Capture a pattern (requires --pattern-bad and --pattern-good)
npx ca learn "Use execFileSync instead of execSync for external commands" \\
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

### Retrieval commands

\`\`\`bash
# Keyword search
npx ca search "sqlite validation"
npx ca search "security" --limit 5

# List all memory items
npx ca list
npx ca list --limit 20
npx ca list --invalidated      # Show only invalidated items

# Semantic search against a plan
npx ca check-plan --plan "Implement git worktree integration"
echo "Add caching layer" | npx ca check-plan

# Load high-severity lessons for session context
npx ca load-session
npx ca load-session --json
\`\`\`

### Management commands

\`\`\`bash
# View a specific item
npx ca show <id>
npx ca show <id> --json

# Update item fields
npx ca update <id> --insight "Updated insight text"
npx ca update <id> --severity high --tags "security,input-validation"

# Soft delete (creates tombstone)
npx ca delete <id>
npx ca delete <id1> <id2> <id3>

# Mark as invalid (excluded from retrieval but preserved)
npx ca wrong <id> --reason "This advice was incorrect"

# Re-enable an invalidated item
npx ca validate <id>

# Export as JSON
npx ca export
npx ca export --since 2026-01-01 --tags "security"

# Import from JSONL file
npx ca import lessons-backup.jsonl

# Database maintenance
npx ca compact                 # Remove tombstones and archive old items
npx ca compact --dry-run       # Preview without changes
npx ca compact --force         # Compact even if below threshold
npx ca rebuild                 # Rebuild SQLite index from JSONL
npx ca rebuild --force         # Force rebuild even if unchanged
npx ca stats                   # Show database health and statistics

# Context recovery
npx ca prime                   # Reload workflow context after compaction
\`\`\`

### Setup commands

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

### Reviewer commands

\`\`\`bash
npx ca reviewer enable gemini  # Enable Gemini as external reviewer
npx ca reviewer enable codex   # Enable Codex as external reviewer
npx ca reviewer disable gemini # Disable a reviewer
npx ca reviewer list           # List enabled reviewers
\`\`\`

### Loop command

\`\`\`bash
# Generate an infinity loop script for autonomous epic processing
npx ca loop
npx ca loop --epics epic-1 epic-2
npx ca loop --output my-loop.sh
npx ca loop --max-retries 5
npx ca loop --model claude-opus-4-6
npx ca loop --force            # Overwrite existing script
\`\`\`

### Health and audit commands

\`\`\`bash
npx ca doctor                  # Check external dependencies and project health
npx ca audit                   # Run pattern, rule, and lesson quality checks
npx ca rules check             # Check codebase against .claude/rules.json
npx ca test-summary            # Run tests and output compact pass/fail summary
\`\`\`

### Verification commands

\`\`\`bash
# Verify workflow gates before epic closure
npx ca verify-gates <epic-id>

# Phase state management (used by LFG workflow)
npx ca phase-check init <epic-id>
npx ca phase-check status
npx ca phase-check start <phase>
npx ca phase-check gate <gate-name>   # post-plan, gate-3, gate-4, final
npx ca phase-check clean
\`\`\`

### Worktree commands

\`\`\`bash
# Create an isolated worktree for an epic
npx ca worktree create <epic-id>

# Connect merge dependencies
npx ca worktree wire-deps <epic-id>

# Merge worktree back to main (two-phase: resolve in worktree, land on main)
npx ca worktree merge <epic-id>

# List active worktrees
npx ca worktree list

# Remove worktree and clean up
npx ca worktree cleanup <epic-id>
npx ca worktree cleanup <epic-id> --force   # Force cleanup of dirty worktrees
\`\`\`

### Compound command

\`\`\`bash
# Synthesize cross-cutting patterns from accumulated lessons
npx ca compound
\`\`\`

---

## 5. Skills reference

Skills are instructions that Claude reads before executing each phase. They live in \`.claude/skills/compound/\` and are auto-installed by \`npx ca setup\`.

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

**What it does**: Sequences all 5 phases with mandatory gates between them, tracks progress in beads notes, handles resumption after interruption.

### \`/compound:set-worktree\`

**Purpose**: Set up an isolated git worktree before running LFG.

**When invoked**: Before \`/compound:lfg\` when you want parallel epic execution.

**What it does**: Validates the epic, runs \`npx ca worktree create <epic-id>\`, verifies output, and informs the user they can proceed with \`/compound:lfg\`.

---

## 6. The LFG workflow

\`/compound:lfg\` chains all 5 phases with enforcement gates. Here is how it works:

### Invocation

\`\`\`
/compound:lfg <epic-id>
\`\`\`

Or with a phase skip:

\`\`\`
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

---

## 7. Worktree integration

Worktrees let you run epics in isolation, enabling parallel execution across multiple Claude Code sessions.

### Creating a worktree

\`\`\`bash
npx ca worktree create <epic-id>
\`\`\`

This:

1. Creates a git worktree at \`../<repo>-wt-<epic-id>\` on branch \`epic/<epic-id>\`
2. Installs dependencies via \`pnpm install --frozen-lockfile\`
3. Copies \`.claude/lessons/index.jsonl\` to the worktree
4. Runs \`npx ca setup --skip-model\` in the worktree
5. Creates a Merge beads task linked to the epic

### Using with LFG

\`\`\`bash
# From main repo:
npx ca worktree create my-epic-id

# Then in the worktree directory:
# Run /compound:lfg or /compound:set-worktree followed by /compound:lfg
\`\`\`

Or use the skill:

\`\`\`
/compound:set-worktree <epic-id>
\`\`\`

### Merging back

When all work tasks complete, the Merge task surfaces via \`bd ready\`:

\`\`\`bash
npx ca worktree merge <epic-id>
\`\`\`

This runs a two-phase merge:

1. Merges \`main\` into the worktree branch (resolve conflicts there)
2. Fast-forwards \`main\` to the worktree branch (clean landing)

### Cleanup

\`\`\`bash
npx ca worktree cleanup <epic-id>
npx ca worktree cleanup <epic-id> --force   # For dirty worktrees
\`\`\`

This removes the worktree directory, deletes the branch, and closes the Merge task.

### Listing worktrees

\`\`\`bash
npx ca worktree list
\`\`\`

Shows active worktrees with their epic and merge task status.

---

## 8. Memory system

### Storage format

Memory items are stored as newline-delimited JSON in \`.claude/lessons/index.jsonl\`. Each line is a complete JSON object:

\`\`\`json
{"id":"L-abc123","type":"lesson","trigger":"Shell injection via execSync","insight":"Use execFileSync with array args to prevent shell interpretation","tags":["security"],"source":"manual","context":{"tool":"cli","intent":"manual learning"},"created":"2026-02-15T10:00:00Z","confirmed":true,"severity":"high","supersedes":[],"related":[]}
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

### Compounding (pattern synthesis)

\`\`\`bash
npx ca compound
\`\`\`

This reads all memory items, computes embeddings, clusters them by similarity, and synthesizes cross-cutting patterns into \`.claude/lessons/cct-patterns.jsonl\`. Clusters with 2+ items become patterns; single-item clusters are filtered as noise.

### Data lifecycle

| Operation | Effect |
|-----------|--------|
| \`npx ca learn\` | Appends a new item to JSONL |
| \`npx ca update\` | Appends an updated version (last-write-wins) |
| \`npx ca delete\` | Appends with \`deleted: true\` flag |
| \`npx ca wrong\` | Sets \`invalidatedAt\` (excluded from retrieval, preserved in storage) |
| \`npx ca compact\` | Removes tombstones and archives old items, then rebuilds index |

---

## 9. For AI agents

### Integrating into CLAUDE.md

Add a reference to compound-agent in your project's \`.claude/CLAUDE.md\`:

\`\`\`markdown
## References

- docs/compound/HOW_TO_COMPOUND.md -- Usage guide for humans and AI agents
\`\`\`

The \`npx ca init\` command does this automatically.

### Claude Code hooks

Compound-agent installs five hooks into \`.claude/settings.json\`:

| Hook | Trigger | Action |
|------|---------|--------|
| **SessionStart** | New session or resume | Runs \`npx ca prime\` to load workflow context and high-severity lessons |
| **PreCompact** | Before context compaction | Runs \`npx ca prime\` to preserve context across compaction |
| **UserPromptSubmit** | Every user message | Detects correction language ("actually", "wrong") and planning language ("implement", "build"), injects memory reminders |
| **PostToolUseFailure** | Bash/Edit/Write failures | After 2 failures on same file or 3 total, suggests \`npx ca search\` |
| **PostToolUse** | After successful tool use | Resets failure tracking; tracks skill file reads for phase guard |

### Memory usage during sessions

**At session start**: High-severity lessons are automatically loaded via the SessionStart hook.

**Before planning**: Search memory for relevant context:

\`\`\`bash
npx ca search "feature area keywords"
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

### Beads workflow integration

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

This checks that:

1. A Review task exists and is closed
2. A Compound task exists and is closed
3. If a Merge task exists (worktree epic), it is also closed

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
