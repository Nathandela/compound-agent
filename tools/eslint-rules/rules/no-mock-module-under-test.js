import path from 'node:path'

/** Strip .js/.ts/.jsx/.tsx extension from a path */
function stripExt(p) {
  return p.replace(/\.[jt]sx?$/, '')
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow vi.mock() of the module being tested',
      recommended: true,
    },
    messages: {
      noMockModuleUnderTest:
        'Do not mock the module being tested \u2014 test real behavior. Mock only external dependencies (network, filesystem, third-party). See: docs/standards/anti-patterns.md',
    },
    schema: [],
  },
  create(context) {
    const filename = path.normalize(context.filename || context.getFilename())

    // Only apply to test files
    const testFileMatch = path.basename(filename).match(
      /^(.+?)\.(?:test|spec)\.[jt]sx?$/
    )
    if (!testFileMatch) {
      return {}
    }

    const moduleUnderTest = testFileMatch[1]
    const testDir = path.dirname(filename)
    // The expected source file is adjacent to the test file
    const expectedSource = path.resolve(testDir, moduleUnderTest)

    return {
      CallExpression(node) {
        // Match: vi.mock('...')
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'vi' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'mock'
        ) {
          return
        }

        const firstArg = node.arguments[0]
        if (!firstArg || firstArg.type !== 'Literal' || typeof firstArg.value !== 'string') {
          return
        }

        const mockPath = firstArg.value

        // Only check relative paths (not bare specifiers like 'better-sqlite3' or 'node:fs')
        if (!mockPath.startsWith('.')) {
          return
        }

        // Resolve mock path to absolute, strip extension, and compare
        const resolvedMock = stripExt(path.resolve(testDir, mockPath))

        if (resolvedMock === expectedSource) {
          context.report({
            node,
            messageId: 'noMockModuleUnderTest',
          })
        }
      },
    }
  },
}

export default rule
