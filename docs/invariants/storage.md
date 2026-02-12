# Storage Module Invariants

## JSONL Storage (src/storage/jsonl.ts)

### Data Invariants
```
D1: Each line is valid JSON; entries validate against LessonSchema
D2: Lesson IDs match /^L[a-f0-9]{8}$/; created is ISO8601
D3: Lesson.type is 'quick' or 'full'; full lessons have evidence + severity
```

### Safety Properties
```
S1: File is append-only; existing lines never modified
S2: Lesson content never changes after creation
S3: readLessons never returns lessons with deleted=true
S4: Empty/missing file returns empty array (not error)
```

### Liveness Properties
```
L1: appendLesson completes in bounded time
L2: Directory created if missing; last-write-wins for duplicate IDs
```

## SQLite Storage (src/storage/sqlite.ts)

### Data Invariants
```
D1: lessons.id is PRIMARY KEY (unique, non-null)
D2: FTS5 index synced with lessons table via triggers
D3: Boolean fields stored as 0/1 integers
```

### Safety Properties
```
S1: SQLite is derived index; can be rebuilt from JSONL
S2: Database corruption does not affect JSONL source of truth
S3: rebuildIndex is idempotent; searchKeyword is read-only
S4: WAL mode prevents reader/writer conflicts
```

### Liveness Properties
```
L1: openDb creates schema if needed; returns singleton
L2: rebuildIndex reflects all current JSONL lessons
L3: closeDb releases all database resources
```
