# Compound Agent - Full Context & Research

This document captures all research, sources, and decisions made during the design phase.

---

## Sources Explored

### 1. Moltbot
**Repository**: https://github.com/moltbot/moltbot

**What it is**: Local-first personal AI assistant with multi-channel messaging and persistent memory.

**Key Architecture**:
```
┌─────────────────────────────────────────────────────────────────┐
│                           MOLTBOT                               │
├─────────────────────────────────────────────────────────────────┤
│  Gateway (WebSocket) ◄──► Pi Runtime (Agent) ◄──► Memory Manager│
│                                                                 │
│  Channels: WhatsApp │ Telegram │ Slack │ Discord │ Signal      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WORKSPACE (~/.clawdbot/)                     │
│  moltbot.json          │  Config                                │
│  agents/<id>/          │  Per-agent state                       │
│  ├── MEMORY.md         │  Long-term curated facts               │
│  ├── memory/*.md       │  Daily logs                            │
│  ├── sessions/*.jsonl  │  Conversation transcripts              │
│  memory/<id>.sqlite    │  Vector index + embeddings             │
└─────────────────────────────────────────────────────────────────┘
```

**Memory System (3 layers)**:
1. **On-disk files** (source of truth): MEMORY.md + memory/YYYY-MM-DD.md
2. **Vector index** (SQLite + embeddings): Hybrid search (vector + BM25)
3. **Agent tools**: memory_search(), memory_get()

**Key Innovations**:
- **Pre-compaction flush**: Before context is compacted, agent automatically saves important memories
- **Hybrid search**: 0.7 × vector + 0.3 × keyword (catches exact terms)
- **Embedding fallback chain**: OpenAI → Gemini → Local llama.cpp
- **File watching**: Debounced 1.5s, auto-reindex on changes

**How memories are fed to model**:
```
System Prompt: "Before answering about prior work, decisions, dates...
               run memory_search first"
     │
     ▼
Agent calls memory_search("query")
     │
     ▼
Returns top 6 snippets (~700 chars each)
     │
     ▼
Agent uses context to answer
```

---

### 2. Compound Engineering Plugin
**Repository**: https://github.com/EveryInc/compound-engineering-plugin

**What it is**: Claude Code plugin marketplace with 27 agents, 24 commands, 15 skills.

**Philosophy**: "Each unit of engineering work should make subsequent units easier."

**Key Architecture**:
```
┌─────────────────────────────────────────────────────────────────┐
│              COMPOUND ENGINEERING PLUGIN                         │
├─────────────────────────────────────────────────────────────────┤
│  27 AGENTS    │  24 COMMANDS     │  15 SKILLS                   │
│  (review,     │  (/workflows:*)  │  (reusable                   │
│   research,   │                  │   knowledge)                 │
│   design)     │                  │                              │
├─────────────────────────────────────────────────────────────────┤
│  FORMAT CONVERTERS: Claude → OpenCode, Claude → Codex           │
├─────────────────────────────────────────────────────────────────┤
│  MCP SERVER: Context7 (framework docs lookup)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Compound Workflow**:
```
PLAN → WORK → REVIEW → COMPOUND → (repeat)
                          │
                  Knowledge captured
                  (makes next cycle easier)
```

**Key Innovations**:
- **Parallel multi-agent review**: 14 specialized reviewers run concurrently
- **Skills as encoded knowledge**: Reusable, discoverable modules (not hardcoded)
- **Research agents check skills FIRST**: Curated knowledge > external search
- **File-based, human-readable**: All markdown, version controllable

**Limitation for our use case**: Skills are STATIC, always loaded. Context explosion as skills grow.

---

### 3. Beads
**Repository**: https://github.com/steveyegge/beads

**What it is**: Distributed, git-backed graph issue tracker for AI agents.

**Key Architecture**:
```
┌─────────────────────────────────────────────────────────────────┐
│                         BEADS (bd)                               │
├─────────────────────────────────────────────────────────────────┤
│  SQLite (fast) ◄──► JSONL (.beads/) ◄──► Git (versioned)       │
├─────────────────────────────────────────────────────────────────┤
│  DAEMON: 30s debounce │ git hooks │ background push             │
└─────────────────────────────────────────────────────────────────┘
```

**Key Innovations**:

1. **Hash-based conflict-free IDs**:
   - ID = hash(repo + timestamp + title)
   - No merge conflicts in multi-branch workflows
   - Same work in different clones gets same ID

2. **Git as database**:
   - SQLite for queries
   - JSONL export for portability
   - Auto-sync with 30s debounce

3. **Rich dependency graph** (18+ types):
   - blocks, parent-child, conditional-blocks
   - discovered-from (traceability)
   - waits-for (gates)

4. **Compaction (memory decay)**:
   - Tier 1 (30+ days): Basic summary
   - Tier 2 (90+ days): Aggressive compression
   - Uses Claude Haiku for summarization

5. **Smart ready work**: `bd ready` calculates tasks with no open blockers

---

## Framework Comparison

| Aspect | Moltbot | Compound Eng. | Beads |
|--------|---------|---------------|-------|
| **Focus** | Personal memory | Developer productivity | Task tracking |
| **Storage** | SQLite + Markdown | Markdown only | SQLite + JSONL + Git |
| **Memory** | RAG (embeddings) | Skills (static) | Compaction (AI decay) |
| **Sync** | File watching | None | Git-native |
| **Context cost** | ~4K tokens (search) | 10-50K (always loaded) | ~2K (active tasks) |
| **Multi-agent** | Single | Parallel review | Built-in deps |

---

## Critic Review

A neutral Plan agent reviewed the proposed design. Key feedback:

### Critical Flaws Identified

1. **No definition of "mistake"**
   - Need taxonomy before building
   - What makes a lesson valuable vs noise?

2. **Agent-initiated capture is risky**
   - Claude doesn't reliably recognize own mistakes
   - Sycophancy bias works against self-reporting
   - Better: User correction as primary trigger

3. **Subagent for capture is wrong tool**
   - Needs full context of what just happened
   - Not parallel work, it's synchronous reflection
   - Better: Inline capture, async validation

4. **Local embeddings add reliability bottleneck**
   - Extra dependency, platform issues
   - Suggestion: Start with FTS5 keyword search

### What to Cut (Over-engineered)

- Hybrid search (vector + keyword) - premature without data
- Dynamic budget based on task - hard to measure complexity
- AI-powered compaction - simple time-based pruning is enough
- Pre-compaction flush - solving problem we don't have

### What's Missing

- **Lesson quality gate**: Require trigger/insight/evidence
- **Contradiction detection**: When lessons conflict
- **Provenance**: Where did lesson come from?
- **Negative feedback loop**: Track when lessons cause mistakes

### Recommendation

> "Build the simplest thing that could work, then iterate based on evidence."

---

## User Requirements (Q&A Summary)

### Learning Type
**Q**: What should agent learn?
**A**: Facts & Preferences + Code Patterns. Main goal: avoid repeating mistakes, stop re-explaining things.

### Environment
**Q**: Deployment context?
**A**: Claude Code CLI

### Priority
**Q**: Biggest concern?
**A**: Context explosion (token budget)

### Storage
**Q**: How to persist?
**A**: Git-backed (version controlled, portable)

### Current Setup
**Q**: How do you handle project context now?
**A**: Multiple .md files (CLAUDE.md + others)

### Learning Triggers
**Q**: When should learning happen?
**A**: After mistakes + On-demand. Still figuring out best practices.

### Session Pattern
**Q**: Typical session style?
**A**: Long sessions (often hit context limits)

### Cross-Repo Sharing
**Q**: Mechanism for sharing lessons?
**A**: Copy on demand (simplest)

### Lesson Threshold
**Q**: How to decide "worth a lesson"?
**A**: Combination of: Severity + Novelty + Explicit signal + Repetition

### Subagent UX
**Q**: How should lesson-capture interact?
**A**: Claude proposes, user confirms in chat, then Claude uses MCP tool or --yes flag

### Storage Format
**Q**: SQLite vs JSONL?
**A**: Hybrid (JSONL source, SQLite index)

### CLAUDE.md Relation
**Q**: How should lessons relate to CLAUDE.md?
**A**: Separate systems. CLAUDE.md = permanent rules, Lessons = contextual WHY.

### Self-Correction
**Q**: What does Claude self-correcting look like?
**A**: Mix of: autonomous (edit→fail→re-edit), user-guided, Claude-initiated pivots

### Lesson Frequency
**Q**: How often do valuable lessons occur?
**A**: A few per day, then decreasing over time

### Concrete Examples
**Q**: What lessons do you wish Claude remembered?
**A**:
- Tool/library preferences (Polars > pandas, uv > pip)
- Project-specific rules (API headers, protected files)
- Bad typing habits
- Library misuse, wrong API calls
- Not documenting, not testing
- Not following rules/best practices

### Trigger Source (Critic Pushback)
**Q**: Critic says Claude can't recognize mistakes. Your view?
**A**: Disagree. Claude can iterate on problems and notice when something went wrong.

### Search MVP
**Q**: Start with keyword only (no embeddings)?
**A**: No, need vectors. Semantic similarity is core value.

### Quality Gate
**Q**: Require trigger/insight/evidence for lessons?
**A**: Different levels - quick lessons minimal, important lessons full structure.

### MVP Scope
**Q**: What's minimum viable?
**A**: Let's scope together (2-3 weeks timeline)

### Embedding Choice
**Q**: Local vs API embeddings?
**A**: Local model (nomic-embed-text via llama.cpp)

### Timeline
**Q**: Time budget?
**A**: 2-3 weeks for solid foundation

---

## Key Design Decisions

### 0. TypeScript over Python
**Decision**: Build as TypeScript pnpm package, not Python
**Reason**:
- User wants "dev dependency deployable to any repo"
- npm/pnpm is universal (even Python repos can have package.json for tooling)
- A Python dev dependency in a non-Python repo is awkward
- User specifically asked about pnpm
- +3 days of work accepted for better ecosystem fit

**Trade-offs accepted**:
- node-llama-cpp is less mature than llama-cpp-python
- Native modules (better-sqlite3) can have compilation issues
- Mitigated by: prebuilds, fallback to FTS5-only if embeddings fail

### 1. Repository Scope Only
**Decision**: No global/hierarchical scopes
**Reason**: Complexity. Share via copy on demand.

### 2. JSONL + SQLite Hybrid
**Decision**: JSONL as source of truth, SQLite as index
**Reason**: Git-readable diffs + fast search. Index is rebuildable.

### 3. Local Embeddings Only
**Decision**: nomic-embed-text via llama.cpp, no online fallback
**Reason**: Offline capable, no API dependencies, simpler

### 4. Agent-Initiated + User Confirm
**Decision**: Claude proposes lessons, user confirms in chat, Claude uses MCP/--yes to save
**Reason**: Claude CAN notice some mistakes, but needs validation

### 5. Tiered Quality
**Decision**: Quick lessons (minimal) vs Full lessons (structured)
**Reason**: Balance capture speed vs rigor

### 6. Quality Over Quantity
**Decision**: Most sessions have NO lessons, and that's fine
**Reason**: Prevent "lesson inflation" (BS lessons to fill quota)

### 7. No Pre-Compaction Flush (Initially)
**Decision**: Cut from MVP
**Reason**: Critic's concern about auto-captured low-quality lessons

### 8. Dev Dependency Deployment Model
**Decision**: Install as dev dependency via pnpm, not global CLI
**Reason**:
- User preference for repo-scoped tooling
- Easier version management per-project
- Works with pnpm workspaces

**Usage**:
```bash
# Add to any repo
pnpm add -D @scope/compound-agent

# Use via scripts or npx
pnpm learn "Use Polars not pandas"
npx ca search "data"
```

### 9. Embedding Model Download on First Use
**Decision**: Download nomic-embed-text to ~/.cache on first run
**Reason**:
- Keeps package size small (~few KB vs ~500MB)
- Model shared across all repos
- User accepted this approach

---

## Lesson Taxonomy

From user examples, lessons fall into:

| Category | Examples |
|----------|----------|
| **Preferences** | Use Polars not pandas, uv over pip |
| **Project Rules** | API requires X header, never modify file Y |
| **Patterns** | Always test, always document |
| **Corrections** | Bad typing, wrong API calls, library misuse |

---

## Architecture Comparison: Context Efficiency

### Moltbot (RAG)
- Only loads relevant snippets via search
- ~4K tokens for memory context
- Can store gigabytes, use kilobytes
- Risk: Search may miss relevant context

### Compound Engineering (Static Skills)
- Loads ALL skills into context
- 10-50K tokens as skills grow
- No search failures
- Problem: CONTEXT EXPLOSION

### Beads (Task Graph)
- Only loads active tasks via `bd ready`
- ~2K tokens
- Old tasks auto-compacted
- Natural pruning via dependency resolution

### Our Approach (Hybrid)
- CLAUDE.md always loaded (~2-5K)
- Lessons retrieved via vector search (~500-1K)
- Total: <5K tokens for learning context
- Old lessons archived, not deleted

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Context explosion | Dynamic budget, archive old lessons |
| BS lessons | Quality filter (novel? specific? actionable?) |
| Search misses | Hybrid vector+keyword if needed later |
| Embedding failures | llama.cpp is reliable, fallback to FTS5 |
| Lesson conflicts | Contradiction detection, warn user |
| Over-compliance | "Most sessions have no lessons" principle |

---

## References

- Moltbot: https://github.com/moltbot/moltbot
- Compound Engineering: https://github.com/EveryInc/compound-engineering-plugin
- Beads: https://github.com/steveyegge/beads
- nomic-embed-text: https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
- llama-cpp-python: https://github.com/abetlen/llama-cpp-python
- SQLite FTS5: https://www.sqlite.org/fts5.html
