# Migration Guide: learning-agent to compound-agent

## Overview

The project was renamed from **learning-agent** to **compound-agent** in the compound-agent rename. The CLI command changed from `lna` to `ca`, MCP tools were renamed, and the internal data model evolved from "lessons" to "memory items." Your existing lesson data is fully compatible -- no data migration is needed.

## What Changed

| Aspect | Before (learning-agent) | After (compound-agent) |
|--------|------------------------|----------------------|
| Package name | `learning-agent` | `compound-agent` |
| CLI command | `lna` | `ca` |
| CLI long name | `learning-agent` | `compound-agent` |
| MCP server name | `learning-agent` | `compound-agent` |
| MCP binary | `learning-agent-mcp` | `compound-agent-mcp` (removed in v1.2.9) |
| MCP tool: search | `lesson_search` | `memory_search` |
| MCP tool: capture | `lesson_capture` | `memory_capture` |
| MCP resource | `lessons://prime` | `memory://prime` |
| Data model term | Lesson | Memory item (lesson, solution, pattern, preference) |

## Step-by-Step Migration

### 1. Uninstall old package

```bash
npm uninstall learning-agent
# or if installed globally:
npm uninstall -g learning-agent
```

If you installed as a dev dependency:

```bash
npm uninstall --save-dev learning-agent
```

### 2. Install compound-agent

```bash
npm install --save-dev compound-agent
# or globally:
npm install -g compound-agent
```

### 3. Run setup

The setup command reconfigures hooks, AGENTS.md, and slash commands:

```bash
npx ca setup
```

This is idempotent and safe to run multiple times. It will:
- Create/update `.claude/lessons/` directory
- Update AGENTS.md with compound-agent section
- Register Claude Code hooks in `.claude/settings.json`
- Download the embedding model (skip with `--skip-model` if already downloaded)

> **Note**: MCP server registration (`.mcp.json`) was removed in v1.2.9. The `compound-agent-mcp` binary no longer exists.

### 4. Remove old configuration

If the old `learning-agent` MCP entry still exists in `.mcp.json`, remove it manually:

```json
{
  "mcpServers": {
    "learning-agent": { ... }  // <-- delete this entry
  }
}
```

Check `.claude/settings.json` for old hook references to `lna` or `learning-agent` and remove them.

### 5. Restart Claude Code

Restart Claude Code to pick up the new hooks configuration.

### 6. Verify

```bash
npx ca setup --status
```

All items should show `installed`.

## Data Compatibility

- `.claude/lessons/index.jsonl` is fully compatible. No changes to the file format.
- The SQLite cache (`.claude/.cache/lessons.sqlite`) rebuilds automatically on first use.
- Existing lessons with `type: "lesson"` continue to work as-is.
- The new `type` field supports `lesson`, `solution`, `pattern`, and `preference`. Existing lessons default to `lesson`.

## CLI Command Mapping

All commands work the same way -- only the binary name changed.

| Old command | New command |
|-------------|-------------|
| `lna learn` | `ca learn` |
| `lna search` | `ca search` |
| `lna list` | `ca list` |
| `lna show <id>` | `ca show <id>` |
| `lna update <id>` | `ca update <id>` |
| `lna delete <id>` | `ca delete <id>` |
| `lna wrong <id>` | `ca wrong <id>` |
| `lna validate <id>` | `ca validate <id>` |
| `lna stats` | `ca stats` |
| `lna compact` | `ca compact` |
| `lna export` | `ca export` |
| `lna import <file>` | `ca import <file>` |
| `lna prime` | `ca prime` |
| `lna check-plan` | `ca check-plan` |
| `lna load-session` | `ca load-session` |
| `lna rebuild` | `ca rebuild` |
| `lna download-model` | `ca download-model` |
| `lna setup` | `ca setup` |
| `lna setup claude` | `ca setup claude` |
| `lna init` | `ca init` |
| `lna hooks` | `ca hooks` |
| `lna rules check` | `ca rules check` |
| `lna remind-capture` | Removed -- handled by git pre-commit hook via `ca setup` |
| `lna test-summary` | `ca test-summary` |

## New Features in v1.0.0

- **Memory item types**: Lessons are now one of four types -- `lesson`, `solution`, `pattern`, `preference` -- for better categorization.
- **Type filtering**: `memory_search` MCP tool accepts an optional `type` parameter to filter results.
- **Agent templates**: `ca setup` installs agent templates, workflow commands, and phase skills under `.claude/`.
- **Setup update**: `ca setup --update` regenerates generated files while preserving user customizations.
- **Rules engine**: `ca rules check` runs repository-defined rule checks from `.claude/rules.json`.
- **Test summary**: `ca test-summary` runs tests and outputs a compact pass/fail summary.

## Breaking Changes

- **CLI binary name**: `lna` and `learning-agent` no longer exist. Use `ca` or `compound-agent`.
- **MCP tool names**: `lesson_search` and `lesson_capture` are now `memory_search` and `memory_capture`. Update any scripts or AGENTS.md references.
- **MCP binary**: `learning-agent-mcp` is now `compound-agent-mcp`. Update `.mcp.json` if you configured it manually.
- **Hook references**: Any Claude Code hooks referencing `lna` commands need updating to `ca`.

## Troubleshooting

**"command not found: ca"**
The package is not installed or not in your PATH. Run `npm install --save-dev compound-agent` and use `npx ca` to invoke.

**MCP tools not appearing in Claude Code**
> Not applicable in v1.2.9 -- the MCP server was removed. There are no MCP tools to register.

(For pre-v1.2.9) Run `npx ca setup` to register the MCP server, then restart Claude Code. Verify with `npx ca setup --status`.

**Old hooks still firing**
Check `.claude/settings.json` for references to `lna` or `learning-agent`. Remove them and run `npx ca setup` to install the new hooks.

**SQLite cache errors after upgrade**
Delete the cache file and let it rebuild:
```bash
rm .claude/.cache/lessons.sqlite
npx ca rebuild
```

**Embedding model missing**
```bash
npx ca download-model
```
The model is stored in `~/.node-llama-cpp/models/` and is shared across projects.

---

## Migrating from v1.2.8 to v1.2.9

### Breaking Changes

**MCP Server Removed**

The `compound-agent-mcp` binary and `@modelcontextprotocol/sdk` dependency have been removed. There is no replacement MCP server — functionality is handled entirely via CLI commands and Claude Code hooks.

**Migration steps:**
1. Remove any `.mcp.json` entry for `compound-agent-mcp` if present
2. Run `npx ca setup` to install the updated Claude Code hooks (now 8 hook registrations)
3. Update any scripts calling `compound-agent-mcp` to use `npx ca` instead

### New Features in v1.2.9

- `ca phase-check` — Phase state management CLI (init/status/clean/gate)
- PreToolUse phase guard hook — enforces reading phase skill before editing
- PostToolUse read tracker — tracks skill file reads in phase state
- Stop audit hook — blocks phase transitions without gate verification
- Run `npx ca setup` to get all new hooks installed
