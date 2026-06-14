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

Compound-agent installs seven hooks into `.claude/settings.json`:

| Hook | Trigger | Action |
|------|---------|--------|
| **SessionStart** | New session or resume | Runs `ca prime` to load workflow context and high-severity lessons |
| **PreCompact** | Before context compaction | Runs `ca prime` to preserve context across compaction |
| **UserPromptSubmit** | Every user message | Detects correction/planning language, injects memory reminders |
| **PostToolUseFailure** | Bash/Edit/Write failures | After 2 failures on same file or 3 total, suggests `ca search` |
| **PostToolUse** | After successful tool use | Resets failure tracking; tracks skill file reads for phase guard |
| **PreToolUse** | During cook-it phases | Enforces phase gates — prevents jumping ahead in the workflow |
| **Stop** | Session end | Enforces phase gates — blocks stop if an active cook-it phase gate has not been verified |

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

## Coding harnesses

Compound-agent integrates with multiple coding harnesses. Select one at setup with `ca setup --harness <name>`:

| Harness | Status | Notes |
|---------|--------|-------|
| **Claude Code** | Full loop + reviewers | Default implementer for `ca loop`. |
| **goose** | Full loop | Runs open and local models (for example `--model ollama/qwen2.5-coder:14b`). Sets `GOOSE_TOOLSHIM=1` automatically for ollama models. |
| **codex** | Full loop | Default model `gpt-5.5-codex`, driven via `codex exec`. Valid reviewers are codex and gemini. |
| **gemini** | Full loop | Default model `gemini-3.1-pro`, driven via `gemini -p --yolo`. Valid reviewers are codex and gemini. The Gemini CLI is being migrated to its successor, the `agy` CLI (see antigravity). |
| **antigravity** | Groundwork only | Installs AGENTS.md for the `agy` CLI, the Gemini CLI successor. No functional loop or reviewer yet. |

Implementers are selected per loop with `ca loop --implementer <name>`. See CLI_REFERENCE.md for the full flag matrix.

### Implementation modes

Two modes drive implementation:

- **Detached loop** (`ca loop`): work runs unattended in a screen session, using the selected implementer and backend.
- **Architect live orchestration**: a second, in-conversation mode entered via architect Phase 5, where the architect drives implementation directly inside the current session rather than detaching.

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

### Spec storage

Specs are the single source of truth and live as files at `docs/specs/<epic-id>-<slug>.md`. Acceptance criteria and contracts are recorded there. The epic description holds only a pointer stub to the spec file (legacy epics may still carry the full spec in the description as a fallback).

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
