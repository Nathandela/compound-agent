# Compound Agent - Architecture V2

## Vision

A semantically-intelligent workflow plugin for Claude Code that replaces the current disconnected toolchain (learning-agent + compound-engineering + manual coordination) with a unified system where **every unit of work makes subsequent work easier**.

The core insight: compound-engineering's workflow is powerful but its knowledge storage (grep on markdown files) doesn't scale. Our learning-agent's semantic retrieval is powerful but its scope (just lessons) is too narrow. Compound-agent combines the best of both: **compound-engineering's workflow cycle** powered by **semantic memory with vector search**.

---

## Philosophy

**Each unit of work should compound.** Not just by storing files, but by building a searchable, ranked, semantically-accessible knowledge base that gets smarter with every cycle.

### Principles

| Principle | Implication |
|-----------|-------------|
| **Semantic over static** | Vector search replaces grep. Only relevant knowledge enters context. |
| **Capture aggressively, prune later** | Lower bar for capture. Compaction cleans up over time. |
| **Beads as foundation** | Issue tracking, dependency graph, git-backed persistence. We build on top. |
| **Agent teams for quality** | Inter-communicating agents at each phase. Cost is not a concern. |
| **Explicit workflow phases** | User triggers phases via slash commands. System doesn't auto-decide complexity. |
| **Skills guide process, knowledge informs content** | SKILL.md defines HOW phases work. Memory items provide WHAT was learned. |

---

## Three-Layer Architecture

```
LAYER 3: WORKFLOWS
  Slash commands (/compound:brainstorm, /compound:plan, etc.)
  Agent teams at each phase (with inter-communication)
  TDD pair model (adaptive per task complexity)

LAYER 2: SEMANTIC MEMORY
  Unified store: lessons + solutions + patterns + preferences
  JSONL source of truth + SQLite index + vector embeddings
  Ranked retrieval: semantic similarity + boosts (recency, severity, confirmation)

LAYER 1: BEADS (Foundation)
  Issue tracking + dependency graph
  Git-backed persistence + distributed sync
  Molecules for workflow orchestration
```

### Layer 1: Beads (Foundation)

Beads is the storage and orchestration backbone. We don't replace it; we build on it.

**What beads provides:**
- `bd ready` -- dependency-aware task readiness
- `bd create` / `bd close` -- issue lifecycle
- `bd sync` -- git-backed distributed sync
- Molecules / wisps -- persistent vs ephemeral work units
- Hash-based IDs -- no distributed coordination needed
- 3-way merge -- field-specific conflict resolution

**How compound-agent uses beads:**
- Each workflow phase creates/updates beads issues
- Agent team tasks map to beads issues
- The compound phase creates beads issues for follow-up work
- Beads' dependency graph orchestrates task ordering within agent teams

### Layer 2: Semantic Memory (The Intelligence Layer)

The evolution of learning-agent's lesson store into a unified knowledge base.

**What gets stored:**

| Type | Description | Example |
|------|-------------|---------|
| `lesson` | Mistake -> insight | "Polars 10x faster than pandas for large files" |
| `solution` | Problem -> resolution | "Auth 401 fix: add X-Request-ID header" |
| `pattern` | Recurring practice | "Always run tests before commit in this repo" |
| `preference` | User/project choice | "Use uv over pip" |

All types share one store, one schema, one search mechanism. A query returns the most relevant items regardless of type.

**Storage model:**

```
.claude/
  memory/
    items.jsonl          # Source of truth (git-tracked, append-only)
    archive/             # Compacted old items
  .cache/
    memory.sqlite        # Rebuildable index with FTS5 + embeddings (gitignored)
```

This is the same proven three-layer model from beads (fast local DB + portable JSONL + git distribution) applied to knowledge.

**Schema (extended from learning-agent):**

```typescript
interface MemoryItem {
  // Identity
  id: string;                                    // Hash-based, like beads
  type: 'lesson' | 'solution' | 'pattern' | 'preference';

  // Core content (embeddings generated from trigger + insight)
  trigger: string;                               // What caused/prompted this
  insight: string;                               // What was learned
  evidence?: string;                             // Supporting evidence

  // Metadata
  tags: string[];
  severity: 'high' | 'medium' | 'low';
  source: string;                                // How captured
  context?: { tool: string; intent: string };
  citation?: { file: string; line?: number; commit?: string };
  created: string;
  confirmed: boolean;

  // Lifecycle
  retrievalCount: number;
  supersedes: string[];
  related: string[];
  compactionLevel: 0 | 1 | 2;

  // Type-specific
  pattern?: { bad: string; good: string };       // For patterns/lessons
}
```

**Retrieval:**

```
score = vector_similarity(query, item)
      * severity_boost    (high=1.5, medium=1.0, low=0.8)
      * recency_boost     (last 30d=1.2, older=1.0)
      * confirmation_boost (confirmed=1.3)
      * retrieval_boost   (frequently retrieved=1.1)
```

**Capture quality (lower bar, prune later):**
- Novelty check: skip if >0.85 similarity with existing item
- Specificity check: reject obviously vague items
- No actionability gate (capture more, prune later)
- User confirmation for high-severity items only
- Aggressive compaction: archive items >90 days with 0 retrievals

### Layer 3: Workflows

The compound engineering cycle, triggered by explicit slash commands.

**Commands:**

| Command | Phase | Description |
|---------|-------|-------------|
| `/compound:brainstorm` | Brainstorm | Explore the problem, iterate with user |
| `/compound:plan` | Plan | Create detailed plan with semantic retrieval |
| `/compound:work` | Work | Execute with agent teams |
| `/compound:review` | Review | Multi-agent review with inter-communication |
| `/compound:compound` | Compound | Capture knowledge, feed back into memory |
| `/compound:lfg` | All | Chain all phases sequentially |

---

## Workflow Phases

### Phase 1: Brainstorm (`/compound:brainstorm`)

**Purpose**: Understand the epic-level task before diving into details. Claude is excellent at this -- proactively exploring, asking questions, identifying concerns.

**Process:**
1. User describes the high-level goal
2. Agent explores: reads relevant code, searches memory for related knowledge
3. AskUserQuestion dialogue to clarify scope, constraints, preferences
4. Optional: spawn Explore subagents for quick research on specific aspects
5. Output: clear problem definition + approach + beads epic

**Agent model**: Single agent (lead) with user dialogue. No team needed.

**Memory integration**: Search memory for related lessons/solutions before asking questions. Past experiences inform the brainstorm.

### Phase 2: Plan (`/compound:plan`)

**Purpose**: Create a detailed technical plan with blocking tasks, enriched by semantic memory.

**Process:**
1. Read brainstorm output (if exists)
2. Semantic memory search: retrieve relevant lessons, solutions, patterns
3. Spawn research agent team:
   - Repo analyst: codebase patterns and architecture
   - Memory analyst: deep dive into related memory items
   - (Optional) External researcher: docs, best practices
4. Synthesize research into plan
5. Create beads issues with dependencies from plan items
6. Output: beads tasks with rich context, ready for `/compound:work`

**Agent model**: Small team (2-4 research agents). Lead synthesizes.

**Memory integration**: Retrieved items injected into plan. Phase skill (SKILL.md) guides what to search for.

### Phase 3: Work (`/compound:work`)

**Purpose**: Execute the plan using agent teams with TDD.

**Process:**
1. Read plan + beads issues (`bd ready` for available work)
2. Assess task complexity -> determine agent model (adaptive TDD):

| Complexity | Agent Model |
|------------|-------------|
| Trivial | Single agent, no TDD |
| Simple | Sequential TDD: test-writer creates tests, hands off to implementer |
| Complex | Iterative TDD: test-writer and implementer ping-pong, sync on interface |

3. Lead in delegate mode: coordinates, doesn't code
4. Each agent gets:
   - Their beads task context
   - Relevant memory items (via semantic search on task description)
   - Phase skill (TDD workflow instructions)
5. Agents work, communicate when tasks overlap
6. Incremental commits as tests pass
7. Output: implemented code with passing tests

**Agent model**: Team with TDD pairs (adaptive). Lead delegates.

**Memory integration**: Each agent gets relevant memory items injected. If an agent encounters a known issue, the memory provides the solution directly.

### Phase 4: Review (`/compound:review`)

**Purpose**: Multi-agent review with inter-communication. Findings become compound input.

**Process:**
1. Spawn reviewer agent team (specialized roles):
   - Security reviewer
   - Architecture reviewer
   - Performance reviewer
   - Test coverage reviewer
   - Code simplicity reviewer
   - (Project-specific reviewers based on tech stack)
2. Reviewers CAN communicate with each other (agent teams feature)
   - Security finding that impacts architecture -> direct message
   - Performance concern that needs test -> direct message
3. Lead synthesizes findings into P1/P2/P3
4. Mandatory gate: implementation-reviewer has final authority
5. P1 findings block completion
6. Output: review report + action items as beads issues

**Agent model**: Full team (5-10 reviewers). Inter-communication enabled.

**Memory integration**: Reviewers check memory for known issues in the codebase. Past review findings inform current review.

### Phase 5: Compound (`/compound:compound`)

**Purpose**: Capture what was learned. Feed back into semantic memory.

**Process:**
1. Spawn compound analysis team:
   - Context Analyzer: summarize what happened (plan + diff + tests)
   - Lesson Extractor: identify mistakes, corrections, discoveries
   - Pattern Matcher: find recurring patterns across sessions
   - Solution Writer: formulate structured memory items
2. Quality filter (lower bar):
   - Novelty check (>0.85 similarity = skip)
   - Basic specificity check
   - No actionability gate
3. Propose memory items to user
4. High-severity items require user confirmation
5. Low/medium-severity items auto-stored (pruned later)
6. Update existing items: set `supersedes` and `related` links
7. Output: new memory items in `items.jsonl`

**Agent model**: Small team (3-4 analysts). Lead writes final items.

**Memory integration**: This phase PRODUCES memory items. The compound loop closes here.

---

## The Compound Loop (Core Innovation)

```
COMPOUND writes to MEMORY
    |
    v
MEMORY is searched by PLAN
    |
    v
PLAN creates context for WORK
    |
    v
WORK produces artifacts for REVIEW
    |
    v
REVIEW generates findings for COMPOUND
    |
    v
COMPOUND writes to MEMORY  <-- loop closes
```

Every cycle through the loop makes subsequent cycles smarter:
- A bug found in review becomes a lesson
- That lesson surfaces during planning of similar work
- The plan accounts for the known issue
- Work avoids the mistake
- Review confirms the improvement
- Compound captures the meta-lesson: "this pattern of proactive checking works"

---

## Skill System

Skills define HOW each phase works. They are SKILL.md files, not stored knowledge.

```
.claude/skills/
  compound/
    brainstorm/
      SKILL.md       # How to brainstorm, what questions to ask
    plan/
      SKILL.md       # How to plan, what agents to spawn, what to search
    work/
      SKILL.md       # TDD workflow, team structure, execution patterns
    review/
      SKILL.md       # Reviewer roles, communication patterns, quality gates
    compound/
      SKILL.md       # What to capture, quality filters, item schema
```

**Skills vs Knowledge:**
- Skills = process instructions (HOW to do something). Static, authored by humans.
- Knowledge = learned information (WHAT was learned). Dynamic, captured by the system.
- Skills guide the workflow. Knowledge informs the content.

Skills can reference each other and can be project-specific or shared.

---

## Integration with Claude Code

### Hooks

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "npx compound-agent prime" }
    ],
    "PreCompact": [
      { "type": "command", "command": "npx compound-agent prime" }
    ],
    "UserPromptSubmit": [
      { "type": "command", "command": "npx compound-agent context" }
    ]
  }
}
```

- **SessionStart/PreCompact**: Load high-severity memory items + active beads tasks
- **UserPromptSubmit**: Detect correction/planning language, inject relevant memory

### MCP Tools

| Tool | Purpose |
|------|---------|
| `memory_search` | Search memory items (semantic) |
| `memory_capture` | Store new memory item |
| `workflow_status` | Current workflow phase + progress |

### Slash Commands

Implemented as Claude Code commands (markdown files):

```
.claude/commands/
  compound/
    brainstorm.md
    plan.md
    work.md
    review.md
    compound.md
    lfg.md
```

### Agent Definitions

Implemented as Claude Code agent files (markdown with YAML frontmatter):

```
.claude/agents/
  compound/
    research/
      repo-analyst.md
      memory-analyst.md
    review/
      security.md
      architecture.md
      performance.md
      test-coverage.md
      simplicity.md
    compound/
      context-analyzer.md
      lesson-extractor.md
      pattern-matcher.md
      solution-writer.md
    work/
      test-writer.md
      implementer.md
```

---

## Migration from Learning-Agent

The transition preserves all existing investment:

| Current | Compound Agent | Migration |
|---------|---------------|-----------|
| `lessons/index.jsonl` | `memory/items.jsonl` | Rename + schema extension (backward compatible) |
| `lessons.sqlite` | `memory.sqlite` | Rebuild from JSONL |
| `learn` CLI | `compound-agent capture` | Alias preserved |
| `search` CLI | `compound-agent search` | Same interface |
| `lesson_search` MCP | `memory_search` MCP | Renamed |
| `lesson_capture` MCP | `memory_capture` MCP | Renamed |
| All 1000+ tests | Kept | Test paths updated |

**Phase 1**: Rename + extend schema (non-breaking)
**Phase 2**: Add workflow commands + agent definitions
**Phase 3**: Add agent team support for each phase
**Phase 4**: Polish, iterate, compound

---

## Data Flow (Complete)

```
User: /compound:plan "Add auth to API"
                |
                v
        +-------+--------+
        | SEMANTIC SEARCH |
        | query: "auth API"|
        +-------+--------+
                |
        Returns: [
          lesson: "API requires X-Request-ID header" (0.92)
          solution: "JWT token refresh needs retry logic" (0.87)
          pattern: "Always test auth endpoints with expired tokens" (0.83)
        ]
                |
                v
        +-------+--------+
        | PLAN PHASE      |
        | Agent team:     |
        |  - repo analyst |
        |  - memory analyst|
        +-------+--------+
                |
        Creates beads issues:
          bd-a1b2: "Implement JWT auth middleware" (P1)
          bd-c3d4: "Write auth endpoint tests" (P1, blocks bd-a1b2)
          bd-e5f6: "Add token refresh logic" (P2)
                |
                v
User: /compound:work
                |
                v
        +-------+--------+
        | WORK PHASE      |
        | Agent team:     |
        |  - test-writer  |  (picks up bd-c3d4)
        |  - implementer  |  (waits for tests, then bd-a1b2)
        |  - implementer2 |  (picks up bd-e5f6)
        +-------+--------+
                |
        Memory items injected per agent:
          test-writer gets: "Always test with expired tokens" pattern
          implementer gets: "X-Request-ID header required" lesson
                |
                v
User: /compound:review
                |
                v
        +-------+--------+
        | REVIEW PHASE    |
        | Agent team:     |
        |  - security     |  -> finds token storage issue
        |  - architecture |  <- security TELLS architecture about it
        |  - test-coverage|
        +-------+--------+
                |
                v
User: /compound:compound
                |
                v
        +-------+--------+
        | COMPOUND PHASE  |
        | Captures:       |
        |  solution: "Token storage must use httpOnly cookies"
        |  lesson: "Security review caught issue that tests missed"
        +-------+--------+
                |
        Stored in memory/items.jsonl
        Available for next /compound:plan cycle
```

---

## Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Language | TypeScript (ESM) | Same as current learning-agent |
| Package Manager | pnpm | Same |
| Build | tsup | Same |
| Testing | Vitest + fast-check | Same |
| Storage | better-sqlite3 + FTS5 | Same |
| Embeddings | node-llama-cpp + nomic-embed-text | Same |
| CLI | Commander.js | Same |
| Schema | Zod | Same |
| Issue tracking | Beads (bd) | Foundation layer |
| Agent teams | Claude Code agent teams | New: inter-communicating agents |
| Slash commands | Claude Code commands | New: workflow phase triggers |
| Agent definitions | Claude Code agents (.md) | New: specialized roles |

---

## Distribution and Installation

Compound-agent is distributed as a single **npm package**. A setup command generates all Claude Code integration files in the standard locations.

### Install

```bash
pnpm add -D compound-agent
npx compound-agent setup
```

### What `setup` Does

| Action | Location | Purpose |
|--------|----------|---------|
| Drop agent definitions | `.claude/agents/compound/*.md` | Specialized agent roles (reviewers, researchers, etc.) |
| Drop slash commands | `.claude/commands/compound/*.md` | `/compound:plan`, `/compound:work`, etc. |
| Drop phase skills | `.claude/skills/compound/*.md` | Process instructions for each workflow phase |
| Configure hooks | `.claude/settings.json` | SessionStart, PreCompact, UserPromptSubmit |
| Register MCP server | `.mcp.json` | `memory_search`, `memory_capture` tools |
| Create memory store | `.claude/memory/` | JSONL + cache directory |
| Download embedding model | `~/.cache/compound-agent/models/` | First-use only, ~278MB |

### What the npm Package Provides

The runtime: MCP server process, CLI commands, SQLite database management, embedding model, vector search, JSONL storage. Everything that needs code execution.

### What the Generated Files Provide

The Claude Code integration: agent definitions, slash commands, phase skills, hooks, MCP config. Everything that needs to be discovered by Claude Code natively.

### Updates

```bash
pnpm update compound-agent
npx compound-agent setup --update    # Regenerates integration files
```

### Uninstall

```bash
npx compound-agent setup --uninstall  # Removes generated files
pnpm remove compound-agent
```

---

## What This Supersedes

| Before | After | Why |
|--------|-------|-----|
| learning-agent standalone | compound-agent memory module | Same functionality, broader scope |
| compound-engineering-plugin | compound-agent workflow | Semantic retrieval > grep on markdown |
| Manual agent coordination | Agent teams with beads integration | Structured, trackable, reproducible |
| docs/solutions/ markdown dumps | Structured JSONL with embeddings | Searchable, ranked, scalable |
| Static skill loading | Dynamic memory retrieval | No context explosion |

---

## Open Questions (For Future Exploration)

1. **Cross-repo knowledge sharing**: How to share memory items between projects without copy-paste?
2. **Skill marketplace**: Should phase skills be shareable like OpenClaw's ClawHub?
3. **Agent CVs**: Should we track which agents/patterns worked well (like Gastown)?
4. **Molecule integration**: Can beads molecules replace our workflow orchestration?
5. **Multi-runtime support**: Should compound-agent work with non-Claude agents (Codex, Cursor)?

---

## Success Criteria

1. **Knowledge compounds**: Each completed workflow cycle measurably improves future cycles
2. **Context efficiency**: Memory items add <3K tokens per agent (semantic retrieval, not bulk loading)
3. **Workflow adoption**: User naturally uses `/compound:plan` instead of ad-hoc planning
4. **Capture rate**: More knowledge items captured per session than current learning-agent
5. **Retrieval precision**: Retrieved items are relevant >80% of the time
6. **Zero friction migration**: All existing learning-agent functionality preserved

---

## Inspirations

| Repository | What We Took |
|------------|--------------|
| [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | Workflow cycle, agent-as-markdown, compound loop, slash command patterns |
| [gastown](https://github.com/steveyegge/gastown) | Propulsion principle, formula/molecule system, agent CVs concept, plugin model |
| [openclaw](https://github.com/openclaw/openclaw) | SKILL.md pattern, three-tier extensibility, memory architecture with multiple backends |
| [beads](https://github.com/steveyegge/beads) | Three-layer data model, dependency-aware readiness, compaction, git-backed sync |
| [learning-agent](.) (current) | Semantic retrieval, vector search, ranking boosts, quality filters, TDD enforcement |
