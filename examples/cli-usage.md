# CLI Usage Examples

The learning-agent CLI provides commands for managing lessons from the terminal.

## Installation

```bash
# Install as dev dependency
pnpm add -D learning-agent

# Or link locally during development
pnpm add -D ../learning_agent
```

## Commands

### learn - Capture a new lesson

Capture a lesson with the `learn` command:

```bash
# Basic usage
npx learning-agent learn "Use Polars instead of pandas for large datasets"

# With a trigger (what caused you to learn this)
npx learning-agent learn "Use Polars instead of pandas" --trigger "pandas was slow on 500MB file"

# With tags
npx learning-agent learn "Use Polars instead of pandas" --tags "performance,python,data"

# Skip confirmation prompt
npx learning-agent learn "Use Polars instead of pandas" --yes

# Combine all options
npx learning-agent learn "Use Polars instead of pandas for large datasets" \
  --trigger "pandas was slow on 500MB file" \
  --tags "performance,python" \
  --yes
```

Output:
```
Learned: Use Polars instead of pandas for large datasets
ID: L3a7f2b1c
```

### search - Search lessons by keyword

Search lessons using SQLite FTS5 full-text search:

```bash
# Basic search
npx learning-agent search "pandas"

# Limit results
npx learning-agent search "pandas" --limit 5

# Search with multiple terms (OR)
npx learning-agent search "pandas OR polars"
```

Output:
```
Found 2 lesson(s):

[L3a7f2b1c] Use Polars instead of pandas for large datasets
  Trigger: pandas was slow on 500MB file
  Tags: performance, python

[L8b2c4d5e] Always use chunked reading for files over 1GB
  Trigger: Memory error with pandas read_csv
  Tags: performance, memory
```

### list - List all lessons

View all stored lessons:

```bash
# List lessons (default: 20)
npx learning-agent list

# Limit results
npx learning-agent list --limit 10
```

Output:
```
Showing 3 of 3 lesson(s):

[L3a7f2b1c] Use Polars instead of pandas for large datasets
  Type: quick | Source: manual
  Tags: performance, python

[L8b2c4d5e] Always use chunked reading for files over 1GB
  Type: quick | Source: user_correction
  Tags: performance, memory

[L1c3d5e7f] API requires X-Request-ID header
  Type: full | Source: test_failure
  Tags: api, auth
```

### rebuild - Rebuild SQLite index

Rebuild the search index from the JSONL source file:

```bash
# Rebuild only if JSONL has changed
npx learning-agent rebuild

# Force rebuild
npx learning-agent rebuild --force
```

Output:
```
Index rebuilt.
```

### download-model - Download embedding model

Download the nomic-embed-text model for vector search (~500MB):

```bash
npx learning-agent download-model
```

Output:
```
Model path: /Users/you/.cache/learning-agent/models/nomic-embed-text-v1.5.Q4_K_M.gguf
Downloading nomic-embed-text-v1.5...
Model ready.
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEARNING_AGENT_ROOT` | Repository root path | `process.cwd()` |

Example:
```bash
LEARNING_AGENT_ROOT=/path/to/repo npx learning-agent list
```

## File Locations

| Path | Purpose | Git tracked |
|------|---------|-------------|
| `.claude/lessons/index.jsonl` | Lesson storage (source of truth) | Yes |
| `.claude/.cache/lessons.sqlite` | Search index (rebuildable) | No |
| `~/.cache/learning-agent/models/` | Embedding model | No |

## Integration with Claude Code

Add to your `.claude/settings.json`:

```json
{
  "hooks": {
    "session_start": "npx learning-agent load-session",
    "pre_tool": "npx learning-agent check-plan"
  }
}
```

## Tips

1. **Keep lessons specific**: "Use Polars for files > 100MB" is better than "Use fast tools"
2. **Add tags**: Makes searching easier later
3. **Use triggers**: Document what caused the learning
4. **Run rebuild periodically**: Keeps the search index fresh
5. **Download model once**: Vector search requires the embedding model
