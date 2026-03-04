import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';

/**
 * Cook-it phase structural tests.
 *
 * After v1.2.8 refactor:
 * - cook-it.md is a thin wrapper (< 500 chars) that enforces reading the cook-it skill
 * - cook-it SKILL.md has the full orchestration: phase gates, progress, skip/resume/retry
 * - Phase gates also live in individual phase skills
 */

describe('Cook-it Phase Integration', () => {
  const cookitCommand = WORKFLOW_COMMANDS['cook-it.md'];
  const cookitSkill = PHASE_SKILLS['cook-it'];

  describe('cook-it.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(cookitCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(cookitCommand.trimStart()).toMatch(/^---/);
      expect(cookitCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(cookitCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(cookitCommand.length).toBeLessThanOrEqual(500);
    });

    it('enforces reading the cook-it skill file first', () => {
      expect(cookitCommand).toContain('.claude/skills/compound/cook-it/SKILL.md');
      expect(cookitCommand).toMatch(/MANDATORY.*Read tool/i);
    });
  });

  describe('cook-it SKILL.md (orchestration logic)', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(cookitSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(cookitSkill.trimStart()).toMatch(/^---/);
    });

    it('lists all 5 phase skill file paths', () => {
      const phases = ['spec-dev', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(cookitSkill).toContain(`.claude/skills/compound/${phase}/SKILL.md`);
      }
    });

    it('contains phase gates', () => {
      expect(cookitSkill).toContain('GATE 3');
      expect(cookitSkill).toContain('GATE 4');
      expect(cookitSkill).toContain('FINAL GATE');
    });

    it('contains phase execution protocol with progress announcements', () => {
      expect(cookitSkill).toMatch(/\[Phase N\/5\]/);
    });

    it('uses phase-check state machine commands', () => {
      expect(cookitSkill).toContain('phase-check init');
      expect(cookitSkill).toContain('phase-check start');
      expect(cookitSkill).toContain('phase-check gate post-plan');
      expect(cookitSkill).toContain('phase-check gate gate-3');
      expect(cookitSkill).toContain('phase-check gate gate-4');
      expect(cookitSkill).toContain('phase-check gate final');
    });

    it('contains phase control (skip/resume/retry)', () => {
      expect(cookitSkill).toMatch(/skip/i);
      expect(cookitSkill).toMatch(/resume/i);
      expect(cookitSkill).toMatch(/retry/i);
    });

    it('contains stop conditions', () => {
      expect(cookitSkill).toContain('Stop Conditions');
    });

    it('contains session close protocol', () => {
      expect(cookitSkill).toContain('SESSION CLOSE');
      expect(cookitSkill).toContain('phase-clean');
    });

    it('references verify-gates', () => {
      expect(cookitSkill).toContain('verify-gates');
    });

    it('stays under 6000 characters', () => {
      expect(cookitSkill.length).toBeLessThanOrEqual(6000);
    });
  });

  describe('gates in individual phase skills', () => {
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
    it('every phase referenced in cook-it skill exists as its own command', () => {
      const phases = ['spec-dev', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(
          WORKFLOW_COMMANDS[`${phase}.md`],
          `${phase}.md not found in WORKFLOW_COMMANDS`,
        ).toBeDefined();
      }
    });

    it('every phase has a corresponding skill in PHASE_SKILLS', () => {
      const phases = ['spec-dev', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(
          PHASE_SKILLS[phase],
          `${phase} not found in PHASE_SKILLS`,
        ).toBeDefined();
      }
    });

    it('cook-it has its own skill in PHASE_SKILLS', () => {
      expect(PHASE_SKILLS['cook-it']).toBeDefined();
    });
  });
});
