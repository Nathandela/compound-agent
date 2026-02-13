import { RuleTester } from '@typescript-eslint/rule-tester'
import * as vitest from 'vitest'
import rule from '../rules/no-mock-module-under-test.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('no-mock-module-under-test', rule, {
  valid: [
    // Mocking an external dependency in search.test.ts is fine
    {
      code: `vi.mock('./database')`,
      filename: '/project/src/search.test.ts',
    },
    // Mocking a node built-in
    {
      code: `vi.mock('node:fs')`,
      filename: '/project/src/search.test.ts',
    },
    // Mocking a third-party module
    {
      code: `vi.mock('better-sqlite3')`,
      filename: '/project/src/search.test.ts',
    },
    // vi.mock with unrelated relative path
    {
      code: `vi.mock('./utils')`,
      filename: '/project/src/search.test.ts',
    },
    // Not a test file (no .test. in filename)
    {
      code: `vi.mock('./search')`,
      filename: '/project/src/setup.ts',
    },
    // Non-matching module name
    {
      code: `vi.mock('./query')`,
      filename: '/project/src/search.test.ts',
    },
  ],
  invalid: [
    // Direct match: vi.mock('./search') in search.test.ts
    {
      code: `vi.mock('./search')`,
      filename: '/project/src/search.test.ts',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
    // With .js extension
    {
      code: `vi.mock('./search.js')`,
      filename: '/project/src/search.test.ts',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
    // With .ts extension
    {
      code: `vi.mock('./search.ts')`,
      filename: '/project/src/search.test.ts',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
    // Parent directory reference
    {
      code: `vi.mock('../search')`,
      filename: '/project/src/sub/search.test.ts',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
    // .test.js file
    {
      code: `vi.mock('./parser')`,
      filename: '/project/src/parser.test.js',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
    // .spec.ts file
    {
      code: `vi.mock('./handler')`,
      filename: '/project/src/handler.spec.ts',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
    // Deeper path with matching basename
    {
      code: `vi.mock('../../storage')`,
      filename: '/project/tests/unit/storage.test.ts',
      errors: [{ messageId: 'noMockModuleUnderTest' }],
    },
  ],
})
