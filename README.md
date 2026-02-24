# Compound Agent

**Semantic memory for Claude Code -- capture mistakes once, never repeat them.**

[![npm version](https://img.shields.io/npm/v/compound-agent)](https://www.npmjs.com/package/compound-agent)
[![license](https://img.shields.io/npm/l/compound-agent)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue)](https://www.typescriptlang.org/)

## Overview

Claude Code forgets everything between sessions. Compound Agent fixes this with a three-layer system: issue tracking (Beads) at the foundation, semantic memory with vector search in the middle, and structured workflow phases on top. It captures knowledge from corrections, discoveries, and completed work, then retrieves it precisely when relevant -- at session start, during planning, and before architectural decisions. Every cycle through the loop makes subsequent cycles smarter.

## The Compound Loop

```mermaid
graph LR
    B[BRAINSTORM] --> P[PLAN]
    P --> W[WORK]
    W --> R[REVIEW]
    R --> C[COMPOUND]
    C --> M[(MEMORY)]
    M --> P
```

A bug found in review becomes a lesson. That lesson surfaces during planning of similar work. The plan accounts for the known issue. Work avoids the mistake.

## Architecture

```mermaid
block-beta
    columns 1
    block:L3["Layer 3: Workflows"]
        A["Slash commands"] B["Agent teams"] C["5-phase cycle"]
    end
    block:L2["Layer 2: Semantic Memory"]
        D["JSONL source of truth"] E["SQLite FTS5 index"] F["Vector embeddings"]
    end
    block:L1["Layer 1: Beads"]
        G["Issue tracking"] H["Git-backed sync"] I["Dependency graph"]
    end

    L3 --> L2
    L2 --> L1
```

Four memory types -- `lesson`, `solution`, `pattern`, `preference` -- share one store, one schema, and one ranked retrieval mechanism combining vector similarity, severity, recency, and confirmation status.

## Why Not Just X?

| Feature | `.claude/CLAUDE.md` | Claude Reflect | mem0 | Compound Agent |
|---------|---------------------|----------------|------|----------------|
| Persists across sessions | Manual edits | Yes | Yes | Yes |
| Semantic search | No | No (regex) | Yes (cloud) | Yes (local) |
| Quality gate on capture | No | No | No | Yes (novelty + specificity) |
| Runs fully offline | Yes | Yes | No (API) | Yes |
| Git-tracked knowledge | Yes | No | No | Yes (JSONL) |
| Structured workflow phases | No | No | No | Yes (5 phases) |
| Claude Code native integration | N/A | Yes | No | Yes (hooks + commands) |

## Installation

```bash
# Install as dev dependency
pnpm add -D compound-agent

# One-shot setup (creates dirs, hooks, downloads model)
npx ca setup

# Skip the ~278MB model download (do it later)
npx ca setup --skip-model
```

### Requirements

- Node.js >= 20
- ~278MB disk space for the embedding model (one-time download, shared across projects)
- ~150MB RAM during embedding operations

### pnpm Users

pnpm v9+ blocks native addon builds by default. Running `npx ca setup` automatically detects pnpm and adds the required config to your `package.json`.

If you prefer to configure manually, add to your `package.json`:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "node-llama-cpp"]
  }
}
```

Then run `pnpm install`.

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
| `ca phase-check` | Manage LFG phase state (init/status/clean/gate) |
| `ca audit` | Run audit checks against the codebase |
| `ca rules check` | Run repository-defined rule checks |
| `ca test-summary` | Run tests and output a compact summary |

### Worktree

| Command | Description |
|---------|-------------|
| `ca worktree create <epic-id>` | Create isolated worktree for an epic |
| `ca worktree wire-deps <epic-id>` | Wire Review/Compound as merge blockers |
| `ca worktree merge <epic-id>` | Two-phase merge back to main |
| `ca worktree list` | List active worktrees with status |
| `ca worktree cleanup <epic-id>` | Remove worktree and clean up (--force for dirty) |

### Automation

| Command | Description |
|---------|-------------|
| `ca loop` | Generate infinity loop script for autonomous epic processing |
| `ca loop --epics <ids...>` | Target specific epic IDs |
| `ca loop -o <path>` | Custom output path (default: `./infinity-loop.sh`) |
| `ca loop --max-retries <n>` | Max retries per epic on failure (default: 1) |
| `ca loop --force` | Overwrite existing script |

### Setup

| Command | Description |
|---------|-------------|
| `ca setup` | One-shot setup (hooks + git pre-commit + model) |
| `ca setup --skip-model` | Setup without model download |
| `ca setup --uninstall` | Remove all generated files |
| `ca setup --update` | Regenerate files (preserves user customizations) |
| `ca setup --status` | Show installation status |
| `ca setup --dry-run` | Show what would change without changing |
| `ca setup claude --status` | Check Claude Code integration health |
| `ca setup claude --uninstall` | Remove Claude hooks only |
| `ca download-model` | Download the embedding model |
| `ca about` | Show version, animation, and recent changelog |
| `ca doctor` | Verify external dependencies and project health |

## Memory Types

| Type | Trigger means | Insight means | Example |
|------|---------------|---------------|---------|
| `lesson` | What happened | What was learned | "Polars 10x faster than pandas for large files" |
| `solution` | The problem | The resolution | "Auth 401 fix: add X-Request-ID header" |
| `pattern` | When it applies | Why it matters | `{ bad: "await in loop", good: "Promise.all" }` |
| `preference` | The context | The preference | "Use uv over pip in this project" |

### Retrieval Ranking

```
boost  = severity_boost * recency_boost * confirmation_boost
         clamped to max 1.8
score  = vector_similarity(query, item) * boost

severity_boost:     high=1.5, medium=1.0, low=0.8
recency_boost:      last 30d=1.2, older=1.0
confirmation_boost: confirmed=1.3, unconfirmed=1.0
```

## FAQ

**Q: How is this different from mem0?**
A: mem0 is a cloud memory layer for general AI agents. Compound Agent is local-first, designed specifically for Claude Code, with git-tracked storage and local embeddings -- no API keys or cloud services needed.

**Q: Does this work offline?**
A: Yes, completely. Embeddings run locally via node-llama-cpp. No network requests after the initial model download.

**Q: How much disk space does it need?**
A: ~278MB for the embedding model (one-time download, shared across projects) plus negligible space for lessons.

**Q: Can I use it with other AI coding tools?**
A: The CLI (`ca`) works standalone, but hooks and slash commands are Claude Code specific. The TypeScript API can be integrated into other tools.

**Q: What happens if the embedding model isn't available?**
A: Compound Agent hard-fails rather than silently degrading. Run `npx ca doctor` to diagnose issues.

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsup
pnpm dev              # Watch mode (rebuild on changes)
pnpm lint             # Type check + ESLint
```

| Script | Duration | Use Case |
|--------|----------|----------|
| `pnpm test:fast` | ~6s | Rapid feedback during development |
| `pnpm test` | ~60s | Full suite before committing |
| `pnpm test:changed` | varies | Only tests affected by recent changes |
| `pnpm test:watch` | - | Watch mode for TDD workflow |
| `pnpm test:all` | ~60s | Full suite with model download |

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
| Issue Tracking | Beads (bd) |

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE-V2.md](https://github.com/Nathandela/compound-agent/blob/main/docs/ARCHITECTURE-V2.md) | Three-layer architecture design |
| [docs/MIGRATION.md](https://github.com/Nathandela/compound-agent/blob/main/docs/MIGRATION.md) | Migration guide from learning-agent |
| [CHANGELOG.md](https://github.com/Nathandela/compound-agent/blob/main/CHANGELOG.md) | Version history |
| [AGENTS.md](https://github.com/Nathandela/compound-agent/blob/main/AGENTS.md) | Agent workflow instructions |

## Acknowledgments

Compound Agent builds on ideas and patterns from these projects:

| Project | Influence |
|---------|-----------|
| [Compound Engineering Plugin](https://github.com/EveryInc/compound-engineering-plugin) | The "compound" philosophy -- each unit of work makes subsequent units easier. Multi-agent review workflows and skills as encoded knowledge. |
| [Beads](https://github.com/steveyegge/beads) | Git-backed JSONL + SQLite hybrid storage model, hash-based conflict-free IDs, dependency graphs |
| [OpenClaw](https://github.com/openclaw/openclaw) | Claude Code integration patterns and hook-based workflow architecture |

Also informed by research into [Reflexion](https://arxiv.org/abs/2303.11366) (verbal reinforcement learning), [Voyager](https://github.com/MineDojo/Voyager) (executable skill libraries), and production systems from mem0, Letta, and GitHub Copilot Memory.

## License

MIT -- see [LICENSE](LICENSE) for details.

> The embedding model (EmbeddingGemma-300M) is downloaded on-demand and subject to Google's [Gemma Terms of Use](https://ai.google.dev/gemma/terms). See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for full dependency license information.
