import { describe, it, expect } from 'vitest';
import { EXTERNAL_AGENT_TEMPLATES } from './agents-external.js';

const EXPECTED_FILENAMES = [
  'external-reviewer-gemini.md',
  'external-reviewer-codex.md',
];

describe('EXTERNAL_AGENT_TEMPLATES', () => {
  it('has exactly 2 entries', () => {
    expect(Object.keys(EXTERNAL_AGENT_TEMPLATES)).toHaveLength(2);
  });

  it('contains all expected filenames', () => {
    const keys = Object.keys(EXTERNAL_AGENT_TEMPLATES);
    for (const filename of EXPECTED_FILENAMES) {
      expect(keys, `missing ${filename}`).toContain(filename);
    }
  });

  it('every key ends with .md', () => {
    for (const key of Object.keys(EXTERNAL_AGENT_TEMPLATES)) {
      expect(key).toMatch(/\.md$/);
    }
  });

  it('every template starts with YAML frontmatter', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      expect(content.trimStart().startsWith('---'), `${key} missing frontmatter`).toBe(true);
    }
  });

  it('every template has name, description, and model in frontmatter', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      const frontmatter = content.split('---')[1];
      expect(frontmatter, `${key} has no frontmatter block`).toBeDefined();
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
      expect(frontmatter).toMatch(/model:/);
    }
  });

  it('every template has ## Role and ## Instructions sections', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      expect(content, `${key} missing ## Role`).toMatch(/## Role/);
      expect(content, `${key} missing ## Instructions`).toMatch(/## Instructions/);
    }
  });

  it('gemini template references gemini CLI and headless flags', () => {
    const template = EXTERNAL_AGENT_TEMPLATES['external-reviewer-gemini.md'];
    expect(template).toContain('gemini');
    expect(template).toContain('--output-format json');
    expect(template).toContain('-p');
  });

  it('codex template references codex CLI and exec mode', () => {
    const template = EXTERNAL_AGENT_TEMPLATES['external-reviewer-codex.md'];
    expect(template).toContain('codex');
    expect(template).toContain('exec');
  });

  it('both templates reference bd show for beads context', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      expect(content, `${key} missing bd show reference`).toContain('bd show');
    }
  });

  it('both templates reference git diff', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      expect(content, `${key} missing git diff reference`).toContain('git diff');
    }
  });

  it('both templates handle tool-not-installed gracefully', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      expect(content, `${key} missing availability check`).toContain('command -v');
    }
  });

  it('no template exceeds 4000 characters', () => {
    for (const [key, content] of Object.entries(EXTERNAL_AGENT_TEMPLATES)) {
      expect(content.length, `${key} is ${content.length} chars`).toBeLessThanOrEqual(4000);
    }
  });
});
