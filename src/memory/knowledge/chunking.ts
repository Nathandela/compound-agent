import { extname } from 'node:path';

import {
  chunkContentHash,
  generateChunkId,
  type Chunk,
  type ChunkOptions,
} from './types.js';

const DEFAULT_TARGET_SIZE = 1600;
const DEFAULT_OVERLAP_SIZE = 320;

/** Check if content looks binary (contains null bytes). */
function isBinary(content: string): boolean {
  return content.includes('\0');
}

/**
 * Split content into logical sections based on file type.
 * Returns arrays of line groups, where each group is an array of
 * { lineNumber (1-indexed), text } objects.
 */
function splitIntoSections(
  fileLines: string[],
  ext: string,
): { lineNumber: number; text: string }[][] {
  if (ext === '.md' || ext === '.rst') {
    return splitMarkdown(fileLines);
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext)) {
    return splitCode(fileLines);
  }
  // Plain text: split on double newlines (paragraph boundaries)
  return splitParagraphs(fileLines);
}

/**
 * Split markdown into sections at H2+ headers and paragraph boundaries.
 * Keeps fenced code blocks intact.
 */
function splitMarkdown(
  fileLines: string[],
): { lineNumber: number; text: string }[][] {
  const sections: { lineNumber: number; text: string }[][] = [];
  let current: { lineNumber: number; text: string }[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];
    const lineObj = { lineNumber: i + 1, text: line };

    // Track fenced code blocks
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      current.push(lineObj);
      continue;
    }

    // Split on H2+ headers when not inside code block
    if (!inCodeBlock && /^#{2,}\s/.test(line) && current.length > 0) {
      sections.push(current);
      current = [lineObj];
      continue;
    }

    // Split on blank lines (paragraph boundary) when not in code block
    // A blank line after non-blank content marks a paragraph break
    if (
      !inCodeBlock &&
      line.trim() === '' &&
      current.length > 0 &&
      current.some((l) => l.text.trim() !== '')
    ) {
      // Include this blank line in current section, then start fresh
      current.push(lineObj);
      sections.push(current);
      current = [];
      continue;
    }

    current.push(lineObj);
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections;
}

/** Split code at blank lines between top-level definitions. */
function splitCode(
  fileLines: string[],
): { lineNumber: number; text: string }[][] {
  const sections: { lineNumber: number; text: string }[][] = [];
  let current: { lineNumber: number; text: string }[] = [];

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];
    const lineObj = { lineNumber: i + 1, text: line };

    if (line.trim() === '' && current.length > 0) {
      // Check if the previous non-blank line ended a block
      // and the next non-blank line starts a new one
      const nextNonBlank = fileLines.slice(i + 1).find((l) => l.trim() !== '');
      if (nextNonBlank !== undefined) {
        sections.push(current);
        current = [lineObj];
        continue;
      }
    }

    current.push(lineObj);
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections;
}

/** Split plain text on paragraph boundaries (blank lines). */
function splitParagraphs(
  fileLines: string[],
): { lineNumber: number; text: string }[][] {
  const sections: { lineNumber: number; text: string }[][] = [];
  let current: { lineNumber: number; text: string }[] = [];

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];
    const lineObj = { lineNumber: i + 1, text: line };

    if (line.trim() === '' && current.length > 0) {
      sections.push(current);
      current = [lineObj];
      continue;
    }

    current.push(lineObj);
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections;
}

/** Get text from a section (array of line objects). */
function sectionText(section: { text: string }[]): string {
  return section.map((l) => l.text).join('\n');
}

/**
 * Chunk a file into semantic pieces with overlap.
 *
 * @param filePath - Relative path from repo root
 * @param content - File text content
 * @param options - Chunking options (targetSize, overlapSize)
 * @returns Array of Chunk objects
 */
export function chunkFile(
  filePath: string,
  content: string,
  options?: ChunkOptions,
): Chunk[] {
  // Empty or whitespace-only
  if (content.trim() === '') return [];

  // Binary detection
  if (isBinary(content)) return [];

  const targetSize = options?.targetSize ?? DEFAULT_TARGET_SIZE;
  const overlapSize = options?.overlapSize ?? DEFAULT_OVERLAP_SIZE;

  const fileLines = content.split('\n');
  const ext = extname(filePath).toLowerCase();

  const sections = splitIntoSections(fileLines, ext);

  // Merge small sections until reaching targetSize, then emit a chunk
  const chunks: Chunk[] = [];
  let accumulated: { lineNumber: number; text: string }[] = [];
  let accumulatedLength = 0;

  function emitChunk(
    lines: { lineNumber: number; text: string }[],
    overlapLines: { lineNumber: number; text: string }[],
  ): { lineNumber: number; text: string }[] {
    if (lines.length === 0) return [];

    const allLines = [...overlapLines, ...lines];
    const text = allLines.map((l) => l.text).join('\n');
    const startLine = allLines[0].lineNumber;
    const endLine = allLines[allLines.length - 1].lineNumber;

    chunks.push({
      id: generateChunkId(filePath, startLine, endLine),
      filePath,
      startLine,
      endLine,
      text,
      contentHash: chunkContentHash(text),
    });

    // Compute overlap: take lines from the end of `lines` that fit overlapSize
    if (overlapSize <= 0) return [];
    const overlapResult: { lineNumber: number; text: string }[] = [];
    let overlapLen = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineLen = lines[i].text.length + 1; // +1 for newline
      if (overlapLen + lineLen > overlapSize && overlapResult.length > 0) break;
      overlapResult.unshift(lines[i]);
      overlapLen += lineLen;
    }
    return overlapResult;
  }

  let overlapLines: { lineNumber: number; text: string }[] = [];

  for (const section of sections) {
    const sectionLen = sectionText(section).length;

    // If adding this section exceeds targetSize and we have accumulated content, emit
    if (accumulatedLength > 0 && accumulatedLength + sectionLen > targetSize) {
      overlapLines = emitChunk(accumulated, overlapLines);
      accumulated = [];
      accumulatedLength = 0;
    }

    accumulated.push(...section);
    accumulatedLength += sectionLen;

    // If this single section alone exceeds targetSize, emit it immediately
    if (accumulatedLength > targetSize) {
      overlapLines = emitChunk(accumulated, overlapLines);
      accumulated = [];
      accumulatedLength = 0;
    }
  }

  // Emit remaining accumulated content
  if (accumulated.length > 0) {
    emitChunk(accumulated, overlapLines);
  }

  return chunks;
}
