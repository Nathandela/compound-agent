import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_TEMPLATES } from './agents.js';
import { AGENT_ROLE_SKILLS } from './agent-role-skills.js';

/**
 * Plan phase integration tests.
 *
 * After v1.2.6 refactor:
 * - plan.md command is a thin wrapper (< 500 chars) referencing the skill
 * - plan SKILL.md has the detailed workflow: subagent spawning for
 *   repo-analyst and memory-analyst, beads task creation, dependency mapping
 * - repo-analyst and memory-analyst are subagents (thin agent wrappers + role skills)
 */

describe('Plan Phase Integration', () => {
  const planCommand = WORKFLOW_COMMANDS['plan.md'];
  const planSkill = PHASE_SKILLS['plan'];

  describe('plan.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(planCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(planCommand.trimStart()).toMatch(/^---/);
      expect(planCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(planCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(planCommand.length).toBeLessThanOrEqual(500);
    });

    it('does NOT have ## Workflow section (content moved to skill)', () => {
      expect(planCommand).not.toContain('## Workflow');
    });
  });

  describe('plan SKILL.md template (has detailed workflow)', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(planSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(planSkill.trimStart()).toMatch(/^---/);
    });

    it('has name and description in frontmatter', () => {
      const frontmatter = planSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
    });

    it('has ## Methodology section', () => {
      expect(planSkill).toContain('## Methodology');
    });

    it('has ## Common Pitfalls section', () => {
      expect(planSkill).toContain('## Common Pitfalls');
    });

    it('has ## Quality Criteria section', () => {
      expect(planSkill).toContain('## Quality Criteria');
    });

    it('stays under 6000 characters', () => {
      expect(planSkill.length).toBeLessThanOrEqual(6000);
    });

    // --- Content that skill must have ---
    it('references npx ca search', () => {
      expect(planSkill).toContain('npx ca search');
    });

    it('references repo-analyst subagent', () => {
      expect(planSkill).toMatch(/repo.analyst/i);
    });

    it('references memory-analyst subagent', () => {
      expect(planSkill).toMatch(/memory.analyst/i);
    });

    it('describes spawning research subagents', () => {
      expect(planSkill).toMatch(/spawn|launch|start/i);
    });

    it('describes lead synthesis of research findings', () => {
      expect(planSkill).toMatch(/synthe|consolidat|combin/i);
    });

    it('references bd create for task creation', () => {
      expect(planSkill).toContain('bd create');
    });

    it('references dependency mapping', () => {
      expect(planSkill).toMatch(/depend/i);
    });

    it('describes acceptance criteria for tasks', () => {
      expect(planSkill).toMatch(/acceptance criteria|exit criteria|definition of done/i);
    });

    it('contains POST-PLAN VERIFICATION', () => {
      expect(planSkill).toContain('POST-PLAN VERIFICATION');
    });

    it('mentions review and compound as blocking tasks', () => {
      expect(planSkill).toMatch(/review.*compound|compound.*review/is);
      expect(planSkill).toMatch(/block|depend/i);
    });
  });

  describe('supporting subagents', () => {
    it('repo-analyst exists as thin agent wrapper', () => {
      expect(AGENT_TEMPLATES['repo-analyst.md']).toBeDefined();
    });

    it('memory-analyst exists as thin agent wrapper', () => {
      expect(AGENT_TEMPLATES['memory-analyst.md']).toBeDefined();
    });

    it('repo-analyst exists as role skill', () => {
      expect(AGENT_ROLE_SKILLS['repo-analyst']).toBeDefined();
    });

    it('memory-analyst exists as role skill', () => {
      expect(AGENT_ROLE_SKILLS['memory-analyst']).toBeDefined();
    });

    it('repo-analyst role skill has codebase exploration instructions', () => {
      expect(AGENT_ROLE_SKILLS['repo-analyst']).toMatch(/codebase|repository|structure/i);
    });

    it('memory-analyst role skill references npx ca search', () => {
      expect(AGENT_ROLE_SKILLS['memory-analyst']).toContain('npx ca search');
    });
  });

  describe('cross-template consistency', () => {
    it('plan skill references npx ca search', () => {
      expect(planSkill).toContain('npx ca search');
    });

    it('plan skill references beads (bd)', () => {
      expect(planSkill).toMatch(/\bbd\b|beads/i);
    });

    it('plan skill and agents reference same subagents', () => {
      expect(AGENT_TEMPLATES['repo-analyst.md']).toBeDefined();
      expect(AGENT_TEMPLATES['memory-analyst.md']).toBeDefined();
    });
  });
});
