# Code Organization

## Small Code Principle (Strong Default)

- **Functions**: < 50 lines
- **Files**: < 300 lines
- **Packages**: Single clear responsibility
- **Public API**: Minimal exported symbols (uppercase identifiers)

## Package Design (Parnas Principles)

```go
// internal/storage/ — Public API via exported functions
package storage

func AppendLesson(repoRoot string, lesson Lesson) error { ... }
func ReadLessons(repoRoot string) ([]Lesson, error) { ... }
func RebuildIndex(repoRoot string) error { ... }
func SearchKeyword(repoRoot string, query string) ([]Lesson, error) { ... }

// Unexported helpers stay internal to the package
func openDB(path string) (*sql.DB, error) { ... }
```

Code size limits (functions < 50 lines, files < 300 lines) are mechanically enforced via lint rules. See [linting-for-agents.md](linting-for-agents.md) for rule configuration.

## Documentation Structure

```
docs/                       # All documentation
├── ARCHITECTURE-V2.md      # Three-layer architecture design
├── RESOURCE_LIFECYCLE.md   # Heavyweight resource management
├── adr/                    # Architectural Decision Records
├── archive/                # Historical specs, plans, and summaries
├── invariants/             # Module invariants (data/safety/liveness)
├── research/               # External research and references
├── specs/                  # Feature specifications
├── standards/              # Coding standards and best practices
└── verification/           # Review workflow and criteria

go/                         # Go codebase
├── cmd/ca/                 # CLI entrypoint
├── internal/               # All internal packages
│   ├── build/              # Version/commit injection
│   ├── capture/            # Lesson capture logic
│   ├── cli/                # CLI command wiring
│   ├── compound/           # Core types and config
│   ├── embed/              # Embedding daemon client
│   ├── hook/               # Git hook management
│   ├── knowledge/          # Knowledge base operations
│   ├── memory/             # JSONL storage and types
│   ├── retrieval/          # Retrieval logic
│   ├── search/             # Search algorithms
│   ├── setup/              # Repository initialization
│   ├── storage/            # SQLite storage layer
│   └── util/               # Shared utilities
├── go.mod
├── go.sum
└── Makefile
```
