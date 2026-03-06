import { describe, it, expect } from 'vitest';
import { WORKFLOW_COMMANDS } from './commands.js';

const PHASE_FILENAMES = [
  'spec-dev.md',
  'plan.md',
  'work.md',
  'review.md',
  'compound.md',
  'cook-it.md',
  'research.md',
  'test-clean.md',
  'get-a-phd.md',
  'agentic-audit.md',
  'agentic-setup.md',
];

const UTILITY_FILENAMES = [
  'learn-that.md',
  'check-that.md',
  'prime.md',
];

/** CLI wrapper commands removed in v1.3+ — must NOT appear in WORKFLOW_COMMANDS. */
const REMOVED_CLI_WRAPPERS = [
  'search.md',
  'list.md',
  'show.md',
  'stats.md',
  'wrong.md',
  'learn.md',
];

describe('WORKFLOW_COMMANDS', () => {
  it('has exactly 14 entries (11 phase + 3 utility)', () => {
    expect(Object.keys(WORKFLOW_COMMANDS)).toHaveLength(14);
  });

  it('has all expected filenames', () => {
    const expected = [...PHASE_FILENAMES, ...UTILITY_FILENAMES];
    expect(Object.keys(WORKFLOW_COMMANDS).sort()).toEqual(expected.sort());
  });

  it('does NOT contain removed CLI wrapper commands', () => {
    for (const key of REMOVED_CLI_WRAPPERS) {
      expect(Object.keys(WORKFLOW_COMMANDS)).not.toContain(key);
    }
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
      const SINGLE_PHASE_FILENAMES = PHASE_FILENAMES.filter((k) => k !== 'cook-it.md' && k !== 'research.md' && k !== 'test-clean.md' && k !== 'get-a-phd.md' && k !== 'agentic-audit.md' && k !== 'agentic-setup.md');
      for (const key of SINGLE_PHASE_FILENAMES) {
        const phase = key.replace('.md', '');
        expect(
          WORKFLOW_COMMANDS[key],
          `${key} missing skill file path`,
        ).toContain(`.claude/skills/compound/${phase}/SKILL.md`);
      }
    });

    it('cook-it.md references reading its own skill file', () => {
      expect(WORKFLOW_COMMANDS['cook-it.md']).toContain('.claude/skills/compound/cook-it/SKILL.md');
    });

    it('research.md references researcher skill file', () => {
      expect(WORKFLOW_COMMANDS['research.md']).toContain('.claude/skills/compound/researcher/SKILL.md');
    });

    it('test-clean.md references test-cleaner skill file', () => {
      expect(WORKFLOW_COMMANDS['test-clean.md']).toContain('.claude/skills/compound/test-cleaner/SKILL.md');
    });

    it('get-a-phd.md references researcher skill file', () => {
      expect(WORKFLOW_COMMANDS['get-a-phd.md']).toContain('.claude/skills/compound/researcher/SKILL.md');
    });

    it('agentic-audit.md references shared agentic skill file', () => {
      expect(WORKFLOW_COMMANDS['agentic-audit.md']).toContain('.claude/skills/compound/agentic/SKILL.md');
    });

    it('agentic-setup.md references shared agentic skill file', () => {
      expect(WORKFLOW_COMMANDS['agentic-setup.md']).toContain('.claude/skills/compound/agentic/SKILL.md');
    });

    it('agentic-audit.md indicates audit mode', () => {
      expect(WORKFLOW_COMMANDS['agentic-audit.md']).toMatch(/audit/i);
    });

    it('agentic-setup.md indicates setup mode', () => {
      expect(WORKFLOW_COMMANDS['agentic-setup.md']).toMatch(/setup/i);
    });

    it('phase commands do NOT have Key steps summaries (forces reading the skill)', () => {
      for (const key of PHASE_FILENAMES) {
        expect(WORKFLOW_COMMANDS[key], `${key} should not have Key steps`).not.toContain(
          'Key steps',
        );
      }
    });
  });

  describe('utility commands (remaining)', () => {
    it('learn-that.md references ca learn and $ARGUMENTS', () => {
      expect(WORKFLOW_COMMANDS['learn-that.md']).toContain('ca learn');
      expect(WORKFLOW_COMMANDS['learn-that.md']).toContain('$ARGUMENTS');
    });

    it('check-that.md references ca search and $ARGUMENTS', () => {
      expect(WORKFLOW_COMMANDS['check-that.md']).toContain('ca search');
      expect(WORKFLOW_COMMANDS['check-that.md']).toContain('$ARGUMENTS');
    });

    it('prime.md references ca prime', () => {
      expect(WORKFLOW_COMMANDS['prime.md']).toContain('ca prime');
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
   * Phase templates (spec-dev, plan, work, review, compound, cook-it) are
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
