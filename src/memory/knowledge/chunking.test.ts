/**
 * Tests for document chunking engine.
 *
 * Written BEFORE implementation (TDD).
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  chunkContentHash,
  generateChunkId,
  SUPPORTED_EXTENSIONS,
  type Chunk,
} from './types.js';
import { chunkFile } from './chunking.js';

// ---------------------------------------------------------------------------
// Helper: build content from lines for precise line tracking
// ---------------------------------------------------------------------------

function lines(...parts: string[]): string {
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// types.ts: SUPPORTED_EXTENSIONS
// ---------------------------------------------------------------------------

describe('SUPPORTED_EXTENSIONS', () => {
  it('includes markdown extensions', () => {
    expect(SUPPORTED_EXTENSIONS.has('.md')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.rst')).toBe(true);
  });

  it('includes text extension', () => {
    expect(SUPPORTED_EXTENSIONS.has('.txt')).toBe(true);
  });

  it('includes code extensions', () => {
    for (const ext of ['.ts', '.py', '.js', '.tsx', '.jsx']) {
      expect(SUPPORTED_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  it('does not include unsupported extensions', () => {
    expect(SUPPORTED_EXTENSIONS.has('.png')).toBe(false);
    expect(SUPPORTED_EXTENSIONS.has('.exe')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// types.ts: generateChunkId
// ---------------------------------------------------------------------------

describe('generateChunkId', () => {
  it('returns a deterministic 16-char hex string', () => {
    const id = generateChunkId('file.ts', 1, 10);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(generateChunkId('file.ts', 1, 10)).toBe(id);
  });

  it('produces different IDs for different inputs', () => {
    const a = generateChunkId('file.ts', 1, 10);
    const b = generateChunkId('file.ts', 1, 11);
    const c = generateChunkId('other.ts', 1, 10);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('matches manual SHA-256 computation', () => {
    const expected = createHash('sha256')
      .update('src/foo.ts:5:20')
      .digest('hex')
      .slice(0, 16);
    expect(generateChunkId('src/foo.ts', 5, 20)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// types.ts: chunkContentHash
// ---------------------------------------------------------------------------

describe('chunkContentHash', () => {
  it('returns full SHA-256 hex digest', () => {
    const hash = chunkContentHash('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same content produces same hash', () => {
    expect(chunkContentHash('abc')).toBe(chunkContentHash('abc'));
  });

  it('different content produces different hash', () => {
    expect(chunkContentHash('abc')).not.toBe(chunkContentHash('def'));
  });
});

// ---------------------------------------------------------------------------
// chunkFile: empty and trivial cases
// ---------------------------------------------------------------------------

describe('chunkFile - edge cases', () => {
  it('returns empty array for empty file', () => {
    expect(chunkFile('empty.md', '')).toEqual([]);
  });

  it('returns empty array for whitespace-only file', () => {
    expect(chunkFile('blank.txt', '   \n\n   ')).toEqual([]);
  });

  it('returns empty array for binary content (null bytes)', () => {
    const binary = 'hello\x00world\x00\x00';
    expect(chunkFile('data.bin', binary)).toEqual([]);
  });

  it('returns single chunk for small file under targetSize', () => {
    const content = 'A small file.';
    const chunks = chunkFile('small.txt', content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(content);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
    expect(chunks[0].filePath).toBe('small.txt');
  });
});

// ---------------------------------------------------------------------------
// chunkFile: Chunk structure validation
// ---------------------------------------------------------------------------

describe('chunkFile - chunk structure', () => {
  it('populates all Chunk fields correctly', () => {
    const content = 'Line one\nLine two\nLine three';
    const chunks = chunkFile('test.txt', content);
    expect(chunks).toHaveLength(1);

    const chunk = chunks[0];
    expect(chunk.id).toBe(generateChunkId('test.txt', 1, 3));
    expect(chunk.filePath).toBe('test.txt');
    expect(chunk.startLine).toBe(1);
    expect(chunk.endLine).toBe(3);
    expect(chunk.text).toBe(content);
    expect(chunk.contentHash).toBe(chunkContentHash(content));
  });

  it('uses 1-indexed line numbers', () => {
    const content = 'first\nsecond\nthird';
    const chunks = chunkFile('file.txt', content);
    expect(chunks[0].startLine).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: markdown splitting
// ---------------------------------------------------------------------------

describe('chunkFile - markdown splitting', () => {
  it('splits on H2 headers', () => {
    const content = lines(
      '# Title',
      '',
      'Intro paragraph.',
      '',
      '## Section One',
      '',
      'Content of section one.',
      '',
      '## Section Two',
      '',
      'Content of section two.',
    );
    const chunks = chunkFile('doc.md', content, { targetSize: 40 });

    // Should produce at least 2 chunks split at H2 boundaries
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // First chunk should contain Title + Intro or Section One
    // Last chunk should contain Section Two content
    const allText = chunks.map((c) => c.text).join('');
    expect(allText).toContain('Section One');
    expect(allText).toContain('Section Two');
  });

  it('keeps code blocks intact when under targetSize', () => {
    const codeBlock = [
      '```typescript',
      'function hello() {',
      '  return "world";',
      '}',
      '```',
    ].join('\n');
    const content = lines(
      '## Section',
      '',
      'Some text.',
      '',
      codeBlock,
    );
    const chunks = chunkFile('readme.md', content, { targetSize: 500 });

    // The code block should not be split across chunks
    const chunkWithCode = chunks.find((c) => c.text.includes('```typescript'));
    expect(chunkWithCode).toBeDefined();
    expect(chunkWithCode!.text).toContain('return "world"');
    expect(chunkWithCode!.text).toContain('```');
  });

  it('splits large sections at paragraph boundaries', () => {
    // Create a markdown section with multiple paragraphs that exceed targetSize
    const para = 'A'.repeat(100);
    const content = lines(
      '## Big Section',
      '',
      para,
      '',
      para,
      '',
      para,
    );
    const chunks = chunkFile('big.md', content, { targetSize: 150 });

    // Should split into multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: code splitting
// ---------------------------------------------------------------------------

describe('chunkFile - code splitting', () => {
  it('splits TypeScript at blank lines between functions', () => {
    const content = lines(
      'function foo() {',
      '  return 1;',
      '}',
      '',
      'function bar() {',
      '  return 2;',
      '}',
      '',
      'function baz() {',
      '  return 3;',
      '}',
    );
    // Use small targetSize to force splitting
    const chunks = chunkFile('code.ts', content, { targetSize: 50 });
    expect(chunks.length).toBeGreaterThan(1);

    // All functions should be present across chunks
    const allText = chunks.map((c) => c.text).join('\n');
    expect(allText).toContain('function foo');
    expect(allText).toContain('function bar');
    expect(allText).toContain('function baz');
  });

  it('keeps function body together when under targetSize', () => {
    const content = lines(
      'function small() {',
      '  return 42;',
      '}',
    );
    const chunks = chunkFile('tiny.ts', content, { targetSize: 200 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('function small');
    expect(chunks[0].text).toContain('return 42');
  });

  it('splits Python files at blank lines', () => {
    const content = lines(
      'def hello():',
      '    return "hi"',
      '',
      'def world():',
      '    return "world"',
    );
    const chunks = chunkFile('script.py', content, { targetSize: 30 });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: text splitting
// ---------------------------------------------------------------------------

describe('chunkFile - text splitting', () => {
  it('splits plain text on paragraph boundaries (double newline)', () => {
    const para1 = 'First paragraph content.';
    const para2 = 'Second paragraph content.';
    const para3 = 'Third paragraph content.';
    const content = lines(para1, '', para2, '', para3);
    const chunks = chunkFile('notes.txt', content, { targetSize: 30 });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: overlap
// ---------------------------------------------------------------------------

describe('chunkFile - overlap', () => {
  it('creates overlap between consecutive chunks', () => {
    const para = 'X'.repeat(200);
    const content = lines(para, '', para, '', para);
    const chunks = chunkFile('overlap.txt', content, {
      targetSize: 250,
      overlapSize: 50,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The end of chunk N should overlap with the start of chunk N+1
    const endOfFirst = chunks[0]!.text.slice(-50);
    expect(chunks[1]!.text).toContain(endOfFirst.trim());
  });

  it('does not create overlap for single-chunk files', () => {
    const content = 'Short content.';
    const chunks = chunkFile('short.txt', content, {
      targetSize: 500,
      overlapSize: 50,
    });
    expect(chunks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: line tracking
// ---------------------------------------------------------------------------

describe('chunkFile - line tracking', () => {
  it('tracks correct start and end lines for multiple chunks', () => {
    const para1 = 'First paragraph.';
    const para2 = 'Second paragraph.';
    const para3 = 'Third paragraph.';
    const content = lines(para1, '', para2, '', para3);
    const chunks = chunkFile('lines.txt', content, { targetSize: 20, overlapSize: 0 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk starts at line 1
    expect(chunks[0]!.startLine).toBe(1);
    // Each chunk's endLine should be >= startLine
    for (const chunk of chunks) {
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
    // No gap in lines (except overlap) -- last chunk ends at or near total lines
    const totalLines = content.split('\n').length;
    const lastChunk = chunks[chunks.length - 1]!;
    expect(lastChunk.endLine).toBeLessThanOrEqual(totalLines);
  });

  it('endLine is inclusive (contains the last line of text)', () => {
    const content = 'line1\nline2\nline3';
    const chunks = chunkFile('three.txt', content);
    expect(chunks[0].endLine).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: default options
// ---------------------------------------------------------------------------

describe('chunkFile - default options', () => {
  it('uses targetSize=1600 and overlapSize=320 by default', () => {
    // Create content just over 1600 chars to force 2 chunks
    const section1 = 'A'.repeat(900);
    const section2 = 'B'.repeat(900);
    const content = lines(section1, '', section2);
    const chunks = chunkFile('defaults.txt', content);
    // With default targetSize of 1600, this ~1802 char content should split
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: very long single lines
// ---------------------------------------------------------------------------

describe('chunkFile - very long lines', () => {
  it('does not split mid-line', () => {
    const longLine = 'X'.repeat(3000);
    const chunks = chunkFile('long.txt', longLine, { targetSize: 500 });
    // Even though targetSize is 500, we should not split mid-line
    // The single line should remain in one chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(longLine);
  });
});

// ---------------------------------------------------------------------------
// chunkFile: content hash per chunk
// ---------------------------------------------------------------------------

describe('chunkFile - content hashes', () => {
  it('each chunk has correct contentHash', () => {
    const content = lines('Para one.', '', 'Para two.', '', 'Para three.');
    const chunks = chunkFile('hashes.txt', content, { targetSize: 15, overlapSize: 0 });

    for (const chunk of chunks) {
      expect(chunk.contentHash).toBe(chunkContentHash(chunk.text));
    }
  });
});

// ---------------------------------------------------------------------------
// chunkFile: chunk ID determinism
// ---------------------------------------------------------------------------

describe('chunkFile - deterministic IDs', () => {
  it('same input produces same chunk IDs', () => {
    const content = 'Hello world.\n\nSecond paragraph.';
    const a = chunkFile('det.txt', content, { targetSize: 20 });
    const b = chunkFile('det.txt', content, { targetSize: 20 });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});
