/**
 * Tests for DOC_TEMPLATES and installDocTemplates.
 */

import { describe, expect, it } from 'vitest';

import { DOC_TEMPLATES } from './docs.js';

describe('DOC_TEMPLATES', () => {
  it('exports a HOW_TO_COMPOUND.md template', () => {
    expect(DOC_TEMPLATES).toHaveProperty('HOW_TO_COMPOUND.md');
  });

  it('template contains a YAML frontmatter with a version placeholder', () => {
    const content = DOC_TEMPLATES['HOW_TO_COMPOUND.md'];
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('{{VERSION}}');
  });

  it('template contains the main heading', () => {
    const content = DOC_TEMPLATES['HOW_TO_COMPOUND.md'];
    expect(content).toContain('# How to Compound');
  });
});
