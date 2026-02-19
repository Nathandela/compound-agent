/**
 * Shared types for SQLite storage module.
 */

/** Options for opening the database */
export interface DbOptions {
  inMemory?: boolean;
}

/** Options for sync operation */
export interface SyncOptions {
  /** Force rebuild even if mtimes match */
  force?: boolean;
}

/** Retrieval statistics for a lesson */
export interface RetrievalStat {
  /** Lesson ID */
  id: string;
  /** Number of times retrieved */
  count: number;
  /** ISO timestamp of last retrieval */
  lastRetrieved: string | null;
}

/** Internal row representation from SQLite */
export interface MemoryItemRow {
  id: string;
  type: string;
  trigger: string;
  insight: string;
  evidence: string | null;
  severity: string | null;
  tags: string;
  source: string;
  context: string;
  supersedes: string;
  related: string;
  created: string;
  confirmed: number;
  deleted: number;
  retrieval_count: number;
  last_retrieved: string | null;
  embedding: Buffer | null;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  citation_file: string | null;
  citation_line: number | null;
  citation_commit: string | null;
  compaction_level: number | null;
  compacted_at: string | null;
  pattern_bad: string | null;
  pattern_good: string | null;
}

/** Cached embedding data */
export interface CachedEmbeddingData {
  embedding: Buffer;
  contentHash: string;
}
