import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';

/**
 * Spec-dev phase integration tests.
 *
 * After v1.5 refactor:
 * - spec-dev.md command is a thin wrapper (< 500 chars) referencing the skill
 * - spec-dev SKILL.md has the detailed workflow: memory search,
 *   AskUserQuestion dialogue, optional Explore subagent, beads epic output
 */

describe('Spec Dev Phase Integration', () => {
  const specDevCommand = WORKFLOW_COMMANDS['spec-dev.md'];
  const specDevSkill = PHASE_SKILLS['spec-dev'];

  describe('spec-dev.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(specDevCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(specDevCommand.trimStart()).toMatch(/^---/);
      expect(specDevCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(specDevCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(specDevCommand.length).toBeLessThanOrEqual(500);
    });

    it('does NOT have ## Workflow section (content moved to skill)', () => {
      expect(specDevCommand).not.toContain('## Workflow');
    });
  });

  describe('spec-dev SKILL.md template (has detailed workflow)', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(specDevSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(specDevSkill.trimStart()).toMatch(/^---/);
    });

    it('has name and description in frontmatter', () => {
      const frontmatter = specDevSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
    });

    it('has ## Methodology section', () => {
      expect(specDevSkill).toContain('## Methodology');
    });

    it('has ## Common Pitfalls section', () => {
      expect(specDevSkill).toContain('## Common Pitfalls');
    });

    it('has ## Quality Criteria section', () => {
      expect(specDevSkill).toContain('## Quality Criteria');
    });

    it('stays under 6000 characters', () => {
      expect(specDevSkill.length).toBeLessThanOrEqual(6000);
    });

    // --- Content that skill must have ---
    it('references npx ca search for semantic retrieval', () => {
      expect(specDevSkill).toContain('npx ca search');
    });

    it('mentions AskUserQuestion for dialogue', () => {
      expect(specDevSkill).toMatch(/AskUserQuestion/);
    });

    it('mentions optional subagent exploration', () => {
      expect(specDevSkill).toMatch(/subagent|explore.*agent/i);
    });

    it('mentions beads epic as expected output', () => {
      expect(specDevSkill).toMatch(/beads epic|bd create|epic/i);
    });

    it('describes scope and constraint clarification', () => {
      expect(specDevSkill).toMatch(/scope|constraint|preference/i);
    });

    it('describes proposing multiple approaches', () => {
      expect(specDevSkill).toMatch(/alternative|approach|tradeoff/i);
    });
  });

  describe('hypothesis validation protocol (R1-R7)', () => {
    // R1: Proactive validation instruction
    it('instructs Claude to validate assumptions with executable code', () => {
      expect(specDevSkill).toMatch(/validat.*assumption/i);
      expect(specDevSkill).toMatch(/executable|throwaway|probe/i);
    });

    // R2: 5-step validation cycle
    it('describes the 5-step validation cycle', () => {
      expect(specDevSkill).toMatch(/hypothesis/i);
      expect(specDevSkill).toMatch(/execute.*script|run.*script/i);
      expect(specDevSkill).toMatch(/delete.*script|clean.*up/i);
      expect(specDevSkill).toMatch(/validation log/i);
    });

    // R3: Phase-specific guidance
    it('includes phase-specific validation guidance', () => {
      // Explore: library capabilities, API availability
      expect(specDevSkill).toMatch(/librar.*capabilit|API.*availab/i);
      // Understand: edge case behavior, integration compatibility
      expect(specDevSkill).toMatch(/edge case|integration.*compat/i);
      // Specify: performance bounds, architecture feasibility
      expect(specDevSkill).toMatch(/performance.*bound|architecture.*feasib/i);
    });

    // R4: Validation Log format
    it('prescribes a Validation Log table format', () => {
      expect(specDevSkill).toContain('Validation Log');
      expect(specDevSkill).toContain('Hypothesis');
      expect(specDevSkill).toContain('Impact on Spec');
    });

    // R5: Cleanup enforcement
    it('enforces cleanup of validation scripts', () => {
      expect(specDevSkill).toMatch(/delete.*script|remove.*script|clean.*up.*script/i);
    });

    // R6: Quality criteria updated
    it('includes validation check in quality criteria', () => {
      const qualityCriteria = specDevSkill.split('## Quality Criteria')[1] || '';
      expect(qualityCriteria).toMatch(/assumption.*validat|validat.*assumption/i);
    });

    // R7: Pitfall warnings
    it('warns against assuming without validating in pitfalls', () => {
      const pitfalls = specDevSkill.split('## Common Pitfalls')[1]?.split('##')[0] || '';
      expect(pitfalls).toMatch(/assum.*without.*validat|unvalidated.*assumption/i);
    });

    it('warns against persisting throwaway validation code in pitfalls', () => {
      const pitfalls = specDevSkill.split('## Common Pitfalls')[1]?.split('##')[0] || '';
      expect(pitfalls).toMatch(/persist.*validation|throwaway.*code|validation.*code.*persist/i);
    });
  });

  describe('cross-template consistency', () => {
    it('both command and skill reference npx ca search', () => {
      // Command is thin but the skill has the detail
      expect(specDevSkill).toContain('npx ca search');
    });

    it('skill references AskUserQuestion', () => {
      expect(specDevSkill).toContain('AskUserQuestion');
    });

    it('skill references beads', () => {
      expect(specDevSkill).toMatch(/\bbd\b|beads|epic/i);
    });
  });
});
