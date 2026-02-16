import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_ROLE_SKILLS } from './agent-role-skills.js';

/**
 * Compound phase integration tests.
 *
 * After v1.2.6 refactor:
 * - compound.md command is a thin wrapper (< 500 chars) referencing the skill
 * - compound SKILL.md absorbs the detailed workflow: AgentTeam spawning,
 *   team coordination via SendMessage, quality filters, severity rubric,
 *   type classification, supersedes/related linking, FINAL GATE
 * - 4 compound agents + compounding are now AgentTeam role skills (not agent templates)
 */

describe('Compound Phase Integration', () => {
  const compoundCommand = WORKFLOW_COMMANDS['compound.md'];
  const compoundSkill = PHASE_SKILLS['compound'];

  describe('compound.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(compoundCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(compoundCommand.trimStart()).toMatch(/^---/);
      expect(compoundCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(compoundCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(compoundCommand.length).toBeLessThanOrEqual(500);
    });

    it('does NOT have ## Workflow section (content moved to skill)', () => {
      expect(compoundCommand).not.toContain('## Workflow');
    });
  });

  describe('compound SKILL.md template (absorbs detailed workflow)', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(compoundSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(compoundSkill.trimStart()).toMatch(/^---/);
    });

    it('has name and description in frontmatter', () => {
      const frontmatter = compoundSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
    });

    it('has ## Methodology section', () => {
      expect(compoundSkill).toContain('## Methodology');
    });

    it('has ## Common Pitfalls section', () => {
      expect(compoundSkill).toContain('## Common Pitfalls');
    });

    it('has ## Quality Criteria section', () => {
      expect(compoundSkill).toContain('## Quality Criteria');
    });

    it('stays under 6000 characters', () => {
      expect(compoundSkill.length).toBeLessThanOrEqual(6000);
    });

    // --- Absorbed from command: AgentTeam deployment ---
    it('describes AgentTeam deployment', () => {
      expect(compoundSkill).toMatch(/AgentTeam/);
    });

    it('describes SendMessage for team coordination', () => {
      expect(compoundSkill).toMatch(/SendMessage/);
    });

    it('references all 4 compound agent roles', () => {
      expect(compoundSkill).toMatch(/context.analyzer/i);
      expect(compoundSkill).toMatch(/lesson.extractor/i);
      expect(compoundSkill).toMatch(/pattern.matcher/i);
      expect(compoundSkill).toMatch(/solution.writer/i);
    });

    it('references compounding for CCT synthesis delegation', () => {
      expect(compoundSkill).toMatch(/compounding/i);
      expect(compoundSkill).toMatch(/cct-patterns\.jsonl|synthesis|synthesize/i);
    });

    // --- Absorbed from command: Memory ---
    it('references npx ca search for semantic retrieval', () => {
      expect(compoundSkill).toContain('npx ca search');
    });

    it('references npx ca learn for storing items', () => {
      expect(compoundSkill).toContain('npx ca learn');
    });

    // --- Absorbed from command: Quality filter ---
    it('describes novelty check', () => {
      expect(compoundSkill).toMatch(/novel/i);
    });

    it('describes specificity check', () => {
      expect(compoundSkill).toMatch(/specific/i);
    });

    it('does NOT reference actionability gate', () => {
      expect(compoundSkill).not.toMatch(/actionab/i);
    });

    // --- Absorbed from command: Supersedes/related links ---
    it('describes setting supersedes and/or related links', () => {
      expect(compoundSkill).toMatch(/supersede|related/i);
    });

    // --- Absorbed from command: User confirmation ---
    it('describes user confirmation only for high-severity items', () => {
      expect(compoundSkill).toMatch(/confirm.*user|user.*confirm|user.*approv|approv.*user|ask.*user/i);
      expect(compoundSkill).toMatch(/high.severity|critical|important|significant/i);
    });

    // --- Absorbed from command: Beads integration ---
    it('references beads integration', () => {
      expect(compoundSkill).toMatch(/\bbd\b/);
    });

    // --- Absorbed from command: FINAL GATE ---
    it('contains FINAL GATE for epic closure', () => {
      expect(compoundSkill).toContain('FINAL GATE');
      expect(compoundSkill).toContain('ca verify-gates');
    });

    // --- Absorbed from command: Type classification ---
    it('references type classification', () => {
      expect(compoundSkill).toMatch(/type.*classif|classif.*type|classify/i);
      expect(compoundSkill).toMatch(/lesson/i);
      expect(compoundSkill).toMatch(/solution/i);
      expect(compoundSkill).toMatch(/pattern/i);
      expect(compoundSkill).toMatch(/preference/i);
    });

    // --- Absorbed from command: Severity rubric ---
    it('contains severity rubric', () => {
      expect(compoundSkill).toMatch(/high/i);
      expect(compoundSkill).toMatch(/medium/i);
      expect(compoundSkill).toMatch(/low/i);
    });

    // --- Anti-MEMORY.md ---
    it('warns against MEMORY.md', () => {
      expect(compoundSkill).toMatch(/NOT.*MEMORY\.md/);
    });

    // --- Methodology: parallel agent spawning ---
    it('methodology describes parallel agent spawning', () => {
      const methodologyMatch = compoundSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/spawn|launch|parallel/i);
    });

    // --- Methodology: quality filter before storage ---
    it('methodology describes quality filter BEFORE storage', () => {
      const methodologyMatch = compoundSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      const filterPos = methodology.search(/novel|specific|quality.*filter|filter/i);
      const capturePos = methodology.search(/npx ca learn|store|captur/i);
      expect(filterPos).toBeGreaterThan(-1);
      expect(capturePos).toBeGreaterThan(-1);
      expect(filterPos).toBeLessThan(capturePos);
    });
  });

  describe('compound agent role skills', () => {
    const compoundAgentKeys = [
      'context-analyzer',
      'lesson-extractor',
      'pattern-matcher',
      'solution-writer',
      'compounding',
    ];

    for (const key of compoundAgentKeys) {
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
      });
    }

    // --- Agent-specific content checks ---
    describe('context-analyzer specifics', () => {
      it('references git diff or git log', () => {
        expect(AGENT_ROLE_SKILLS['context-analyzer']).toMatch(/git diff|git log/i);
      });

      it('references test output or test results', () => {
        expect(AGENT_ROLE_SKILLS['context-analyzer']).toMatch(/test.*output|test.*result/i);
      });
    });

    describe('lesson-extractor specifics', () => {
      it('references corrections', () => {
        expect(AGENT_ROLE_SKILLS['lesson-extractor']).toMatch(/correction/i);
      });

      it('references mistakes', () => {
        expect(AGENT_ROLE_SKILLS['lesson-extractor']).toMatch(/mistake/i);
      });

      it('references discoveries', () => {
        expect(AGENT_ROLE_SKILLS['lesson-extractor']).toMatch(/discover/i);
      });
    });

    describe('pattern-matcher specifics', () => {
      it('references npx ca search', () => {
        expect(AGENT_ROLE_SKILLS['pattern-matcher']).toContain('npx ca search');
      });

      it('classifies as New/Duplicate/Reinforcement/Contradiction', () => {
        const pm = AGENT_ROLE_SKILLS['pattern-matcher'];
        expect(pm).toMatch(/New/);
        expect(pm).toMatch(/Duplicate/);
        expect(pm).toMatch(/Reinforcement/);
        expect(pm).toMatch(/Contradiction/);
      });
    });

    describe('solution-writer specifics', () => {
      it('references npx ca learn', () => {
        expect(AGENT_ROLE_SKILLS['solution-writer']).toContain('npx ca learn');
      });

      it('references quality filters', () => {
        expect(AGENT_ROLE_SKILLS['solution-writer']).toMatch(/quality.*filter|filter|novel|specific/i);
      });

      it('references severity assignment', () => {
        expect(AGENT_ROLE_SKILLS['solution-writer']).toMatch(/severity/i);
      });
    });
  });

  describe('cross-template consistency', () => {
    it('compound skill references role skills that exist', () => {
      expect(AGENT_ROLE_SKILLS['context-analyzer']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['lesson-extractor']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['pattern-matcher']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['solution-writer']).toBeDefined();
    });

    it('compound skill references npx ca search and npx ca learn', () => {
      expect(compoundSkill).toContain('npx ca search');
      expect(compoundSkill).toContain('npx ca learn');
    });

    it('compound skill references beads (bd)', () => {
      expect(compoundSkill).toMatch(/\bbd\b/);
    });
  });
});
