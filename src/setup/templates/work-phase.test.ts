import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';
import { PHASE_SKILLS } from './skills.js';
import { AGENT_ROLE_SKILLS } from './agent-role-skills.js';

/**
 * Work phase integration tests.
 *
 * After v1.2.6 refactor:
 * - work.md command is a thin wrapper (< 500 chars) referencing the skill
 * - work SKILL.md absorbs the detailed 12-step workflow, AgentTeam deployment,
 *   parallelization, beads lifecycle, memory injection, verification gates
 * - test-writer and implementer are now AgentTeam role skills (not agent templates)
 */

describe('Work Phase Integration', () => {
  const workCommand = WORKFLOW_COMMANDS['work.md'];
  const workSkill = PHASE_SKILLS['work'];
  const testWriterSkill = AGENT_ROLE_SKILLS['test-writer'];
  const implementerSkill = AGENT_ROLE_SKILLS['implementer'];

  describe('work.md command (thin wrapper)', () => {
    it('exists in WORKFLOW_COMMANDS', () => {
      expect(workCommand).toBeDefined();
    });

    it('starts with YAML frontmatter followed by $ARGUMENTS', () => {
      expect(workCommand.trimStart()).toMatch(/^---/);
      expect(workCommand).toContain('$ARGUMENTS');
    });

    it('references the skill', () => {
      expect(workCommand).toMatch(/skill/i);
    });

    it('is under 500 characters (thin wrapper)', () => {
      expect(workCommand.length).toBeLessThanOrEqual(500);
    });

    it('does NOT have ## Workflow section (content moved to skill)', () => {
      expect(workCommand).not.toContain('## Workflow');
    });
  });

  describe('work SKILL.md template (absorbs detailed workflow)', () => {
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

    it('stays under 6000 characters', () => {
      expect(workSkill.length).toBeLessThanOrEqual(6000);
    });

    // --- Absorbed from command: AgentTeam deployment ---
    it('describes AgentTeam deployment', () => {
      expect(workSkill).toMatch(/AgentTeam/);
    });

    it('references test-writer and implementer agents', () => {
      expect(workSkill).toMatch(/test.writer/i);
      expect(workSkill).toMatch(/implementer/i);
    });

    it('describes parallelization', () => {
      expect(workSkill).toMatch(/paralleliz/i);
    });

    it('describes delegate mode (lead does not code, coordinates)', () => {
      expect(workSkill).toMatch(/does not (code|implement|write)|do not (code|implement|write)|coordinat.*delegat|delegat.*coordinat/i);
    });

    // --- Absorbed from command: Beads lifecycle ---
    it('references bd ready, bd update, bd close for beads lifecycle', () => {
      expect(workSkill).toContain('bd ready');
      expect(workSkill).toContain('bd update');
      expect(workSkill).toContain('bd close');
    });

    // --- Absorbed from command: Memory ---
    it('references npx ca search for semantic retrieval', () => {
      expect(workSkill).toContain('npx ca search');
    });

    it('describes per-agent memory injection', () => {
      expect(workSkill).toMatch(/inject.*memory.*agent|memory.*inject.*agent|memory.*items.*agent|agent.*memory.*context|per (agent|subtask|delegated)/i);
    });

    it('describes npx ca learn for corrections or discoveries', () => {
      expect(workSkill).toContain('npx ca learn');
    });

    // --- Absorbed from command: Verification gates ---
    it('includes MANDATORY VERIFICATION with implementation-reviewer', () => {
      expect(workSkill).toContain('MANDATORY VERIFICATION');
      expect(workSkill).toMatch(/implementation-reviewer/i);
    });

    it('contains PHASE GATE 3', () => {
      expect(workSkill).toContain('PHASE GATE 3');
      expect(workSkill).toMatch(/work tasks.*closed|work tasks remain open/i);
    });

    // --- Absorbed from command: Incremental commits ---
    it('references incremental commits', () => {
      expect(workSkill).toMatch(/incremental.*commit|commit.*as.*test.*pass|commit.*incremental/i);
    });

    // --- Absorbed from command: Agent overlap communication ---
    it('references agent overlap communication', () => {
      expect(workSkill).toMatch(/communicat.*overlap|overlap.*communicat|agents.*communicat/i);
    });
  });

  describe('test-writer role skill', () => {
    it('exists in AGENT_ROLE_SKILLS', () => {
      expect(testWriterSkill).toBeDefined();
    });

    it('has YAML frontmatter with name and description (no model)', () => {
      expect(testWriterSkill.trimStart()).toMatch(/^---/);
      const frontmatter = testWriterSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
      expect(frontmatter).not.toMatch(/model:/);
    });

    it('has ## Role section', () => {
      expect(testWriterSkill).toContain('## Role');
    });

    it('mentions AgentTeam deployment', () => {
      expect(testWriterSkill).toMatch(/AgentTeam/);
    });
  });

  describe('implementer role skill', () => {
    it('exists in AGENT_ROLE_SKILLS', () => {
      expect(implementerSkill).toBeDefined();
    });

    it('has YAML frontmatter with name and description (no model)', () => {
      expect(implementerSkill.trimStart()).toMatch(/^---/);
      const frontmatter = implementerSkill.split('---')[1];
      expect(frontmatter).toMatch(/name:/);
      expect(frontmatter).toMatch(/description:/);
      expect(frontmatter).not.toMatch(/model:/);
    });

    it('has ## Role section', () => {
      expect(implementerSkill).toContain('## Role');
    });

    it('mentions AgentTeam deployment', () => {
      expect(implementerSkill).toMatch(/AgentTeam/);
    });
  });

  describe('cross-template consistency', () => {
    it('work skill references agents that exist as role skills', () => {
      expect(AGENT_ROLE_SKILLS['test-writer']).toBeDefined();
      expect(AGENT_ROLE_SKILLS['implementer']).toBeDefined();
    });

    it('work skill references npx ca search and npx ca learn', () => {
      expect(workSkill).toContain('npx ca search');
      expect(workSkill).toContain('npx ca learn');
    });

    it('work skill references beads (bd)', () => {
      expect(workSkill).toMatch(/\bbd\b/);
    });
  });
});
