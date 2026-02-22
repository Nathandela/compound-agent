/**
 * Shared types for knowledge SQLite storage module.
 */

/** A chunk of documentation text with metadata */
export interface KnowledgeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  contentHash: string;
  text: string;
  model?: string;
  updatedAt: string;
}

/** Options for opening the knowledge database */
export interface KnowledgeDbOptions {
  inMemory?: boolean;
}

/** A chunk with an associated relevance score */
export interface ScoredChunk {
  chunk: KnowledgeChunk;
  score: number;
}
