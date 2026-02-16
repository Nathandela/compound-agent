import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_ROLE_SKILLS } from './agent-role-skills.js';

/**
 * Review phase integration tests.
 *
 * After v1.2.6 refactor:
 * - review.md command is a thin wrapper (< 500 chars) referencing the skill
 * - review SKILL.md absorbs the detailed workflow: AgentTeam spawning,
 *   inter-communication, severity classification, adaptive tiers, gates
 * - 5 reviewer agents are now AgentTeam role skills (not agent templates)
 */

describe('Review Phase Integration', () => {
  const reviewCommand = WORKFLOW_COMMANDS['review.md'];
  const reviewSkill = PHASE_SKILLS['review'];

  describe('review.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(reviewCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(reviewCommand.trimStart()).toMatch(/^---/);
      expect(reviewCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(reviewCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(reviewCommand.length).toBeLessThanOrEqual(500);
    });

    it('does NOT have ## Workflow section (content moved to skill)', () => {
      expect(reviewCommand).not.toContain('## Workflow');
    });
  });

  describe('review SKILL.md template (absorbs detailed workflow)', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(reviewSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(reviewSkill.trimStart()).toMatch(/^---/);
    });

    it('has name and description in frontmatter', () => {
      const frontmatter = reviewSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
    });

    it('has ## Methodology section', () => {
      expect(reviewSkill).toContain('## Methodology');
    });

    it('has ## Common Pitfalls section', () => {
      expect(reviewSkill).toContain('## Common Pitfalls');
    });

    it('has ## Quality Criteria section', () => {
      expect(reviewSkill).toContain('## Quality Criteria');
    });

    it('stays under 6000 characters', () => {
      expect(reviewSkill.length).toBeLessThanOrEqual(6000);
    });

    // --- Absorbed from command: AgentTeam deployment ---
    it('describes AgentTeam deployment for reviewers', () => {
      expect(reviewSkill).toMatch(/AgentTeam/);
    });

    it('references all 5 reviewer perspectives', () => {
      expect(reviewSkill).toMatch(/security/i);
      expect(reviewSkill).toMatch(/architecture/i);
      expect(reviewSkill).toMatch(/performance/i);
      expect(reviewSkill).toMatch(/test.*coverage/i);
      expect(reviewSkill).toMatch(/simplicity/i);
    });

    // --- Absorbed from command: Memory ---
    it('references npx ca search for semantic retrieval', () => {
      expect(reviewSkill).toContain('npx ca search');
    });

    it('references npx ca learn for novel findings', () => {
      expect(reviewSkill).toContain('npx ca learn');
    });

    // --- Absorbed from command: Severity classification ---
    it('describes P1/P2/P3 finding classification', () => {
      expect(reviewSkill).toMatch(/P1/);
      expect(reviewSkill).toMatch(/P2/);
      expect(reviewSkill).toMatch(/P3/);
    });

    // --- Absorbed from command: Implementation-reviewer gate ---
    it('describes implementation-reviewer as mandatory gate', () => {
      expect(reviewSkill).toMatch(/implementation.reviewer/i);
      expect(reviewSkill).toMatch(/mandatory|final.*authority|gate/i);
    });

    it('uses /implementation-reviewer slash form', () => {
      expect(reviewSkill).toMatch(/\/implementation-reviewer/);
    });

    // --- Absorbed from command: P1 -> beads ---
    it('describes creating beads issues for P1 findings', () => {
      expect(reviewSkill).toMatch(/P1.*bd|P1.*bead|P1.*issue|finding.*bd create/i);
    });

    // --- Absorbed from command: Quality gates ---
    it('references running quality gates (tests + lint)', () => {
      expect(reviewSkill).toMatch(/pnpm test|test.*suite|quality.*gate/i);
    });

    // --- Absorbed from command: Inter-communication ---
    it('describes reviewer inter-communication', () => {
      expect(reviewSkill).toMatch(
        /communicat.*reviewer|reviewer.*communicat|share.*finding|inter.communicat/i,
      );
    });

    // --- Absorbed from command: type=solution for review report ---
    it('references type=solution for storing review report', () => {
      expect(reviewSkill).toMatch(/type.*solution|type=solution/i);
    });

    // --- Absorbed from command: Adaptive tiers ---
    it('describes tiered reviewer selection based on diff size', () => {
      expect(reviewSkill).toMatch(/<100 lines/);
    });

    // --- Absorbed from command: PHASE GATE 4 ---
    it('contains PHASE GATE 4', () => {
      expect(reviewSkill).toContain('PHASE GATE 4');
      expect(reviewSkill).toMatch(/implementation-reviewer.*APPROVED|APPROVED.*implementation-reviewer/i);
    });

    // --- Anti-MEMORY.md ---
    it('warns against MEMORY.md', () => {
      expect(reviewSkill).toMatch(/NOT.*MEMORY\.md/);
    });

    // --- Beads integration ---
    it('references beads integration', () => {
      expect(reviewSkill).toMatch(/\bbd\b/);
    });

    // --- Methodology: parallel spawning ---
    it('methodology describes reviewer team spawning', () => {
      const methodologyMatch = reviewSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/spawn|launch|parallel/i);
    });

    // --- Methodology: finding consolidation ---
    it('methodology describes finding consolidation', () => {
      const methodologyMatch = reviewSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/synthesize|consolidat|collect|gather|deduplic/i);
    });
  });

  describe('reviewer role skills', () => {
    const reviewerKeys = [
      'security-reviewer',
      'architecture-reviewer',
      'performance-reviewer',
      'test-coverage-reviewer',
      'simplicity-reviewer',
    ];

    for (const key of reviewerKeys) {
      describe(`${key} role skill`, () => {
        it('exists in AGENT_ROLE_SKILLS', () => {
          expect(AGENT_ROLE_SKILLS[key]).toBeDefined();
        });

        it('has YAML frontmatter with name and description (no model)', () => {
          const content = AGENT_ROLE_SKILLS[key];
          expect(content.trimStart()).toMatch(/^---/);
          const frontmatter = content.split('---')[1];
          expect(frontmatter).toMatch(/name:/);
          expect(frontmatter).toMatch(/description:/);
          expect(frontmatter).not.toMatch(/model:/);
        });

        it('has ## Role section', () => {
          expect(AGENT_ROLE_SKILLS[key]).toContain('## Role');
        });

        it('has ## Output Format section', () => {
          expect(AGENT_ROLE_SKILLS[key]).toContain('## Output Format');
        });

        it('mentions AgentTeam deployment', () => {
          expect(AGENT_ROLE_SKILLS[key]).toMatch(/AgentTeam/);
        });

        it('mentions SendMessage for collaboration', () => {
          expect(AGENT_ROLE_SKILLS[key]).toMatch(/SendMessage/);
        });
      });
    }
  });

  describe('cross-template consistency', () => {
    it('review skill references reviewer role skills that exist', () => {
      expect(AGENT_ROLE_SKILLS['security-reviewer']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['architecture-reviewer']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['performance-reviewer']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['test-coverage-reviewer']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['simplicity-reviewer']).toBeDefined();
    });

    it('review skill references npx ca search and npx ca learn', () => {
      expect(reviewSkill).toContain('npx ca search');
      expect(reviewSkill).toContain('npx ca learn');
    });

    it('review skill references beads (bd)', () => {
      expect(reviewSkill).toMatch(/\bbd\b/);
    });
  });
});
