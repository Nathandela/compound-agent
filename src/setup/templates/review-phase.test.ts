import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_TEMPLATES } from './agents.js';

/**
 * Review phase integration tests.
 *
 * Verifies the review.md command, review SKILL.md, and reviewer agents
 * form a complete, well-integrated review phase with multi-agent review,
 * inter-communication, severity classification, and mandatory gate.
 */

describe('Review Phase Integration', () => {
  const reviewCommand = WORKFLOW_COMMANDS['review.md'];
  const reviewSkill = PHASE_SKILLS['review'];

  // All 5 reviewer agents
  const securityReviewer = AGENT_TEMPLATES['security-reviewer.md'];
  const architectureReviewer = AGENT_TEMPLATES['architecture-reviewer.md'];
  const performanceReviewer = AGENT_TEMPLATES['performance-reviewer.md'];
  const testCoverageReviewer = AGENT_TEMPLATES['test-coverage-reviewer.md'];
  const simplicityReviewer = AGENT_TEMPLATES['simplicity-reviewer.md'];

  describe('review.md command template', () => {
    // --- Structural requirements ---
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(reviewCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(reviewCommand.trimStart()).toMatch(/^---/);
      expect(reviewCommand).toContain('$ARGUMENTS');
    });

    it('has ## Workflow section', () => {
      expect(reviewCommand).toContain('## Workflow');
    });

    it('stays under 5000 characters', () => {
      expect(reviewCommand.length).toBeLessThanOrEqual(5000);
    });

    // --- Memory enrichment ---
    it('references memory_search for semantic retrieval', () => {
      expect(reviewCommand).toContain('memory_search');
    });

    it('references memory_capture for novel findings', () => {
      expect(reviewCommand).toContain('memory_capture');
    });

    // --- Agent team spawning ---
    it('describes spawning reviewer agent team', () => {
      expect(reviewCommand).toMatch(/spawn|launch|start/i);
      expect(reviewCommand).toMatch(/reviewer|review.*agent|agent.*review/i);
    });

    it('references all 5 reviewer perspectives', () => {
      expect(reviewCommand).toMatch(/security/i);
      expect(reviewCommand).toMatch(/architecture/i);
      expect(reviewCommand).toMatch(/performance/i);
      expect(reviewCommand).toMatch(/test.*coverage/i);
      expect(reviewCommand).toMatch(/simplicity/i);
    });

    // --- Inter-communication ---
    it('describes reviewer inter-communication', () => {
      expect(reviewCommand).toMatch(
        /communicat.*reviewer|reviewer.*communicat|share.*finding|finding.*share|direct.*message|message.*direct/i
      );
    });

    // --- Severity classification ---
    it('describes P1/P2/P3 severity classification', () => {
      expect(reviewCommand).toMatch(/P1/);
      expect(reviewCommand).toMatch(/P2/);
      expect(reviewCommand).toMatch(/P3/);
    });

    // --- Mandatory gate ---
    it('describes implementation-reviewer as mandatory gate', () => {
      expect(reviewCommand).toMatch(/implementation.reviewer/i);
      expect(reviewCommand).toMatch(/mandatory|final.*authority|gate|block/i);
    });

    // --- P1 findings -> beads ---
    it('describes creating beads issues for P1 findings', () => {
      expect(reviewCommand).toMatch(/bd create/);
      expect(reviewCommand).toMatch(/P1.*bd|P1.*bead|P1.*issue|finding.*bd|finding.*bead/i);
    });

    // --- Quality gates ---
    it('references running quality gates (tests + lint)', () => {
      expect(reviewCommand).toMatch(/pnpm test|test.*suite|quality.*gate/i);
    });

    // --- Beads lifecycle ---
    it('references beads integration', () => {
      expect(reviewCommand).toMatch(/\bbd\b/);
    });

    // --- Memory: type=solution for review report ---
    it('references type=solution for storing review report', () => {
      expect(reviewCommand).toMatch(/type.*solution|type=solution/i);
    });

    // --- Slash-form /implementation-reviewer ---
    it('uses /implementation-reviewer slash form', () => {
      expect(reviewCommand).toMatch(/\/implementation-reviewer/);
    });

    it('contains PHASE GATE 4 at end of template', () => {
      expect(reviewCommand).toContain('PHASE GATE 4');
      expect(reviewCommand).toMatch(/implementation-reviewer.*APPROVED|APPROVED.*implementation-reviewer/i);
    });
  });

  describe('review SKILL.md template', () => {
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

    it('references memory_search', () => {
      expect(reviewSkill).toContain('memory_search');
    });

    it('references memory_capture for novel findings', () => {
      expect(reviewSkill).toContain('memory_capture');
    });

    it('stays under 4000 characters', () => {
      expect(reviewSkill.length).toBeLessThanOrEqual(4000);
    });

    // --- Review-specific skill content ---
    it('describes spawning specialized reviewers in parallel', () => {
      expect(reviewSkill).toMatch(/spawn|launch|parallel/i);
      expect(reviewSkill).toMatch(/reviewer|specialized/i);
    });

    it('describes reviewer inter-communication pattern', () => {
      expect(reviewSkill).toMatch(
        /communicat.*reviewer|reviewer.*communicat|share.*finding|inter.communicat/i
      );
    });

    it('describes P1/P2/P3 finding classification', () => {
      expect(reviewSkill).toMatch(/P1/);
      expect(reviewSkill).toMatch(/P2/);
      expect(reviewSkill).toMatch(/P3/);
    });

    it('describes implementation-reviewer as mandatory gate', () => {
      expect(reviewSkill).toMatch(/implementation.reviewer/i);
      expect(reviewSkill).toMatch(/mandatory|final.*authority|gate/i);
    });

    it('describes P1 findings creating beads issues', () => {
      expect(reviewSkill).toMatch(/P1.*bd|P1.*bead|P1.*issue|finding.*bd create/i);
    });

    // --- Memory: type=solution for review report ---
    it('references type=solution for storing review report', () => {
      expect(reviewSkill).toMatch(/type.*solution|type=solution/i);
    });

    // --- Slash-form /implementation-reviewer ---
    it('uses /implementation-reviewer slash form', () => {
      expect(reviewSkill).toMatch(/\/implementation-reviewer/);
    });
  });

  describe('reviewer agent templates', () => {
    const reviewerAgents = [
      { key: 'security-reviewer.md', ref: securityReviewer, name: 'security' },
      { key: 'architecture-reviewer.md', ref: architectureReviewer, name: 'architecture' },
      { key: 'performance-reviewer.md', ref: performanceReviewer, name: 'performance' },
      { key: 'test-coverage-reviewer.md', ref: testCoverageReviewer, name: 'test-coverage' },
      { key: 'simplicity-reviewer.md', ref: simplicityReviewer, name: 'simplicity' },
    ];

    for (const { key, ref, name } of reviewerAgents) {
      describe(`${key}`, () => {
        it('exists in AGENT_TEMPLATES', () => {
          expect(ref).toBeDefined();
        });

        it('has proper YAML frontmatter with name, description, model', () => {
          expect(ref.trimStart()).toMatch(/^---/);
          const frontmatter = ref.split('---')[1];
          expect(frontmatter).toMatch(/name:/);
          expect(frontmatter).toMatch(/description:/);
          expect(frontmatter).toMatch(/model:/);
        });

        it('has a ## Role section', () => {
          expect(ref).toContain('## Role');
        });

        it('has an ## Output Format section with severity levels', () => {
          expect(ref).toContain('## Output Format');
        });

        it('stays under 4000 characters', () => {
          expect(ref.length).toBeLessThanOrEqual(4000);
        });
      });
    }

    it('each reviewer agent contains collaboration/communication instructions', () => {
      const reviewerAgentsList = [
        securityReviewer,
        architectureReviewer,
        performanceReviewer,
        testCoverageReviewer,
        simplicityReviewer,
      ];
      for (const agent of reviewerAgentsList) {
        expect(agent).toMatch(
          /share.*finding|communicat|direct.*message|message.*other.*reviewer|collaborate|findings.*reviewer/i
        );
      }
    });
  });

  describe('cross-template consistency', () => {
    it('review command references reviewer agents that exist in AGENT_TEMPLATES', () => {
      // All 5 reviewers should exist
      expect(AGENT_TEMPLATES['security-reviewer.md']).toBeDefined();
      expect(AGENT_TEMPLATES['architecture-reviewer.md']).toBeDefined();
      expect(AGENT_TEMPLATES['performance-reviewer.md']).toBeDefined();
      expect(AGENT_TEMPLATES['test-coverage-reviewer.md']).toBeDefined();
      expect(AGENT_TEMPLATES['simplicity-reviewer.md']).toBeDefined();
    });

    it('review skill and command both reference memory_search', () => {
      expect(reviewCommand).toContain('memory_search');
      expect(reviewSkill).toContain('memory_search');
    });

    it('review skill and command both reference memory_capture', () => {
      expect(reviewCommand).toContain('memory_capture');
      expect(reviewSkill).toContain('memory_capture');
    });

    it('review skill and command both reference beads (bd)', () => {
      expect(reviewCommand).toMatch(/\bbd\b/);
      expect(reviewSkill).toMatch(/\bbd\b|beads/i);
    });

    it('review skill and command both describe P1/P2/P3 classification', () => {
      expect(reviewCommand).toMatch(/P1/);
      expect(reviewSkill).toMatch(/P1/);
      expect(reviewCommand).toMatch(/P2/);
      expect(reviewSkill).toMatch(/P2/);
    });

    it('review skill and command both describe implementation-reviewer gate', () => {
      expect(reviewCommand).toMatch(/implementation.reviewer/i);
      expect(reviewSkill).toMatch(/implementation.reviewer/i);
    });

    it('review skill and command both use /implementation-reviewer slash form', () => {
      expect(reviewCommand).toMatch(/\/implementation-reviewer/);
      expect(reviewSkill).toMatch(/\/implementation-reviewer/);
    });

    it('review skill and command both describe inter-communication', () => {
      expect(reviewCommand).toMatch(/communicat/i);
      expect(reviewSkill).toMatch(/communicat/i);
    });

    it('review skill and command both reference quality gates', () => {
      expect(reviewCommand).toMatch(/pnpm test|test.*suite|quality.*gate/i);
      expect(reviewSkill).toMatch(/pnpm test|test.*suite|quality.*gate/i);
    });
  });

  describe('dynamic reviewer selection', () => {
    it('review.md describes tiered reviewer selection based on diff size', () => {
      expect(reviewCommand).toMatch(/small|trivial|< ?100|fewer/i);
      expect(reviewCommand).toMatch(/large|full|500|all/i);
    });

    it('review.md lists core reviewers for small diffs', () => {
      // Small diffs should use a reduced set
      expect(reviewCommand).toMatch(/security/i);
      expect(reviewCommand).toMatch(/test/i);
      expect(reviewCommand).toMatch(/simplicity/i);
    });

    it('review.md describes scaling up reviewers for larger diffs', () => {
      expect(reviewCommand).toMatch(/scale|add|additional|full.*team|all.*reviewer/i);
    });
  });

  describe('branch-contract checks', () => {
    // --- Review-specific architectural contracts ---

    it('review.md workflow describes parallel reviewer spawning', () => {
      const workflowMatch = reviewCommand.match(/## Workflow[^]*?(?=##|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];
      expect(workflow).toMatch(/spawn|launch|parallel/i);
    });

    it('review.md workflow describes finding synthesis before beads creation', () => {
      const workflowMatch = reviewCommand.match(/## Workflow[^]*?(?=##|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];
      // Synthesis/consolidation should appear in the workflow
      expect(workflow).toMatch(/synthesize|consolidat|prioritize|triage|classify/i);
    });

    it('review.md describes that P1 findings block completion', () => {
      expect(reviewCommand).toMatch(/P1.*block|block.*P1|P1.*must.*fix|critical.*block/i);
    });

    it('review SKILL.md methodology describes reviewer team spawning', () => {
      const methodologyMatch = reviewSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/spawn|launch|parallel/i);
    });

    it('review SKILL.md methodology describes finding consolidation', () => {
      const methodologyMatch = reviewSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/synthesize|consolidat|collect|gather|deduplic/i);
    });
  });
});
