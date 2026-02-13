import { RuleTester } from '@typescript-eslint/rule-tester'
import * as vitest from 'vitest'
import rule from '../rules/no-utils-helpers-dirs.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('no-utils-helpers-dirs', rule, {
  valid: [
    // Domain-specific directory names are fine
    { code: 'const x = 1', filename: '/project/src/formatting/format.ts' },
    { code: 'const x = 1', filename: '/project/src/validation/validate.ts' },

    // File named utils.ts (not a directory) is OK
    { code: 'const x = 1', filename: '/project/src/utils.ts' },
    { code: 'const x = 1', filename: '/project/src/helpers.ts' },

    // Compound names like test-utils are OK (not exact match)
    { code: 'const x = 1', filename: '/project/src/test-utils.ts' },
    { code: 'const x = 1', filename: '/project/src/test-utils/setup.ts' },

    // Deeply nested domain-specific paths
    { code: 'const x = 1', filename: '/project/src/memory/storage/sqlite/connection.ts' },

    // Paths outside src/ with banned-looking names but different context
    { code: 'const x = 1', filename: '/project/docs/shared-overview.ts' },
  ],
  invalid: [
    // utils/ directory
    {
      code: 'const x = 1',
      filename: '/project/src/utils/format.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
    // helpers/ directory
    {
      code: 'const x = 1',
      filename: '/project/src/helpers/validate.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
    // shared/ directory
    {
      code: 'const x = 1',
      filename: '/project/src/shared/types.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
    // common/ directory
    {
      code: 'const x = 1',
      filename: '/project/src/common/config.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
    // misc/ directory
    {
      code: 'const x = 1',
      filename: '/project/src/misc/stuff.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
    // Deeply nested banned directory
    {
      code: 'const x = 1',
      filename: '/project/src/memory/utils/cache.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
    // Banned directory as intermediate path segment
    {
      code: 'const x = 1',
      filename: '/project/src/helpers/sub/deep.ts',
      errors: [{ messageId: 'noUtilsHelpersDir' }],
    },
  ],
})
