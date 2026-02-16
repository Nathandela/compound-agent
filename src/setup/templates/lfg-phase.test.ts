import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';

/**
 * LFG phase structural tests.
 *
 * After v1.2.6 refactor:
 * - lfg.md is a thin wrapper (< 500 chars) referencing the skill
 * - Phase gates (PHASE GATE 3, 4, FINAL GATE) live in skills, not commands
 * - Individual phase commands are also thin wrappers
 */

describe('LFG Phase Integration', () => {
  const lfgCommand = WORKFLOW_COMMANDS['lfg.md'];

  describe('lfg.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(lfgCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(lfgCommand.trimStart()).toMatch(/^---/);
      expect(lfgCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(lfgCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(lfgCommand.length).toBeLessThanOrEqual(500);
    });

    it('references all 5 phases', () => {
      const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(lfgCommand.toLowerCase()).toContain(phase);
      }
    });
  });

  describe('gates relocated to skills (not commands)', () => {
    it('PHASE GATE 3 in work skill', () => {
      expect(PHASE_SKILLS['work']).toContain('PHASE GATE 3');
    });

    it('PHASE GATE 4 in review skill', () => {
      expect(PHASE_SKILLS['review']).toContain('PHASE GATE 4');
    });

    it('FINAL GATE in compound skill', () => {
      expect(PHASE_SKILLS['compound']).toContain('FINAL GATE');
      expect(PHASE_SKILLS['compound']).toContain('ca verify-gates');
    });

    it('POST-PLAN VERIFICATION in plan skill', () => {
      expect(PHASE_SKILLS['plan']).toContain('POST-PLAN VERIFICATION');
    });
  });

  describe('skill content (detailed workflows live here)', () => {
    it('work skill contains MANDATORY VERIFICATION', () => {
      expect(PHASE_SKILLS['work']).toContain('MANDATORY VERIFICATION');
    });

    it('compound skill requires minimum 1 lesson per significant decision', () => {
      expect(PHASE_SKILLS['compound']).toContain('At minimum, capture 1 lesson');
    });

    it('compound skill contains anti-MEMORY.md guardrail', () => {
      expect(PHASE_SKILLS['compound']).toMatch(/NOT.*MEMORY\.md/i);
      expect(PHASE_SKILLS['compound']).toMatch(/\.claude\/lessons\/index\.jsonl/);
    });

    it('review skill warns against MEMORY.md', () => {
      expect(PHASE_SKILLS['review']).toMatch(/NOT.*MEMORY\.md/i);
    });

    it('work skill references npx ca search and npx ca learn', () => {
      expect(PHASE_SKILLS['work']).toContain('npx ca search');
      expect(PHASE_SKILLS['work']).toContain('npx ca learn');
    });

    it('compound skill references npx ca search and npx ca learn', () => {
      expect(PHASE_SKILLS['compound']).toContain('npx ca search');
      expect(PHASE_SKILLS['compound']).toContain('npx ca learn');
    });
  });

  describe('cross-template consistency', () => {
    it('every phase referenced in lfg.md exists as its own command in WORKFLOW_COMMANDS', () => {
      const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(
          WORKFLOW_COMMANDS[`${phase}.md`],
          `${phase}.md not found in WORKFLOW_COMMANDS`,
        ).toBeDefined();
      }
    });

    it('every phase has a corresponding skill in PHASE_SKILLS', () => {
      const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(
          PHASE_SKILLS[phase],
          `${phase} not found in PHASE_SKILLS`,
        ).toBeDefined();
      }
    });
  });
});
