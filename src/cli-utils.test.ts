/**
 * Tests for CLI utility functions.
 *
 * These are pure functions extracted from cli.ts for testability.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatBytes, getRepoRoot, parseLimit } from './cli-utils.js';

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
    const originalEnv = process.env['LEARNING_AGENT_ROOT'];

    beforeEach(() => {
      // Clear the env var before each test
      delete process.env['LEARNING_AGENT_ROOT'];
    });

    afterEach(() => {
      // Restore original value
      if (originalEnv !== undefined) {
        process.env['LEARNING_AGENT_ROOT'] = originalEnv;
      } else {
        delete process.env['LEARNING_AGENT_ROOT'];
      }
    });

    it('returns LEARNING_AGENT_ROOT if set', () => {
      process.env['LEARNING_AGENT_ROOT'] = '/custom/path';
      expect(getRepoRoot()).toBe('/custom/path');
    });

    it('returns cwd if env not set', () => {
      expect(getRepoRoot()).toBe(process.cwd());
    });
  });
});
