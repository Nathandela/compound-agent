import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';

/**
 * LFG phase structural tests.
 *
 * Verifies the lfg.md command template chains all 5 workflow phases
 * (brainstorm, plan, work, review, compound) with proper ordering,
 * memory integration, stop conditions, and review gate.
 */

describe('LFG Phase Integration', () => {
  const lfgCommand = WORKFLOW_COMMANDS['lfg.md'];

  describe('structural requirements', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(lfgCommand).toBeDefined();
    });

    it('starts with $ARGUMENTS', () => {
      expect(lfgCommand.trimStart()).toMatch(/^\$ARGUMENTS/);
    });

    it('has ## Workflow section', () => {
      expect(lfgCommand).toContain('## Workflow');
    });

    it('has ## Stop Conditions section', () => {
      expect(lfgCommand).toContain('## Stop Conditions');
    });

    it('has ## Memory Integration section', () => {
      expect(lfgCommand).toContain('## Memory Integration');
    });

    it('stays under 7000 characters', () => {
      expect(lfgCommand.length).toBeLessThanOrEqual(7000);
    });
  });

  describe('phase ordering', () => {
    const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'] as const;

    it('references all 5 phases', () => {
      for (const phase of phases) {
        expect(lfgCommand.toLowerCase()).toContain(phase);
      }
    });

    it('each phase has a numbered step in the workflow', () => {
      const workflowMatch = lfgCommand.match(/## Workflow[^]*?(?=## Stop|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];
      for (const phase of phases) {
        expect(workflow.toLowerCase()).toContain(phase);
      }
    });

    it('phases appear in correct order: brainstorm < plan < work < review < compound', () => {
      const workflowMatch = lfgCommand.match(/## Workflow[^]*?(?=## Stop|$)/i);
      expect(workflowMatch).not.toBeNull();
      const workflow = workflowMatch![0];

      // Find each phase's numbered step (e.g. "1. **Brainstorm phase**")
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

  describe('memory integration', () => {
    it('references memory_search', () => {
      expect(lfgCommand).toContain('memory_search');
    });

    it('references memory_capture', () => {
      expect(lfgCommand).toContain('memory_capture');
    });

    it('compound phase warns against MEMORY.md', () => {
      const compoundMatch = lfgCommand.match(/compound.*?phase[^]*?(?=## FINAL|$)/i);
      expect(compoundMatch).not.toBeNull();
      expect(compoundMatch![0]).toMatch(/NOT.*MEMORY\.md/i);
    });

    it('## Memory Integration section references memory_search in brainstorm, work, compound', () => {
      const memorySection = lfgCommand.match(/## Memory Integration[^]*$/i);
      expect(memorySection).not.toBeNull();
      const section = memorySection![0];
      expect(section).toContain('memory_search');
      expect(section).toMatch(/brainstorm/i);
      expect(section).toMatch(/work/i);
      expect(section).toMatch(/compound/i);
    });

    it('## Memory Integration section references memory_capture in work and compound', () => {
      const memorySection = lfgCommand.match(/## Memory Integration[^]*$/i);
      expect(memorySection).not.toBeNull();
      const section = memorySection![0];
      expect(section).toContain('memory_capture');
      expect(section).toMatch(/work/i);
      expect(section).toMatch(/compound/i);
    });
  });

  describe('stop conditions', () => {
    it('has explicit stop conditions section', () => {
      const stopSection = lfgCommand.match(/## Stop Conditions[^]*?(?=## Memory|$)/i);
      expect(stopSection).not.toBeNull();
    });

    it('references unclear goal as a stop condition', () => {
      const stopSection = lfgCommand.match(/## Stop Conditions[^]*?(?=## Memory|$)/i);
      expect(stopSection).not.toBeNull();
      expect(stopSection![0]).toMatch(/unclear/i);
    });

    it('references test failures as a stop condition', () => {
      const stopSection = lfgCommand.match(/## Stop Conditions[^]*?(?=## Memory|$)/i);
      expect(stopSection).not.toBeNull();
      expect(stopSection![0]).toMatch(/test.*fail/i);
    });

    it('references security issues as a stop condition', () => {
      const stopSection = lfgCommand.match(/## Stop Conditions[^]*?(?=## Memory|$)/i);
      expect(stopSection).not.toBeNull();
      expect(stopSection![0]).toMatch(/security/i);
    });
  });

  describe('review gate', () => {
    it('review phase delegates to /compound:review', () => {
      expect(lfgCommand).toMatch(/\/compound:review/);
    });

    it('review phase mentions /implementation-reviewer as mandatory gate', () => {
      expect(lfgCommand).toMatch(/\/implementation-reviewer/);
    });

    it('P1 findings are referenced in phase gate', () => {
      expect(lfgCommand).toMatch(/P1.*resolved|P1.*finding/i);
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

    it('lfg.md references memory_search which exists in individual phase commands', () => {
      expect(lfgCommand).toContain('memory_search');
      // Verify the phases that use memory_search also reference it in their own commands
      expect(WORKFLOW_COMMANDS['brainstorm.md']).toContain('memory_search');
      expect(WORKFLOW_COMMANDS['work.md']).toContain('memory_search');
      expect(WORKFLOW_COMMANDS['compound.md']).toContain('memory_search');
    });

    it('lfg.md references memory_capture which exists in individual phase commands', () => {
      expect(lfgCommand).toContain('memory_capture');
      expect(WORKFLOW_COMMANDS['work.md']).toContain('memory_capture');
      expect(WORKFLOW_COMMANDS['compound.md']).toContain('memory_capture');
    });
  });

  describe('phase delegation survives compaction', () => {
    it('each phase delegates to its dedicated slash command', () => {
      expect(lfgCommand).toMatch(/\/compound:brainstorm/);
      expect(lfgCommand).toMatch(/\/compound:plan/);
      expect(lfgCommand).toMatch(/\/compound:work/);
      expect(lfgCommand).toMatch(/\/compound:review/);
      expect(lfgCommand).toMatch(/\/compound:compound/);
    });

    it('resume section can recover phase state from beads after compaction', () => {
      const phaseControlMatch = lfgCommand.match(/## Phase Control[^]*?(?=## Stop|$)/i);
      expect(phaseControlMatch).not.toBeNull();
      const phaseControl = phaseControlMatch![0];
      expect(phaseControl).toMatch(/bd list|bd ready|resume/i);
    });
  });

  describe('phase control', () => {
    it('has ## Phase Control section', () => {
      expect(lfgCommand).toContain('## Phase Control');
    });

    it('describes skip-phase behavior', () => {
      expect(lfgCommand).toMatch(/skip.*phase|from.*phase/i);
    });

    it('describes progress reporting', () => {
      expect(lfgCommand).toMatch(/progress|announce|current.*phase|\[Phase/i);
    });

    it('describes retry on failure', () => {
      expect(lfgCommand).toMatch(/retry.*fail|fail.*retry/i);
    });

    it('describes resume after interruption', () => {
      expect(lfgCommand).toMatch(/resume|interrupt/i);
    });
  });

  describe('beads integration', () => {
    it('work phase mentions task tracking', () => {
      const workMatch = lfgCommand.match(/work.*?phase[^]*?(?=\d+\.\s\*\*Review|$)/i);
      expect(workMatch).not.toBeNull();
      expect(workMatch![0]).toMatch(/task/i);
    });

    it('references closing tasks', () => {
      expect(lfgCommand).toMatch(/close.*task|task.*complete/i);
    });
  });

  describe('workflow enforcement gates', () => {
    it('lfg.md contains PHASE GATE 3 between work and review', () => {
      expect(lfgCommand).toContain('PHASE GATE 3');
    });

    it('lfg.md contains PHASE GATE 4 between review and compound', () => {
      expect(lfgCommand).toContain('PHASE GATE 4');
    });

    it('lfg.md contains FINAL GATE for epic closure', () => {
      expect(lfgCommand).toContain('FINAL GATE');
    });

    it('lfg.md contains ca verify-gates', () => {
      expect(lfgCommand).toContain('ca verify-gates');
    });

    it('lfg.md contains SESSION CLOSE section', () => {
      expect(lfgCommand).toContain('SESSION CLOSE');
    });

    it('lfg.md contains phase state tracking with COMPLETE markers', () => {
      expect(lfgCommand).toMatch(/Phase:.*COMPLETE/);
    });

    it('lfg.md phase control resume reads notes field for phase state', () => {
      const phaseControlMatch = lfgCommand.match(/## Phase Control[^]*?(?=## Stop|$)/i);
      expect(phaseControlMatch).not.toBeNull();
      expect(phaseControlMatch![0]).toContain('notes field');
    });

    it('lfg.md delegates memory integration to phase slash commands', () => {
      // Each phase delegates to its slash command which handles memory_search/memory_capture
      const memorySection = lfgCommand.match(/## Memory Integration[^]*$/i);
      expect(memorySection).not.toBeNull();
      expect(memorySection![0]).toMatch(/slash command/i);
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

    it('work.md instructs displaying memory_search results', () => {
      expect(workCommand).toMatch(/display.*memory|memory.*display/i);
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
