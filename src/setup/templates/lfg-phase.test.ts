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

    it('stays under 5000 characters', () => {
      expect(lfgCommand.length).toBeLessThanOrEqual(5000);
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

    it('memory_search is mentioned in brainstorm phase section', () => {
      const brainstormMatch = lfgCommand.match(/brainstorm.*?phase[^]*?(?=\d+\.\s\*\*Plan|$)/i);
      expect(brainstormMatch).not.toBeNull();
      expect(brainstormMatch![0]).toContain('memory_search');
    });

    it('memory_search is mentioned in work phase section', () => {
      const workMatch = lfgCommand.match(/work.*?phase[^]*?(?=\d+\.\s\*\*Review|$)/i);
      expect(workMatch).not.toBeNull();
      expect(workMatch![0]).toContain('memory_search');
    });

    it('memory_capture is mentioned in work phase section', () => {
      const workMatch = lfgCommand.match(/work.*?phase[^]*?(?=\d+\.\s\*\*Review|$)/i);
      expect(workMatch).not.toBeNull();
      expect(workMatch![0]).toContain('memory_capture');
    });

    it('memory_search is mentioned in compound phase section', () => {
      const compoundMatch = lfgCommand.match(/compound.*?phase[^]*?(?=## Stop|$)/i);
      expect(compoundMatch).not.toBeNull();
      expect(compoundMatch![0]).toContain('memory_search');
    });

    it('memory_capture is mentioned in compound phase section', () => {
      const compoundMatch = lfgCommand.match(/compound.*?phase[^]*?(?=## Stop|$)/i);
      expect(compoundMatch).not.toBeNull();
      expect(compoundMatch![0]).toContain('memory_capture');
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
    it('review phase mentions severity classification (P1/P2/P3)', () => {
      expect(lfgCommand).toMatch(/P1/);
      expect(lfgCommand).toMatch(/P2/);
      expect(lfgCommand).toMatch(/P3/);
    });

    it('review phase mentions /implementation-reviewer as mandatory gate', () => {
      expect(lfgCommand).toMatch(/\/implementation-reviewer/);
      expect(lfgCommand).toMatch(/mandatory.*gate|gate/i);
    });

    it('P1 findings are described as blocking', () => {
      expect(lfgCommand).toMatch(/P1.*block|block.*P1|critical.*block/i);
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

  describe('review and compound blocking tasks survive compaction', () => {
    it('plan phase instructs creating review and compound beads issues', () => {
      const planMatch = lfgCommand.match(/plan.*?phase[^]*?(?=\d+\.\s\*\*Work|$)/i);
      expect(planMatch).not.toBeNull();
      const planSection = planMatch![0];
      expect(planSection).toMatch(/review.*compound|compound.*review/is);
      expect(planSection).toMatch(/bd create|beads/i);
    });

    it('review and compound tasks have dependencies so they surface via bd ready', () => {
      // compound depends on review, review depends on work
      expect(lfgCommand).toMatch(/depend|block|bd dep/i);
    });

    it('resume section can recover review/compound from beads after compaction', () => {
      const phaseControlMatch = lfgCommand.match(/## Phase Control[^]*?(?=## Stop|$)/i);
      expect(phaseControlMatch).not.toBeNull();
      const phaseControl = phaseControlMatch![0];
      // Resume uses bd list, which will surface pending review/compound tasks
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
});
