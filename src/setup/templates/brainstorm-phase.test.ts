import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';

/**
 * Brainstorm phase integration tests.
 *
 * Verifies the brainstorm.md command and brainstorm SKILL.md
 * form a complete, well-integrated brainstorm phase per ARCHITECTURE-V2.md.
 */

describe('Brainstorm Phase Integration', () => {
  const brainstormCommand = WORKFLOW_COMMANDS['brainstorm.md'];
  const brainstormSkill = PHASE_SKILLS['brainstorm'];

  describe('brainstorm.md command template', () => {
    // --- Structural requirements ---
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(brainstormCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(brainstormCommand.trimStart()).toMatch(/^---/);
      expect(brainstormCommand).toContain('$ARGUMENTS');
    });

    it('has ## Workflow section', () => {
      expect(brainstormCommand).toContain('## Workflow');
    });

    it('stays under 5000 characters', () => {
      expect(brainstormCommand.length).toBeLessThanOrEqual(5000);
    });

    // --- Memory enrichment ---
    it('references memory_search for semantic retrieval', () => {
      expect(brainstormCommand).toContain('memory_search');
    });

    it('calls memory_search before asking questions', () => {
      // memory_search should appear in workflow before AskUserQuestion
      const memIdx = brainstormCommand.indexOf('memory_search');
      const askIdx = brainstormCommand.indexOf('AskUserQuestion');
      expect(memIdx).toBeGreaterThan(-1);
      expect(askIdx).toBeGreaterThan(-1);
      expect(memIdx).toBeLessThan(askIdx);
    });

    // --- AskUserQuestion dialogue (ARCHITECTURE-V2 step 3) ---
    it('explicitly references AskUserQuestion for user dialogue', () => {
      expect(brainstormCommand).toContain('AskUserQuestion');
    });

    it('describes scope and constraint clarification', () => {
      expect(brainstormCommand).toMatch(/scope|constraint|preference/i);
    });

    // --- Optional subagent exploration (ARCHITECTURE-V2 step 4) ---
    it('mentions optional Explore subagent for codebase research', () => {
      expect(brainstormCommand).toMatch(/explore.*subagent|subagent.*explore|spawn.*explore/i);
    });

    // --- Beads epic output (ARCHITECTURE-V2 step 5) ---
    it('instructs creating a beads epic from conclusions', () => {
      expect(brainstormCommand).toMatch(/bd create.*--type=feature|beads epic/i);
    });

    it('describes output as problem definition + approach + epic', () => {
      expect(brainstormCommand).toMatch(/problem definition|clear definition/i);
      expect(brainstormCommand).toMatch(/approach/i);
    });

    it('references bd create for epic creation', () => {
      expect(brainstormCommand).toContain('bd create');
    });

    // --- Alternative exploration ---
    it('describes proposing multiple approaches', () => {
      expect(brainstormCommand).toMatch(/alternative|approach|tradeoff/i);
    });
  });

  describe('brainstorm SKILL.md template', () => {
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

    it('references memory_search', () => {
      expect(brainstormSkill).toContain('memory_search');
    });

    it('stays under 4000 characters', () => {
      expect(brainstormSkill.length).toBeLessThanOrEqual(4000);
    });

    // --- Brainstorm-specific skill content ---
    it('mentions AskUserQuestion for dialogue', () => {
      expect(brainstormSkill).toMatch(/AskUserQuestion/);
    });

    it('mentions optional subagent exploration', () => {
      expect(brainstormSkill).toMatch(/subagent|explore.*agent/i);
    });

    it('mentions beads epic as expected output', () => {
      expect(brainstormSkill).toMatch(/beads epic|bd create|epic/i);
    });
  });

  describe('cross-template consistency', () => {
    it('both command and skill reference memory_search', () => {
      expect(brainstormCommand).toContain('memory_search');
      expect(brainstormSkill).toContain('memory_search');
    });

    it('both command and skill reference AskUserQuestion', () => {
      expect(brainstormCommand).toContain('AskUserQuestion');
      expect(brainstormSkill).toContain('AskUserQuestion');
    });

    it('both command and skill reference beads', () => {
      expect(brainstormCommand).toMatch(/\bbd\b/);
      expect(brainstormSkill).toMatch(/\bbd\b|beads|epic/i);
    });
  });
});
