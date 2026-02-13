import path from 'node:path'

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
    const filename = context.filename || context.getFilename()

    // Only apply to test files
    const testFileMatch = path.basename(filename).match(
      /^(.+?)\.(?:test|spec)\.[jt]sx?$/
    )
    if (!testFileMatch) {
      return {}
    }

    const moduleUnderTest = testFileMatch[1]

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

        // Strip extension from mock path and extract basename
        const mockBasename = path.basename(mockPath).replace(/\.[jt]sx?$/, '')
        if (mockBasename !== moduleUnderTest) {
          return
        }

        // Check that the mock path only contains '..'/'.' traversals and the module name,
        // with no intervening directory segments (e.g., '../search' is flagged but
        // '../other-dir/search' is not since it's a different module with the same name)
        const segments = mockPath.replace(/\.[jt]sx?$/, '').split('/')
        const nonTraversalSegments = segments.filter(s => s !== '..' && s !== '.')
        if (nonTraversalSegments.length === 1) {
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
