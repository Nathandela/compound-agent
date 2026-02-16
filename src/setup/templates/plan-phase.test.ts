import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_TEMPLATES } from './agents.js';

/**
 * Plan phase integration tests.
 *
 * Verifies the plan.md command, plan SKILL.md, and supporting agents
 * form a complete, well-integrated plan phase per ARCHITECTURE-V2.md.
 */

describe('Plan Phase Integration', () => {
  const planCommand = WORKFLOW_COMMANDS['plan.md'];
  const planSkill = PHASE_SKILLS['plan'];
  const repoAnalyst = AGENT_TEMPLATES['repo-analyst.md'];
  const memoryAnalyst = AGENT_TEMPLATES['memory-analyst.md'];

  describe('plan.md command template', () => {
    // --- Structural requirements ---
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(planCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(planCommand.trimStart()).toMatch(/^---/);
      expect(planCommand).toContain('$ARGUMENTS');
    });

    it('has ## Workflow section', () => {
      expect(planCommand).toContain('## Workflow');
    });

    it('stays under 5000 characters', () => {
      expect(planCommand.length).toBeLessThanOrEqual(5000);
    });

    // --- Semantic enrichment (6pwy) ---
    it('references npx ca search for semantic retrieval', () => {
      expect(planCommand).toContain('npx ca search');
    });

    it('instructs reading brainstorm output if available', () => {
      expect(planCommand).toMatch(/brainstorm/i);
    });

    it('describes injecting memory items into plan context', () => {
      // The template should mention using/incorporating retrieved lessons
      expect(planCommand).toMatch(/lesson|memory item|retrieved|relevant/i);
    });

    // --- Agent team spawning (ju7p) ---
    it('references repo-analyst agent', () => {
      expect(planCommand).toMatch(/repo.analyst/i);
    });

    it('references memory-analyst agent', () => {
      expect(planCommand).toMatch(/memory.analyst/i);
    });

    it('describes spawning research agent team', () => {
      // Should mention spawning/launching agents as a team
      expect(planCommand).toMatch(/spawn|launch|start/i);
    });

    it('describes lead synthesis of research findings', () => {
      expect(planCommand).toMatch(/synthe|consolidat|combin/i);
    });

    // --- Beads task creation (mgii) ---
    it('references bd create for task creation', () => {
      expect(planCommand).toContain('bd create');
    });

    it('references bd dep add for dependency mapping', () => {
      expect(planCommand).toContain('bd dep add');
    });

    it('describes priority assignment', () => {
      expect(planCommand).toMatch(/priority/i);
    });

    it('describes acceptance criteria for tasks', () => {
      expect(planCommand).toMatch(/acceptance criteria|exit criteria|definition of done/i);
    });

    it('references dependency mapping between tasks', () => {
      expect(planCommand).toMatch(/depend/i);
    });
  });

  describe('plan SKILL.md template', () => {
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

    it('references npx ca search', () => {
      expect(planSkill).toContain('npx ca search');
    });

    it('stays under 4000 characters', () => {
      expect(planSkill.length).toBeLessThanOrEqual(4000);
    });

    // --- Plan-specific skill content ---
    it('mentions research agents in methodology', () => {
      expect(planSkill).toMatch(/repo.analyst|memory.analyst|research agent/i);
    });

    it('mentions beads task creation', () => {
      expect(planSkill).toMatch(/bd create|beads/i);
    });

    it('mentions dependency mapping', () => {
      expect(planSkill).toMatch(/depend/i);
    });
  });

  describe('supporting agent templates', () => {
    it('repo-analyst exists', () => {
      expect(repoAnalyst).toBeDefined();
    });

    it('memory-analyst exists', () => {
      expect(memoryAnalyst).toBeDefined();
    });

    it('repo-analyst has codebase exploration instructions', () => {
      expect(repoAnalyst).toMatch(/codebase|repository|structure/i);
    });

    it('memory-analyst references npx ca search', () => {
      expect(memoryAnalyst).toContain('npx ca search');
    });
  });

  describe('review and compound blocking tasks', () => {
    it('plan.md instructs creating a review blocking task', () => {
      expect(planCommand).toMatch(/review/i);
      expect(planCommand).toMatch(/bd create.*review|review.*bd create/is);
    });

    it('plan.md instructs creating a compound blocking task', () => {
      expect(planCommand).toMatch(/compound/i);
      expect(planCommand).toMatch(/bd create.*compound|compound.*bd create/is);
    });

    it('plan.md sets compound to depend on review', () => {
      // compound blocked by review (review must finish before compound starts)
      expect(planCommand).toMatch(/bd dep add.*compound.*review|compound.*depend.*review|review.*block.*compound/is);
    });

    it('plan.md sets review to depend on work tasks', () => {
      // review blocked by work tasks
      expect(planCommand).toMatch(/bd dep add.*review.*work|review.*depend.*work|work.*block.*review/is);
    });

    it('plan skill mentions review and compound as blocking tasks', () => {
      expect(planSkill).toMatch(/review.*compound|compound.*review/is);
      expect(planSkill).toMatch(/block|depend/i);
    });
  });

  describe('cross-template consistency', () => {
    it('plan command references the same agents defined in AGENT_TEMPLATES', () => {
      // If plan.md mentions repo-analyst, the agent template must exist
      if (planCommand.match(/repo.analyst/i)) {
        expect(AGENT_TEMPLATES['repo-analyst.md']).toBeDefined();
      }
      if (planCommand.match(/memory.analyst/i)) {
        expect(AGENT_TEMPLATES['memory-analyst.md']).toBeDefined();
      }
    });

    it('plan skill and plan command both reference npx ca search', () => {
      expect(planCommand).toContain('npx ca search');
      expect(planSkill).toContain('npx ca search');
    });

    it('plan skill and plan command both reference beads', () => {
      expect(planCommand).toMatch(/\bbd\b/);
      expect(planSkill).toMatch(/\bbd\b|beads/i);
    });
  });
});
