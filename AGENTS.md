# Agent Instructions

This document provides machine-readable context for AI agents working on this codebase.

For detailed project rules and TDD workflow, see `.claude/CLAUDE.md`.

---

## Project Overview

**Name**: Compound Agent
**Purpose**: Learning system that helps Claude Code avoid repeating mistakes across sessions
**Stack**: Go (primary) + Rust (embedding daemon) + Node/pnpm (npm wrapper distribution)
**CLI**: `ca` (alias: `compound-agent`), built with Cobra
**Module**: `github.com/nathandelacretaz/compound-agent`

### What It Does

1. Captures lessons from user corrections, self-corrections, and test failures
2. Stores lessons in JSONL (git-tracked) with SQLite index (cache)
3. Retrieves relevant lessons via local embeddings (ONNX Runtime, Rust daemon)
4. Injects lessons at session-start and plan-time via hooks

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| CLI entrypoint | `go/cmd/ca/` | Cobra root command, hook dispatch |
| Commands | `go/internal/cli/` | All CLI subcommand definitions |
| Storage | `go/internal/storage/` | SQLite + FTS5 (search, cache, sync, knowledge DB) |
| Search | `go/internal/search/` | Hybrid search (keyword + vector ranking) |
| Capture | `go/internal/capture/` | Trigger detection + quality filters |
| Retrieval | `go/internal/retrieval/` | Session-start and plan-time retrieval |
| Compound | `go/internal/compound/` | Compound synthesis (clustering, patterns) |
| Knowledge | `go/internal/knowledge/` | Knowledge indexing and embedding |
| Embed | `go/internal/embed/` | Embedding daemon IPC (client, lifecycle) |
| Hook | `go/internal/hook/` | Hook runner, phase state, failure tracking |
| Memory | `go/internal/memory/` | Memory types and JSONL operations |
| Setup | `go/internal/setup/` | Template installation (embedded templates) |
| Util | `go/internal/util/` | Shared utilities (stdin, shell escape, cosine) |
| Build | `go/internal/build/` | Build version injection |
| npm dist | `go/internal/npmdist/` | npm distribution wrapper |
| Embed daemon | `rust/embed-daemon/` | Rust ONNX Runtime embedding daemon |

### Architecture

```
go/
├── cmd/ca/                     <- CLI entrypoint (Cobra root command)
├── internal/                   <- All packages (unexported)
│   ├── cli/                    <- Cobra command definitions
│   ├── storage/                <- SQLite + FTS5
│   ├── search/                 <- Hybrid search (keyword + vector)
│   ├── capture/                <- Lesson capture
│   ├── retrieval/              <- Session retrieval
│   ├── compound/               <- Compound synthesis
│   ├── knowledge/              <- Knowledge indexing
│   ├── embed/                  <- Embedding daemon IPC
│   ├── hook/                   <- Hook management
│   ├── memory/                 <- Memory types / JSONL
│   ├── setup/                  <- Template installation
│   ├── util/                   <- Shared utilities
│   ├── build/                  <- Version injection
│   └── npmdist/                <- npm wrapper
rust/
└── embed-daemon/               <- Rust embedding daemon (ONNX Runtime)
.claude/
├── CLAUDE.md                   <- Always-loaded project rules
├── compound-agent.json         <- Config
├── agents/                     <- Subagent definitions (TDD pipeline)
├── commands/                   <- Slash commands
├── skills/compound/            <- Skill definitions (cook-it, spec-dev, plan, work, review, compound, etc.)
└── lessons/
    └── index.jsonl             <- Source of truth (git-tracked)
.claude/.cache/
    └── lessons.sqlite          <- Rebuildable index (.gitignore)
```

---

## Build, Test, Run Commands

```bash
# Build CLI binary (CGO required for SQLite)
cd go && go build -tags sqlite_fts5 ./cmd/ca

# Run full test suite
cd go && go test -tags sqlite_fts5 ./...

# Static analysis
cd go && go vet -tags sqlite_fts5 ./...

# Lint (golangci-lint v2)
cd go && golangci-lint run ./...

# Build via Makefile
make -C go build

# Test via Makefile
make -C go test
```

### Build Requirements

- Go 1.26+
- CGO enabled (for `mattn/go-sqlite3`)
- Build tag: `sqlite_fts5`

### Dependencies (minimal)

| Dependency | Purpose |
|------------|---------|
| `github.com/mattn/go-sqlite3` | SQLite driver with FTS5 support (CGO) |
| `github.com/spf13/cobra` | CLI framework |

### CLI Usage

```bash
# Core commands
ca search <query>              # Search lessons (hybrid: keyword + vector)
ca list                        # List all lessons
ca learn                       # Capture a new lesson
ca load-session                # Load high-severity lessons for session context
ca check-plan --plan "..."     # Check a plan against learned lessons

# Knowledge
ca knowledge                   # Knowledge indexing commands

# Maintenance
ca stats                       # Database health
ca compact                     # Reduce lesson database size

# Setup
ca init                        # Setup hooks, templates, config

# Verification
ca verify-gates <epic-id>      # Verify review + compound tasks closed
ca phase-check                 # Cook-it phase state management

# Hooks
ca hooks run <hook-name>       # Run a hook handler

# Advanced
ca capture                     # Structured capture from JSON input
ca detect                      # Detect triggers from JSON input
```

---

## Code Style and Conventions

### File Organization

- Source: `go/internal/<package>/*.go`
- Tests: `go/internal/<package>/*_test.go` (colocated with source)
- CLI commands: `go/internal/cli/commands_*.go` (one file per command group)
- All internal packages are unexported (`internal/`)

### Naming Conventions

- **Files**: snake_case (e.g., `phase_state.go`, `knowledge_db.go`)
- **Exported functions**: PascalCase, verb-first (e.g., `RegisterCommands`, `OpenRepoDB`)
- **Unexported functions**: camelCase, verb-first (e.g., `runSearch`, `formatSearchResults`)
- **Types/Structs**: PascalCase (e.g., `Item`, `ScoredItem`, `RankedItem`)
- **Constants**: PascalCase for exported, camelCase for unexported (Go convention)

### Documentation

- Doc comments on all exported functions (enforced by linter)
- No emojis in code or comments
- Package-level doc comments in each package

### Module Boundaries

Each package in `go/internal/` has a clear responsibility:
- `storage` owns SQLite operations (open, sync, search, cache)
- `search` owns ranking and scoring logic
- `capture` owns trigger detection and quality gates
- `retrieval` owns session loading and plan checking
- `memory` owns JSONL read/write and type definitions
- `embed` owns daemon lifecycle and IPC protocol
- `cli` owns Cobra command wiring and output formatting

### Error Handling

- Errors wrapped with `fmt.Errorf("context: %w", err)`
- Embedding failures: Hard fail (no silent fallback to empty results)
- File read errors: Return wrapped errors
- Invalid lesson data: Validate and reject malformed entries
- Structured logging via `log/slog` (debug/warn/error levels)

---

## Security and Data Handling

### Secrets

- DO NOT hardcode API keys, tokens, or credentials
- DO NOT log sensitive data (PII, tokens, passwords)
- DO NOT include secrets in test fixtures

### SQL Injection Prevention

All SQLite queries use parameterized statements:

```go
// CORRECT - parameterized
db.QueryRow("SELECT * FROM lessons WHERE id = ?", id)

// WRONG - string interpolation
db.QueryRow(fmt.Sprintf("SELECT * FROM lessons WHERE id = '%s'", id))
```

### File Paths

- Use `filepath.Join()` for constructing file paths
- Resolve to absolute paths before file operations
- Validate that paths are within expected directories

---

## Common Pitfalls

### DO NOT

1. **DO NOT mock business logic in tests**
   - Mock only external dependencies (file system, network)
   - Test real functions with real data

2. **DO NOT write tests after implementation**
   - Follow TDD: write tests FIRST, then implement
   - Use verification subagents (see `.claude/CLAUDE.md`)

3. **DO NOT modify tests to make them pass**
   - If tests seem wrong, discuss with user first
   - Tests define expected behavior

4. **DO NOT use string interpolation in SQL**
   - Always use parameterized queries
   - SQLite injection is a real risk

5. **DO NOT use global mutable state**
   - Pass dependencies explicitly
   - Use function parameters, not globals

6. **DO NOT commit without running tests**
   - `go test -tags sqlite_fts5 ./...` must pass before commit
   - `golangci-lint run ./...` must pass before commit

7. **DO NOT add heavyweight dependencies**
   - This project has only two direct dependencies (sqlite3, cobra)
   - Keep it minimal

8. **DO NOT log sensitive lesson content in production**
   - Lessons may contain code patterns
   - Debug logging only in development

### Testing Requirements

- Tests colocated with source files (`*_test.go`)
- Table-driven tests with subtests (`t.Run`)
- Build tag `sqlite_fts5` required for all test commands
- 100% pass rate required
- No mocking of business logic
- Property-based tests where appropriate

---

## Compound Agent Integration

This section explains HOW and WHEN Claude should interact with the compound-agent memory system.

### Workflow Commands

| Command | Phase | Description |
|---------|-------|-------------|
| `/compound:spec-dev` | Spec Dev | Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams |
| `/compound:plan` | Plan | Create structured plan enriched by semantic memory |
| `/compound:work` | Work | Execute plan with agent teams and TDD |
| `/compound:review` | Review | Multi-agent review with inter-communication |
| `/compound:compound` | Compound | Capture knowledge, feed back into memory |
| `/compound:cook-it` | All | Chain all 5 phases sequentially |

### CLI

| Command | Purpose |
|---------|---------|
| `ca load-session` | Load session context (high-severity lessons) |
| `ca search <query>` | Search lessons |
| `ca learn` | Capture a lesson |
| `ca list` | List all lessons |
| `ca stats` | Database health |
| `ca verify-gates <epic-id>` | Verify review + compound tasks exist and are closed |
| `ca phase-check` | Manage cook-it phase state (init/status/clean/gate) |

### Core Principle

**Quality over quantity.** Most sessions should have NO new lessons. Only capture lessons that are:
- **Novel** - Not already in the lesson database
- **Specific** - Clear, actionable guidance (not "write better code")
- **Actionable** - Concrete behavior to change

---

### Mandatory Recall

#### Session Start (Automatic via hooks)

`ca load-session` runs automatically via `.claude/settings.json` hooks at SessionStart and PreCompact.

#### Before Architectural Decisions

Before making architectural decisions or choosing between approaches, run `ca search <query>` to check for relevant past lessons.

---

### Lesson Capture Flow

#### Trigger Detection

Propose a lesson when ANY of these triggers occur:

| Trigger | Signal | Example |
|---------|--------|---------|
| **User Correction** | User says "no", "wrong", "actually..." | "Actually, use v2 of the API" |
| **Self-Correction** | Claude iterates: edit -> fail -> re-edit | Fixed bug after multiple attempts |
| **Test Failure** | Test fails -> fix -> passes | Auth test failed due to missing header |
| **Manual** | User says "remember this" or `/learn` | "Remember: always run lint before commit" |

#### Quality Gate (MANDATORY)

Before proposing ANY lesson, verify ALL THREE criteria:

```
[ ] Is this NOVEL?     - Not already in lessons database
[ ] Is this SPECIFIC?  - Clear, concrete guidance
[ ] Is this ACTIONABLE? - Obvious what to do differently
```

**If ANY check fails -> DO NOT propose the lesson.**

#### Confirmation UX

```
Learned: [insight]. Confirm to save?
```

**Rules:**
- Keep insight concise (one sentence)
- User must explicitly confirm with "yes" or similar
- Silence or other response = do not save
- After confirmation, use `ca learn --yes`

---

### Never Edit JSONL Directly

**WARNING: NEVER directly edit `.claude/lessons/index.jsonl`.**

Direct edits bypass schema validation, embedding sync, and SQLite index updates. Always use:
1. `ca learn` CLI

---

### Anti-Patterns (DO NOT)

| Pattern | Why It's Wrong |
|---------|----------------|
| Propose vague lessons | "Write better code" is not actionable |
| Auto-save without confirmation | User must explicitly confirm |
| Ignore quality gate | Leads to lesson database bloat |
| Propose every correction | Most corrections don't need lessons |
| Edit index.jsonl directly | Breaks schema/validation/sync |

---

### Setup

Run `ca init` in a project root to configure:
- `.claude/settings.json` - Hooks (SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse)
- `AGENTS.md` - Agent instructions
- `.claude/CLAUDE.md` - Project reference
- `.claude/commands/` - Slash commands (/learn, /show, /wrong, /stats)
- `.claude/skills/compound/` - Workflow skills (cook-it, spec-dev, plan, work, review, compound)
- Pre-commit hook - Capture reminder

---

## References

| Document | Purpose |
|----------|---------|
| `.claude/CLAUDE.md` | Detailed project rules and TDD workflow |
| `docs/ARCHITECTURE-V2.md` | Architecture vision and workflow design |
| `docs/INDEX.md` | Full documentation map |
| `CHANGELOG.md` | Version history and release notes |

<!-- BEGIN BEADS INTEGRATION v:1 profile:full hash:f65d5d33 -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Quality
- Use `--acceptance` and `--design` fields when creating issues
- Use `--validate` to check description completeness

### Lifecycle
- `bd defer <id>` / `bd supersede <id>` for issue management
- `bd stale` / `bd orphans` / `bd lint` for hygiene
- `bd human <id>` to flag for human decisions
- `bd formula list` / `bd mol pour <name>` for structured workflows

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- Use bd for ALL task tracking
- Always use `--json` flag for programmatic use
- Link discovered work with `discovered-from` dependencies
- Check `bd ready` before asking "what should I work on?"
- Do NOT create markdown TODO lists
- Do NOT use external issue trackers
- Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
