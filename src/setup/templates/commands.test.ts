import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';

const PHASE_FILENAMES = [
  'brainstorm.md',
  'plan.md',
  'work.md',
  'review.md',
  'compound.md',
  'lfg.md',
];

const UTILITY_FILENAMES = [
  'learn.md',
  'search.md',
  'list.md',
  'prime.md',
  'show.md',
  'wrong.md',
  'stats.md',
];

describe('WORKFLOW_COMMANDS', () => {
  it('has exactly 13 entries (6 phase + 7 utility)', () => {
    expect(Object.keys(WORKFLOW_COMMANDS)).toHaveLength(13);
  });

  it('has all expected filenames', () => {
    const expected = [...PHASE_FILENAMES, ...UTILITY_FILENAMES];
    expect(Object.keys(WORKFLOW_COMMANDS).sort()).toEqual(expected.sort());
  });

  it('every key ends with .md', () => {
    for (const key of Object.keys(WORKFLOW_COMMANDS)) {
      expect(key).toMatch(/\.md$/);
    }
  });

  describe('phase commands', () => {
    it('every phase template contains $ARGUMENTS', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing $ARGUMENTS`).toContain('$ARGUMENTS');
      }
    });

    it('every phase template has a ## Workflow section', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing ## Workflow`).toContain('## Workflow');
      }
    });

    it('every phase template references memory_search or memory_capture', () => {
      for (const key of PHASE_FILENAMES) {
        const template = WORKFLOW_COMMANDS[key];
        const hasMemory =
          template.includes('memory_search') ||
          template.includes('memory_capture');
        expect(hasMemory, `${key} missing memory integration`).toBe(true);
      }
    });

    it('every phase template except lfg references bd (beads integration)', () => {
      for (const key of PHASE_FILENAMES) {
        if (key === 'lfg.md') continue;
        expect(WORKFLOW_COMMANDS[key], `${key} missing bd reference`).toMatch(/\bbd\b/);
      }
    });

    it('lfg.md references all other phases', () => {
      const lfg = WORKFLOW_COMMANDS['lfg.md'];
      const phases = ['brainstorm', 'plan', 'work', 'review', 'compound'];
      for (const phase of phases) {
        expect(lfg, `lfg.md missing reference to ${phase}`).toContain(phase);
      }
    });
  });

  describe('utility commands', () => {
    it('learn.md references ca learn', () => {
      expect(WORKFLOW_COMMANDS['learn.md']).toContain('ca learn');
    });

    it('search.md references ca search', () => {
      expect(WORKFLOW_COMMANDS['search.md']).toContain('ca search');
    });

    it('stats.md references ca stats', () => {
      expect(WORKFLOW_COMMANDS['stats.md']).toContain('ca stats');
    });
  });

  it('every template starts with YAML frontmatter', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      expect(
        template.trimStart().startsWith('---'),
        `${key} does not start with YAML frontmatter (---)`,
      ).toBe(true);
      // Verify closing --- exists
      const firstDelim = template.indexOf('---');
      const secondDelim = template.indexOf('---', firstDelim + 3);
      expect(
        secondDelim,
        `${key} missing closing --- delimiter`,
      ).toBeGreaterThan(firstDelim);
    }
  });

  it('no template exceeds 7000 characters', () => {
    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      expect(
        template.length,
        `${key} is ${template.length} chars (max 7000)`,
      ).toBeLessThanOrEqual(7000);
    }
  });

  /**
   * Claude Code slash command safety tests.
   *
   * Claude Code processes .md templates as slash commands. It substitutes
   * $ARGUMENTS with user input, then scans backtick-enclosed content for
   * shell operators. If user input contains ! ( ) | etc., inline backtick
   * spans that reference $ARGUMENTS trigger permission check failures.
   *
   * Phase templates (brainstorm, plan, work, review, compound, lfg) are
   * instruction-heavy and must avoid shell-unsafe patterns in backticks.
   * Utility templates (learn, show, etc.) are thin CLI wrappers where
   * ```bash blocks are intentional and work correctly.
   */
  describe('slash command shell safety', () => {
    // Shell operators that trigger Claude Code permission checks.
    // Excludes -> (arrow), >= <= (comparison), and = (assignment).
    const SHELL_OPERATORS = /[|!;]|&&|\|\||[<>](?![-=])/;

    for (const [key, template] of Object.entries(WORKFLOW_COMMANDS)) {
      describe(key, () => {
        it('no $ARGUMENTS inside inline backticks', () => {
          // $ARGUMENTS at the very start (standalone line) is the standard
          // slash command pattern. But inside inline backtick code spans,
          // it gets substituted with user text that may contain ! ( ) etc.
          // Fenced blocks (```) are excluded — utility commands use them
          // with properly quoted "$ARGUMENTS" which works fine.
          const inlineBackticks = template.match(/(?<!`)`(?!`)[^`]+`(?!`)/g) ?? [];
          for (const span of inlineBackticks) {
            expect(
              span,
              `${key}: $ARGUMENTS inside inline backtick span risks shell injection`,
            ).not.toContain('$ARGUMENTS');
          }
        });

        it('no shell operators inside inline backticks', () => {
          const inlineBackticks = template.match(/(?<!`)`(?!`)[^`]+`(?!`)/g) ?? [];
          for (const span of inlineBackticks) {
            expect(
              span,
              `${key}: shell operator in inline backtick span ${span}`,
            ).not.toMatch(SHELL_OPERATORS);
          }
        });
      });
    }

    // Phase templates must not use ```bash fenced blocks (Claude Code may
    // try to execute them). Utility templates are allowed — they're thin
    // CLI wrappers where ```bash is intentional.
    for (const key of PHASE_FILENAMES) {
      it(`${key}: no \`\`\`bash fenced code blocks in phase template`, () => {
        expect(
          WORKFLOW_COMMANDS[key],
          `${key}: fenced bash block in phase template risks execution`,
        ).not.toMatch(/```bash/);
      });
    }
  });
});
