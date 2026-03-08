import path from 'node:path'

const TRIVIAL_MATCHERS = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy'])

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when a trivial assertion (toBeDefined, toBeTruthy, toBeFalsy) is the only expect() in a test case',
      recommended: true,
    },
    messages: {
      soloTrivialAssertion:
        'Solo trivial assertion — consider adding a specific assertion (toBe, toEqual, toMatch, etc.)',
    },
    schema: [],
  },
  create(context) {
    const filename = path.basename(context.filename || context.getFilename())

    // Only apply to test files
    if (!filename.match(/\.(?:test|spec)\.[jt]sx?$/)) {
      return {}
    }

    return {
      // Visit it() and test() calls
      CallExpression(node) {
        if (!isTestCall(node)) return

        const body = getTestBody(node)
        if (!body) return

        const expectCalls = collectExpectCalls(body.body)

        // Only warn if there's exactly one expect() and it uses a trivial matcher
        if (expectCalls.length === 1 && isTrivialAssertion(expectCalls[0])) {
          context.report({
            node: expectCalls[0],
            messageId: 'soloTrivialAssertion',
          })
        }
      },
    }
  },
}

/** Check if a CallExpression is it() or test() */
function isTestCall(node) {
  return (
    node.callee.type === 'Identifier' &&
    (node.callee.name === 'it' || node.callee.name === 'test')
  )
}

/** Get the BlockStatement body from a test callback (2nd argument) */
function getTestBody(node) {
  const callback = node.arguments[1]
  if (!callback) return null

  if (
    (callback.type === 'ArrowFunctionExpression' ||
      callback.type === 'FunctionExpression') &&
    callback.body.type === 'BlockStatement'
  ) {
    return callback.body
  }
  return null
}

/**
 * Collect expect().matcher() CallExpression nodes from a list of statements.
 * Only inspects direct statements (not nested blocks) since expect calls
 * in test bodies are top-level expressions.
 */
function collectExpectCalls(statements) {
  const results = []
  for (const stmt of statements) {
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression.type === 'CallExpression' &&
      isExpectChain(stmt.expression)
    ) {
      results.push(stmt.expression)
    }
  }
  return results
}

/** Check if a CallExpression is expect(...).<matcher>() */
function isExpectChain(node) {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  const obj = callee.object
  // expect(...)
  if (obj.type === 'CallExpression' && obj.callee.type === 'Identifier' && obj.callee.name === 'expect') {
    return true
  }
  return false
}

/** Check if a CallExpression like expect(x).toBeDefined() uses a trivial matcher */
function isTrivialAssertion(node) {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  const prop = callee.property
  if (prop.type !== 'Identifier') return false
  return TRIVIAL_MATCHERS.has(prop.name)
}

export default rule
