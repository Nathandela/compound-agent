# Code Organization

## Small Code Principle (Strong Default)

- **Functions**: < 50 lines
- **Files**: < 300 lines
- **Modules**: Single clear responsibility
- **Public API**: Minimal exports via `index.ts`

## Module Design (Parnas Principles)

```typescript
// src/storage/index.ts - Public API only
export { appendLesson, readLessons } from './jsonl.js';
export { rebuildIndex, searchKeyword } from './sqlite.js';

// Internal files NOT exported through index.ts
```

## Documentation Structure

```
docs/                       # All documentation
├── SPEC.md                 # Complete specification
├── CONTEXT.md              # Research and decisions
├── PLAN.md                 # Implementation plan
├── adr/                    # Architectural Decision Records
├── archive/                # Historical plans and summaries
├── invariants/             # Module invariants (data/safety/liveness)
├── research/               # External research and references
├── specs/                  # Feature specifications
├── standards/              # Coding standards and best practices
└── verification/           # Review workflow and criteria

src/                        # Code with inline JSDoc
└── module/
    └── index.ts            # Public API only
```
