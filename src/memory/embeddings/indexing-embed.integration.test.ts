/**
 * Embedding integration tests for the knowledge indexing pipeline.
 *
 * This file exists to keep embedding-dependent tests in the singleFork pool
 * (src/memory/embeddings/**) rather than the thread pool, where native
 * llama-cpp memory causes SIGABRT during worker cleanup.
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable, unloadEmbeddingResources } from './nomic.js';
import { openKnowledgeDb, closeKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { shouldSkipEmbeddingTests } from '../../test-utils.js';
import { getUnembeddedChunkCount } from '../knowledge/embed-chunks.js';
import { indexDocs } from '../knowledge/indexing.js';

const modelAvailable = isModelAvailable();
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);

let repoRoot: string;

/** Helper: create a file in the temp repo's docs/ directory */
async function createDocFile(relativePath: string, content: string): Promise<void> {
  const fullPath = join(repoRoot, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

describe('indexDocs - embed integration', () => {
  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'knowledge-index-embed-'));
    openKnowledgeDb(repoRoot, { inMemory: true });
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repoRoot, { recursive: true, force: true });
    await unloadEmbeddingResources();
  });

  it.skipIf(skipEmbedding)('embeds chunks when embed: true and model available', async () => {
    await createDocFile('docs/guide.md', '# Guide\n\nA helpful guide with enough content to chunk.');
    await createDocFile('docs/api.md', '# API\n\nEndpoint documentation.');

    const result = await indexDocs(repoRoot, { embed: true });

    expect(result.chunksEmbedded).toBeGreaterThan(0);
    expect(getUnembeddedChunkCount(repoRoot)).toBe(0);
  });
});
