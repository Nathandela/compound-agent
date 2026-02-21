/**
 * Tests for extract-changelog.ts — changelog parsing and escaping logic.
 */

import { describe, expect, it } from 'vitest';

// Replicate the core parsing/escaping logic from extract-changelog.ts
// so we can test it without file I/O side effects.

function extractSections(changelog: string, count = 3): string[] {
  const sectionRegex = /^## \[\d+\.\d+\.\d+\]/gm;
  const matches: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(changelog)) !== null) {
    matches.push(match.index);
  }
  return matches.slice(0, count).map((start, i) => {
    const end = matches[i + 1] ?? changelog.length;
    return changelog.slice(start, end).trimEnd();
  });
}

function escapeForTemplateLiteral(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

describe('extract-changelog', () => {
  // ==========================================================================
  // Section parsing
  // ==========================================================================

  describe('section parsing', () => {
    it('extracts up to 3 most recent version sections', () => {
      const changelog = [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [1.3.0] - 2026-02-21',
        '',
        '### Added',
        '- Feature A',
        '',
        '## [1.2.0] - 2026-02-20',
        '',
        '### Fixed',
        '- Bug B',
        '',
        '## [1.1.0] - 2026-02-19',
        '',
        '### Changed',
        '- Change C',
        '',
        '## [1.0.0] - 2026-02-18',
        '',
        '### Added',
        '- Initial release',
      ].join('\n');

      const sections = extractSections(changelog);
      expect(sections).toHaveLength(3);
      expect(sections[0]).toContain('## [1.3.0]');
      expect(sections[1]).toContain('## [1.2.0]');
      expect(sections[2]).toContain('## [1.1.0]');
    });

    it('skips [Unreleased] section', () => {
      const changelog = [
        '## [Unreleased]',
        '- WIP stuff',
        '',
        '## [2.0.0] - 2026-01-01',
        '- Released',
      ].join('\n');

      const sections = extractSections(changelog);
      expect(sections).toHaveLength(1);
      expect(sections[0]).toContain('## [2.0.0]');
      expect(sections[0]).not.toContain('Unreleased');
    });

    it('includes section content up to the next version header', () => {
      const changelog = [
        '## [2.0.0] - 2026-01-01',
        '',
        '### Added',
        '- Feature X',
        '',
        '## [1.0.0] - 2025-12-01',
        '',
        '### Added',
        '- Feature Y',
      ].join('\n');

      const sections = extractSections(changelog);
      expect(sections[0]).toContain('Feature X');
      expect(sections[0]).not.toContain('Feature Y');
      expect(sections[1]).toContain('Feature Y');
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('returns empty array for changelog with no version sections', () => {
      const changelog = '# Changelog\n\nNothing here yet.\n';
      const sections = extractSections(changelog);
      expect(sections).toHaveLength(0);
    });

    it('returns 1 section when only 1 version exists', () => {
      const changelog = '## [1.0.0] - 2026-01-01\n\n- Initial\n';
      const sections = extractSections(changelog);
      expect(sections).toHaveLength(1);
      expect(sections[0]).toContain('## [1.0.0]');
    });

    it('returns 2 sections when only 2 versions exist', () => {
      const changelog = [
        '## [2.0.0] - 2026-02-01',
        '- Second',
        '',
        '## [1.0.0] - 2026-01-01',
        '- First',
      ].join('\n');

      const sections = extractSections(changelog);
      expect(sections).toHaveLength(2);
    });

    it('handles empty string', () => {
      const sections = extractSections('');
      expect(sections).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Escaping
  // ==========================================================================

  describe('escaping for template literals', () => {
    it('escapes backticks', () => {
      expect(escapeForTemplateLiteral('use `foo` here')).toBe(
        'use \\`foo\\` here'
      );
    });

    it('escapes dollar signs to prevent template interpolation', () => {
      expect(escapeForTemplateLiteral('cost is ${price}')).toBe(
        'cost is \\${price}'
      );
    });

    it('escapes backslashes', () => {
      expect(escapeForTemplateLiteral('path\\to\\file')).toBe(
        'path\\\\to\\\\file'
      );
    });

    it('escapes all special chars together', () => {
      const input = 'run `cmd` with $VAR and \\n';
      const escaped = escapeForTemplateLiteral(input);
      expect(escaped).toBe('run \\`cmd\\` with \\$VAR and \\\\n');
    });

    it('returns unchanged string when no special chars', () => {
      expect(escapeForTemplateLiteral('plain text')).toBe('plain text');
    });
  });
});
