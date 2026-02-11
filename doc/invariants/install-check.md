# Install-Check Utility Invariants

## Purpose

Detect and report invalid installations of compound-agent when installed from GitHub URL instead of npm registry.

**Problem**: When users install via `pnpm add -D github:user/compound-agent`, they get source code WITHOUT the compiled `dist/` directory, causing all CLI commands (hooks, load-session, etc.) to fail with "Cannot find module './dist/cli.js'".

**Solution**: Provide utilities to detect invalid installations and guide users toward correct installation method.

---

## Module: `src/utils/install-check.ts`

### Data Invariants

```
D1: InstallCheckResult.valid is boolean (true = valid, false = invalid)
D2: InstallCheckResult.reason is non-empty string when valid=false, optional when valid=true
D3: InstallCheckResult.distPath is absolute path string to expected dist/ directory
D4: InstallCheckResult.cliPath is absolute path string to expected dist/cli.js file
D5: Package root is determined by package.json location (never hardcoded)
D6: All paths use path.join() for cross-platform compatibility (never string concatenation)
```

**Rationale**:
- D1: Boolean makes branching logic explicit and type-safe
- D2: Invalid installs must have diagnostic information; reason explains failure
- D3-D4: Absolute paths avoid ambiguity and support debugging
- D5: Path resolution works regardless of where package is installed
- D6: Windows uses backslashes, Unix uses forward slashes

---

## Safety Properties (Must NEVER Happen)

### S1: No false positives
**Property**: Valid npm installations must NEVER be flagged as invalid

**Why**:
- Breaks working installations
- User frustration and loss of trust
- Creates support burden

**Test Strategy**:
- Property test: Install from npm, verify checkInstallation().valid === true
- Verify dist/cli.js exists in npm tarball (pnpm pack)
- Test with symlinked node_modules (pnpm/yarn workspaces)
- Test in Docker container with fresh npm install

---

### S2: No misleading error messages
**Property**: When valid=false, reason must accurately describe the problem and solution

**Why**:
- Users need actionable guidance
- Wrong advice wastes time
- "npm install failed" vs "GitHub install" are different problems

**Test Strategy**:
- Missing dist/: reason mentions GitHub URL installation
- Missing cli.js: reason mentions missing build output
- Verify reason includes correct command: `pnpm add -D compound-agent`
- Check reason does NOT blame user's project setup

**Expected reason format**:
```
"Invalid installation: compound-agent was installed from GitHub URL without compiled output. Install from npm registry instead: pnpm add -D compound-agent"
```

---

### S3: No silent failures
**Property**: assertValidInstall() must exit with non-zero code and clear error when invalid

**Why**:
- Hooks/scripts detect failures via exit code
- Silent failures lead to confusing downstream errors
- CI/CD pipelines need explicit failures

**Test Strategy**:
- Mock invalid install, call assertValidInstall(), verify process.exit(1)
- Verify error written to stderr (not stdout)
- Verify error includes reason from InstallCheckResult
- Verify exit happens BEFORE any other operations

---

### S4: No environment assumptions
**Property**: Detection must work regardless of package manager (npm/pnpm/yarn/bun)

**Why**:
- Users have different package manager preferences
- node_modules structure varies (pnpm uses symlinks)
- Future package managers may have different layouts

**Test Strategy**:
- Test with npm install, pnpm install, yarn install
- Test with pnpm workspaces (symlinked dependencies)
- Verify detection uses require.resolve() or import.meta.url (not hardcoded paths)
- Check works when package installed globally vs locally

---

### S5: No filesystem side effects
**Property**: checkInstallation() must be read-only (no writes, no modifications)

**Why**:
- Check functions should be idempotent
- Avoid permission errors
- Safe to call repeatedly

**Test Strategy**:
- Spy on fs.writeFile/writeFileSync, verify never called
- Run check 100 times, verify filesystem unchanged
- Check works in read-only directories
- Verify no temp files created

---

## Liveness Properties (Must EVENTUALLY Happen)

### L1: Detection completes in bounded time
**Timeline**: checkInstallation() completes in < 50ms on typical systems

**Why**:
- Called during CLI startup (every command)
- Slow checks degrade UX
- Hooks must run quickly or users disable them

**Monitoring Strategy**:
- Benchmark on CI: verify p95 < 50ms
- Test on slow filesystems (network drives)
- Verify no blocking I/O besides stat/existsSync
- Check no recursive directory walks

---

### L2: assertValidInstall() fails fast
**Timeline**: Invalid installs exit within 100ms (before any other work)

**Why**:
- No point doing work if installation broken
- Faster failure = clearer cause-effect for user
- Prevents cascading errors

**Monitoring Strategy**:
- Verify assertValidInstall() called at top of entry points
- Check no database opens before assertion
- Verify no model downloads before assertion
- Measure time from process.start to exit on invalid install

---

### L3: Error messages are immediately visible
**Timeline**: assertValidInstall() error appears in terminal before process exits

**Why**:
- Users need to see what went wrong
- Buffered output may be lost on exit
- stderr should flush before exit

**Monitoring Strategy**:
- Verify console.error() or process.stderr.write() used (not console.log)
- Test stderr is flushed before process.exit()
- Check error visible in test output
- Verify no race conditions with exit timing

---

## Edge Cases

### Case 1: dist/ exists but cli.js missing
**Scenario**: Package has dist/ directory but dist/cli.js was not built
**Expected**: checkInstallation().valid = false, reason mentions missing cli.js

### Case 2: Package installed as dependency of dependency
**Scenario**: compound-agent installed transitively (not direct devDependency)
**Expected**: Detection still works (uses relative paths from package root)

### Case 3: Symlinked installation (pnpm)
**Scenario**: pnpm creates symlinks in node_modules/.pnpm/
**Expected**: Detection follows symlinks, checks actual package location

### Case 4: Monorepo workspace
**Scenario**: Package used in pnpm/yarn workspace with hoisted dependencies
**Expected**: Detection resolves package root correctly via package.json

### Case 5: Global installation
**Scenario**: npx compound-agent (global cache install)
**Expected**: Detection works; global installs use npm registry (include dist/)

### Case 6: Corrupted dist/ (partial build)
**Scenario**: dist/cli.js exists but is 0 bytes or invalid JavaScript
**Expected**: checkInstallation() succeeds (file exists), error happens later during require()
**Rationale**: Detecting corruption requires deeper validation; out of scope for install check

### Case 7: Missing package.json
**Scenario**: package.json deleted or corrupted
**Expected**: checkInstallation() throws error (can't determine package root)
**Rationale**: Broken environment; fail explicitly

---

## Function Signatures

### checkInstallation(): InstallCheckResult

**Returns**:
```typescript
{
  valid: true,
  distPath: "/path/to/node_modules/compound-agent/dist",
  cliPath: "/path/to/node_modules/compound-agent/dist/cli.js"
}
```

OR

```typescript
{
  valid: false,
  reason: "Invalid installation: compound-agent was installed from GitHub URL without compiled output. Install from npm registry instead: pnpm add -D compound-agent",
  distPath: "/path/to/node_modules/compound-agent/dist",
  cliPath: "/path/to/node_modules/compound-agent/dist/cli.js"
}
```

**Guarantees**:
- Synchronous (returns immediately, no async/await)
- Read-only (no filesystem modifications)
- Deterministic (same input = same output)
- No exceptions (returns result, never throws)

---

### assertValidInstall(): void

**Behavior**:
- Calls checkInstallation()
- If valid: returns silently
- If invalid: writes error to stderr, calls process.exit(1)

**Guarantees**:
- Never returns if invalid (process terminates)
- Exit code is always 1 on invalid install
- Error message written to stderr (not stdout)
- No cleanup needed (process exits immediately)

**Usage**:
```typescript
// At top of CLI entry point (src/cli.ts)
assertValidInstall(); // Dies here if invalid
// ... rest of CLI logic
```

---

## Integration Points

### src/cli.ts (CLI entry point)
**Invariant**: assertValidInstall() called before program.parse()
**Rationale**: Catch invalid installs before any commands run

### src/commands/setup/hooks.ts (Git hook installation)
**Invariant**: Hook scripts call CLI via `npx ca`, which triggers assertValidInstall()
**Rationale**: Hooks fail early with clear error if invalid install

### src/commands/setup/templates.ts (COMPOUND_AGENT_HOOK_BLOCK)
**Invariant**: Hook template uses `npx ca hooks run pre-commit`
**Rationale**: npx resolves to installed package, which includes install check

### package.json bin field
**Current**:
```json
{
  "bin": {
    "compound-agent": "./dist/cli.js",
    "ca": "./dist/cli.js"
  }
}
```
**Invariant**: Bin scripts point to dist/cli.js (not src/)
**Rationale**: Only npm registry includes dist/; GitHub installs fail here

---

## Detection Logic

### Step 1: Resolve package root
```typescript
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
// OR for CommonJS:
const packageRoot = path.dirname(__dirname);
```

### Step 2: Construct expected paths
```typescript
const distPath = path.join(packageRoot, 'dist');
const cliPath = path.join(distPath, 'cli.js');
```

### Step 3: Check existence
```typescript
import { existsSync } from 'node:fs';

const distExists = existsSync(distPath);
const cliExists = existsSync(cliPath);
```

### Step 4: Determine validity
```typescript
if (!distExists || !cliExists) {
  return {
    valid: false,
    reason: "Invalid installation: compound-agent was installed from GitHub URL...",
    distPath,
    cliPath
  };
}

return { valid: true, distPath, cliPath };
```

---

## Test Checklist

- [ ] Valid npm install returns valid=true
- [ ] Missing dist/ returns valid=false with correct reason
- [ ] Missing cli.js returns valid=false with correct reason
- [ ] assertValidInstall() exits with code 1 when invalid
- [ ] assertValidInstall() writes to stderr (not stdout)
- [ ] Error message includes correct installation command
- [ ] checkInstallation() completes in < 50ms
- [ ] Works with pnpm/npm/yarn
- [ ] Works with symlinked node_modules (pnpm)
- [ ] Works in monorepo workspace
- [ ] Read-only (no filesystem modifications)
- [ ] No false positives on valid installs
- [ ] Paths are absolute (not relative)
- [ ] Cross-platform (Windows and Unix)

---

## References

- package.json bin field (lines 8-11)
- package.json files field (lines 18-21) - dist/ is published
- src/commands/setup/hooks.ts - hook installation using npx
- doc/specs/packaging.md - npm vs GitHub installation differences
