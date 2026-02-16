import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_TEMPLATES } from './agents.js';

/**
 * Work phase integration tests.
 *
 * Verifies the work.md command, work SKILL.md, and supporting agents
 * form a complete, well-integrated work phase with agent team delegation.
 */

describe('Work Phase Integration', () => {
  const workCommand = WORKFLOW_COMMANDS['work.md'];
  const workSkill = PHASE_SKILLS['work'];
  const testWriter = AGENT_TEMPLATES['test-writer.md'];
  const implementer = AGENT_TEMPLATES['implementer.md'];

  describe('work.md command template', () => {
    // --- Structural requirements ---
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(workCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(workCommand.trimStart()).toMatch(/^---/);
      expect(workCommand).toContain('$ARGUMENTS');
    });

    it('has ## Workflow section', () => {
      expect(workCommand).toContain('## Workflow');
    });

    it('stays under 5000 characters', () => {
      expect(workCommand.length).toBeLessThanOrEqual(5000);
    });

    // --- Memory enrichment ---
    it('references npx ca search for semantic retrieval', () => {
      expect(workCommand).toContain('npx ca search');
    });

    // --- Agent team delegation ---
    it('references test-writer and implementer agents', () => {
      expect(workCommand).toMatch(/test.writer/i);
      expect(workCommand).toMatch(/implementer/i);
    });

    it('describes spawning or delegating to agent team', () => {
      expect(workCommand).toMatch(/spawn|launch|start|delegate/i);
    });

    // --- Delegate mode ---
    it('describes delegate mode (lead doesn\'t code, coordinates)', () => {
      expect(workCommand).toMatch(/delegate|coordinat|does not (code|implement)|do not (code|implement)/i);
    });

    // --- Beads lifecycle ---
    it('references bd ready, bd update, bd close for beads lifecycle', () => {
      expect(workCommand).toContain('bd ready');
      expect(workCommand).toContain('bd update');
      expect(workCommand).toContain('bd close');
    });

    // --- Per-agent memory injection ---
    it('describes per-agent memory injection', () => {
      expect(workCommand).toMatch(/memory.*agent|agent.*memory|inject.*memory|memory.*inject|context.*agent/i);
    });

    it('describes npx ca learn for corrections or discoveries', () => {
      expect(workCommand).toContain('npx ca learn');
    });

    it('includes explicit Mandatory Verification section with pipeline reference', () => {
      expect(workCommand).toContain('## MANDATORY VERIFICATION');
      expect(workCommand).toMatch(/implementation-reviewer/i);
      expect(workCommand).toMatch(/invariant-designer/i);
    });

    it('contains PHASE GATE 3 at end of template', () => {
      expect(workCommand).toContain('PHASE GATE 3');
      expect(workCommand).toMatch(/work tasks.*closed|work tasks remain open/i);
    });
  });

  describe('work SKILL.md template', () => {
    it('exists in PHASE_SKILLS', () => {
      expect(workSkill).toBeDefined();
    });

    it('starts with YAML frontmatter', () => {
      expect(workSkill.trimStart()).toMatch(/^---/);
    });

    it('has name and description in frontmatter', () => {
      const frontmatter = workSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
    });

    it('has ## Methodology section', () => {
      expect(workSkill).toContain('## Methodology');
    });

    it('has ## Common Pitfalls section', () => {
      expect(workSkill).toContain('## Common Pitfalls');
    });

    it('has ## Quality Criteria section', () => {
      expect(workSkill).toContain('## Quality Criteria');
    });

    it('references npx ca search', () => {
      expect(workSkill).toContain('npx ca search');
    });

    it('stays under 4000 characters', () => {
      expect(workSkill.length).toBeLessThanOrEqual(4000);
    });

    // --- Work-specific skill content ---
    it('describes team structure / agent delegation', () => {
      expect(workSkill).toMatch(/team|delegat|agent/i);
    });

    it('describes agent delegation', () => {
      expect(workSkill).toMatch(/delegat|agent|coordinat/i);
    });

    it('describes per-agent memory injection in Memory Integration section', () => {
      expect(workSkill).toMatch(/inject.*memory.*agent|memory.*inject.*agent|memory.*items.*agent|agent.*memory.*context/i);
    });

    it('describes npx ca learn for corrections or discoveries', () => {
      expect(workSkill).toContain('npx ca learn');
    });

    it('includes MANDATORY VERIFICATION gate with implementation-reviewer', () => {
      expect(workSkill).toContain('## MANDATORY VERIFICATION');
      expect(workSkill).toMatch(/implementation-reviewer/i);
      expect(workSkill).toContain('INVIOLABLE');
    });
  });

  describe('test-writer.md agent template', () => {
    it('exists in AGENT_TEMPLATES', () => {
      expect(testWriter).toBeDefined();
    });

    it('has proper YAML frontmatter with name, description, model', () => {
      expect(testWriter.trimStart()).toMatch(/^---/);
      const frontmatter = testWriter.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
      expect(frontmatter).toMatch(/model:/);
    });

    it('references npx ca search for task context', () => {
      expect(testWriter).toContain('npx ca search');
    });

    it('stays under 4000 characters', () => {
      expect(testWriter.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('implementer.md agent template', () => {
    it('exists in AGENT_TEMPLATES', () => {
      expect(implementer).toBeDefined();
    });

    it('has proper YAML frontmatter with name, description, model', () => {
      expect(implementer.trimStart()).toMatch(/^---/);
      const frontmatter = implementer.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
      expect(frontmatter).toMatch(/model:/);
    });

    it('explicitly states NEVER modify test files', () => {
      expect(implementer).toMatch(/never.*modify.*test|never.*change.*test|never.*edit.*test/i);
    });

    it('references npx ca search for implementation patterns', () => {
      expect(implementer).toContain('npx ca search');
    });

    it('stays under 4000 characters', () => {
      expect(implementer.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('cross-template consistency', () => {
    it('work command references agents that exist in AGENT_TEMPLATES', () => {
      if (workCommand.match(/test.writer/i)) {
        expect(AGENT_TEMPLATES['test-writer.md']).toBeDefined();
      }
      if (workCommand.match(/implementer/i)) {
        expect(AGENT_TEMPLATES['implementer.md']).toBeDefined();
      }
    });

    it('work skill and command both reference npx ca search', () => {
      expect(workCommand).toContain('npx ca search');
      expect(workSkill).toContain('npx ca search');
    });

    it('work skill and command both reference beads (bd)', () => {
      expect(workCommand).toMatch(/\bbd\b/);
      expect(workSkill).toMatch(/\bbd\b|beads/i);
    });

    it('work command and skill both describe delegate mode (lead does not code)', () => {
      expect(workCommand).toMatch(/does not (code|implement)|do not (code|implement)|coordinat/i);
      expect(workSkill).toMatch(/does not (code|implement|write)|do not (code|implement|write)|coordinat.*delegat|delegat.*coordinat/i);
    });

    it('work command and skill both reference npx ca learn', () => {
      expect(workCommand).toContain('npx ca learn');
      expect(workSkill).toContain('npx ca learn');
    });

    it('work skill references full beads lifecycle (bd ready, bd update, bd close)', () => {
      expect(workSkill).toContain('bd ready');
      expect(workSkill).toContain('bd update');
      expect(workSkill).toContain('bd close');
    });

    it('implementer explicitly prohibits modifying test files', () => {
      expect(implementer).toMatch(/never.*modify.*test/i);
    });

    it('both agents mention npx ca search', () => {
      expect(testWriter).toContain('npx ca search');
      expect(implementer).toContain('npx ca search');
    });
  });

  describe('branch-contract checks', () => {
    // --- F2: Per-agent memory must be per-subtask ---
    it('work.md describes per-subtask memory search, not single broadcast', () => {
      expect(workCommand).toMatch(
        /npx ca search.*(per (agent|subtask|delegated)|each (agent|subtask|delegated).*task|for each.*npx ca search)/i
      );
    });

    it('work SKILL.md describes per-subtask memory retrieval', () => {
      expect(workSkill).toMatch(
        /per (agent|subtask|delegated)|each (agent|subtask).*search|search.*per.*task/i
      );
    });

    // --- F4: Architecture-lock assertions ---
    it('work.md references agent overlap communication', () => {
      expect(workCommand).toMatch(/communicat.*overlap|overlap.*communicat|agents.*communicat.*task/i);
    });

    it('work.md references incremental commits', () => {
      expect(workCommand).toMatch(/incremental.*commit|commit.*as.*test.*pass|commit.*incremental/i);
    });

    it('work SKILL.md references agent overlap communication', () => {
      expect(workSkill).toMatch(/communicat.*overlap|overlap.*communicat|agents.*communicat/i);
    });

    it('work SKILL.md references incremental commits', () => {
      expect(workSkill).toMatch(/incremental.*commit|commit.*as.*test.*pass|commit.*incremental/i);
    });
  });
});
