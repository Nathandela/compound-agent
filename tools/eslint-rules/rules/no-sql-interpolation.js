const SQL_METHODS = new Set(['prepare', 'run', 'exec', 'all', 'get'])

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow template literal interpolation in SQLite method calls',
      recommended: true,
    },
    messages: {
      noSqlInterpolation:
        "SQL injection risk: Use parameterized query with ? placeholders instead of template literal. Example: db.prepare('SELECT * FROM t WHERE id = ?').get(id). See: docs/standards/typescript-best-practices.md#database-sqlite",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // Match: <expr>.<method>(templateLiteral)
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          !SQL_METHODS.has(node.callee.property.name)
        ) {
          return
        }

        // Check first argument is a template literal with expressions
        const firstArg = node.arguments[0]
        if (
          firstArg &&
          firstArg.type === 'TemplateLiteral' &&
          firstArg.expressions.length > 0
        ) {
          context.report({
            node: firstArg,
            messageId: 'noSqlInterpolation',
          })
        }
      },
    }
  },
}

export default rule
