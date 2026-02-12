/**
 * Tests for CLI error format helpers.
 *
 * Standard format:
 *   ERROR [command] CODE: message -- remediation
 *   WARN [command] CODE: message -- suggestion
 *   INFO [command]: message
 */

import { describe, expect, it } from 'vitest';

import { formatError, formatInfo, formatWarn } from './cli-error-format.js';

describe('formatError', () => {
  it('should format with all fields', () => {
    const result = formatError('search', 'INVALID_LIMIT', 'limit must be positive', 'Use --limit with a number > 0');
    expect(result).toBe('ERROR [search] INVALID_LIMIT: limit must be positive — Use --limit with a number > 0');
  });

  it('should include command name in brackets', () => {
    const result = formatError('import', 'FILE_NOT_FOUND', 'file missing', 'Check the path');
    expect(result).toContain('[import]');
  });

  it('should use em dash separator before remediation', () => {
    const result = formatError('learn', 'BAD_INPUT', 'invalid', 'fix it');
    expect(result).toContain('— fix it');
  });
});

describe('formatWarn', () => {
  it('should format with suggestion', () => {
    const result = formatWarn('list', 'OLD_LESSONS', '3 lessons are stale', 'Run ca compact');
    expect(result).toBe('WARN [list] OLD_LESSONS: 3 lessons are stale — Run ca compact');
  });

  it('should format without suggestion', () => {
    const result = formatWarn('delete', 'ALREADY_DELETED', 'item already deleted');
    expect(result).toBe('WARN [delete] ALREADY_DELETED: item already deleted');
  });
});

describe('formatInfo', () => {
  it('should format with command and message', () => {
    const result = formatInfo('search', 'Found 5 results');
    expect(result).toBe('INFO [search]: Found 5 results');
  });
});
