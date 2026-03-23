---
version: "1.7.4"
last-updated: "2026-03-11"
summary: "Memory system, hooks, beads integration, and agent guidance"
---

# Integration

Deep integration topics for compound-agent: memory system internals, Claude Code hooks, beads workflow, and agent guidance.

---

## Memory system

### Storage format

Memory items are stored as newline-delimited JSON in `.claude/lessons/index.jsonl`. Each line is a complete JSON object:

```json
{"id":"L-abc123","type":"lesson","trigger":"Shell injection via execSync","insight":"Use execFileSync with array args","tags":["security"],"source":"manual","context":{"tool":"cli","intent":"manual learning"},"created":"2026-02-15T10:00:00Z","confirmed":true,"severity":"high","supersedes":[],"related":[]}
```

### Indexing

The SQLite index at `.claude/.cache/lessons.sqlite` provides:

- **FTS5 full-text search** for keyword queries (`ca search`)
- **Embedding cache** for vector similarity (avoids re-computing embeddings)
- **Retrieval count tracking** for usage statistics

The index is rebuilt automatically when the JSONL changes. Force rebuild with `ca rebuild --force`.

### Search mechanisms

**Keyword search** (`ca search`): Uses SQLite FTS5 to match words in trigger, insight, and tags.

**Semantic search** (`ca check-plan`): Embeds the query text and compares cosine similarity against stored lesson embeddings. Results are ranked with configurable boosts for severity, recency, and confirmation status.

**Session loading** (`ca load-session`): Returns high-severity confirmed lessons for injection at session start.

### Data lifecycle

| Operation | Effect |
|-----------|--------|
| `ca learn` | Appends a new item to JSONL |
| `ca update` | Appends an updated version (last-write-wins) |
| `ca delete` | Appends with `deleted: true` flag |
| `ca wrong` | Sets `invalidatedAt` (excluded from retrieval, preserved in storage) |
| `ca compact` | Removes tombstones, then rebuilds index |

---

## Claude Code hooks

Compound-agent installs five hooks into `.claude/settings.json`:

| Hook | Trigger | Action |
|------|---------|--------|
| **SessionStart** | New session or resume | Runs `ca prime` to load workflow context and high-severity lessons |
| **PreCompact** | Before context compaction | Runs `ca prime` to preserve context across compaction |
| **UserPromptSubmit** | Every user message | Detects correction/planning language, injects memory reminders |
| **PostToolUseFailure** | Bash/Edit/Write failures | After 2 failures on same file or 3 total, suggests `ca search` |
| **PostToolUse** | After successful tool use | Resets failure tracking; tracks skill file reads for phase guard |

### Memory usage during sessions

**At session start**: High-severity lessons are automatically loaded via the SessionStart hook.

**Before planning**: Search memory for relevant context:

```bash
ca search "feature area keywords"
ca knowledge "architecture topic"
ca check-plan --plan "description of what you are about to implement"
```

**After corrections**: Capture what you learned:

```bash
ca learn "The insight" --trigger "What happened" --severity medium
```

**At session end**: Run the compound phase to extract patterns:

```bash
ca compound
```

---

## Beads integration

Compound-agent works with beads (`bd`) for issue tracking:

```bash
bd ready                          # Find available tasks
bd show <id>                      # View task details
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>
bd sync                           # Sync with git remote
```

The plan phase creates Review and Compound blocking tasks that depend on work tasks. This ensures these phases surface via `bd ready` after work completes, surviving context compaction.

### Verification gates

Before closing an epic, verify all gates pass:

```bash
ca verify-gates <epic-id>
```

This checks that a Review task and Compound task both exist and are closed.

---

## For AI agents

### Integrating into CLAUDE.md

Add a reference to compound-agent in your project's `.claude/CLAUDE.md`:

```markdown
## References

- docs/compound/README.md -- Compound-agent overview and getting started
```

The `ca init` command does this automatically.

### Session completion checklist

```bash
ca verify-gates <epic-id>    # Verify review + compound tasks closed
git status                        # Check what changed
git add <files>                   # Stage code changes
bd sync                           # Commit beads changes
git commit -m "..."               # Commit code
bd sync                           # Commit any new beads changes
git push                          # Push to remote
```

Work is not complete until `git push` succeeds.
