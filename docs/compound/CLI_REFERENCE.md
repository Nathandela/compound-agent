---
version: "1.8.0"
last-updated: "2026-03-15"
summary: "Complete CLI command reference for compound-agent"
---

# CLI Reference

All commands use `npx ca` (or `npx compound-agent`). Global flags: `-v, --verbose` and `-q, --quiet`.

---

## Capture commands

```bash
# Capture a lesson (primary command)
npx ca learn "Always validate epic IDs before shell execution" \
  --trigger "Shell injection via bd show" \
  --tags "security,validation" \
  --severity high \
  --type lesson

# Capture a pattern (requires --pattern-bad and --pattern-good)
npx ca learn "Use execFileSync instead of execSync" \
  --type pattern \
  --pattern-bad "execSync(\`bd show \${id}\`)" \
  --pattern-good "execFileSync('bd', ['show', id])"

# Capture from trigger/insight flags
npx ca capture --trigger "Tests failed after refactor" --insight "Run full suite after moving files" --yes

# Detect learning triggers from input file
npx ca detect --input corrections.json
npx ca detect --input corrections.json --save --yes
```

**Types**: `lesson` (default), `solution`, `pattern`, `preference`
**Severity**: `high`, `medium`, `low`

## Retrieval commands

```bash
npx ca search "sqlite validation"           # Keyword search
npx ca search "security" --limit 5
npx ca list                                  # List all memory items
npx ca list --limit 20
npx ca list --invalidated                    # Show only invalidated items
npx ca check-plan --plan "Implement caching layer for API responses"
echo "Add caching layer" | npx ca check-plan # Semantic search against a plan
npx ca load-session                          # Load high-severity lessons
npx ca load-session --json
```

## Management commands

```bash
npx ca show <id>                             # View a specific item
npx ca show <id> --json
npx ca update <id> --insight "Updated text"  # Update item fields
npx ca update <id> --severity high --tags "security,input-validation"
npx ca delete <id>                           # Soft delete (creates tombstone)
npx ca delete <id1> <id2> <id3>
npx ca wrong <id> --reason "Incorrect"       # Mark as invalid
npx ca validate <id>                         # Re-enable an invalidated item
npx ca export                                # Export as JSON
npx ca export --since 2026-01-01 --tags "security"
npx ca import lessons-backup.jsonl           # Import from JSONL file
npx ca compact                               # Remove tombstones and rebuild index
npx ca compact --dry-run
npx ca compact --force
npx ca rebuild                               # Rebuild SQLite index from JSONL
npx ca rebuild --force
npx ca stats                                 # Show database health and statistics
npx ca prime                                 # Reload workflow context after compaction
```

## Setup commands

```bash
npx ca init                    # Initialize in current repo
npx ca init --skip-hooks       # Skip hook installation
npx ca init --json             # Output result as JSON
npx ca init --repo-root <path> # Specify repository root
npx ca setup                   # Full setup (init + hooks + templates)
npx ca setup --skip-hooks      # Skip hook installation
npx ca setup --json            # Output result as JSON
npx ca setup --repo-root <path> # Specify repository root
npx ca setup claude            # Install Claude Code hooks only
npx ca setup claude --status   # Check hook status
npx ca setup claude --uninstall # Remove Claude Code hooks
npx ca setup claude --global   # Use global ~/.claude/ settings
```

## Reviewer commands

```bash
npx ca reviewer enable gemini  # Enable Gemini as external reviewer
npx ca reviewer enable codex   # Enable Codex as external reviewer
npx ca reviewer disable gemini # Disable a reviewer
npx ca reviewer list           # List enabled reviewers
```

## Loop command

```bash
npx ca loop                    # Generate infinity loop script for autonomous processing
npx ca loop --epics epic-1 epic-2
npx ca loop --output my-loop.sh
npx ca loop --max-retries 5
npx ca loop --model claude-opus-4-6[1m]
npx ca loop --force            # Overwrite existing script
```

## Improve command

```bash
npx ca improve                           # Generate improvement loop script
npx ca improve --topics lint tests       # Run only specific topics
npx ca improve --max-iters 3             # Max iterations per topic (default: 5)
npx ca improve --time-budget 3600        # Total time budget in seconds (0=unlimited)
npx ca improve --model claude-sonnet-4-6 # Choose model
npx ca improve --output my-improve.sh    # Custom output path
npx ca improve --force                   # Overwrite existing script
npx ca improve --dry-run                 # Validate and print plan without generating
npx ca improve init                      # Scaffold example improve/*.md program file
```

## Watch command

```bash
npx ca watch                             # Tail live trace from latest loop session
npx ca watch --epic <id>                 # Watch a specific epic trace
npx ca watch --improve                   # Watch improvement loop traces
npx ca watch --no-follow                 # Print existing trace and exit
```

## Health, audit, and verification commands

```bash
npx ca about                    # Show version, animation, and recent changelog
npx ca doctor                  # Check external dependencies and project health
npx ca audit                   # Run pattern, rule, and lesson quality checks
npx ca rules check             # Check codebase against .claude/rules.json
npx ca test-summary            # Run tests and output compact pass/fail summary
npx ca verify-gates <epic-id>  # Verify workflow gates before epic closure
npx ca phase-check init <epic-id>
npx ca phase-check status
npx ca phase-check start <phase>
npx ca phase-check gate <gate-name>   # post-plan, gate-3, gate-4, final
npx ca phase-check clean
```

## Compound command

```bash
npx ca compound                # Synthesize cross-cutting patterns from accumulated lessons
```
