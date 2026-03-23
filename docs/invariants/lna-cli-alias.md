# Invariants for CA CLI Alias

## Overview

Feature: Add `ca` as the PRIMARY CLI alias for compound-agent.

**Purpose**: Reduce typing and token usage for Claude Code interactions while maintaining backwards compatibility.

## Data Invariants

### package.json bin field
- **Type**: `Record<string, string>` with exactly 2 entries
- **Structure**:
  - `{ "ca": "./dist/cli.js", "compound-agent": "./dist/cli.js" }`
- **Constraint**: Both keys MUST point to identical path `./dist/cli.js`
- **Rationale**: Single implementation ensures identical behavior

### CLI program name
- **Field**: `program.name()` in cli.ts
- **Value**: MUST be set (either "ca" or "compound-agent")
- **Display**: Help text shows the invoked command name
- **Rationale**: Provides correct usage examples in --help

### Claude-facing strings (PRIMARY: ca)
All strings intended for Claude Code MUST use `npx ca`, not `npx compound-agent`:

- **AGENTS_MD_TEMPLATE**: All command examples use `npx ca`
- **PRE_COMMIT_MESSAGE**: Hint uses `ca capture`
- **CLAUDE_HOOK_CONFIG.hooks[0].command**: Uses `ca load-session`
- **Error messages**: Model download hint uses `ca download-model`
- **Rationale**: Claude should learn the shorter form as primary

### Backwards compatibility strings
User-facing documentation MAY mention both:
- **README.md**: Can show both, prefer ca in examples
- **Error messages to users**: May show compound-agent for clarity
- **Rationale**: Users may have existing scripts

## Safety Properties (Must NEVER Happen)

### 1. CLI commands diverge
- **Property**: `ca` and `compound-agent` MUST have identical behavior
- **Why**: Single bin entry ensures this - both are same executable
- **Test strategy**: Run same command with both aliases, verify identical output

### 2. Documentation inconsistency
- **Property**: Claude-facing docs MUST NOT mix `ca` and `compound-agent` randomly
- **Why**: Confuses Claude about which command to use
- **Test strategy**: Grep for "npx compound-agent" in AGENTS_MD_TEMPLATE, PRE_COMMIT_MESSAGE, CLAUDE_HOOK_CONFIG - MUST be zero matches (except for backwards compat notes)

### 3. bin field corruption
- **Property**: package.json bin field MUST NOT have missing or broken paths
- **Why**: Breaks CLI invocation entirely
- **Test strategy**:
  - JSON schema validation on package.json
  - Integration test: `ca --version` and `npx compound-agent --version` both succeed

### 4. Name collision
- **Property**: `ca` package name MUST NOT be registered on npm
- **Why**: Would block future npm publish with that name
- **Test strategy**: Check `npm view ca` returns 404 (not our concern for v0.2.1, but good to verify)

## Liveness Properties (Must EVENTUALLY Happen)

### 1. Both commands work after install
- **Property**: After `npm install compound-agent`, both `npx ca` and `npx compound-agent` MUST execute within 1 second
- **Timeline**: Immediate (npm bin linking is synchronous)
- **Monitoring**: Integration tests run both commands

### 2. Help text displays correctly
- **Property**: `ca --help` shows appropriate usage within 100ms
- **Timeline**: Immediate (synchronous operation)
- **Monitoring**: Integration test verifies help output

## Edge Cases

### Empty or missing dist/cli.js
- **Scenario**: dist/cli.js doesn't exist (pre-build)
- **Expected**: `npx ca` fails with clear "file not found" error
- **Actual behavior**: Node/npm handles this natively

### Global vs local install
- **Scenario**: Both `npm i -g compound-agent` and local `npm install`
- **Expected**: Both `ca` and `compound-agent` work in both contexts
- **Test**: Integration tests cover both

### User has existing "ca" binary
- **Scenario**: User has another tool named "ca" in PATH
- **Expected**: `npx ca` uses our package (npx resolution priority)
- **Behavior**: npx prefers local node_modules/.bin over global PATH

### Claude uses old commands
- **Scenario**: Claude uses `npx compound-agent` from old examples
- **Expected**: Still works (backwards compat)
- **Test**: Keep one test using `compound-agent` to verify

## Implementation Checklist

### Code Changes
- [ ] package.json: Add `"ca": "./dist/cli.js"` to bin field
- [ ] cli.ts: Update AGENTS_MD_TEMPLATE to use `npx ca`
- [ ] cli.ts: Update PRE_COMMIT_MESSAGE to use `ca capture`
- [ ] cli.ts: Update CLAUDE_HOOK_CONFIG to use `ca load-session`
- [ ] cli.ts: Update check-plan error message to use `ca download-model`

### Tests
- [ ] Unit: Verify package.json has both bin entries
- [ ] Integration: `ca --version` succeeds
- [ ] Integration: `ca learn "test" --yes` creates lesson
- [ ] Integration: `npx compound-agent list` still works
- [ ] Documentation: Grep for incorrect usage in templates

## Verification Strategy

### Static Analysis
```bash
# Verify bin field structure
jq '.bin | length == 2' package.json
jq '.bin.ca == "./dist/cli.js"' package.json
jq '.bin["compound-agent"] == "./dist/cli.js"' package.json

# Verify Claude-facing strings use ca
grep -c "npx ca" src/cli.ts  # Should be high
grep "npx compound-agent" src/cli.ts | grep -v "backwards compat"  # Should be minimal
```

### Runtime Tests
```bash
# Both commands work
ca --version
npx compound-agent --version

# Same behavior
ca list > /tmp/ca.txt
npx compound-agent list > /tmp/compound-agent.txt
diff /tmp/ca.txt /tmp/compound-agent.txt  # Should be identical
```

## Schema Validation

### package.json bin field
```typescript
const BinSchema = z.object({
  ca: z.literal('./dist/cli.js'),
  'compound-agent': z.literal('./dist/cli.js'),
});
```

### Invariant: Both point to same file
```typescript
assert(packageJson.bin.ca === packageJson.bin['compound-agent']);
```
