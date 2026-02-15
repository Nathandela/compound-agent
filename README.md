# Compound Agent

Semantically-intelligent workflow plugin for Claude Code. Every unit of work compounds -- mistakes become lessons, solutions become searchable knowledge, and each cycle makes subsequent work smarter.

## Overview

Claude Code forgets everything between sessions. Compound Agent fixes this with a three-layer system: issue tracking (Beads) at the foundation, semantic memory with vector search in the middle, and structured workflow phases on top. It captures knowledge from corrections, discoveries, and completed work, then retrieves it precisely when relevant -- at session start, during planning, and before architectural decisions.

## Architecture

```
LAYER 3: WORKFLOWS
  /compound:brainstorm, /compound:plan, /compound:work,
  /compound:review, /compound:compound, /compound:lfg
  Agent teams at each phase with inter-communication

LAYER 2: SEMANTIC MEMORY
  4 types: lesson | solution | pattern | preference
  JSONL source of truth + SQLite FTS5 index + vector embeddings
  Ranked retrieval: similarity * severity * recency * confirmation

LAYER 1: BEADS (Foundation)
  Issue tracking + dependency graph
  Git-backed persistence + distributed sync
```

### Storage Layout

```
project_root/
+-- .mcp.json                    <- MCP server config
+-- AGENTS.md                    <- Workflow instructions for Claude
+-- .claude/
    +-- settings.json            <- Claude Code hooks
    +-- lessons/
    |   +-- index.jsonl          <- Source of truth (git-tracked)
    |   +-- archive/             <- Compacted old items
    +-- .cache/
        +-- lessons.sqlite       <- Rebuildable index (.gitignore)
```

### The Compound Loop

```
COMPOUND --> writes to --> MEMORY
                             |
                      searched by
                             |
                           PLAN --> creates context for --> WORK
                                                             |
                                                      produces for
                                                             |
                                                          REVIEW
                                                             |
                                                    generates for
                                                             |
                                                         COMPOUND
```

Every cycle through the loop makes subsequent cycles smarter. A bug found in review becomes a lesson. That lesson surfaces during planning of similar work. The plan accounts for the known issue. Work avoids the mistake.

## Installation

```bash
# Install as dev dependency
pnpm add -D compound-agent

# One-shot setup (creates dirs, hooks, MCP server, downloads model)
npx ca setup

# Skip the ~278MB model download (do it later)
npx ca setup --skip-model
```

### Requirements

- Node.js >= 20
- ~278MB disk space for the embedding model
- ~150MB RAM during embedding operations

### pnpm Users

pnpm v9+ blocks native addon builds by default. Add to your `package.json`:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "node-llama-cpp"]
  }
}
```

Then run `pnpm install`.

### What `setup` Does

| Action | Location | Purpose |
|--------|----------|---------|
| Create lessons store | `.claude/lessons/` | JSONL + cache directory |
| Install AGENTS.md | project root | Workflow instructions for Claude |
| Configure hooks | `.claude/settings.json` | SessionStart, PreCompact, UserPromptSubmit, PostToolUse hooks |
| Register MCP server | `.mcp.json` | `memory_search`, `memory_capture` tools |
| Install workflow commands | `.claude/commands/compound/` | Slash commands for each phase |
| Install agent definitions | `.claude/agents/compound/` | Specialized agent roles |
| Install phase skills | `.claude/skills/compound/` | Process instructions per phase |
| Download embedding model | `~/.node-llama-cpp/models/` | First-use only, ~278MB |

## Quick Start

The five-phase workflow:

```
1. /compound:brainstorm  -->  Explore the problem, clarify scope
2. /compound:plan        -->  Create tasks enriched by memory search
3. /compound:work        -->  Execute with agent teams + TDD
4. /compound:review      -->  Multi-agent review with inter-communication
5. /compound:compound    -->  Capture what was learned into memory
```

Or run all phases sequentially:

```
/compound:lfg "Add auth to API"
```

Each phase searches memory for relevant past knowledge and injects it into agent context. The compound phase captures new knowledge, closing the loop.

## CLI Reference

The CLI binary is `ca` (alias: `compound-agent`).

### Capture

| Command | Description |
|---------|-------------|
| `ca learn "<insight>"` | Capture a memory item manually |
| `ca learn "<insight>" --trigger "<context>"` | Capture with trigger context |
| `ca learn "<insight>" --severity high` | Set severity level |
| `ca learn "<insight>" --citation src/api.ts:42` | Attach file provenance |
| `ca capture --input <file>` | Capture from structured input file |
| `ca detect --input <file>` | Detect correction patterns in input |

### Retrieval

| Command | Description |
|---------|-------------|
| `ca search "<query>"` | Keyword search across memory (FTS5) |
| `ca list` | List all memory items |
| `ca list --invalidated` | List only invalidated items |
| `ca check-plan --plan "<text>"` | Semantic search for plan-time retrieval |
| `ca load-session` | Load high-severity items for session start |

### Management

| Command | Description |
|---------|-------------|
| `ca show <id>` | Display item details |
| `ca update <id> --insight "..."` | Modify item fields |
| `ca delete <id>` | Soft-delete an item |
| `ca wrong <id>` | Mark item as invalid |
| `ca wrong <id> --reason "..."` | Mark invalid with reason |
| `ca validate <id>` | Re-enable an invalidated item |
| `ca stats` | Database health and age distribution |
| `ca rebuild` | Rebuild SQLite index from JSONL |
| `ca compact` | Archive old items, remove tombstones |
| `ca export` | Export items as JSON |
| `ca import <file>` | Import items from JSONL file |
| `ca prime` | Load workflow context (used by hooks) |
| `ca verify-gates <epic-id>` | Verify review + compound tasks exist and are closed |
| `ca audit` | Run audit checks against the codebase |
| `ca rules check` | Run repository-defined rule checks |
| `ca test-summary` | Run tests and output a compact summary |

### Automation

| Command | Description |
|---------|-------------|
| `ca loop` | Generate infinity loop script for autonomous epic processing |
| `ca loop --epics <ids...>` | Target specific epic IDs |
| `ca loop -o <path>` | Custom output path (default: `./infinity-loop.sh`) |
| `ca loop --max-retries <n>` | Max retries per epic on failure (default: 1) |
| `ca loop --force` | Overwrite existing script |

Generated scripts detect three markers: `EPIC_COMPLETE` (success), `EPIC_FAILED` (retry then stop), `HUMAN_REQUIRED: <reason>` (skip and continue). Run with `LOOP_DRY_RUN=1` to preview.

### Setup

| Command | Description |
|---------|-------------|
| `ca setup` | One-shot setup (hooks + MCP + model) |
| `ca setup --skip-model` | Setup without model download |
| `ca setup --uninstall` | Remove all generated files |
| `ca setup --update` | Regenerate files (preserves user customizations) |
| `ca setup --status` | Show installation status |
| `ca setup --dry-run` | Show what would change without changing |
| `ca setup claude --status` | Check Claude Code integration health |
| `ca setup claude --uninstall` | Remove Claude hooks only |
| `ca download-model` | Download the embedding model |

## MCP Tools

Compound Agent exposes three MCP endpoints. These are the primary interface for Claude -- preferred over CLI commands.

| Endpoint | Type | Purpose |
|----------|------|---------|
| `memory_search` | Tool | Search memory items by semantic similarity. Supports `query`, `maxResults`, and `type` filter. |
| `memory_capture` | Tool | Capture a new memory item. Accepts `insight`, `trigger`, `tags`, `type`, `severity`, `pattern`, and relationship fields. |
| `memory://prime` | Resource | Workflow context with high-severity memory items for session start. |

## Workflow Commands

Installed to `.claude/commands/compound/` during setup. Invoked as slash commands in Claude Code.

| Command | Phase | Description |
|---------|-------|-------------|
| `/compound:brainstorm` | Brainstorm | Explore the problem, iterate with user, create beads epic |
| `/compound:plan` | Plan | Create detailed plan with memory retrieval + research agents |
| `/compound:work` | Work | Execute with agent teams, adaptive TDD per task complexity |
| `/compound:review` | Review | Multi-agent review (security, architecture, performance, tests, simplicity) |
| `/compound:compound` | Compound | Capture lessons, solutions, patterns into memory |
| `/compound:lfg` | All | Chain all phases sequentially |

## Memory Types

All types share one store, one schema, one search mechanism. A query returns the most relevant items regardless of type.

| Type | Trigger means | Insight means | Example |
|------|---------------|---------------|---------|
| `lesson` | What happened | What was learned | "Polars 10x faster than pandas for large files" |
| `solution` | The problem | The resolution | "Auth 401 fix: add X-Request-ID header" |
| `pattern` | When it applies | Why it matters | `{ bad: "await in loop", good: "Promise.all" }` |
| `preference` | The context | The preference | "Use uv over pip in this project" |

## Memory Item Schema

All memory items share a common schema with a discriminated union on the `type` field.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Hash-based unique identifier |
| `type` | `"lesson"` \| `"solution"` \| `"pattern"` \| `"preference"` | Item type |
| `trigger` | string | What caused/prompted this |
| `insight` | string | What was learned |
| `tags` | string[] | Categorization tags |
| `source` | string | How captured: `user_correction`, `self_correction`, `test_failure`, `manual` |
| `context` | `{ tool, intent }` | Capture context |
| `created` | ISO string | Creation timestamp |
| `confirmed` | boolean | Whether user confirmed |
| `supersedes` | string[] | IDs of items this replaces |
| `related` | string[] | IDs of related items |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `evidence` | string | Supporting evidence |
| `severity` | `"high"` \| `"medium"` \| `"low"` | Importance level |
| `citation` | `{ file, line?, commit? }` | File/line provenance |
| `pattern` | `{ bad, good }` | Code pattern (required for `pattern` type) |

### Retrieval Ranking

```
boost  = severity_boost * recency_boost * confirmation_boost
         clamped to max 1.8
score  = vector_similarity(query, item) * boost

severity_boost:     high=1.5, medium=1.0, low=0.8
recency_boost:      last 30d=1.2, older=1.0
confirmation_boost: confirmed=1.3, unconfirmed=1.0
```

### Example

```json
{
  "id": "Sa1b2c3d4",
  "type": "solution",
  "trigger": "API returned 401 despite valid JWT token",
  "insight": "Auth API requires X-Request-ID header in all requests",
  "evidence": "Traced in network tab, discovered missing header requirement",
  "severity": "high",
  "tags": ["api", "auth", "headers"],
  "source": "test_failure",
  "context": { "tool": "fetch", "intent": "API authentication" },
  "created": "2026-01-15T10:30:00.000Z",
  "confirmed": true,
  "supersedes": [],
  "related": [],
  "citation": { "file": "src/api/client.ts", "line": 42 }
}
```

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsup
pnpm dev              # Watch mode (rebuild on changes)
pnpm lint             # Type check + ESLint
```

### Test Scripts

| Script | Duration | Use Case |
|--------|----------|----------|
| `pnpm test:fast` | ~6s | Rapid feedback during development (skips CLI integration tests) |
| `pnpm test` | ~60s | Full suite before committing |
| `pnpm test:changed` | varies | Only tests affected by recent changes |
| `pnpm test:watch` | - | Watch mode for TDD workflow |
| `pnpm test:all` | ~60s | Full suite with model download |

**Recommended**: Use `pnpm test:fast` while coding, `pnpm test` before committing.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM) |
| Package Manager | pnpm |
| Build | tsup |
| Testing | Vitest + fast-check (property tests) |
| Storage | better-sqlite3 + FTS5 |
| Embeddings | node-llama-cpp + EmbeddingGemma-300M |
| CLI | Commander.js |
| Schema | Zod |
| MCP | @modelcontextprotocol/sdk |
| Issue Tracking | Beads (bd) |

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE-V2.md](docs/ARCHITECTURE-V2.md) | Three-layer architecture design |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Migration guide from learning-agent |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [AGENTS.md](AGENTS.md) | Agent workflow instructions |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Claude Code project instructions |

## License

MIT
