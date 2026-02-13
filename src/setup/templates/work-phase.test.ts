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

    it('starts with $ARGUMENTS', () => {
      expect(workCommand.trimStart()).toMatch(/^\$ARGUMENTS/);
    });

    it('has ## Workflow section', () => {
      expect(workCommand).toContain('## Workflow');
    });

    it('stays under 5000 characters', () => {
      expect(workCommand.length).toBeLessThanOrEqual(5000);
    });

    // --- Memory enrichment ---
    it('references memory_search for semantic retrieval', () => {
      expect(workCommand).toContain('memory_search');
    });

    // --- Agent team delegation ---
    it('references test-writer and implementer agents', () => {
      expect(workCommand).toMatch(/test.writer/i);
      expect(workCommand).toMatch(/implementer/i);
    });

    it('describes spawning agent team', () => {
      expect(workCommand).toMatch(/spawn|launch|start|delegate/i);
    });

    // --- Complexity assessment ---
    it('describes complexity assessment (trivial/simple/complex)', () => {
      expect(workCommand).toMatch(/trivial/i);
      expect(workCommand).toMatch(/simple/i);
      expect(workCommand).toMatch(/complex/i);
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

    it('describes memory_capture for corrections or discoveries', () => {
      expect(workCommand).toContain('memory_capture');
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

    it('references memory_search', () => {
      expect(workSkill).toContain('memory_search');
    });

    it('stays under 4000 characters', () => {
      expect(workSkill.length).toBeLessThanOrEqual(4000);
    });

    // --- Work-specific skill content ---
    it('describes team structure / adaptive TDD model', () => {
      expect(workSkill).toMatch(/team structure|adaptive|team/i);
    });

    it('describes complexity assessment', () => {
      expect(workSkill).toMatch(/complexity|trivial|simple|complex/i);
    });

    it('describes agent delegation', () => {
      expect(workSkill).toMatch(/delegat|agent|coordinat/i);
    });

    it('describes per-agent memory injection in Memory Integration section', () => {
      expect(workSkill).toMatch(/inject.*memory.*agent|memory.*inject.*agent|memory.*items.*agent|agent.*memory.*context/i);
    });

    it('describes memory_capture for corrections or discoveries', () => {
      expect(workSkill).toContain('memory_capture');
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

    it('references sequential mode (write full test suite, hand off)', () => {
      expect(testWriter).toMatch(/sequential/i);
      // Should describe writing the full suite then handing off
      expect(testWriter).toMatch(/hand.off|hand off|complete.*suite|full.*suite/i);
    });

    it('references iterative mode (interface tests first, ping-pong)', () => {
      expect(testWriter).toMatch(/iterative/i);
      // Should describe interface/contract tests first
      expect(testWriter).toMatch(/interface|contract/i);
    });

    it('references memory_search for task context', () => {
      expect(testWriter).toContain('memory_search');
    });

    it('describes when to use each mode', () => {
      // Both modes should be described with guidance on when to use
      expect(testWriter).toMatch(/sequential/i);
      expect(testWriter).toMatch(/iterative/i);
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

    it('references sequential mode (receive test suite, implement)', () => {
      expect(implementer).toMatch(/sequential/i);
    });

    it('references iterative mode (receive interface tests, communicate back)', () => {
      expect(implementer).toMatch(/iterative/i);
      // Should describe communicating back to test-writer
      expect(implementer).toMatch(/communicat|respond|feedback|report/i);
    });

    it('explicitly states NEVER modify test files', () => {
      expect(implementer).toMatch(/never.*modify.*test|never.*change.*test|never.*edit.*test/i);
    });

    it('references memory_search for implementation patterns', () => {
      expect(implementer).toContain('memory_search');
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

    it('work skill and command both reference memory_search', () => {
      expect(workCommand).toContain('memory_search');
      expect(workSkill).toContain('memory_search');
    });

    it('work skill and command both reference beads (bd)', () => {
      expect(workCommand).toMatch(/\bbd\b/);
      expect(workSkill).toMatch(/\bbd\b|beads/i);
    });

    it('both agents reference the same modes described in work.md command', () => {
      // work.md describes sequential and iterative modes
      // Both agents should reference both modes
      expect(testWriter).toMatch(/sequential/i);
      expect(testWriter).toMatch(/iterative/i);
      expect(implementer).toMatch(/sequential/i);
      expect(implementer).toMatch(/iterative/i);
    });

    it('both agents mention memory_search', () => {
      expect(testWriter).toContain('memory_search');
      expect(implementer).toContain('memory_search');
    });

    it('work command and skill both describe all three complexity levels', () => {
      for (const level of ['trivial', 'simple', 'complex']) {
        expect(workCommand.toLowerCase()).toContain(level);
        expect(workSkill.toLowerCase()).toContain(level);
      }
    });

    it('work command and skill both describe delegate mode (lead does not code)', () => {
      expect(workCommand).toMatch(/does not (code|implement)|do not (code|implement)|coordinat/i);
      expect(workSkill).toMatch(/does not (code|implement|write)|do not (code|implement|write)|coordinat.*delegat|delegat.*coordinat/i);
    });

    it('work command and skill both reference memory_capture', () => {
      expect(workCommand).toContain('memory_capture');
      expect(workSkill).toContain('memory_capture');
    });

    it('work skill references full beads lifecycle (bd ready, bd update, bd close)', () => {
      expect(workSkill).toContain('bd ready');
      expect(workSkill).toContain('bd update');
      expect(workSkill).toContain('bd close');
    });

    it('implementer explicitly prohibits modifying test files', () => {
      expect(implementer).toMatch(/never.*modify.*test/i);
    });
  });
});
