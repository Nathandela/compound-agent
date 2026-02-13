import { RuleTester } from '@typescript-eslint/rule-tester'
import * as vitest from 'vitest'
import rule from '../rules/enforce-barrel-exports.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('enforce-barrel-exports', rule, {
  valid: [
    // Cross-module import through barrel (index.js)
    {
      code: "import { searchKeyword } from '../memory/index.js'",
      filename: '/project/src/commands/capture.ts',
    },
    // Cross-module import through barrel (just index, no extension)
    {
      code: "import { searchKeyword } from '../memory/index'",
      filename: '/project/src/commands/capture.ts',
    },
    // Same-module internal import (both in src/memory/)
    {
      code: "import { openDb } from './connection.js'",
      filename: '/project/src/memory/storage/sqlite/search.ts',
    },
    // Same-module internal import going up within module
    {
      code: "import { MemoryItemRow } from '../types.js'",
      filename: '/project/src/memory/storage/sqlite/search.ts',
    },
    // External package imports
    {
      code: "import { z } from 'zod'",
      filename: '/project/src/commands/capture.ts',
    },
    // Node built-in imports
    {
      code: "import path from 'node:path'",
      filename: '/project/src/commands/capture.ts',
    },
    // Bare package import (no relative path)
    {
      code: "import chalk from 'chalk'",
      filename: '/project/src/commands/capture.ts',
    },
    // Importing from a directory (resolves to index)
    {
      code: "import { something } from '../memory'",
      filename: '/project/src/commands/capture.ts',
    },
    // Bare module name (extensionless single segment) is OK
    {
      code: "import { x } from '../memory'",
      filename: '/project/src/commands/capture.ts',
    },
    // Import from parent index.js
    {
      code: "import { something } from '../index.js'",
      filename: '/project/src/memory/storage/sqlite/search.ts',
    },
    // File at src/ root level (not inside a module directory)
    {
      code: "import { something } from './memory/storage/jsonl.js'",
      filename: '/project/src/index.ts',
    },
    // Cross-module barrel import with deeper path ending in index.js
    {
      code: "import { something } from '../memory/storage/index.js'",
      filename: '/project/src/commands/capture.ts',
    },
  ],
  invalid: [
    // Cross-module import to internal file
    {
      code: "import { searchKeyword } from '../memory/storage/sqlite/search.js'",
      filename: '/project/src/commands/capture.ts',
      errors: [{ messageId: 'enforceBarrelExport' }],
    },
    // Cross-module import to internal file (jsonl)
    {
      code: "import { appendLesson } from '../memory/storage/jsonl.js'",
      filename: '/project/src/commands/capture.ts',
      errors: [{ messageId: 'enforceBarrelExport' }],
    },
    // Cross-module import from setup to memory internal
    {
      code: "import { openDb } from '../memory/storage/sqlite/connection.js'",
      filename: '/project/src/setup/init.ts',
      errors: [{ messageId: 'enforceBarrelExport' }],
    },
    // Cross-module importing a types file directly
    {
      code: "import { Config } from '../setup/types.js'",
      filename: '/project/src/commands/status.ts',
      errors: [{ messageId: 'enforceBarrelExport' }],
    },
    // Extensionless deep import should be flagged
    {
      code: "import { x } from '../memory/storage/sqlite/search'",
      filename: '/project/src/commands/capture.ts',
      errors: [{ messageId: 'enforceBarrelExport' }],
    },
    // Extensionless two-segment deep import
    {
      code: "import { x } from '../memory/storage'",
      filename: '/project/src/commands/capture.ts',
      errors: [{ messageId: 'enforceBarrelExport' }],
    },
    // Multiple invalid imports in one file — each gets its own error
    {
      code: [
        "import { a } from '../memory/storage/jsonl.js'",
        "import { b } from '../memory/embeddings/model.js'",
      ].join('\n'),
      filename: '/project/src/commands/capture.ts',
      errors: [
        { messageId: 'enforceBarrelExport' },
        { messageId: 'enforceBarrelExport' },
      ],
    },
  ],
})
