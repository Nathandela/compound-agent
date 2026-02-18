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

  describe('phase commands (thin wrappers)', () => {
    it('every phase command contains $ARGUMENTS', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing $ARGUMENTS`).toContain('$ARGUMENTS');
      }
    });

    it('every phase command starts with YAML frontmatter', () => {
      for (const key of PHASE_FILENAMES) {
        expect(
          WORKFLOW_COMMANDS[key].trimStart().startsWith('---'),
          `${key} missing frontmatter`,
        ).toBe(true);
      }
    });

    it('every phase command references its skill', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing skill reference`).toMatch(/skill/i);
      }
    });

    it('every phase command is under 500 characters', () => {
      for (const key of PHASE_FILENAMES) {
        expect(
          WORKFLOW_COMMANDS[key].length,
          `${key} is ${WORKFLOW_COMMANDS[key].length} chars (max 500)`,
        ).toBeLessThanOrEqual(500);
      }
    });

    it('phase commands do NOT have ## Workflow sections (content moved to skills)', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} should not have ## Workflow`).not.toContain(
          '## Workflow',
        );
      }
    });

    it('every phase command enforces reading the skill file first (MANDATORY)', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} missing MANDATORY read enforcement`).toMatch(
          /MANDATORY.*Read tool/i,
        );
      }
    });

    it('every phase command references the skill file path', () => {
      const SINGLE_PHASE_FILENAMES = PHASE_FILENAMES.filter((k) => k !== 'lfg.md');
      for (const key of SINGLE_PHASE_FILENAMES) {
        const phase = key.replace('.md', '');
        expect(
          WORKFLOW_COMMANDS[key],
          `${key} missing skill file path`,
        ).toContain(`.claude/skills/compound/${phase}/SKILL.md`);
      }
    });

    it('lfg.md references reading its own skill file', () => {
      expect(WORKFLOW_COMMANDS['lfg.md']).toContain('.claude/skills/compound/lfg/SKILL.md');
    });

    it('phase commands do NOT have Key steps summaries (forces reading the skill)', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} should not have Key steps`).not.toContain(
          'Key steps',
        );
      }
    });
  });

  describe('utility commands (unchanged)', () => {
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
      expect(secondDelim, `${key} missing closing --- delimiter`).toBeGreaterThan(firstDelim);
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
    // try to execute them). Utility templates are allowed -- they're thin
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
