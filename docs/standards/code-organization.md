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

Code size limits (functions < 50 lines, files < 300 lines) are mechanically enforced via lint rules. See [linting-for-agents.md](linting-for-agents.md) for rule configuration and error message patterns.

## Documentation Structure

```
docs/                       # All documentation
├── ARCHITECTURE-V2.md      # Three-layer architecture design
├── RESOURCE_LIFECYCLE.md    # Heavyweight resource management
├── MIGRATION.md            # Migration guide (learning-agent -> compound-agent)
├── adr/                    # Architectural Decision Records
├── archive/                # Historical specs, plans, and summaries
├── invariants/             # Module invariants (data/safety/liveness)
├── research/               # External research and references
├── specs/                  # Feature specifications
├── standards/              # Coding standards and best practices
└── verification/           # Review workflow and criteria

src/                        # Code with inline JSDoc
└── module/
    └── index.ts            # Public API only
```
