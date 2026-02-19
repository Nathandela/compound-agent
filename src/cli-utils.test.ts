/**
 * Tests for CLI utility functions.
 *
 * These are pure functions extracted from cli.ts for testability.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EPIC_ID_PATTERN,
  formatBytes,
  getRepoRoot,
  parseLimit,
  parseBdShowDeps,
  shortId,
  validateEpicId,
} from './cli-utils.js';

describe('CLI utilities', () => {
  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes under 1KB', () => {
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10.0 KB');
      expect(formatBytes(1024 * 1023)).toBe('1023.0 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
      expect(formatBytes(1024 * 1024 * 100)).toBe('100.0 MB');
    });
  });

  describe('parseLimit', () => {
    it('parses valid positive integers', () => {
      expect(parseLimit('1', 'limit')).toBe(1);
      expect(parseLimit('10', 'limit')).toBe(10);
      expect(parseLimit('100', 'limit')).toBe(100);
    });

    it('throws on negative numbers', () => {
      expect(() => parseLimit('-1', 'limit')).toThrow('Invalid limit: must be a positive integer');
      expect(() => parseLimit('-100', 'count')).toThrow('Invalid count: must be a positive integer');
    });

    it('throws on zero', () => {
      expect(() => parseLimit('0', 'limit')).toThrow('Invalid limit: must be a positive integer');
    });

    it('throws on non-numeric strings', () => {
      expect(() => parseLimit('abc', 'limit')).toThrow('Invalid limit: must be a positive integer');
      expect(() => parseLimit('', 'limit')).toThrow('Invalid limit: must be a positive integer');
    });

    it('throws on NaN', () => {
      expect(() => parseLimit('NaN', 'limit')).toThrow('Invalid limit: must be a positive integer');
    });

    it('throws on floating point numbers', () => {
      // parseInt parses "1.5" as 1, which is valid
      expect(parseLimit('1.5', 'limit')).toBe(1);
    });
  });

  describe('getRepoRoot', () => {
    const originalEnv = process.env['COMPOUND_AGENT_ROOT'];

    beforeEach(() => {
      // Clear the env var before each test
      delete process.env['COMPOUND_AGENT_ROOT'];
    });

    afterEach(() => {
      // Restore original value
      if (originalEnv !== undefined) {
        process.env['COMPOUND_AGENT_ROOT'] = originalEnv;
      } else {
        delete process.env['COMPOUND_AGENT_ROOT'];
      }
    });

    it('returns COMPOUND_AGENT_ROOT if set', () => {
      process.env['COMPOUND_AGENT_ROOT'] = '/custom/path';
      expect(getRepoRoot()).toBe('/custom/path');
    });

    it('returns cwd if env not set', () => {
      expect(getRepoRoot()).toBe(process.cwd());
    });
  });

  describe('validateEpicId', () => {
    it('accepts valid IDs', () => {
      expect(() => validateEpicId('epic1')).not.toThrow();
      expect(() => validateEpicId('my-epic')).not.toThrow();
      expect(() => validateEpicId('my_epic')).not.toThrow();
      expect(() => validateEpicId('ABC123')).not.toThrow();
    });

    it('rejects shell injection attempts', () => {
      expect(() => validateEpicId('test; rm -rf /')).toThrow('Invalid epic ID');
      expect(() => validateEpicId('$(whoami)')).toThrow('Invalid epic ID');
      expect(() => validateEpicId('test`cmd`')).toThrow('Invalid epic ID');
      expect(() => validateEpicId('id && echo pwned')).toThrow('Invalid epic ID');
    });

    it('rejects spaces', () => {
      expect(() => validateEpicId('has space')).toThrow('Invalid epic ID');
    });

    it('rejects dots', () => {
      expect(() => validateEpicId('has.dot')).toThrow('Invalid epic ID');
    });

    it('rejects empty string', () => {
      expect(() => validateEpicId('')).toThrow('Invalid epic ID');
    });

    it('EPIC_ID_PATTERN matches expected characters', () => {
      expect(EPIC_ID_PATTERN.test('abc-def_123')).toBe(true);
      expect(EPIC_ID_PATTERN.test('no spaces')).toBe(false);
    });
  });

  describe('parseBdShowDeps', () => {
    it('parses array format', () => {
      const raw = JSON.stringify([
        { id: 'x', depends_on: [{ id: 'a', title: 'T', status: 'open' }] },
      ]);
      expect(parseBdShowDeps(raw)).toEqual([{ id: 'a', title: 'T', status: 'open' }]);
    });

    it('parses object format (non-array)', () => {
      const raw = JSON.stringify({
        id: 'x',
        depends_on: [{ id: 'b', title: 'U', status: 'closed' }],
      });
      expect(parseBdShowDeps(raw)).toEqual([{ id: 'b', title: 'U', status: 'closed' }]);
    });

    it('returns empty array for empty deps', () => {
      const raw = JSON.stringify([{ id: 'x' }]);
      expect(parseBdShowDeps(raw)).toEqual([]);
    });

    it('returns empty array for null issue', () => {
      const raw = JSON.stringify([null]);
      expect(parseBdShowDeps(raw)).toEqual([]);
    });

    it('returns empty array for empty array', () => {
      const raw = JSON.stringify([]);
      expect(parseBdShowDeps(raw)).toEqual([]);
    });

    it('defaults missing fields', () => {
      const raw = JSON.stringify([{ id: 'x', depends_on: [{}] }]);
      expect(parseBdShowDeps(raw)).toEqual([{ id: '', title: '', status: 'open' }]);
    });

    it('handles dependencies key as alias for depends_on', () => {
      const raw = JSON.stringify([
        { id: 'x', dependencies: [{ id: 'c', title: 'V', status: 'in_progress' }] },
      ]);
      expect(parseBdShowDeps(raw)).toEqual([{ id: 'c', title: 'V', status: 'in_progress' }]);
    });
  });

  describe('shortId', () => {
    it('extracts last segment after hyphen', () => {
      expect(shortId('learning_agent-m001')).toBe('m001');
    });

    it('returns full ID when no hyphens', () => {
      expect(shortId('abc123')).toBe('abc123');
    });

    it('handles multiple hyphens', () => {
      expect(shortId('my-project-abc-def')).toBe('def');
    });
  });
});
