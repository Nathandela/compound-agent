<!-- compound-agent:start -->
## Compound Agent Integration

This project uses compound-agent for session memory via **CLI commands**.

### CLI Commands (ALWAYS USE THESE)

**You MUST use CLI commands for lesson management:**

| Command | Purpose |
|---------|---------|
| `ca search "query"` | Search lessons - MUST call before architectural decisions; use anytime you need context |
| `ca knowledge "query"` | Semantic search over project docs - MUST call before architectural decisions; use keyword phrases, not questions |
| `ca learn "insight" --type lesson --severity medium --tags "tag1,tag2"` | Capture lesson (see flags below) |
| `ca learn "..." --type pattern --pattern-bad "bad" --pattern-good "good"` | Capture pattern (--pattern-* required for type=pattern) |
| `ca list` | List all stored lessons |
| `ca show <id>` | Show details of a specific lesson |
| `ca wrong <id> --reason "..."` | Mark a lesson as incorrect/superseded |
| `ca update <id> --severity high --tags "security"` | Update an existing lesson |

**`ca learn` flags:**
- `--type` — `lesson` (default) · `solution` · `pattern` · `preference`
- `--severity` — `high` · `medium` · `low`
- `--tags` — comma-separated, no spaces: `"eslint,typescript,catch"`
- `--trigger` — what caused this insight (quoted string)
- `--pattern-bad` / `--pattern-good` — required when `--type pattern`

> Full reference: `docs/compound/CLI_REFERENCE.md` → "Capture commands"

### Mandatory Recall

You MUST call `ca search` and `ca knowledge` BEFORE:
- Architectural decisions or complex planning
- Patterns you've implemented before in this repo
- After user corrections ("actually...", "wrong", "use X instead")

**NEVER skip search for complex decisions.** Past mistakes will repeat.

Beyond mandatory triggers, use these commands freely — they are lightweight queries, not heavyweight operations. Uncertain about a pattern? `ca search`. Need a detail from the docs? `ca knowledge`. The cost of an unnecessary search is near-zero; the cost of a missed one can be hours.

### Capture Protocol

Run `ca learn` AFTER:
- User corrects you
- Test fail -> fix -> pass cycles
- You discover project-specific knowledge

**Workflow**: Search BEFORE deciding, capture AFTER learning.

### Quality Gate

Before capturing, verify the lesson is:
- **Novel** - Not already stored
- **Specific** - Clear guidance
- **Actionable** (preferred) - Obvious what to do

### Never Edit JSONL Directly

**WARNING: NEVER edit .claude/lessons/index.jsonl directly.**

The JSONL file requires proper ID generation, schema validation, and SQLite sync.
Use CLI (`ca learn`) — never manual edits.

See [documentation](https://github.com/Nathandela/compound-agent) for more details.
<!-- compound-agent:end -->
