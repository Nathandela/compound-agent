/**
 * ESLint rule: require-embedding-cleanup
 *
 * Detects files that import embedding functions from the embeddings module
 * without also importing a cleanup function (withEmbedding, unloadEmbedding,
 * or unloadEmbeddingResources).
 *
 * Matches both static `import { ... } from '...'` and dynamic
 * `const { ... } = await import('...')` patterns.
 *
 * Source-aware: only triggers on imports from embedding module paths
 * (containing 'embeddings/').
 */

/** Functions that load native memory (~150MB) */
const EMBEDDING_FUNCTIONS = new Set([
  'embedText',
  'embedTexts',
  'getEmbedding',
])

/** Functions that clean up native memory */
const CLEANUP_FUNCTIONS = new Set([
  'withEmbedding',
  'unloadEmbedding',
  'unloadEmbeddingResources',
])

/** Only flag imports from embedding module paths */
function isEmbeddingSource(source) {
  return typeof source === 'string' && source.includes('embeddings/')
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require cleanup when importing embedding functions',
      recommended: true,
    },
    messages: {
      missingCleanup:
        'Embedding memory leak: This file imports {{functionName}} which loads ~150MB of native memory, ' +
        'but does not import a cleanup function. Wrap embedding usage in withEmbedding() to guarantee cleanup. ' +
        'Example: await withEmbedding(async () => { const v = await embedText("..."); }). ' +
        'See: src/memory/embeddings/nomic.ts',
    },
    schema: [],
  },
  create(context) {
    const embeddingImports = []  // { name, node }
    let hasCleanup = false

    return {
      // Static: import { embedText } from '../memory/embeddings/index.js'
      ImportDeclaration(node) {
        const source = node.source.value
        if (!isEmbeddingSource(source)) return

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          const name = specifier.imported.name

          if (CLEANUP_FUNCTIONS.has(name)) {
            hasCleanup = true
          }
          if (EMBEDDING_FUNCTIONS.has(name)) {
            embeddingImports.push({ name, node })
          }
        }
      },

      // Dynamic: const { embedText } = await import('../memory/embeddings/nomic.js')
      VariableDeclarator(node) {
        // Match: const { ... } = await import('...')
        if (
          node.id.type !== 'ObjectPattern' ||
          !node.init
        ) return

        // Handle: await import('...')
        let importExpr = node.init
        if (importExpr.type === 'AwaitExpression') {
          importExpr = importExpr.argument
        }
        if (
          importExpr.type !== 'ImportExpression' ||
          importExpr.source.type !== 'Literal'
        ) return

        const source = importExpr.source.value
        if (!isEmbeddingSource(source)) return

        for (const prop of node.id.properties) {
          if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue
          const name = prop.key.name

          if (CLEANUP_FUNCTIONS.has(name)) {
            hasCleanup = true
          }
          if (EMBEDDING_FUNCTIONS.has(name)) {
            embeddingImports.push({ name, node: prop })
          }
        }
      },

      'Program:exit'() {
        if (hasCleanup || embeddingImports.length === 0) return

        // Report on the first embedding import node
        const first = embeddingImports[0]
        context.report({
          node: first.node,
          messageId: 'missingCleanup',
          data: { functionName: first.name },
        })
      },
    }
  },
}

export default rule
