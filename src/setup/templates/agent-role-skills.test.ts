import { describe, it, expect } from 'vitest';
import { AGENT_ROLE_SKILLS } from './agent-role-skills.js';

/** All 18 expected agent role skill keys (kebab-case name used as directory). */
const EXPECTED_KEYS = [
  // Workflow agents (compound + work phases)
  'context-analyzer',
  'lesson-extractor',
  'pattern-matcher',
  'solution-writer',
  'test-writer',
  'implementer',
  // Review agents
  'repo-analyst',
  'memory-analyst',
  'security-reviewer',
  'architecture-reviewer',
  'performance-reviewer',
  'test-coverage-reviewer',
  'simplicity-reviewer',
  // Phase 11 agents
  'compounding',
  'audit',
  'doc-gardener',
  'cct-subagent',
  'drift-detector',
];

/** Agents that operate as AgentTeam members (TeamCreate + SendMessage). */
const TEAM_MEMBER_KEYS = [
  'context-analyzer',
  'lesson-extractor',
  'pattern-matcher',
  'solution-writer',
  'test-writer',
  'implementer',
  'security-reviewer',
  'architecture-reviewer',
  'performance-reviewer',
  'test-coverage-reviewer',
  'simplicity-reviewer',
  'compounding',
];

/** Agents that operate as standalone subagents (Task tool, no team). */
const SUBAGENT_KEYS = [
  'repo-analyst',
  'memory-analyst',
  'audit',
  'doc-gardener',
  'cct-subagent',
  'drift-detector',
];

describe('AGENT_ROLE_SKILLS', () => {
  it('has exactly 18 entries', () => {
    expect(Object.keys(AGENT_ROLE_SKILLS)).toHaveLength(18);
  });

  it('has all expected keys', () => {
    expect(Object.keys(AGENT_ROLE_SKILLS).sort()).toEqual(EXPECTED_KEYS.sort());
  });

  it('every skill starts with YAML frontmatter', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content.trimStart().startsWith('---'), `${key} missing frontmatter`).toBe(true);
    }
  });

  it('every skill has name and description in frontmatter (no model)', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      const frontmatter = content.split('---')[1];
      expect(frontmatter, `${key} has no frontmatter block`).toBeDefined();
      expect(frontmatter, `${key} missing name`).toMatch(/name:/);
      expect(frontmatter, `${key} missing description`).toMatch(/description:/);
      expect(frontmatter, `${key} should not have model in frontmatter`).not.toMatch(/model:/);
    }
  });

  it('every skill has a ## Role section', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content, `${key} missing ## Role`).toMatch(/## Role/);
    }
  });

  it('every skill has a ## Instructions section', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content, `${key} missing ## Instructions`).toMatch(/## Instructions/);
    }
  });

  it('every skill has a ## Output Format section', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content, `${key} missing ## Output Format`).toMatch(/## Output Format/);
    }
  });

  it('every skill has a ## Deployment section', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content, `${key} missing ## Deployment`).toMatch(/## Deployment/);
    }
  });

  it('team member skills specify AgentTeam deployment', () => {
    for (const key of TEAM_MEMBER_KEYS) {
      expect(AGENT_ROLE_SKILLS[key], `${key} should mention AgentTeam`).toMatch(/AgentTeam/);
      expect(AGENT_ROLE_SKILLS[key], `${key} should mention SendMessage`).toMatch(/SendMessage/);
    }
  });

  it('subagent skills specify subagent deployment', () => {
    for (const key of SUBAGENT_KEYS) {
      expect(AGENT_ROLE_SKILLS[key], `${key} should mention subagent`).toMatch(/subagent/i);
    }
  });

  it('no skill has a ## Tools Available section (not relevant for skills)', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content, `${key} should not have ## Tools Available`).not.toMatch(/## Tools Available/);
    }
  });

  it('no skill exceeds 4000 characters', () => {
    for (const [key, content] of Object.entries(AGENT_ROLE_SKILLS)) {
      expect(content.length, `${key} is ${content.length} chars`).toBeLessThanOrEqual(4000);
    }
  });
});
