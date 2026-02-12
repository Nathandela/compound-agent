# Invariants for MCP Server Module

## Module Overview

**Purpose**: Expose compound-agent functionality as MCP (Model Context Protocol) tools and resources.

**Scope**: `src/mcp.ts` - A thin wrapper that delegates all business logic to existing modules.

**Key Principle**: The MCP server is a presentation layer only. All logic lives in existing modules.

---

## Data Invariants

### Server State
- **server**: MCP server instance, initialized once on startup
- **repoRoot**: string, absolute path to repository root, set at initialization, immutable after startup
- **repoRoot validity**: Must point to an existing directory with `.claude/` structure (or creatable structure)

### Tool Input Parameters
- **lesson_search.query**: string, non-empty, describes what to search for
- **lesson_search.maxResults**: number (optional), if provided: integer, >= 1, <= 100 (reasonable upper bound)
- **lesson_capture.insight**: string, non-empty, min length 10 chars (enforce minimal quality)
- **lesson_capture.trigger**: string (optional), if provided: non-empty
- **lesson_capture.tags**: array of strings (optional), if provided: all elements non-empty

### Tool Output Structure
- **lesson_search**: Always returns array (empty if no results), each element has `lesson` object + `score` number
- **lesson_capture**: Always returns complete lesson object with generated ID
- **lessons://prime**: Always returns string (never fails, even if lessons DB empty)

### Resource Identifiers
- **lessons://prime**: Fixed URI, no parameters, always resolvable

---

## Safety Properties (Must NEVER Happen)

### 1. No Business Logic in MCP Layer
**Why**: Violates separation of concerns, creates duplicate logic paths, makes testing brittle.

**Enforcement**:
- MCP tools ONLY call existing exported functions from `src/search/`, `src/storage/`, `src/retrieval/`
- NO embedding calls in `src/mcp.ts`
- NO JSONL parsing in `src/mcp.ts`
- NO lesson validation beyond parameter validation

**Test Strategy**:
- Unit tests verify mcp.ts imports only from public APIs
- No direct imports of internal modules (e.g., `embeddings/nomic.ts`, `storage/jsonl.ts` internals)

### 2. No Silent Failures
**Why**: MCP clients need clear error signals to retry or report to users.

**Enforcement**:
- All errors from underlying modules propagate to MCP client
- Use MCP SDK error types for known failure modes
- Never return success status for failed operations
- Never return empty results when operation actually failed

**Test Strategy**:
- Property test: For any error thrown by underlying API, MCP tool call throws
- Integration test: Verify error messages reach MCP client

### 3. No Mutation of Underlying State Outside Tool Calls
**Why**: MCP tools should be side-effect free except when explicitly invoked.

**Enforcement**:
- Server initialization does NOT create/modify `.claude/` structure
- Server initialization does NOT download embedding models
- Resource reads (lessons://prime) do NOT modify database
- Only `lesson_capture` tool writes data

**Test Strategy**:
- Verify server start with missing `.claude/` does not create files
- Verify resource read does not change file timestamps

### 4. No Data Loss on lesson_capture
**Why**: Lessons are user-created data - losing them destroys trust.

**Enforcement**:
- `lesson_capture` delegates to `appendLesson` which uses atomic append
- Generated ID must be returned to client for reference
- Must fail loudly if append operation fails (disk full, permissions, etc.)

**Test Strategy**:
- Integration test: Verify lesson appears in `readLessons` after capture
- Failure test: Verify error propagates if append fails (simulate read-only filesystem)

### 5. No Invalid Lesson IDs Generated
**Why**: IDs are used for retrieval, deduplication, and tombstones.

**Enforcement**:
- Always use `generateId(insight)` from `src/types.ts`
- NEVER generate IDs via other methods
- NEVER allow client-provided IDs

**Test Strategy**:
- Property test: Two captures with same insight produce same ID
- Property test: Different insights produce different IDs

### 6. No Exposure of Internal File Paths
**Why**: Security - clients should not access arbitrary filesystem paths.

**Enforcement**:
- `repoRoot` is set at server initialization, not per-tool-call
- Tool parameters NEVER accept file paths
- Returned lessons contain relative paths in citation fields (if present)

**Test Strategy**:
- Parameter validation test: Reject any tool call attempting to override repoRoot
- Audit: Verify no tool parameter is interpreted as filesystem path

---

## Liveness Properties (Must EVENTUALLY Happen)

### 1. lesson_search Returns Within 2 Seconds
**Timeline**: p95 < 2s for <1000 lessons

**Why**: MCP tools block client operations - slow responses degrade UX.

**Enforcement**:
- `searchVector` uses embedding cache to avoid recomputation
- No synchronous model downloads during search

**Monitoring Strategy**:
- Log slow queries (>1s)
- Return partial results if timeout approaches (future optimization)

**Edge Cases**:
- First search after DB creation: May be slower (acceptable - user sees model loading)
- Very large query text: Truncate at 500 chars to bound embedding time

### 2. lesson_capture Completes Within 1 Second
**Timeline**: p95 < 1s (excluding first-time model download)

**Why**: Capture should feel instant - users expect quick confirmation.

**Enforcement**:
- No embedding computation during capture (only on search)
- JSONL append is fast (just file I/O)

**Monitoring Strategy**:
- Log slow captures (>500ms)

**Edge Cases**:
- Disk full: Fail fast with clear error
- Concurrent captures: Append is atomic, order preserved

### 3. lessons://prime Resource Always Resolves
**Timeline**: < 100ms

**Why**: Resource reads should be instant, even if lesson DB is empty.

**Enforcement**:
- Returns workflow context string + formatted lessons
- If `loadSessionLessons` fails, return just workflow context (degrade gracefully)
- Never block on embedding model availability

**Monitoring Strategy**:
- Log if resource resolution takes >50ms

**Edge Cases**:
- No `.claude/` directory: Return workflow context only
- Corrupted lessons.jsonl: Skip errors, return valid lessons

### 4. Server Startup Completes Within 5 Seconds
**Timeline**: < 5s (excluding model download)

**Why**: MCP servers should start quickly - users expect low latency.

**Enforcement**:
- No synchronous I/O during initialization
- No eager loading of lessons into memory
- Embedding model loaded lazily on first use

**Monitoring Strategy**:
- Log startup time

**Edge Cases**:
- First-ever run (no model): May take 30-60s to download model (acceptable, show progress)
- Invalid repoRoot: Fail fast with clear error

---

## Edge Cases & Degradation Modes

### Empty Lesson Database
**Scenario**: User calls tools before any lessons captured

**Expected Behavior**:
- `lesson_search`: Returns empty array `[]`
- `lesson_capture`: Works normally, creates `.claude/` structure
- `lessons://prime`: Returns workflow context + empty lesson list

**Test**: Integration test with fresh directory

### Corrupted lessons.jsonl
**Scenario**: Malformed JSON lines in JSONL file

**Expected Behavior**:
- `readLessons` skips corrupted lines (unless strict mode)
- Tools continue to work with valid lessons
- `lesson_search` and `lessons://prime` return only valid lessons

**Test**: Unit test with intentionally corrupted JSONL

### Missing Embedding Model
**Scenario**: Model not downloaded, network unavailable

**Expected Behavior**:
- Server starts successfully
- `lesson_capture`: Works (no embeddings needed)
- `lesson_search`: Fails with clear error about missing model
- `lessons://prime`: Works (no embeddings needed)

**Test**: Integration test with model directory deleted

### SQLite Index Missing/Corrupted
**Scenario**: `.claude/.cache/lessons.sqlite` deleted or corrupted

**Expected Behavior**:
- Falls back to JSONL-only mode (per existing storage/sqlite.ts graceful degradation)
- `lesson_search` still works via JSONL read
- Performance degraded but functional

**Test**: Integration test with sqlite file deleted

### Concurrent Tool Calls
**Scenario**: Multiple MCP clients call tools simultaneously

**Expected Behavior**:
- `lesson_search`: Safe (read-only)
- `lesson_capture`: Atomic appends, order preserved, no corruption
- `lessons://prime`: Safe (read-only)

**Test**: Property test with concurrent writes

### Invalid Parameters
**Scenario**: Client sends malformed tool parameters

**Expected Behavior**:
- MCP server validates parameters BEFORE calling underlying APIs
- Returns MCP InvalidParams error
- Underlying APIs never see invalid data

**Test**: Unit test for each tool with invalid inputs

### repoRoot Not a Git Repository
**Scenario**: repoRoot points to non-repo directory

**Expected Behavior**:
- Server allows initialization (no git dependency)
- Lessons stored in `.claude/lessons/index.jsonl` regardless of git status
- Git-specific features (citation commit hashes) are optional

**Test**: Integration test with non-git directory

---

## Testing Strategy

### Unit Tests (src/mcp.test.ts)
- Parameter validation for all tools
- Error propagation from underlying APIs
- Return value structure validation
- No business logic in MCP layer (mock underlying calls)

### Integration Tests
- End-to-end: Start server, call tools, verify results
- Error scenarios: Missing model, corrupted data, disk full
- Concurrent operations: Multiple clients

### Property Tests (fast-check)
- For any valid insight, `lesson_capture` produces valid ID
- For any query, `lesson_search` returns sorted results (score descending)
- For any error from underlying API, MCP tool propagates error

### Performance Tests
- `lesson_search` < 2s for 1000 lessons
- `lesson_capture` < 1s
- `lessons://prime` < 100ms
- Server startup < 5s (excluding model download)

---

## Module Boundaries

### What MCP Server Does
- Accept MCP tool calls and resource requests
- Validate input parameters
- Delegate to existing APIs
- Format responses for MCP protocol
- Propagate errors to client

### What MCP Server Does NOT Do
- Embed text (delegates to `embedText`)
- Parse JSONL (delegates to `readLessons`, `appendLesson`)
- Generate lesson IDs (delegates to `generateId`)
- Rank search results (delegates to `searchVector`)
- Filter lessons by severity (delegates to `loadSessionLessons`)
- Download models (delegates to embedding module)

---

## References

### Existing APIs (Read-Only, Must Not Modify)
- `searchVector(repoRoot, query, { limit })` - Vector search with cosine similarity
- `appendLesson(repoRoot, lesson)` - Atomic JSONL append
- `generateId(insight)` - Deterministic lesson ID generation
- `loadSessionLessons(repoRoot, limit)` - High-severity lesson retrieval
- `readLessons(repoRoot)` - JSONL parse with last-write-wins deduplication

### MCP SDK Dependencies
- `@modelcontextprotocol/sdk` - Server initialization, tool/resource registration
- Tool schema validation via SDK
- Error types: InvalidParams, InternalError

### File Structure
```
.claude/
├── lessons/
│   └── index.jsonl         <- Source of truth (git-tracked)
└── .cache/
    └── lessons.sqlite      <- Rebuildable index (.gitignore)
```

---

## Invariant Verification Checklist

Before marking implementation complete, verify:

### Data Invariants
- [ ] repoRoot is set at initialization and immutable
- [ ] All tool parameters validated before calling underlying APIs
- [ ] Tool outputs match documented structure

### Safety Properties
- [ ] No business logic in src/mcp.ts (only delegation)
- [ ] All errors propagate to MCP client
- [ ] No file creation during server initialization
- [ ] lesson_capture uses generateId(insight) for ID
- [ ] No tool parameters accept file paths

### Liveness Properties
- [ ] lesson_search completes within 2s for 1000 lessons
- [ ] lesson_capture completes within 1s
- [ ] lessons://prime resolves within 100ms
- [ ] Server startup < 5s (excluding model download)

### Edge Cases
- [ ] Empty DB: All tools work correctly
- [ ] Corrupted JSONL: Tools return valid lessons only
- [ ] Missing model: lesson_search fails gracefully, other tools work
- [ ] Concurrent calls: No corruption, atomic appends
- [ ] Invalid parameters: MCP InvalidParams error returned

### Testing
- [ ] Unit tests cover all tools
- [ ] Integration tests verify end-to-end flow
- [ ] Property tests verify core invariants
- [ ] Performance tests verify timing constraints
