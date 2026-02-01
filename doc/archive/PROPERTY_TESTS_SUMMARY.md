# Property-Based Tests for SQLite Graceful Degradation

## Summary

Added comprehensive property-based tests to `src/storage/sqlite-degradation.test.ts` using fast-check to validate SQLite graceful degradation invariants.

## Tests Added

### Property 1: Data Integrity (Sequence Write/Read)
- **Invariant**: For any sequence of lessons written to JSONL, all lessons are readable
- **Tests**:
  1. Arbitrary sequence of lessons (quick/full mix) can be written and read back
  2. JSONL operations work even when interleaved with SQLite operation attempts
  3. Deleted lessons (tombstones) are properly filtered out

### Property 2: No Data Loss (Round-Trip)
- **Invariant**: JSONL round-trip preserves all lesson fields
- **Tests**:
  1. Any lesson preserves all fields through write/read cycle
  2. Quick lessons preserve all required fields
  3. Full lessons preserve evidence, severity, and all other fields
  4. Last-write-wins deduplication works correctly for multiple updates

### Property 3: Idempotent Degradation
- **Invariant**: Multiple calls to degraded functions produce consistent results
- **Tests**:
  1. `getCachedEmbedding` always returns null
  2. `setCachedEmbedding` is idempotent (no crashes, subsequent reads return null)
  3. `getRetrievalStats` always returns empty array
  4. `rebuildIndex` is idempotent (no crashes)
  5. `syncIfNeeded` always returns false
  6. `searchKeyword` always throws consistent error

### Property 4: Performance Bounded
- **Invariant**: JSONL operations complete within reasonable time for any input size
- **Tests**:
  1. JSONL writes complete in < 100ms per lesson
  2. JSONL reads complete in < 1000ms for up to 100 lessons
  3. Degraded SQLite operations (no-ops) complete instantly
  4. Multiple `rebuildIndex` calls complete quickly without DB work

### Property 5: Warning Logged Exactly Once
- **Invariant**: SQLite unavailability warning is logged exactly once, not silently ignored
- **Test**: Any number of SQLite operations logs warning exactly once

## Test Configuration

- **Fast-check runs**: 100 iterations in CI, 20 locally
- **Arbitraries defined**:
  - `sourceArb`: All valid Source types
  - `severityArb`: All valid Severity types
  - `contextArb`: Random tool/intent pairs
  - `lessonIdArb`: Valid hex lesson IDs
  - `baseLessonFieldsArb`: All common lesson fields
  - `quickLessonArb`: Quick lesson generator
  - `fullLessonArb`: Full lesson generator
  - `lessonArb`: Combined quick/full generator

## Current Status

**IMPORTANT**: These tests are written in TDD style (Test-Driven Development).

### Expected Behavior
- ✅ Tests are **correctly written** for the graceful degradation feature
- ❌ Tests **currently FAIL** because the implementation doesn't exist yet
- ✅ Tests will **PASS** once graceful degradation is implemented in `src/storage/sqlite.ts`

### Why Tests Fail Now
The `src/storage/sqlite.ts` module currently:
1. Imports `better-sqlite3` directly without try/catch
2. Does not handle import failures
3. Crashes when better-sqlite3 is unavailable (mocked in tests)

### Implementation Required
To make these tests pass, `src/storage/sqlite.ts` needs:

1. **Wrap import in try/catch**:
   ```typescript
   let Database: typeof import('better-sqlite3').default | null = null;
   let sqliteAvailable = false;
   
   try {
     const mod = await import('better-sqlite3');
     Database = mod.default;
     sqliteAvailable = true;
   } catch (err) {
     console.warn('SQLite unavailable, running in JSONL-only mode');
     sqliteAvailable = false;
   }
   ```

2. **Graceful degradation in each function**:
   - `setCachedEmbedding`: no-op if !sqliteAvailable
   - `getCachedEmbedding`: return null if !sqliteAvailable
   - `getRetrievalStats`: return [] if !sqliteAvailable
   - `searchKeyword`: throw clear error if !sqliteAvailable
   - `rebuildIndex`: no-op if !sqliteAvailable
   - `syncIfNeeded`: return false if !sqliteAvailable

See `doc/invariants/sqlite_graceful_degradation_invariants.md` for complete specification.

## Files Modified

- `src/storage/sqlite-degradation.test.ts` - Added 5 property test suites with 16 property tests

## References

- **Issue**: learning_agent-2f0 - Fix better-sqlite3 native bindings error
- **Invariants**: `doc/invariants/sqlite_graceful_degradation_invariants.md`
- **Pattern reference**: `src/types.test.ts` (existing property-based tests)
- **Fast-check docs**: https://fast-check.dev/

## Next Steps

1. Implement graceful degradation in `src/storage/sqlite.ts`
2. Run tests to verify implementation: `pnpm test src/storage/sqlite-degradation.test.ts`
3. All 56 tests (17 example-based + 16 property-based) should pass
