import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';

const PHASE_FILENAMES = [
  'brainstorm.md',
  'plan.md',
  'work.md',
  'review.md',
  'compound.md',
  'lfg.md',
];

const UTILITY_FILENAMES = [
  'learn.md',
  'search.md',
  'list.md',
  'prime.md',
  'show.md',
  'wrong.md',
  'stats.md',
];

describe('WORKFLOW_COMMANDS', () => {
  it('has exactly 13 entries (6 phase + 7 utility)', () => {
    expect(Object.keys(WORKFLOW_COMMANDS)).toHaveLength(13);
  });

  it('has all expected filenames', () => {
    const expected = [...PHASE_FILENAMES, ...UTILITY_FILENAMES];
    expect(Object.keys(WORKFLOW_COMMANDS).sort()).toEqual(expected.sort());
  });

  it('every key ends with .md', () => {
    for (const key of Object.keys(WORKFLOW_COMMANDS)) {
      expect(key).toMatch(/\.md$/);
    }
  });

  describe('phase commands', () => {
    it('every phase template contains $ARGUMENTS', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing $ARGUMENTS`).toContain('$ARGUMENTS');
      }
    });

    it('every phase template has a ## Workflow section', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing ## Workflow`).toContain('## Workflow');
      }
    });

    it('every phase template references memory_search or memory_capture', () => {
      for (const key of PHASE_FILENAMES) {
        const template = WORKFLOW_COMMANDS[key];
        const hasMemory =
          template.includes('memory_search') ||
          template.includes('memory_capture');
        expect(hasMemory, `${key} missing memory integration`).toBe(true);
      }
    });

    it('every phase template except lfg references bd (beads integration)', () => {
      for (const key of PHASE_FILENAMES) {
        if (key === 'lfg.md') continue;
        expect(WORKFLOW_COMMANDS[key], `${key} missing bd reference`).toMatch(/\bbd\b/);
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

  describe('utility commands', () => {
    it('learn.md references ca learn', () => {
      expect(WORKFLOW_COMMANDS['learn.md']).toContain('ca learn');
    });

    it('search.md references ca search', () => {
      expect(WORKFLOW_COMMANDS['search.md']).toContain('ca search');
    });

    it('stats.md references ca stats', () => {
      expect(WORKFLOW_COMMANDS['stats.md']).toContain('ca stats');
    });
  });

  it('no template exceeds 5000 characters', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      expect(
        template.length,
        `${key} is ${template.length} chars (max 5000)`,
      ).toBeLessThanOrEqual(5000);
    }
  });
});
