# Invariants for LNA CLI Alias

## Overview

Feature: Add `lna` as the PRIMARY CLI alias for learning-agent.

**Purpose**: Reduce typing and token usage for Claude Code interactions while maintaining backwards compatibility.

## Data Invariants

### package.json bin field
- **Type**: `Record<string, string>` with exactly 2 entries
- **Structure**:
  - `{ "lna": "./dist/cli.js", "learning-agent": "./dist/cli.js" }`
- **Constraint**: Both keys MUST point to identical path `./dist/cli.js`
- **Rationale**: Single implementation ensures identical behavior

### CLI program name
- **Field**: `program.name()` in cli.ts
- **Value**: MUST be set (either "lna" or "learning-agent")
- **Display**: Help text shows the invoked command name
- **Rationale**: Provides correct usage examples in --help

### Claude-facing strings (PRIMARY: lna)
All strings intended for Claude Code MUST use `npx lna`, not `npx learning-agent`:

- **AGENTS_MD_TEMPLATE**: All command examples use `npx lna`
- **PRE_COMMIT_MESSAGE**: Hint uses `npx lna capture`
- **CLAUDE_HOOK_CONFIG.hooks[0].command**: Uses `npx lna load-session`
- **Error messages**: Model download hint uses `npx lna download-model`
- **Rationale**: Claude should learn the shorter form as primary

### Backwards compatibility strings
User-facing documentation MAY mention both:
- **README.md**: Can show both, prefer lna in examples
- **Error messages to users**: May show learning-agent for clarity
- **Rationale**: Users may have existing scripts

## Safety Properties (Must NEVER Happen)

### 1. CLI commands diverge
- **Property**: `lna` and `learning-agent` MUST have identical behavior
- **Why**: Single bin entry ensures this - both are same executable
- **Test strategy**: Run same command with both aliases, verify identical output

### 2. Documentation inconsistency
- **Property**: Claude-facing docs MUST NOT mix `lna` and `learning-agent` randomly
- **Why**: Confuses Claude about which command to use
- **Test strategy**: Grep for "npx learning-agent" in AGENTS_MD_TEMPLATE, PRE_COMMIT_MESSAGE, CLAUDE_HOOK_CONFIG - MUST be zero matches (except for backwards compat notes)

### 3. bin field corruption
- **Property**: package.json bin field MUST NOT have missing or broken paths
- **Why**: Breaks CLI invocation entirely
- **Test strategy**:
  - JSON schema validation on package.json
  - Integration test: `npx lna --version` and `npx learning-agent --version` both succeed

### 4. Name collision
- **Property**: `lna` package name MUST NOT be registered on npm
- **Why**: Would block future npm publish with that name
- **Test strategy**: Check `npm view lna` returns 404 (not our concern for v0.2.1, but good to verify)

## Liveness Properties (Must EVENTUALLY Happen)

### 1. Both commands work after install
- **Property**: After `npm install learning-agent`, both `npx lna` and `npx learning-agent` MUST execute within 1 second
- **Timeline**: Immediate (npm bin linking is synchronous)
- **Monitoring**: Integration tests run both commands

### 2. Help text displays correctly
- **Property**: `npx lna --help` shows appropriate usage within 100ms
- **Timeline**: Immediate (synchronous operation)
- **Monitoring**: Integration test verifies help output

## Edge Cases

### Empty or missing dist/cli.js
- **Scenario**: dist/cli.js doesn't exist (pre-build)
- **Expected**: `npx lna` fails with clear "file not found" error
- **Actual behavior**: Node/npm handles this natively

### Global vs local install
- **Scenario**: Both `npm i -g learning-agent` and local `npm install`
- **Expected**: Both `lna` and `learning-agent` work in both contexts
- **Test**: Integration tests cover both

### User has existing "lna" binary
- **Scenario**: User has another tool named "lna" in PATH
- **Expected**: `npx lna` uses our package (npx resolution priority)
- **Behavior**: npx prefers local node_modules/.bin over global PATH

### Claude uses old commands
- **Scenario**: Claude uses `npx learning-agent` from old examples
- **Expected**: Still works (backwards compat)
- **Test**: Keep one test using `learning-agent` to verify

## Implementation Checklist

### Code Changes
- [ ] package.json: Add `"lna": "./dist/cli.js"` to bin field
- [ ] cli.ts: Update AGENTS_MD_TEMPLATE to use `npx lna`
- [ ] cli.ts: Update PRE_COMMIT_MESSAGE to use `npx lna capture`
- [ ] cli.ts: Update CLAUDE_HOOK_CONFIG to use `npx lna load-session`
- [ ] cli.ts: Update check-plan error message to use `npx lna download-model`

### Tests
- [ ] Unit: Verify package.json has both bin entries
- [ ] Integration: `npx lna --version` succeeds
- [ ] Integration: `npx lna learn "test" --yes` creates lesson
- [ ] Integration: `npx learning-agent list` still works
- [ ] Documentation: Grep for incorrect usage in templates

## Verification Strategy

### Static Analysis
```bash
# Verify bin field structure
jq '.bin | length == 2' package.json
jq '.bin.lna == "./dist/cli.js"' package.json
jq '.bin["learning-agent"] == "./dist/cli.js"' package.json

# Verify Claude-facing strings use lna
grep -c "npx lna" src/cli.ts  # Should be high
grep "npx learning-agent" src/cli.ts | grep -v "backwards compat"  # Should be minimal
```

### Runtime Tests
```bash
# Both commands work
npx lna --version
npx learning-agent --version

# Same behavior
npx lna list > /tmp/lna.txt
npx learning-agent list > /tmp/learning-agent.txt
diff /tmp/lna.txt /tmp/learning-agent.txt  # Should be identical
```

## Schema Validation

### package.json bin field
```typescript
const BinSchema = z.object({
  lna: z.literal('./dist/cli.js'),
  'learning-agent': z.literal('./dist/cli.js'),
});
```

### Invariant: Both point to same file
```typescript
assert(packageJson.bin.lna === packageJson.bin['learning-agent']);
```
