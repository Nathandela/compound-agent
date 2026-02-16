import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';

/**
 * LFG phase structural tests.
 *
 * Verifies the lfg.md command template is a thin orchestrator that chains
 * all 5 workflow phases via /compound:* slash command delegation.
 */

describe('LFG Phase Integration', () => {
  const lfgCommand = WORKFLOW_COMMANDS['lfg.md'];

  describe('structural requirements', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(lfgCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(lfgCommand.trimStart()).toMatch(/^---/);
      expect(lfgCommand).toContain('$ARGUMENTS');
    });

    it('has ## Workflow section', () => {
      expect(lfgCommand).toContain('## Workflow');
    });

    it('stays under 1500 characters', () => {
      expect(lfgCommand.length).toBeLessThanOrEqual(1500);
    });
  });

  describe('phase ordering', () => {
    const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'] as const;

    it('references all 5 phases', () => {
      for (const phase of phases) {
        expect(lfgCommand.toLowerCase()).toContain(phase);
      }
    });

    it('phases appear in correct order: brainstorm < plan < work < review < compound', () => {
      const workflowMatch = lfgCommand.match(/## Workflow[^]*?(?=## Phase Control|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];

      let lastPos = -1;
      for (const phase of phases) {
        const phasePattern = new RegExp(`\\d+\\.\\s+\\*\\*${phase}`, 'i');
        const match = workflow.match(phasePattern);
        expect(match, `${phase} numbered step not found`).not.toBeNull();
        const pos = match!.index!;
        expect(pos, `${phase} appears before previous phase`).toBeGreaterThan(lastPos);
        lastPos = pos;
      }
    });
  });

  describe('phase delegation', () => {
    it('each phase delegates to its dedicated slash command', () => {
      expect(lfgCommand).toMatch(/\/compound:brainstorm/);
      expect(lfgCommand).toMatch(/\/compound:plan/);
      expect(lfgCommand).toMatch(/\/compound:work/);
      expect(lfgCommand).toMatch(/\/compound:review/);
      expect(lfgCommand).toMatch(/\/compound:compound/);
    });

    it('compound phase warns against MEMORY.md', () => {
      expect(lfgCommand).toMatch(/NOT.*MEMORY\.md/i);
    });

    it('references npx ca learn in compound phase', () => {
      expect(lfgCommand).toContain('npx ca learn');
    });
  });

  describe('phase control', () => {
    it('has ## Phase Control section', () => {
      expect(lfgCommand).toContain('## Phase Control');
    });

    it('describes skip-phase behavior', () => {
      expect(lfgCommand).toMatch(/skip|from.*phase/i);
    });

    it('describes progress reporting', () => {
      expect(lfgCommand).toMatch(/progress|announce|\[Phase/i);
    });

    it('describes resume via bd show and notes field', () => {
      expect(lfgCommand).toMatch(/resume/i);
      expect(lfgCommand).toContain('notes field');
    });
  });

  describe('session close', () => {
    it('has SESSION CLOSE section', () => {
      expect(lfgCommand).toContain('SESSION CLOSE');
    });

    it('references ca verify-gates', () => {
      expect(lfgCommand).toContain('ca verify-gates');
    });

    it('requires git push as final step', () => {
      expect(lfgCommand).toMatch(/git push/);
    });
  });

  describe('phase state tracking', () => {
    it('contains COMPLETE markers for phase transitions', () => {
      expect(lfgCommand).toMatch(/Phase:.*COMPLETE/);
    });
  });

  describe('review gate', () => {
    it('review phase delegates to /compound:review', () => {
      expect(lfgCommand).toMatch(/\/compound:review/);
    });

    it('review gate (PHASE GATE 4) lives in review.md', () => {
      expect(WORKFLOW_COMMANDS['review.md']).toContain('PHASE GATE 4');
      expect(WORKFLOW_COMMANDS['review.md']).toMatch(/implementation-reviewer/);
    });
  });

  describe('gates relocated to individual phase commands', () => {
    it('PHASE GATE 3 in work.md', () => {
      expect(WORKFLOW_COMMANDS['work.md']).toContain('PHASE GATE 3');
    });

    it('PHASE GATE 4 in review.md', () => {
      expect(WORKFLOW_COMMANDS['review.md']).toContain('PHASE GATE 4');
    });

    it('FINAL GATE in compound.md', () => {
      expect(WORKFLOW_COMMANDS['compound.md']).toContain('FINAL GATE');
      expect(WORKFLOW_COMMANDS['compound.md']).toContain('ca verify-gates');
    });
  });

  describe('cross-template consistency', () => {
    it('every phase referenced in lfg.md exists as its own command in WORKFLOW_COMMANDS', () => {
      const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(
          WORKFLOW_COMMANDS[`${phase}.md`],
          `${phase}.md not found in WORKFLOW_COMMANDS`,
        ).toBeDefined();
      }
    });

    it('individual phase commands handle their own memory integration', () => {
      expect(WORKFLOW_COMMANDS['brainstorm.md']).toContain('npx ca search');
      expect(WORKFLOW_COMMANDS['work.md']).toContain('npx ca search');
      expect(WORKFLOW_COMMANDS['work.md']).toContain('npx ca learn');
      expect(WORKFLOW_COMMANDS['compound.md']).toContain('npx ca search');
      expect(WORKFLOW_COMMANDS['compound.md']).toContain('npx ca learn');
    });
  });

  describe('plan.md enforcement', () => {
    const planCommand = WORKFLOW_COMMANDS['plan.md'];

    it('plan.md contains POST-PLAN VERIFICATION section', () => {
      expect(planCommand).toContain('POST-PLAN VERIFICATION');
    });
  });

  describe('work.md enforcement', () => {
    const workCommand = WORKFLOW_COMMANDS['work.md'];

    it('work.md contains MANDATORY VERIFICATION section', () => {
      expect(workCommand).toContain('MANDATORY VERIFICATION');
    });

    it('work.md instructs displaying search results', () => {
      expect(workCommand).toMatch(/display.*search|display.*memory|memory.*display|search.*display/i);
    });
  });

  describe('compound.md enforcement', () => {
    const compoundCommand = WORKFLOW_COMMANDS['compound.md'];

    it('compound.md requires minimum 1 lesson per significant decision', () => {
      expect(compoundCommand).toContain('At minimum, capture 1 lesson');
    });

    it('compound.md contains anti-MEMORY.md guardrail', () => {
      expect(compoundCommand).toMatch(/NOT.*MEMORY\.md/i);
      expect(compoundCommand).toMatch(/\.claude\/lessons\/index\.jsonl/);
    });
  });

  describe('review.md enforcement', () => {
    const reviewCommand = WORKFLOW_COMMANDS['review.md'];

    it('review.md Memory Integration warns against MEMORY.md', () => {
      expect(reviewCommand).toMatch(/NOT.*MEMORY\.md/i);
    });
  });
});
