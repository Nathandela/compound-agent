import { describe, it, expect } from 'vitest';
import { PHASE_SKILLS } from './skills.js';

const EXPECTED_KEYS = ['brainstorm', 'plan', 'work', 'review', 'compound'];

describe('PHASE_SKILLS', () => {
  it('has exactly 5 entries', () => {
    expect(Object.keys(PHASE_SKILLS)).toHaveLength(5);
  });

  it('has all expected keys', () => {
    expect(Object.keys(PHASE_SKILLS).sort()).toEqual(EXPECTED_KEYS.sort());
  });

  it('every template starts with YAML frontmatter', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(content.trimStart().startsWith('---'), `${key} missing frontmatter`).toBe(true);
    }
  });

  it('every template has name and description in frontmatter', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      const frontmatter = content.split('---')[1];
      expect(frontmatter, `${key} has no frontmatter block`).toBeDefined();
      expect(frontmatter, `${key} missing name`).toMatch(/name:/);
      expect(frontmatter, `${key} missing description`).toMatch(/description:/);
    }
  });

  it('every template has a ## Methodology section', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(content, `${key} missing ## Methodology`).toContain('## Methodology');
    }
  });

  it('every template has a ## Common Pitfalls section', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(content, `${key} missing ## Common Pitfalls`).toContain('## Common Pitfalls');
    }
  });

  it('every template references memory tools', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      const hasMemory =
        content.includes('memory_search') ||
        content.includes('memory_capture');
      expect(hasMemory, `${key} missing memory tool reference`).toBe(true);
    }
  });

  it('no template exceeds 4000 characters', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(
        content.length,
        `${key} is ${content.length} chars (max 4000)`,
      ).toBeLessThanOrEqual(4000);
    }
  });

  it('every template has a ## Quality Criteria section', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(content, `${key} missing ## Quality Criteria`).toContain('## Quality Criteria');
    }
  });

  it('plan skill contains POST-PLAN VERIFICATION gate', () => {
    expect(PHASE_SKILLS.plan).toContain('POST-PLAN VERIFICATION');
    expect(PHASE_SKILLS.plan).toMatch(/Review.*Compound.*tasks/i);
  });

  it('work skill contains MANDATORY VERIFICATION and PHASE GATE 3', () => {
    expect(PHASE_SKILLS.work).toContain('MANDATORY VERIFICATION');
    expect(PHASE_SKILLS.work).toContain('/implementation-reviewer');
    expect(PHASE_SKILLS.work).toContain('PHASE GATE 3');
  });

  it('review skill contains adaptive tiers, PHASE GATE 4, and anti-MEMORY.md', () => {
    expect(PHASE_SKILLS.review).toContain('PHASE GATE 4');
    expect(PHASE_SKILLS.review).toMatch(/NOT.*MEMORY\.md/);
    expect(PHASE_SKILLS.review).toMatch(/<100 lines/);
  });

  it('compound skill contains anti-MEMORY.md warning and FINAL GATE', () => {
    expect(PHASE_SKILLS.compound).toContain('FINAL GATE');
    expect(PHASE_SKILLS.compound).toMatch(/NOT.*MEMORY\.md/);
    expect(PHASE_SKILLS.compound).toContain('ca verify-gates');
  });
});
