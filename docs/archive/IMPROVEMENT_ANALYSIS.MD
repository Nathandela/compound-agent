# Improvement Analysis

## Analysis 1: Public Claude Code Comparison

Date: 2026-03-31

This is a first-pass improvement memo comparing compound-agent's current harness with two public Claude Code codebases:

- `https://github.com/nirholas/claude-code`
- `https://github.com/Kuberwastaken/claude-code`

The goal here is not to copy source code. The useful exercise is to identify architectural patterns, harness behaviors, and product decisions that could materially improve compound-agent.

## Bottom Line

`Kuberwastaken/claude-code` is the stronger architecture reference for runtime behavior, dynamic skill loading, coordination, and observability. `nirholas/claude-code` is more useful as a documentation and self-exploration reference, especially around architecture explanation and an explorer-style MCP surface.

Compound-agent already has a stronger persistence core than either reference in a few key places:

- repo-scoped, git-tracked memory
- hybrid retrieval instead of plain lookup
- explicit workflow gating around multi-phase execution
- local harness installation into the target repository

The main weakness is not the memory substrate. It is the harness layer around it: how skills are activated, how context is selected, how coordination is enforced, how behavior is explained, and how the system is observed.

## What Compound-Agent Already Does Well

The current system has several strengths that should be preserved:

- The repo-local memory model is a strong product decision. Lessons are not hidden in a remote service and they remain auditable through version control.
- Hybrid retrieval in `go/internal/search/hybrid.go` is a good foundation. Ranking with both keyword and vector signals is better than naive embedding-only recall.
- Plan-time retrieval in `go/internal/retrieval/plan.go` is aligned with how agents actually fail. The best time to inject lessons is before work, not after damage.
- Phase-gated workflow in the installed skills and hooks is a meaningful differentiator. The intent to prevent skipping review and compound steps is correct.

The conclusion is important: compound-agent should not replace its core with a Claude Code clone. It should keep its memory and workflow strengths, then modernize the harness around them.

## Biggest Gaps And Opportunities

### 1. Fix trust-breaking documentation drift first

The docs currently undermine confidence in the product. `docs/compound/README.md` still describes the project as a TypeScript plugin and still references old embedding assumptions, while `AGENTS.md` describes the actual stack as Go plus Rust plus a Node wrapper. `docs/compound/INTEGRATION.md` describes five hooks, but `go/internal/setup/settings.go` installs seven hook types.

This is not a cosmetic documentation issue. A harness that presents itself incorrectly becomes hard to trust, hard to extend, and hard to debug. One of the strongest qualities in the better external references is legibility: the system explains itself clearly.

Recommendation:

- treat documentation drift as a product bug
- generate more docs directly from code-owned constants
- keep setup, hooks, and installed assets described from the same source of truth

### 2. Stop vendoring a large static research corpus into every initialized repo

`go/internal/setup/init.go` currently installs a substantial documentation payload, including research material, into each initialized repository. In the current tree, the embedded research docs are large enough to be a maintenance burden and increase prompt surface without guaranteeing relevance.

This is the wrong side of the tradeoff. Both public Claude Code references lean toward selective retrieval and dynamic access rather than copying a large static corpus into every project.

Useful reference patterns:

- Kuber's dynamic skill loading and selective memory/context surfacing: `https://github.com/Kuberwastaken/claude-code/blob/main/skills/loadSkillsDir.ts`
- nirholas's explorer-style MCP surface: `https://github.com/nirholas/claude-code/blob/main/mcp-server/README.md`

Recommendation:

- move research and reference material out of the default repo scaffold
- index it centrally and retrieve on demand
- keep only the minimum local instructions needed for the harness to operate

### 3. Replace prompt-heavy skill templates with richer metadata and conditional activation

Many installed command and skill templates are currently long imperative instruction files with minimal frontmatter. That makes the harness harder to evolve because behavior is encoded mainly as prose instead of machine-readable metadata.

Kuber's skill system is materially better on this point. It supports richer metadata, path-aware loading, deduplication, argument substitution, and dynamic discovery. That is the pattern worth borrowing.

Useful reference:

- `https://github.com/Kuberwastaken/claude-code/blob/main/skills/loadSkillsDir.ts`

Recommendation:

- expand skill metadata to include fields such as when-to-use, path scope, context requirements, effort hints, hook affinity, and coordinator/worker role
- use metadata to decide activation instead of relying mainly on large instruction blocks
- keep prose for nuanced guidance, but move routing and activation decisions into structured fields

### 4. Upgrade memory from ranking-only to ranking plus selection plus consolidation

Compound-agent already ranks lessons well enough to be useful, but the current design is still largely a retrieval system rather than a memory-management system. Retrieval exists. Selection and consolidation are still underdeveloped.

Kuber's codebase has two especially useful ideas here:

- a second-stage selector that chooses only a small number of memories based on the current query and local context
- a consolidation process that turns accumulation into periodic memory maintenance

Useful references:

- `https://github.com/Kuberwastaken/claude-code/blob/main/memdir/findRelevantMemories.ts`
- `https://github.com/Kuberwastaken/claude-code/blob/main/services/autoDream/consolidationPrompt.ts`

Compound-agent already has the beginnings of this in `go/internal/compound/compound.go`, but the loop is incomplete.

Recommendation:

- add a second-stage selector after retrieval scoring
- bias toward fewer, higher-signal lessons
- add background consolidation to merge duplicates, compress clusters, and elevate stable patterns into more durable guidance

### 5. Make multi-agent orchestration enforceable instead of aspirational

The current installed skills do a good job describing how a lead agent should behave, but a large portion of the coordination model still lives in prompt instructions. That is fragile. Once orchestration depends mostly on prose, compliance becomes inconsistent.

Kuber's coordinator mode is a better reference here because it gives the coordination layer explicit machine-readable structure: workers, notifications, continue-vs-spawn decisions, and shared coordination state.

Useful reference:

- `https://github.com/Kuberwastaken/claude-code/blob/main/coordinator/coordinatorMode.ts`

Recommendation:

- introduce structured task artifacts for coordinator and workers
- define explicit handoff schemas for plan, execution result, verification result, and compound result
- maintain a shared scratchpad or epic-level coordination state instead of relying only on narrative prompt transfer
- keep the phase guard in `go/internal/hook/phase_guard.go`, but back it with stronger runtime contracts

### 6. Replace brittle heuristics with typed decision systems where possible

Some current harness behavior is driven by regex and threshold heuristics, especially around prompt correction detection and failure-based intervention. Those mechanisms are useful as a bootstrap, but they are brittle and hard to reason about as the system grows.

Kuber's permission tooling suggests a better design pattern: explicit reason codes, decision objects, logging, source attribution, and persistence.

Useful references:

- `https://github.com/Kuberwastaken/claude-code/blob/main/hooks/toolPermission/PermissionContext.ts`
- `https://github.com/Kuberwastaken/claude-code/blob/main/hooks/toolPermission/permissionLogging.ts`

Recommendation:

- represent intervention decisions as typed records instead of ad hoc heuristics
- log why a lesson was surfaced, why a gate fired, why a recovery suggestion appeared, and which evidence triggered it
- use that data later for tuning instead of guessing from behavior

### 7. Add real observability to the harness

The current doctor/setup checks are useful, but they are mostly configuration validation. That is not enough for a compound-agent harness that is trying to influence agent behavior over time.

The better external reference tracks runtime cost and operational signals. Compound-agent should do the same for harness effectiveness, not just setup correctness.

Useful reference:

- `https://github.com/Kuberwastaken/claude-code/blob/main/cost-tracker.ts`

Recommendation:

- measure hook latency
- measure retrieval hit rate and lesson acceptance rate
- measure how often surfaced lessons are actually reflected in later actions
- measure phase-gate failures and recovery paths
- measure compaction or consolidation yield over time

Without this layer, the harness will be tuned by intuition instead of evidence.

### 8. Build onboarding and self-explanation into the product

The public Claude Code references are easier to understand because they explain their moving parts more explicitly. nirholas's repo is especially useful here because the architecture docs and MCP explorer angle make the system queryable and legible.

Useful references:

- `https://github.com/nirholas/claude-code/blob/main/docs/architecture.md`
- `https://github.com/nirholas/claude-code/blob/main/mcp-server/README.md`
- `https://github.com/Kuberwastaken/claude-code/blob/main/projectOnboardingState.ts`

Recommendation:

- create a compound-agent explorer MCP surface for installed hooks, lessons, skills, commands, and phase state
- make the harness able to explain what it installed, what it retrieved, and why it intervened
- add lightweight onboarding state so new repositories do not get the full harness behavior all at once without context

### 9. Preserve the parts where compound-agent is already ahead

The right move is not to replace compound-agent with a copy of Claude Code. The right move is to keep the parts that are already stronger and improve the weak harness layer around them.

The strongest pieces worth preserving are:

- git-tracked, repo-local lesson storage
- hybrid retrieval
- explicit multi-phase workflow model
- repo-installed commands, skills, and hooks

Those are meaningful product decisions. The improvement strategy should modernize activation, coordination, consolidation, and observability around them.

## Suggested Order Of Attack

1. Repair documentation and template drift, and generate more install-facing docs from code-owned constants.
2. Stop copying the large research corpus into every repo and move to indexed, on-demand retrieval.
3. Add richer skill frontmatter and conditional activation so the harness routes behavior through metadata instead of long prose files.
4. Add second-stage memory selection and a consolidation loop so retrieval becomes real memory management.
5. Introduce structured coordinator artifacts and stronger orchestration contracts across the work, review, and compound phases.
6. Add harness telemetry so future improvements are guided by evidence.
7. Ship an explorer-style MCP surface so compound-agent can explain itself.

## Patterns To Borrow, Not Code To Copy

The key lessons from the external repos are architectural, not textual.

Borrow these patterns:

- metadata over prose
- selective context over bulk context
- consolidation over accumulation
- runtime contracts over instruction-only governance
- telemetry over intuition
- self-explanation over hidden behavior

Do not chase a full Claude Code reimplementation. Compound-agent already has a differentiated foundation. The highest-leverage path is to tighten the harness around that foundation until the runtime behavior is as strong as the memory substrate underneath it.

---

## Analysis 3: Advanced Architecture & Orchestration Cross-Pollination

Date: 2026-03-31

Based on an analysis of the leaked Anthropic `claude-code` repositories and the local `compound-agent` harness, here is a detailed, highly critical comparison and a strategic roadmap for dramatically improving the current system. The goal here is to cross-pollinate the hyper-optimized, production-grade patterns of Claude Code with the rigorous, phase-gated methodology of the `compound-agent`.

### 1. Memory & Context Management

**Claude Code Approach:**
- **The "autoDream" System:** Instead of just appending to memory, Claude Code runs a background `autoDream` service. When specific gates are met (e.g., 24 hours passed, 5 sessions completed, consolidation lock acquired), it executes a 4-phase background task: *Orient, Gather Signal, Consolidate, and Prune*.
- **Strict Limits:** It aggressively prunes `MEMORY.md` to keep it under 200 lines (~25KB) to maintain context efficiency and lower token costs.
- **Dynamic Prompt Boundaries:** System prompts use a strict `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` marker. Everything before the marker is static and highly cacheable by the LLM backend; everything after is volatile (user context, current working directory).

**Compound-Agent Approach:**
- Relies on a hybrid memory system (git-tracked JSONL for long-term knowledge + SQLite/FTS5/Vector index for semantic retrieval). 
- Lessons are extracted and accumulated over time during the "Compound" phase.

**Improvement Strategies for Compound-Agent:**
1. **Implement an Asynchronous "Dream Phase":** Your current "Compound" phase is synchronous and inline with the active loop. Move deep memory consolidation to an async background daemon (`rust/embed-daemon/` is a perfect place for this). Let the daemon periodically wake up, read recent session logs, run a local embedding clustering algorithm, resolve contradictions, and rewrite the `index.jsonl` to be more concise.
2. **Hard Memory Caps:** Implement a strict pruning mechanism for the prompt context. If your SQLite query returns too much context, have an agentic step summarize it down to a hard cap (e.g., 200 lines) before injecting it into the prompt.
3. **Prompt Cache Optimization:** Rewrite your `.claude/skills/` and `.gemini/skills/` markdown files to strictly separate static instructions from dynamic workspace data. Put all the static skill rules at the very top so the LLM provider can cache them across turns, saving massive token overhead and time to first token (TTFT).

### 2. Execution Loops & Orchestration

**Claude Code Approach:**
- **Coordinator Mode:** The system can transform from a single-agent loop into a multi-agent coordinator. It is explicitly prompted to *"Launch independent workers concurrently whenever possible—don't serialize work that can run simultaneously."*
- **Async Task Tools:** It uses a suite of `Task*` tools to background long-running operations. The main loop doesn't block; it monitors asynchronously.
- **QueryEngine:** The core iterative loop handles streaming, tool execution, and robust error/retry logic at the lowest level.

**Compound-Agent Approach:**
- Uses the `cook-it` command and a 5-phase workflow (Spec Dev -> Plan -> Work -> Review -> Compound) acting as a rigid state machine.
- Relies heavily on `.beads/` for state tracking and phase gates.
- Uses an "AgentTeam" approach for specialized tasks like security and architecture reviews.

**Improvement Strategies for Compound-Agent:**
1. **True Parallel Sub-Agents:** Your review phase (`compound-review`) is likely too serial. Upgrade your orchestrator to fire off `compound-agent-security-reviewer`, `compound-agent-architecture-reviewer`, and `compound-agent-performance-reviewer` *concurrently* as background tasks. The main orchestrator should act as a `Promise.all()` gate, synthesizing their findings only when all return.
2. **Decouple the State Machine:** The `cook-it` workflow is powerful but fragile if interrupted. Implement a centralized, transactional state manager for your `.beads/` data (using your existing SQLite DB) so that if the CLI crashes, it can resume exactly where it left off, including recovering orphaned background worker threads.
3. **Introduce "Deferred Discovery":** Your harness loads a massive amount of context and skills. Adopt Claude Code's `ToolSearchTool` pattern: give the agent a single "Skill Directory" tool. Let the agent *dynamically load* the `compound-agent-security-injection` skill only when it realizes it's looking at SQL code, keeping the base prompt incredibly lean.

### 3. Tooling, Safety, and UX

**Claude Code Approach:**
- **Modular, Zod-Schema Tools:** Every tool is a self-contained module with its own strict Zod input schema and permission model.
- **Risk-Based Explanations:** Tools are categorized as LOW, MEDIUM, or HIGH risk. Instead of a generic CLI prompt, a lightweight LLM call generates a human-readable explanation of *why* the tool is risky (e.g., "This command drops the production database") before asking the user for permission.
- **Schema Caching:** JSON schemas for tools are heavily cached to reduce prompt construction time.

**Compound-Agent Approach:**
- Heavily relies on shell commands, bash hooks (`ca-phase-guard.sh`, `ca-post-tool.sh`), and standard prompt instructions.

**Improvement Strategies for Compound-Agent:**
1. **Semantic Permission Gates:** Upgrade your `ca-phase-guard.sh` hooks. Before the agent executes a destructive action (like modifying a core architecture file during the `Work` phase), intercept the command. Run a fast, localized LLM check (using a smaller model) to generate a plain-English impact report for the user to approve.
2. **Schema-Driven Tool Execution:** Move away from raw bash hooks for critical logic. Wrap your Go/Rust binaries in strict JSON Schema definitions and validate all inputs via Zod (or equivalent) *before* the LLM's payload ever touches the shell. 
3. **Compile-Time Feature Gating:** Use dead-code elimination to strip out internal/experimental skills when deploying the harness. Your `.claude/agents/` folder is getting large; dynamically bundle only the necessary agents based on the specific project's `context.json`.

### 4. Performance & Lifecycle

**Claude Code Approach:**
- **Parallel Prefetching:** Optimizes startup by prefetching keychain data, API connections, and settings concurrently before evaluating heavy modules.
- **Lazy Loading:** Heavy dependencies are deferred via dynamic imports.

**Compound-Agent Approach:**
- Bootstraps the environment, loads hooks, and initializes the local Go/Rust binaries on run.

**Improvement Strategies for Compound-Agent:**
1. **Lazy Load Embeddings:** Your local embedding daemon (`rust/embed-daemon/`) and SQLite DB shouldn't block the initial CLI prompt. Initialize the UI immediately and warm up the FTS5/Vector connections asynchronously in the background. 
2. **Streamlined IPC (Inter-Process Communication):** You have a mix of bash, Node, Go, and Rust. Instead of passing state via `.jsonl` files on disk during hot loops, implement a lightweight gRPC or local socket protocol between the CLI frontend and the Rust/Go daemons to drastically reduce disk I/O latency during multi-agent negotiations.

### The Verdict
The `compound-agent` has a structurally superior methodology (the 5 phases are much more rigorous than Claude Code's generalized loop). However, it is fundamentally "heavier" and more synchronous. By adopting Claude Code's techniques of **background dreaming, dynamic prompt boundaries, concurrent worker orchestration, and lazy-loading**, you can make your rigorous 5-phase system run blisteringly fast and at a fraction of the token cost.

---

## Analysis 4: Source-Level Deep Dive — Specific Patterns & Implementation Gaps

Date: 2026-03-31

This analysis is based on a full structural exploration of both leaked repositories (`nirholas/claude-code`, `Kuberwastaken/claude-code`) alongside a complete read of compound-agent's Go source tree. Where Analysis 3 identified broad architectural themes, this analysis drills into specific code-level patterns with concrete implementation paths.

### Tier 1: High-Impact, Directly Applicable

#### 1. Memory Consolidation: From Manual Compaction to Self-Healing Memory

**What CC does differently**: CC's autoDream is not just a compactor — it is a 4-phase cognitive loop running in a forked subagent:

1. **Orient** — scan the memory directory, reload state, identify improvement candidates by skimming topic files
2. **Gather Signal** — extract learnings from daily append-only logs, then drifted memories, then transcript search (lowest priority)
3. **Consolidate** — update memory files with absolute dates, delete entries that contradict newer ones, merge clusters
4. **Prune & Index** — enforce hard size limits (MEMORY.md < 200 lines / ~25KB), resolve remaining contradictions

Three gates must all pass before it runs: 24h elapsed since last dream, 5+ sessions completed, and a file lock acquired (preventing concurrent dreams). The dream process runs in a **read-only bash sandbox** — it can reflect on memory but cannot corrupt user work.

**What CA does**: `ca compact` merges similar lessons via embedding clustering. It is manual, ungated, and does not detect contradictions or enforce size budgets.

**The gap is not compaction — it is liveness.** CA's memory accumulates but never self-heals. Contradictions persist indefinitely. Stale lessons dilute search quality over time. There is no budget enforcement, so a prolific project can accumulate hundreds of lessons that slow hook latency without proportional signal gain.

**Implementation path**:

- New command: `ca dream` with the 4-phase structure
- Gate logic in `go/internal/hook/`: track session count and last-dream timestamp in SQLite metadata table
- Contradiction detection: during Orient phase, compute pairwise cosine similarity of active lessons; when similarity > 0.85 but insights diverge (cosine of insight embeddings < 0.5), flag as contradiction
- Resolution: newer lesson wins; older archived with `invalidation_reason = "contradicted by Lxxxx"`
- Budget enforcement: if active lesson count > 500, archive lowest-signal entries (low retrieval_count, low confirmed, old created date)
- Safety: dream process opens DB read-only for code files; write access only to `.claude/lessons/`

#### 2. Hook Output Caching: Static/Dynamic Boundary

**What CC does**: The system prompt is split by a `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` sentinel. Everything before the boundary is static (core rules, tool descriptions, skill definitions) and cacheable across turns. Everything after is volatile (user context, git status, session state) and regenerated each turn. A function named `DANGEROUS_uncachedSystemPromptSection()` forces developers to acknowledge the performance cost of adding uncacheable content.

**What CA does**: The `user-prompt` hook re-opens SQLite, re-queries FTS5, re-serializes JSON on every single prompt. The `post-tool-failure` hook does the same. There is no distinction between content that changes per-session vs content that is stable across dozens of prompts.

**The gap is latency in the hot path.** Hooks fire on every user prompt and every tool failure. If the lesson corpus is stable (which it is for most of a session), the hook is doing redundant work on every invocation.

**Implementation path**:

- In `go/internal/hook/`, add a file-backed cache: `hookCache struct { hash string; payload []byte; expires time.Time }`
- On `user-prompt` hook entry: compute content hash of `index.jsonl` (cheap: stat mtime + size). If hash matches cache and TTL not expired (30s), return cached payload
- Split hook output JSON into `"static"` (lesson summaries, CCT patterns — changes only when lessons change) and `"dynamic"` (phase state, session-specific context — changes every call)
- Cache only the static portion; always regenerate dynamic
- For `post-tool-failure`: cache keyed by `(tool_name, content_hash_of_error_tokens)` with 15s TTL — prevents redundant DB hits during debugging loops where the same error fires repeatedly

#### 3. Pre-Tool Risk Classification

**What CC does**: Every tool has a 3-tier risk classification (LOW/MEDIUM/HIGH). Before execution, the permission system checks risk level. MEDIUM and HIGH risk actions get a human-readable explanation generated by a lightweight LLM call: "This command drops the production database. Approve?" The explanation is not canned — it is contextual.

**What CA does**: The `post-tool-failure` hook searches lessons after a tool fails. There is no pre-tool intervention. The `phase-guard` hook checks phase constraints but not lesson-derived risk.

**The gap is temporal.** CA intervenes after damage. CC intervenes before it.

**Implementation path**:

- New hook type: `pre-tool` (or extend `phase-guard` to also check lessons)
- On tool invocation, extract `tool_name` and key input tokens
- Search lessons filtered by `tool_name` in context field and `severity = "high"`
- If matches found, emit: `{"risk": "high", "lessons": [...], "suggestion": "..."}`
- Claude Code's hook contract already supports pre-tool hooks — CA just needs to register one in `go/internal/setup/settings.go` and implement the handler in `go/internal/hook/`
- No LLM call needed for v1 — the lesson's own `insight` field is the explanation

#### 4. Phase Transitions With Synthesis Gates

**What CC does**: The coordinator pattern has an explicit synthesis phase between research and implementation. The prompt enforces: "You must understand findings before directing follow-up work." Workers communicate via `<task-notification>` XML. The coordinator reads actual findings and crafts specific implementation specs — it does not blindly delegate.

**What CA does**: Phase tracking validates that the right tools are used in the right phase. But phase transitions are implicit — there is no structured handoff, no synthesis gate, no mechanism to verify the agent actually absorbed research findings before starting implementation.

**The gap is between guardrails and orchestration.** CA's phases prevent wrong actions but do not drive right ones.

**Implementation path**:

- Enhance `phase-guard` hook to detect phase boundaries: when the first write-tool fires after a read-only phase, emit a transition event
- New command: `ca phase summary` — reads the current phase's tracked file reads and tool calls from hook state, generates a structured summary
- Phase-aware lesson retrieval: in `go/internal/hook/failure.go`, filter lessons by phase context. Research-phase failures surface different lessons than implementation-phase failures
- Store phase transition metadata in SQLite: `{phase, started_at, files_read, tools_used, transition_reason}`

#### 5. Concurrency Safety Declarations for Subagents

**What CC does**: Every tool declares `isConcurrencySafe()` returning a boolean. The coordinator uses this to decide parallel vs serial execution. Read-only tools run concurrently; file-writing tools serialize per file path.

**What CA does**: Subagent definitions in `.claude/agents/` have no concurrency metadata. The TDD pipeline runs agents in sequence by convention (documented in CLAUDE.md), but nothing enforces it at runtime. The `/compound:work` command can spawn parallel subagents with no file-lock awareness.

**Implementation path**:

- Add frontmatter field to agent definitions: `concurrent: true` (for read-only reviewers) or `concurrent: false` (for implementation agents)
- In the work orchestrator, respect these declarations when spawning subagents
- Track file paths being modified in hook state; warn if two concurrent agents target the same file

---

### Tier 2: Medium-Impact, Worth Adopting

#### 6. Feature Gates Via Build Tags

**CC pattern**: 100+ compile-time feature flags with dead code elimination. Entire subsystems (BUDDY, KAIROS, ULTRAPLAN) are stripped from production builds.

**CA opportunity**: Use Go build tags beyond just `sqlite_fts5`. Candidates: `//go:build embed_daemon` for Rust embedder, `//go:build experimental` for features under development. Keeps default binary lean.

#### 7. Hook Response TTL Cache

**CC pattern**: `toolSchemaCache.ts` prevents redundant serialization per request.

**CA opportunity**: Cache last N hook responses keyed by `(hook_name, input_hash)` with 30s TTL. Avoids redundant DB round-trips during rapid tool-call sequences.

#### 8. Automated Contradiction Detection

**CC pattern**: autoDream explicitly resolves contradictions — newer memory wins, older archived with reason.

**CA opportunity**: During `ca compact` (or proposed `ca dream`), flag lesson pairs with high trigger similarity but divergent insights. Auto-resolve via `supersedes` field. Surface unresolved contradictions in `ca doctor`.

#### 9. Mandatory Lesson Citations

**CC pattern**: Named ownership of security rules. Every permission decision logs full audit trail.

**CA opportunity**: Make `Citation{File, Line, Commit}` mandatory for `source: test_failure` and `source: user_correction`. Auto-populate from git context. Show in search results for trust and traceability.

#### 10. Search Result Deduplication

**CC pattern**: Content deduplication across conversation turns avoids re-sending identical material.

**CA opportunity**: Post-merge dedup in `go/internal/search/hybrid.go` — when two results share >0.9 similarity, keep only the higher-scored one. Respect `supersedes` chains: if A supersedes B, drop B from results.

---

### Tier 3: Lower Priority

#### 11. Startup Performance Profiling

Profile `ca hooks run` cold-start: SQLite open time, FTS5 query time, embedder connect time. Identify bottlenecks in the hot path.

#### 12. Richer Config System

Support per-repo config overrides, environment-based settings, and `ca config validate` schema checking. Current single `compound-agent.json` is limiting.

#### 13. Lesson System Health Dashboard

`ca health` command showing: active lesson count, average search latency, embedding coverage percentage, contradiction count, last dream timestamp.

#### 14. Runtime Skill Loader

Support user-contributed skill templates installed at runtime (`ca skill install <url>`) without recompilation. CC's bundled + dynamic loader pattern.

---

### Priority Roadmap (Analysis 4)

| # | Improvement | Impact | Effort | Depends On |
|---|------------|--------|--------|------------|
| 1 | `ca dream` consolidation | Very High | Medium | — |
| 2 | Hook static/dynamic cache split | High | Low | — |
| 3 | Pre-tool risk classification | High | Medium | — |
| 4 | Phase transition synthesis gates | High | Medium | — |
| 5 | Concurrency safety declarations | Medium | Low | — |
| 6 | Feature gates via build tags | Medium | Low | — |
| 7 | Hook response TTL cache | Medium | Low | #2 |
| 8 | Contradiction detection | Medium | Medium | #1 |
| 9 | Mandatory lesson citations | Medium | Low | — |
| 10 | Search result deduplication | Medium | Low | — |

---

### Synthesis Across All Analyses

The consistent theme across Analyses 1 through 4 is the same: **compound-agent's memory substrate and phase methodology are strong foundations that CC does not replicate**. The weakness is the harness layer — the runtime that connects memory to action.

CC's harness is alive: it self-heals memory, actively prevents harm, optimizes for latency, and orchestrates work through structured phases. CA's harness is passive: it stores well, retrieves well, but waits to be asked.

The path forward is not to rebuild CA as a CC clone. It is to make CA's harness as alive as CC's while keeping CA's superior memory model and phase rigor. The ten improvements above, executed in order, close that gap.