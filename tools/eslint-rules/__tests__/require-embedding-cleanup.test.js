import { RuleTester } from '@typescript-eslint/rule-tester'
import * as vitest from 'vitest'
import rule from '../rules/require-embedding-cleanup.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('require-embedding-cleanup', rule, {
  valid: [
    // Static import of embedText WITH withEmbedding
    {
      code: `import { embedText, withEmbedding } from '../memory/embeddings/index.js';`,
    },
    // Static import with unloadEmbeddingResources (cli-app backstop pattern)
    {
      code: `import { unloadEmbeddingResources } from '../memory/embeddings/index.js';`,
    },
    // Static import of searchVector WITH withEmbedding
    {
      code: `import { withEmbedding } from '../memory/embeddings/index.js';\nimport { searchVector } from '../memory/search/index.js';`,
    },
    // No embedding imports at all
    {
      code: `import { closeDb } from '../memory/storage/index.js';`,
    },
    // Dynamic import WITH withEmbedding
    {
      code: `const { embedText, withEmbedding } = await import('../memory/embeddings/nomic.js');`,
    },
    // Dynamic import with unloadEmbedding (legacy but valid cleanup)
    {
      code: `const { embedText, unloadEmbedding } = await import('../memory/embeddings/nomic.js');`,
    },
    // Re-export (no call site)
    {
      code: `export { embedText } from '../memory/embeddings/nomic.js';`,
    },
    // Unrelated dynamic import
    {
      code: `const mod = await import('../utils/helper.js');`,
    },
  ],
  invalid: [
    // Static import of embedText without cleanup
    {
      code: `import { embedText } from '../memory/embeddings/index.js';`,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // Static import of embedTexts without cleanup
    {
      code: `import { embedTexts } from '../memory/embeddings/index.js';`,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // Static import of getEmbedding without cleanup
    {
      code: `import { getEmbedding } from '../memory/embeddings/nomic.js';`,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // Static import of isModelUsable alongside embedText without cleanup
    {
      code: `import { embedText, isModelUsable } from '../memory/embeddings/index.js';`,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // Dynamic import of embedText without cleanup
    {
      code: `const { embedText } = await import('../memory/embeddings/nomic.js');`,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // Dynamic import of getEmbedding without cleanup
    {
      code: `const { getEmbedding } = await import('../memory/embeddings/index.js');`,
      errors: [{ messageId: 'missingCleanup' }],
    },
  ],
})
