/**
 * Custom ESLint plugin for compound-agent.
 *
 * Every rule error message includes remediation instructions
 * so agents know exactly what to fix (OpenAI "golden principles" pattern).
 */

import noSqlInterpolation from './rules/no-sql-interpolation.js'
import noMockModuleUnderTest from './rules/no-mock-module-under-test.js'
import noUtilsHelpersDirs from './rules/no-utils-helpers-dirs.js'
import enforceBarrelExports from './rules/enforce-barrel-exports.js'

const plugin = {
  meta: {
    name: 'eslint-plugin-compound-agent',
    version: '1.0.0',
  },
  rules: {
    'no-sql-interpolation': noSqlInterpolation,
    'no-mock-module-under-test': noMockModuleUnderTest,
    'no-utils-helpers-dirs': noUtilsHelpersDirs,
    'enforce-barrel-exports': enforceBarrelExports,
  },
}

export default plugin
