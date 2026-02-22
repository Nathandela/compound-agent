import { createHash } from 'node:crypto';

export interface Chunk {
  /** Unique ID: SHA-256 of filePath + startLine + endLine */
  id: string;
  /** Relative path from repo root */
  filePath: string;
  /** 1-indexed start line */
  startLine: number;
  /** 1-indexed end line (inclusive) */
  endLine: number;
  /** The chunk text content */
  text: string;
  /** SHA-256 of text content for cache invalidation */
  contentHash: string;
}

export interface ChunkOptions {
  /** Target chunk size in characters (default: 1600 ~= 400 tokens) */
  targetSize?: number;
  /** Overlap size in characters (default: 320 ~= 80 tokens) */
  overlapSize?: number;
}

/** Supported file extensions for chunking */
export const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.txt', '.rst', '.ts', '.py', '.js', '.tsx', '.jsx',
]);

/** Generate chunk ID from file path and line range */
export function generateChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha256').update(`${filePath}:${startLine}:${endLine}`).digest('hex').slice(0, 16);
}

/** Generate content hash */
export function chunkContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
