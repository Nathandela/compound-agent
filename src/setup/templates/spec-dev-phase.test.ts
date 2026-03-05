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
