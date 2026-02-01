# Download-Model Command Invariants

## CLI Command: `npx learning-agent download-model`

**Purpose**: Download the EmbeddingGemma-300M embedding model (~278MB) required for semantic search.

**Context**: This command is referenced in `src/cli.ts` (lines 1336, 1341) when users attempt semantic search without the model present, but the command doesn't exist yet. The underlying download logic exists in `src/embeddings/model.ts` via `resolveModel()`.

---

## Data Invariants

```
D1: Model path is always absolute, never relative
D2: Model filename is always MODEL_FILENAME constant from model.ts
D3: Model location is always ~/.node-llama-cpp/models/ (DEFAULT_MODEL_DIR)
D4: Model file size is approximately 278MB (291,782,368 bytes ±1%)
D5: Downloaded model file is a valid GGUF format file
```

**Rationale**:
- D1-D3: Path consistency ensures idempotency checks work reliably
- D4: Size validation helps detect incomplete or corrupted downloads
- D5: Format validation prevents using corrupted files

---

## Safety Properties (Must NEVER Happen)

### S1: No duplicate downloads
**Property**: If model already exists locally, download must be skipped (idempotent)

**Why**:
- Wastes bandwidth and time (~278MB download)
- User frustration from repeated downloads
- Potential partial file corruption if download interrupted

**Test Strategy**:
- Property test: Call download command twice, verify second is instant
- Verify `isModelAvailable()` called before download
- Check file existence before initiating download

---

### S2: No partial/corrupted model files
**Property**: Download must be atomic - either complete valid file or no file

**Why**:
- Partial downloads cause embedding operations to fail
- Corrupted models produce invalid embeddings
- Hard to diagnose "works sometimes" bugs

**Test Strategy**:
- Mock download interruption (network failure)
- Verify no file exists OR file is complete
- Verify subsequent download attempt succeeds
- Check `resolveModelFile` handles failures correctly

---

### S3: No silent failures
**Property**: Download failures must surface as clear errors, never succeed with wrong output

**Why**:
- Users need to know if download failed
- Silent failures lead to confusing errors later
- Actionable error messages improve UX

**Test Strategy**:
- Mock network failures (timeout, 404, connection refused)
- Verify error messages include actionable guidance
- Verify non-zero exit code on failure
- Check error distinguishes between network vs disk vs permission issues

---

### S4: No credential/secret exposure
**Property**: Command must never log or display sensitive credentials

**Why**:
- Model download shouldn't require auth, but future changes might
- Terminal output may be logged or shared
- Security best practice

**Test Strategy**:
- Review all console.log/console.error calls
- Verify no tokens in progress output
- Check node-llama-cpp resolveModelFile doesn't expose credentials

---

### S5: No permission bypass
**Property**: Download must fail gracefully if ~/.node-llama-cpp/models/ is not writable

**Why**:
- Respects filesystem permissions
- Prevents cryptic EACCES errors during embedding
- Clear error message helps user fix permissions

**Test Strategy**:
- Mock directory with read-only permissions
- Verify clear error message about permissions
- Suggest chmod/chown in error message

---

## Liveness Properties (Must EVENTUALLY Happen)

### L1: Download completes or fails within reasonable time
**Timeline**: p95 < 5 minutes for 278MB file on typical connection (1MB/s)

**Why**:
- Users shouldn't wait indefinitely
- Network timeouts should be reasonable
- Hung processes are worse than clear failures

**Monitoring Strategy**:
- Verify node-llama-cpp sets reasonable timeout
- Test with throttled network connection
- Verify progress output shows activity

---

### L2: Progress indication updates during download
**Timeline**: Progress updates at least every 5 seconds during active download

**Why**:
- Users need feedback that process is working
- Distinguish between hung and slow downloads
- Improves perceived performance

**Monitoring Strategy**:
- Verify `resolveModel({ cli: true })` shows progress
- Check output includes percentage or bytes downloaded
- Verify progress updates don't spam (rate-limited)

---

### L3: Successful download makes model immediately available
**Timeline**: `isModelAvailable()` returns true immediately after successful download

**Why**:
- Command completion means model is ready to use
- No race conditions between download and usage
- User shouldn't need to retry embedding commands

**Monitoring Strategy**:
- Run download command, immediately call `check-plan --plan "test"`
- Verify no "model not available" error
- Check `isModelAvailable()` synchronous check is accurate

---

## Edge Cases

### Empty/corrupted existing model file
**Scenario**: Model file exists but is 0 bytes or corrupted
**Expected**: Re-download or fail with clear error about corruption

**Scenario**: ~/.node-llama-cpp/models/ directory doesn't exist
**Expected**: Create directory automatically, download succeeds

**Scenario**: Disk full during download
**Expected**: Fail with clear "disk full" error, clean up partial file

**Scenario**: User Ctrl+C during download
**Expected**: Clean up partial file, exit gracefully with signal

**Scenario**: Model already downloading in another process
**Expected**: Either wait/queue OR fail with "download in progress" message

**Scenario**: Downloaded file hash mismatch (if verification implemented)
**Expected**: Delete corrupted file, fail with "checksum mismatch" error

---

## Command Output Format

### Success (human-readable, NOT --json)
```
Downloading embedding model (278MB)...
[progress bar or percentage]
Model downloaded successfully
  Path: /Users/nathan/.node-llama-cpp/models/hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf
  Size: 278MB
```

### Already exists (idempotent)
```
Embedding model already downloaded
  Path: /Users/nathan/.node-llama-cpp/models/hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf
  Size: 278MB
```

### Failure (network error)
```
[error] Failed to download embedding model
  Error: Connection timeout after 60s
  Try again: npx learning-agent download-model
```

### Failure (disk full)
```
[error] Failed to download embedding model
  Error: No space left on device
  Free up space and try again: npx learning-agent download-model
```

### With --json flag
```json
{
  "success": true,
  "path": "/Users/nathan/.node-llama-cpp/models/hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf",
  "size": 291782368,
  "alreadyExisted": false
}
```

### With --json flag (already exists)
```json
{
  "success": true,
  "path": "/Users/nathan/.node-llama-cpp/models/hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf",
  "size": 291782368,
  "alreadyExisted": true
}
```

### With --json flag (failure)
```json
{
  "success": false,
  "error": "Connection timeout after 60s",
  "action": "Try again: npx learning-agent download-model"
}
```

---

## Integration Points

### Called from check-plan error message (src/cli.ts:1336, 1341)
**Invariant**: Error message must match actual command name
**Current**: `npx learning-agent download-model`
**Test**: Verify command name in error matches registered command

### Uses resolveModel() from src/embeddings/model.ts
**Invariant**: Command delegates to resolveModel({ cli: true })
**Rationale**: Don't duplicate download logic, use existing implementation

### Shares isModelAvailable() check
**Invariant**: Command uses same isModelAvailable() as check-plan
**Rationale**: Consistent model detection across CLI and library

---

## Test Checklist

- [ ] Download when model doesn't exist shows progress
- [ ] Download completes and `isModelAvailable()` returns true
- [ ] Second download is instant (idempotent)
- [ ] Network failure produces clear error
- [ ] Disk full produces clear error
- [ ] Read-only directory produces clear error
- [ ] Ctrl+C cleans up partial file
- [ ] --json flag outputs valid JSON
- [ ] Human output includes path and size
- [ ] Command name matches error messages in check-plan
- [ ] Downloaded model works with check-plan immediately
