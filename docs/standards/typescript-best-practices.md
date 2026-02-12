# TypeScript Best Practices

> Comprehensive guide for TypeScript development.

## Table of Contents

1. [Project Setup](#project-setup)
2. [TypeScript Configuration](#typescript-configuration)
3. [Code Style & Formatting](#code-style--formatting)
4. [Backend Patterns](#backend-patterns)
5. [Validation & Error Handling](#validation--error-handling)
6. [Testing](#testing)
7. [Import Organization](#import-organization)
8. [Quick Reference](#quick-reference)

---

## Project Setup

### Package Manager

Use **pnpm** for all projects. Lock the version in `package.json`:

```json
{
  "packageManager": "pnpm@10.24.0",
  "engines": {
    "node": ">=20"
  }
}
```

Create `.npmrc` for consistency:

```ini
save-exact=true
```

### Build Tools

| Layer | Tool |
|-------|------|
| Library | tsup |
| Backend | TypeScript + Node |
| Monorepo | Turborepo |

---

## TypeScript Configuration

### Base Configuration

Always enable strict mode. Use modern ESM modules:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true
  }
}
```

### Path Aliases

Use a single `@/` alias pointing to `src/`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Backend (Node) Settings

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"]
  }
}
```

---

## Code Style & Formatting

### Prettier Configuration

Standard configuration for all projects (`.prettierrc`):

```json
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### ESLint Configuration

Use flat config (`eslint.config.js`):

```javascript
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-else-return': 'error',
    },
  }
)
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `vector.ts`, `quality.ts` |
| Functions | camelCase, verb-first | `appendLesson`, `detectUserCorrection` |
| Types/Interfaces | PascalCase | `Lesson`, `ScoredLesson` |
| Schemas | PascalCase + Schema | `LessonSchema` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DB_PATH` |

---

## Backend Patterns

### Module Structure

Each module exports through its `index.ts`:

```typescript
// src/storage/index.ts - Public API only
export { appendLesson, readLessons, LESSONS_PATH } from './jsonl.js'
export { rebuildIndex, searchKeyword, closeDb, DB_PATH } from './sqlite.js'

// Internal files NOT exported through index.ts
```

### Database (SQLite)

Use parameterized queries, never string interpolation:

```typescript
// CORRECT - parameterized
db.prepare('SELECT * FROM lessons WHERE id = ?').get(id)

// WRONG - SQL injection risk
db.prepare(`SELECT * FROM lessons WHERE id = '${id}'`)
```

### Function Signatures

Key functions follow consistent patterns:

```typescript
// Storage: (repoRoot, data) -> Promise<void>
appendLesson(repoRoot: string, lesson: Lesson): Promise<void>

// Search: (repoRoot, query, options) -> Promise<Result[]>
searchVector(repoRoot: string, query: string, options?: SearchOptions): Promise<ScoredLesson[]>

// Detection: (input) -> DetectedResult | null
detectUserCorrection(message: string): DetectedCorrection | null
```

---

## Validation & Error Handling

### Zod Schemas

Always use **Zod** for runtime validation:

```typescript
import { z } from 'zod'

// Define schemas
export const LessonSchema = z.object({
  id: z.string(),
  type: z.enum(['quick', 'full']),
  trigger: z.string(),
  insight: z.string(),
  created: z.string().datetime(),
})

// Infer types from schemas
export type Lesson = z.infer<typeof LessonSchema>
```

### Schema Patterns

```typescript
// Omit fields for create operations
export const CreateLessonSchema = LessonSchema.omit({ id: true, created: true })

// Partial for update operations
export const UpdateLessonSchema = CreateLessonSchema.partial()

// Discriminated unions
export const LessonSchema = z.discriminatedUnion('type', [
  QuickLessonSchema,
  FullLessonSchema,
])
```

### Validation

```typescript
const validation = LessonSchema.safeParse(data)

if (!validation.success) {
  throw new Error(`Validation failed: ${validation.error.message}`)
}

const lesson = validation.data
```

### Error Handling

```typescript
// Custom error class
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Error handler
export function handleError(error: unknown): { message: string; details?: unknown } {
  if (error instanceof AppError) {
    return { message: error.message }
  }

  if (error instanceof Error) {
    console.error('Unexpected error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
    return { message: 'Internal error' }
  }

  return { message: 'Unknown error', details: error }
}
```

---

## Testing

### Framework

Use **Vitest** for all tests:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**'],
  },
})
```

### Test File Naming

- Unit tests: `*.test.ts` (colocated with implementation)
- Integration tests: `*.integration.test.ts`
- Property tests: Use fast-check within test files

### Test Patterns

```typescript
import { describe, it, expect } from 'vitest'
import { formatLesson, parseLesson } from './lesson'

describe('formatLesson', () => {
  it('formats quick lesson correctly', () => {
    const lesson = { type: 'quick', trigger: 'x', insight: 'y' }
    expect(formatLesson(lesson)).toContain('Quick')
  })

  it('handles empty insight', () => {
    const lesson = { type: 'quick', trigger: 'x', insight: '' }
    expect(formatLesson(lesson)).toBe('')
  })
})
```

### Property-Based Testing

Use **fast-check** for edge case discovery:

```typescript
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateId, parseId } from './id'

describe('id generation', () => {
  it('generates valid IDs for any input', () => {
    fc.assert(
      fc.property(fc.string(), input => {
        const id = generateId()
        expect(id).toMatch(/^L[a-f0-9]{8}$/)
      })
    )
  })

  it('roundtrips through parse', () => {
    fc.assert(
      fc.property(fc.string(), input => {
        const id = generateId()
        const parsed = parseId(id)
        expect(parsed).toBeDefined()
      })
    )
  })
})
```

---

## Import Organization

Organize imports in 3 sections, separated by blank lines:

```typescript
// 1. External packages (alphabetical)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

// 2. Internal absolute imports (@/ or relative from src)
import { closeDb, rebuildIndex } from './storage/sqlite.js'
import type { Lesson, ScoredLesson } from './types.js'

// 3. Relative imports (same module)
import { formatOutput } from './helpers.js'
```

**Rules:**
- Group by section, alphabetize within sections
- Types can be grouped with their module or in a separate type import
- Node built-ins use `node:` prefix

---

## Quick Reference

### Do

- Enable `strict: true` in TypeScript
- Use Zod for all runtime validation
- Export types alongside functions
- Write tests before implementation (TDD)
- Use parameterized SQL queries
- Keep functions under 50 lines

### Don't

- Use `any` type (use `unknown` and narrow)
- Skip error handling in async operations
- Use string interpolation in SQL
- Export internal utilities through index.ts
- Commit without running tests and lint
- Use `var` (use `const` or `let`)

### Type Safety Patterns

```typescript
// Narrow unknown types
function processData(data: unknown): Lesson {
  const result = LessonSchema.safeParse(data)
  if (!result.success) {
    throw new Error('Invalid data')
  }
  return result.data
}

// Exhaustive switch
function getLabel(type: 'quick' | 'full'): string {
  switch (type) {
    case 'quick':
      return 'Quick Lesson'
    case 'full':
      return 'Full Lesson'
    default:
      // TypeScript ensures this is never reached
      const _exhaustive: never = type
      throw new Error(`Unknown type: ${_exhaustive}`)
  }
}
```

---

## Compound Agent Specifics

This project uses these patterns:

| Pattern | Implementation |
|---------|----------------|
| Validation | Zod schemas in `src/types.ts` |
| Testing | Vitest + fast-check |
| Build | tsup (ESM output) |
| Database | better-sqlite3 with FTS5 |
| Embeddings | node-llama-cpp |

See [AGENTS.md](../../AGENTS.md) for project-specific conventions.

---

*Last updated: January 2026*
