import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES } from './agents.js';

/** 6 thin subagent wrappers + 2 external reviewers = 8 total. */
const THIN_WRAPPER_FILENAMES = [
  'repo-analyst.md',
  'memory-analyst.md',
  'audit.md',
  'doc-gardener.md',
  'cct-subagent.md',
  'drift-detector.md',
];

const EXTERNAL_REVIEWER_FILENAMES = [
  'external-reviewer-gemini.md',
  'external-reviewer-codex.md',
];

const ALL_FILENAMES = [...THIN_WRAPPER_FILENAMES, ...EXTERNAL_REVIEWER_FILENAMES];

describe('AGENT_TEMPLATES', () => {
  it('has exactly 8 entries (6 thin wrappers + 2 external reviewers)', () => {
    expect(Object.keys(AGENT_TEMPLATES)).toHaveLength(8);
  });

  it('every key ends with .md', () => {
    for (const key of Object.keys(AGENT_TEMPLATES)) {
      expect(key).toMatch(/\.md$/);
    }
  });

  it('contains all 8 expected filenames', () => {
    const keys = Object.keys(AGENT_TEMPLATES);
    for (const filename of ALL_FILENAMES) {
      expect(keys, `missing ${filename}`).toContain(filename);
    }
  });

  it('every template starts with YAML frontmatter', () => {
    for (const [key, content] of Object.entries(AGENT_TEMPLATES)) {
      expect(content.trimStart().startsWith('---'), `${key} missing frontmatter`).toBe(true);
    }
  });

  it('every template has name, description, and model in frontmatter', () => {
    for (const [key, content] of Object.entries(AGENT_TEMPLATES)) {
      const frontmatter = content.split('---')[1];
      expect(frontmatter, `${key} has no frontmatter block`).toBeDefined();
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
      expect(frontmatter).toMatch(/model:/);
    }
  });

  describe('thin subagent wrappers', () => {
    for (const filename of THIN_WRAPPER_FILENAMES) {
      describe(filename, () => {
        it('references "role skill"', () => {
          expect(AGENT_TEMPLATES[filename]).toMatch(/role skill/i);
        });

        it('does NOT have a ## Instructions section (thin wrapper)', () => {
          expect(AGENT_TEMPLATES[filename]).not.toMatch(/## Instructions/);
        });

        it('stays under 500 characters', () => {
          expect(
            AGENT_TEMPLATES[filename].length,
            `${filename} is ${AGENT_TEMPLATES[filename].length} chars`,
          ).toBeLessThanOrEqual(500);
        });
      });
    }
  });

  describe('external reviewer agents', () => {
    for (const filename of EXTERNAL_REVIEWER_FILENAMES) {
      describe(filename, () => {
        it('has a ## Role section', () => {
          expect(AGENT_TEMPLATES[filename], `${filename} missing ## Role`).toContain('## Role');
        });

        it('has a ## Instructions section', () => {
          expect(AGENT_TEMPLATES[filename], `${filename} missing ## Instructions`).toContain(
            '## Instructions',
          );
        });

        it('stays under 4000 characters', () => {
          expect(
            AGENT_TEMPLATES[filename].length,
            `${filename} is ${AGENT_TEMPLATES[filename].length} chars`,
          ).toBeLessThanOrEqual(4000);
        });
      });
    }
  });
});
