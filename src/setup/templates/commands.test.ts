import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';

const EXPECTED_FILENAMES = [
  'brainstorm.md',
  'plan.md',
  'work.md',
  'review.md',
  'compound.md',
  'lfg.md',
];

describe('WORKFLOW_COMMANDS', () => {
  it('has exactly 6 entries', () => {
    expect(Object.keys(WORKFLOW_COMMANDS)).toHaveLength(6);
  });

  it('has all expected filenames', () => {
    expect(Object.keys(WORKFLOW_COMMANDS).sort()).toEqual(
      EXPECTED_FILENAMES.sort(),
    );
  });

  it('every key ends with .md', () => {
    for (const key of Object.keys(WORKFLOW_COMMANDS)) {
      expect(key).toMatch(/\.md$/);
    }
  });

  it('every template contains $ARGUMENTS', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      expect(template, `${key} missing $ARGUMENTS`).toContain('$ARGUMENTS');
    }
  });

  it('every template has a ## Workflow section', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      expect(template, `${key} missing ## Workflow`).toContain('## Workflow');
    }
  });

  it('every template references memory_search or memory_capture', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      const hasMemory =
        template.includes('memory_search') ||
        template.includes('memory_capture');
      expect(hasMemory, `${key} missing memory integration`).toBe(true);
    }
  });

  it('every template except lfg references bd (beads integration)', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      if (key === 'lfg.md') continue;
      expect(template, `${key} missing bd reference`).toMatch(/\bbd\b/);
    }
  });

  it('no template exceeds 5000 characters', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      expect(
        template.length,
        `${key} is ${template.length} chars (max 5000)`,
      ).toBeLessThanOrEqual(5000);
    }
  });

  it('lfg.md references all other phases', () => {
    const lfg = WORKFLOW_COMMANDS['lfg.md'];
    const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'];
    for (const phase of phases) {
      expect(lfg, `lfg.md missing reference to ${phase}`).toContain(phase);
    }
  });
});
