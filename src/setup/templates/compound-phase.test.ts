import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_TEMPLATES } from './agents.js';

/**
 * Compound phase integration tests.
 *
 * Verifies the compound.md command, compound SKILL.md, and compound agents
 * (context-analyzer, lesson-extractor, pattern-matcher, solution-writer)
 * form a complete, well-integrated compound phase with multi-agent analysis,
 * team coordination, quality filters, and memory capture.
 */

describe('Compound Phase Integration', () => {
  const compoundCommand = WORKFLOW_COMMANDS['compound.md'];
  const compoundSkill = PHASE_SKILLS['compound'];

  // All 4 compound agents
  const contextAnalyzer = AGENT_TEMPLATES['context-analyzer.md'];
  const lessonExtractor = AGENT_TEMPLATES['lesson-extractor.md'];
  const patternMatcher = AGENT_TEMPLATES['pattern-matcher.md'];
  const solutionWriter = AGENT_TEMPLATES['solution-writer.md'];

  describe('compound.md command template', () => {
    // --- Structural requirements ---
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(compoundCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(compoundCommand.trimStart()).toMatch(/^---/);
      expect(compoundCommand).toContain('$ARGUMENTS');
    });

    it('has ## Workflow section', () => {
      expect(compoundCommand).toContain('## Workflow');
    });

    it('stays under 5000 characters', () => {
      expect(compoundCommand.length).toBeLessThanOrEqual(5000);
    });

    // --- Memory enrichment ---
    it('references memory_search for semantic retrieval', () => {
      expect(compoundCommand).toContain('memory_search');
    });

    it('references memory_capture for storing items', () => {
      expect(compoundCommand).toContain('memory_capture');
    });

    // --- Agent team spawning ---
    it('describes spawning analysis agent team', () => {
      expect(compoundCommand).toMatch(/spawn|launch|start/i);
      expect(compoundCommand).toMatch(/agent|team|analyst|analyzer/i);
    });

    it('references all 4 compound agent roles', () => {
      expect(compoundCommand).toMatch(/context.analyzer/i);
      expect(compoundCommand).toMatch(/lesson.extractor/i);
      expect(compoundCommand).toMatch(/pattern.matcher/i);
      expect(compoundCommand).toMatch(/solution.writer/i);
    });

    it('references compounding subagent for CCT synthesis delegation', () => {
      expect(compoundCommand).toMatch(/compounding/i);
      expect(compoundCommand).toMatch(/cct-patterns\.jsonl|synthesis|synthesize/i);
    });

    // --- Team coordination ---
    it('describes agents communicating and sharing findings', () => {
      expect(compoundCommand).toMatch(
        /communicat.*agent|agent.*communicat|share.*finding|finding.*share|direct.*message|message.*direct|pass.*result|result.*pass/i
      );
    });

    // --- Quality filter ---
    it('describes novelty check', () => {
      expect(compoundCommand).toMatch(/novel/i);
    });

    it('describes specificity check', () => {
      expect(compoundCommand).toMatch(/specific/i);
    });

    it('does NOT reference actionability gate', () => {
      // Compound phase uses novelty + specificity, NOT actionability
      expect(compoundCommand).not.toMatch(/actionab/i);
    });

    // --- Storage ---
    it('references memory_capture for storing approved items', () => {
      expect(compoundCommand).toMatch(/memory_capture/);
    });

    // --- Supersedes/related links ---
    it('describes setting supersedes and/or related links', () => {
      expect(compoundCommand).toMatch(/supersede|related/i);
    });

    // --- User confirmation ---
    it('describes user confirmation only for high-severity items', () => {
      expect(compoundCommand).toMatch(/confirm.*user|user.*confirm|user.*approv|approv.*user|ask.*user/i);
      expect(compoundCommand).toMatch(/high.severity|critical|important|significant/i);
    });

    // --- Beads integration ---
    it('references beads integration', () => {
      expect(compoundCommand).toMatch(/\bbd\b/);
    });

    it('contains FINAL GATE for epic closure', () => {
      expect(compoundCommand).toContain('FINAL GATE');
      expect(compoundCommand).toContain('ca verify-gates');
    });

    // --- Type classification ---
    it('references type classification', () => {
      expect(compoundCommand).toMatch(/type.*classif|classif.*type|classify/i);
      expect(compoundCommand).toMatch(/lesson/i);
      expect(compoundCommand).toMatch(/solution/i);
      expect(compoundCommand).toMatch(/pattern/i);
      expect(compoundCommand).toMatch(/preference/i);
    });
  });

  describe('compound SKILL.md template', () => {
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

    it('references memory_search', () => {
      expect(compoundSkill).toContain('memory_search');
    });

    it('references memory_capture', () => {
      expect(compoundSkill).toContain('memory_capture');
    });

    it('stays under 4000 characters', () => {
      expect(compoundSkill.length).toBeLessThanOrEqual(4000);
    });

    // --- Compound-specific skill content ---
    it('describes spawning analysis team', () => {
      expect(compoundSkill).toMatch(/spawn|launch|parallel/i);
      expect(compoundSkill).toMatch(/agent|team|analyst|analyzer/i);
    });

    it('references compounding subagent for CCT synthesis delegation', () => {
      expect(compoundSkill).toMatch(/compounding/i);
      expect(compoundSkill).toMatch(/cct-patterns\.jsonl|synthesis|synthesize/i);
    });

    it('describes agent communication pattern', () => {
      expect(compoundSkill).toMatch(
        /communicat.*agent|agent.*communicat|share.*finding|pass.*result|pipeline|chain/i
      );
    });

    it('describes novelty quality filter', () => {
      expect(compoundSkill).toMatch(/novel/i);
    });

    it('describes specificity quality filter', () => {
      expect(compoundSkill).toMatch(/specific/i);
    });

    it('does NOT reference actionability gate', () => {
      expect(compoundSkill).not.toMatch(/actionab/i);
    });

    it('describes supersedes/related linking', () => {
      expect(compoundSkill).toMatch(/supersede|related/i);
    });

    it('describes user confirmation for high-severity only', () => {
      expect(compoundSkill).toMatch(/confirm.*user|user.*confirm|user.*approv|ask.*user/i);
      expect(compoundSkill).toMatch(/high.severity|critical|important|significant/i);
    });

    it('references type classification', () => {
      expect(compoundSkill).toMatch(/type.*classif|classif.*type|lesson|solution|pattern|preference/i);
    });
  });

  describe('compound agent templates', () => {
    const compoundAgents = [
      { key: 'context-analyzer.md', ref: contextAnalyzer, name: 'context-analyzer' },
      { key: 'lesson-extractor.md', ref: lessonExtractor, name: 'lesson-extractor' },
      { key: 'pattern-matcher.md', ref: patternMatcher, name: 'pattern-matcher' },
      { key: 'solution-writer.md', ref: solutionWriter, name: 'solution-writer' },
    ];

    for (const { key, ref, name } of compoundAgents) {
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

        it('has an ## Output Format section', () => {
          expect(ref).toContain('## Output Format');
        });

        it('stays under 4000 characters', () => {
          expect(ref.length).toBeLessThanOrEqual(4000);
        });
      });
    }

    it('each compound agent contains collaboration/communication instructions', () => {
      const compoundAgentsList = [
        contextAnalyzer,
        lessonExtractor,
        patternMatcher,
        solutionWriter,
      ];
      for (const agent of compoundAgentsList) {
        expect(agent).toMatch(
          /share.*finding|communicat|direct.*message|message.*other.*agent|collaborate|findings.*agent|pass.*result|result.*to|pipeline/i
        );
      }
    });

    // --- Agent-specific content checks ---
    describe('context-analyzer.md specifics', () => {
      it('references git diff or git log', () => {
        expect(contextAnalyzer).toMatch(/git diff|git log/i);
      });

      it('references test output or test results', () => {
        expect(contextAnalyzer).toMatch(/test.*output|test.*result/i);
      });
    });

    describe('lesson-extractor.md specifics', () => {
      it('references corrections', () => {
        expect(lessonExtractor).toMatch(/correction/i);
      });

      it('references mistakes', () => {
        expect(lessonExtractor).toMatch(/mistake/i);
      });

      it('references discoveries', () => {
        expect(lessonExtractor).toMatch(/discover/i);
      });

      it('does NOT require actionable as hard gate', () => {
        // Should not mandate "specific and actionable" as joint requirement
        expect(lessonExtractor).not.toMatch(/specific and actionable/i);
      });

      it('uses soft language for actionability preference', () => {
        // Should say "prefer actionable" rather than mandating it
        expect(lessonExtractor).toMatch(/prefer.*actionable/i);
      });
    });

    describe('pattern-matcher.md specifics', () => {
      it('references memory_search', () => {
        expect(patternMatcher).toContain('memory_search');
      });

      it('classifies as New/Duplicate/Reinforcement/Contradiction', () => {
        expect(patternMatcher).toMatch(/New/);
        expect(patternMatcher).toMatch(/Duplicate/);
        expect(patternMatcher).toMatch(/Reinforcement/);
        expect(patternMatcher).toMatch(/Contradiction/);
      });
    });

    describe('solution-writer.md specifics', () => {
      it('references memory_capture', () => {
        expect(solutionWriter).toContain('memory_capture');
      });

      it('references quality filters', () => {
        expect(solutionWriter).toMatch(/quality.*filter|filter|novel|specific/i);
      });

      it('references severity assignment', () => {
        expect(solutionWriter).toMatch(/severity/i);
      });
    });
  });

  describe('severity rubric', () => {
    it('compound command contains severity rubric', () => {
      expect(compoundCommand).toMatch(/high/i);
      expect(compoundCommand).toMatch(/medium/i);
      expect(compoundCommand).toMatch(/low/i);
    });

    it('compound skill references severity classification', () => {
      expect(compoundSkill).toMatch(/severity|high.*medium.*low|classify/i);
    });
  });

  describe('cross-template consistency', () => {
    it('command references agents that exist in AGENT_TEMPLATES (all 4 compound agents)', () => {
      expect(AGENT_TEMPLATES['context-analyzer.md']).toBeDefined();
      expect(AGENT_TEMPLATES['lesson-extractor.md']).toBeDefined();
      expect(AGENT_TEMPLATES['pattern-matcher.md']).toBeDefined();
      expect(AGENT_TEMPLATES['solution-writer.md']).toBeDefined();
    });

    it('skill and command both reference memory_search', () => {
      expect(compoundCommand).toContain('memory_search');
      expect(compoundSkill).toContain('memory_search');
    });

    it('skill and command both reference memory_capture', () => {
      expect(compoundCommand).toContain('memory_capture');
      expect(compoundSkill).toContain('memory_capture');
    });

    it('skill and command both reference beads (bd)', () => {
      expect(compoundCommand).toMatch(/\bbd\b/);
      expect(compoundSkill).toMatch(/\bbd\b|beads/i);
    });

    it('skill and command both describe team spawning', () => {
      expect(compoundCommand).toMatch(/spawn|launch|start/i);
      expect(compoundSkill).toMatch(/spawn|launch|parallel/i);
    });

    it('skill and command both describe quality filter', () => {
      expect(compoundCommand).toMatch(/novel/i);
      expect(compoundSkill).toMatch(/novel/i);
      expect(compoundCommand).toMatch(/specific/i);
      expect(compoundSkill).toMatch(/specific/i);
    });

    it('skill and command both describe supersedes/related linking', () => {
      expect(compoundCommand).toMatch(/supersede|related/i);
      expect(compoundSkill).toMatch(/supersede|related/i);
    });
  });

  describe('branch-contract checks', () => {
    it('compound command workflow describes parallel agent spawning', () => {
      const workflowMatch = compoundCommand.match(/## Workflow[^]*?(?=##|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];
      expect(workflow).toMatch(/spawn|launch|parallel/i);
    });

    it('compound command workflow describes quality filter BEFORE storage', () => {
      const workflowMatch = compoundCommand.match(/## Workflow[^]*?(?=##|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];
      // Quality filter (novelty/specificity) should appear before memory_capture
      const filterPos = workflow.search(/novel|specific|quality.*filter|filter/i);
      const capturePos = workflow.search(/memory_capture|store|captur/i);
      expect(filterPos).toBeGreaterThan(-1);
      expect(capturePos).toBeGreaterThan(-1);
      expect(filterPos).toBeLessThan(capturePos);
    });

    it('compound skill methodology describes team spawning', () => {
      const methodologyMatch = compoundSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/spawn|launch|parallel/i);
    });

    it('compound skill methodology describes quality filter', () => {
      const methodologyMatch = compoundSkill.match(/## Methodology[^]*?(?=##|$)/i);
      expect(methodologyMatch).not.toBeNull();
      const methodology = methodologyMatch![0];
      expect(methodology).toMatch(/novel|specific|quality.*filter|filter/i);
    });
  });
});
