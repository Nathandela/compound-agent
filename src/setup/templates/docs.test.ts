/**
 * Tests for DOC_TEMPLATES and installDocTemplates.
 */

import { describe, expect, it } from 'vitest';

import { DOC_TEMPLATES } from './docs.js';

describe('DOC_TEMPLATES', () => {
  it('exports a README.md template as the main entry point', () => {
    expect(DOC_TEMPLATES).toHaveProperty('README.md');
  });

  it('exports all 5 split documentation templates', () => {
    expect(Object.keys(DOC_TEMPLATES).sort()).toEqual([
      'CLI_REFERENCE.md',
      'INTEGRATION.md',
      'README.md',
      'SKILLS.md',
      'WORKFLOW.md',
    ]);
  });

  it('each template contains YAML frontmatter with a version placeholder', () => {
    for (const [name, content] of Object.entries(DOC_TEMPLATES)) {
      expect(content, `${name} should start with frontmatter`).toMatch(/^---\n/);
      expect(content, `${name} should have VERSION placeholder`).toContain('{{VERSION}}');
    }
  });

  it('README.md contains links to all other docs', () => {
    const readme = DOC_TEMPLATES['README.md'];
    expect(readme).toContain('WORKFLOW.md');
    expect(readme).toContain('CLI_REFERENCE.md');
    expect(readme).toContain('SKILLS.md');
    expect(readme).toContain('INTEGRATION.md');
  });

  it('SKILLS.md lists all public slash commands including agentic', () => {
    const skills = DOC_TEMPLATES['SKILLS.md'];
    expect(skills).toContain('/compound:agentic-audit');
    expect(skills).toContain('/compound:agentic-setup');
  });

  it('SKILLS.md uses learn-that and check-that (not removed /compound:learn)', () => {
    const skills = DOC_TEMPLATES['SKILLS.md'];
    expect(skills).toContain('/compound:learn-that');
    expect(skills).toContain('/compound:check-that');
    expect(skills).not.toMatch(/\/compound:learn\b\s/);
  });
});
