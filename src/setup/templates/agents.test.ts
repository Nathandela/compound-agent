import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES } from './agents.js';

const EXPECTED_FILENAMES = [
  'repo-analyst.md',
  'memory-analyst.md',
  'security-reviewer.md',
  'architecture-reviewer.md',
  'performance-reviewer.md',
  'test-coverage-reviewer.md',
  'simplicity-reviewer.md',
  'context-analyzer.md',
  'lesson-extractor.md',
  'pattern-matcher.md',
  'solution-writer.md',
  'test-writer.md',
  'implementer.md',
  'compounding.md',
  'audit.md',
  'doc-gardener.md',
  'cct-subagent.md',
  'drift-detector.md',
];

describe('AGENT_TEMPLATES', () => {
  it('has exactly 18 entries', () => {
    expect(Object.keys(AGENT_TEMPLATES)).toHaveLength(18);
  });

  it('every key ends with .md', () => {
    for (const key of Object.keys(AGENT_TEMPLATES)) {
      expect(key).toMatch(/\.md$/);
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

  it('every template has a ## Role section', () => {
    for (const [key, content] of Object.entries(AGENT_TEMPLATES)) {
      expect(content, `${key} missing ## Role`).toMatch(/## Role/);
    }
  });

  it('every template has a ## Instructions section', () => {
    for (const [key, content] of Object.entries(AGENT_TEMPLATES)) {
      expect(content, `${key} missing ## Instructions`).toMatch(/## Instructions/);
    }
  });

  it('contains all 18 expected filenames', () => {
    const keys = Object.keys(AGENT_TEMPLATES);
    for (const filename of EXPECTED_FILENAMES) {
      expect(keys, `missing ${filename}`).toContain(filename);
    }
  });

  it('no template exceeds 4000 characters', () => {
    for (const [key, content] of Object.entries(AGENT_TEMPLATES)) {
      expect(content.length, `${key} is ${content.length} chars`).toBeLessThanOrEqual(4000);
    }
  });
});
