---
version: "2.2.1"
last-updated: "2026-03-24"
summary: "Complete CLI command reference for compound-agent"
---

# CLI Reference

All commands use `npx ca` (or `npx compound-agent`). Global flags: `-v, --verbose` and `-q, --quiet`.

---

## Capture commands

```bash
# Capture a lesson (primary command)
ca learn "Always validate epic IDs before shell execution" \
  --trigger "Shell injection via bd show" \
  --tags "security,validation" \
  --severity high \
  --type lesson

# Capture a pattern (requires --pattern-bad and --pattern-good)
ca learn "Use execFileSync instead of execSync" \
  --type pattern \
  --pattern-bad "execSync(\`bd show \${id}\`)" \
  --pattern-good "execFileSync('bd', ['show', id])"

# Capture from trigger/insight flags
ca capture --trigger "Tests failed after refactor" --insight "Run full suite after moving files" --yes

# Detect learning triggers from input file
ca detect --input corrections.json
ca detect --input corrections.json --save --yes
```

**Types**: `lesson` (default), `solution`, `pattern`, `preference`
**Severity**: `high`, `medium`, `low`

## Retrieval commands

```bash
ca search "sqlite validation"           # Keyword search
ca search "security" --limit 5
ca list                                  # List all memory items
ca list --limit 20
ca list --invalidated                    # Show only invalidated items
ca check-plan --plan "Implement caching layer for API responses"
echo "Add caching layer" | ca check-plan # Semantic search against a plan
ca load-session                          # Load high-severity lessons
ca load-session --json
```

## Management commands

```bash
ca show <id>                             # View a specific item
ca show <id> --json
ca update <id> --insight "Updated text"  # Update item fields
ca update <id> --severity high --tags "security,input-validation"
ca delete <id>                           # Soft delete (creates tombstone)
ca delete <id1> <id2> <id3>
ca wrong <id> --reason "Incorrect"       # Mark as invalid
ca validate <id>                         # Re-enable an invalidated item
ca export                                # Export as JSON
ca export --since 2026-01-01 --tags "security"
ca import lessons-backup.jsonl           # Import from JSONL file
ca compact                               # Remove tombstones and rebuild index
ca compact --dry-run
ca compact --force
ca rebuild                               # Rebuild SQLite index from JSONL
ca rebuild --force
ca stats                                 # Show database health and statistics
ca prime                                 # Reload workflow context after compaction
```

## Setup commands

```bash
ca init                    # Initialize in current repo
ca init --skip-agents      # Skip AGENTS.md and template installation
ca init --skip-hooks       # Skip git hook installation
ca init --skip-claude      # Skip Claude Code hooks
ca init --json             # Output result as JSON
ca setup                   # Full setup (init + hooks + templates)
ca setup --update          # Regenerate templates (preserves user files)
ca setup --uninstall       # Remove compound-agent integration
ca setup --status          # Show installation status
ca setup claude            # Install Claude Code hooks only
ca setup claude --status   # Check hook status
ca setup claude --dry-run  # Preview changes without writing
ca setup claude --global   # Use global ~/.claude/ settings
ca setup claude --uninstall # Remove compound-agent hooks
ca download-model          # Download embedding model (~23MB)
ca download-model --json   # Output result as JSON
```

## Reviewer commands

```bash
ca reviewer enable gemini  # Enable Gemini as external reviewer
ca reviewer enable codex   # Enable Codex as external reviewer
ca reviewer disable gemini # Disable a reviewer
ca reviewer list           # List enabled reviewers
```

## Loop command

```bash
ca loop                    # Generate infinity loop script for autonomous processing
ca loop --epics epic-1 epic-2
ca loop --output my-loop.sh
ca loop --max-retries 5
ca loop --model claude-opus-4-6[1m]
ca loop --force            # Overwrite existing script
```

## Improve command

```bash
ca improve                           # Generate improvement loop script
ca improve --topics lint tests       # Run only specific topics
ca improve --max-iters 3             # Max iterations per topic (default: 5)
ca improve --time-budget 3600        # Total time budget in seconds (0=unlimited)
ca improve --model claude-sonnet-4-6 # Choose model
ca improve --output my-improve.sh    # Custom output path
ca improve --force                   # Overwrite existing script
ca improve --dry-run                 # Validate and print plan without generating
ca improve init                      # Scaffold example improve/*.md program file
```

## Watch command

```bash
ca watch                             # Tail live trace from latest loop session
ca watch --epic <id>                 # Watch a specific epic trace
ca watch --improve                   # Watch improvement loop traces
ca watch --no-follow                 # Print existing trace and exit
```

## Health, audit, and verification commands

```bash
ca about                    # Show version, animation, and recent changelog
ca doctor                  # Check external dependencies and project health
ca audit                   # Run pattern, rule, and lesson quality checks
ca rules check             # Check codebase against .claude/rules.json
ca test-summary            # Run tests and output compact pass/fail summary
ca verify-gates <epic-id>  # Verify workflow gates before epic closure
ca phase-check init <epic-id>
ca phase-check status
ca phase-check start <phase>
ca phase-check gate <gate-name>   # post-plan, gate-3, gate-4, final
ca phase-check clean
```

## Compound command

```bash
ca compound                # Synthesize cross-cutting patterns from accumulated lessons
```
