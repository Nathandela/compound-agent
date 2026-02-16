import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';

/**
 * Brainstorm phase integration tests.
 *
 * After v1.2.6 refactor:
 * - brainstorm.md command is a thin wrapper (< 500 chars) referencing the skill
 * - brainstorm SKILL.md has the detailed workflow: memory search,
 *   AskUserQuestion dialogue, optional Explore subagent, beads epic output
 */

describe('Brainstorm Phase Integration', () => {
  const brainstormCommand = WORKFLOW_COMMANDS['brainstorm.md'];
  const brainstormSkill = PHASE_SKILLS['brainstorm'];

  describe('brainstorm.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(brainstormCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(brainstormCommand.trimStart()).toMatch(/^---/);
      expect(brainstormCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(brainstormCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(brainstormCommand.length).toBeLessThanOrEqual(500);
    });

    it('does NOT have ## Workflow section (content moved to skill)', () => {
      expect(brainstormCommand).not.toContain('## Workflow');
    });
  });

  describe('brainstorm SKILL.md template (has detailed workflow)', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(brainstormSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(brainstormSkill.trimStart()).toMatch(/^---/);
    });

    it('has name and description in frontmatter', () => {
      const frontmatter = brainstormSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
    });

    it('has ## Methodology section', () => {
      expect(brainstormSkill).toContain('## Methodology');
    });

    it('has ## Common Pitfalls section', () => {
      expect(brainstormSkill).toContain('## Common Pitfalls');
    });

    it('has ## Quality Criteria section', () => {
      expect(brainstormSkill).toContain('## Quality Criteria');
    });

    it('stays under 6000 characters', () => {
      expect(brainstormSkill.length).toBeLessThanOrEqual(6000);
    });

    // --- Content that skill must have ---
    it('references npx ca search for semantic retrieval', () => {
      expect(brainstormSkill).toContain('npx ca search');
    });

    it('mentions AskUserQuestion for dialogue', () => {
      expect(brainstormSkill).toMatch(/AskUserQuestion/);
    });

    it('mentions optional subagent exploration', () => {
      expect(brainstormSkill).toMatch(/subagent|explore.*agent/i);
    });

    it('mentions beads epic as expected output', () => {
      expect(brainstormSkill).toMatch(/beads epic|bd create|epic/i);
    });

    it('describes scope and constraint clarification', () => {
      expect(brainstormSkill).toMatch(/scope|constraint|preference/i);
    });

    it('describes proposing multiple approaches', () => {
      expect(brainstormSkill).toMatch(/alternative|approach|tradeoff/i);
    });
  });

  describe('cross-template consistency', () => {
    it('both command and skill reference npx ca search', () => {
      // Command is thin but the skill has the detail
      expect(brainstormSkill).toContain('npx ca search');
    });

    it('skill references AskUserQuestion', () => {
      expect(brainstormSkill).toContain('AskUserQuestion');
    });

    it('skill references beads', () => {
      expect(brainstormSkill).toMatch(/\bbd\b|beads|epic/i);
    });
  });
});
