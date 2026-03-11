import { describe, it, expect } from 'vitest';
import { PHASE_SKILLS, PHASE_SKILL_REFERENCES } from './skills.js';

const EXPECTED_KEYS = ['spec-dev', 'plan', 'work', 'review', 'compound', 'researcher', 'cook-it', 'test-cleaner', 'agentic', 'architect'];

describe('PHASE_SKILLS', () => {
  it('has exactly 10 entries', () => {
    expect(Object.keys(PHASE_SKILLS)).toHaveLength(10);
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

  it('every phase skill has a ## Methodology section (cook-it uses Phase Execution Protocol, agentic uses Audit/Setup Methodology, architect uses Phase N)', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      if (key === 'cook-it') {
        expect(content, `${key} missing ## Phase Execution Protocol`).toContain('## Phase Execution Protocol');
      } else if (key === 'agentic') {
        expect(content, `${key} missing ## Audit Methodology`).toContain('## Audit Methodology');
        expect(content, `${key} missing ## Setup Methodology`).toContain('## Setup Methodology');
      } else if (key === 'architect') {
        expect(content, `${key} missing ## Phase 1`).toContain('## Phase 1');
        expect(content, `${key} missing ## Phase 4`).toContain('## Phase 4');
      } else {
        expect(content, `${key} missing ## Methodology`).toContain('## Methodology');
      }
    }
  });

  it('every template has a ## Common Pitfalls section', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(content, `${key} missing ## Common Pitfalls`).toContain('## Common Pitfalls');
    }
  });

  it('every template references memory CLI commands', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      const hasMemory =
        content.includes('npx ca search') ||
        content.includes('npx ca learn');
      expect(hasMemory, `${key} missing memory CLI command reference`).toBe(true);
    }
  });

  it('no template exceeds 6000 characters (agentic allowed 12000 due to inline principles)', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      const max = key === 'agentic' ? 12000 : 6000;
      expect(
        content.length,
        `${key} is ${content.length} chars (max ${max})`,
      ).toBeLessThanOrEqual(max);
    }
  });

  it('every template has a ## Quality Criteria section', () => {
    for (const [key, content] of Object.entries(PHASE_SKILLS)) {
      expect(content, `${key} missing ## Quality Criteria`).toContain('## Quality Criteria');
    }
  });

  // --- Phase gate assertions (preserved from v1.2.5) ---

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

  // --- New v1.2.6 assertions: skills absorb detailed workflow ---

  it('work skill contains AgentTeam deployment language', () => {
    expect(PHASE_SKILLS.work).toMatch(/AgentTeam/);
  });

  it('work skill contains parallelization instructions', () => {
    expect(PHASE_SKILLS.work).toMatch(/paralleliz/i);
  });

  it('work skill references bd ready and bd close for beads lifecycle', () => {
    expect(PHASE_SKILLS.work).toContain('bd ready');
    expect(PHASE_SKILLS.work).toContain('bd close');
  });

  it('work skill references implementation-reviewer', () => {
    expect(PHASE_SKILLS.work).toContain('implementation-reviewer');
  });

  it('review skill contains AgentTeam deployment language', () => {
    expect(PHASE_SKILLS.review).toMatch(/AgentTeam/);
  });

  it('review skill contains adaptive tier references', () => {
    expect(PHASE_SKILLS.review).toMatch(/<100 lines/);
  });

  it('compound skill contains AgentTeam deployment language', () => {
    expect(PHASE_SKILLS.compound).toMatch(/AgentTeam/);
  });

  it('compound skill contains SendMessage for team coordination', () => {
    expect(PHASE_SKILLS.compound).toMatch(/SendMessage/);
  });

  // --- cook-it orchestration skill ---

  it('cook-it skill contains READ BEFORE EXECUTE rule', () => {
    expect(PHASE_SKILLS['cook-it']).toContain('READ BEFORE EXECUTE');
    expect(PHASE_SKILLS['cook-it']).toContain('Read tool');
  });

  it('cook-it skill lists all 5 phase skill file paths', () => {
    const phases = ['spec-dev', 'plan', 'work', 'review', 'compound'];
    for (const phase of phases) {
      expect(PHASE_SKILLS['cook-it']).toContain(`.claude/skills/compound/${phase}/SKILL.md`);
    }
  });

  it('cook-it skill contains phase gates', () => {
    expect(PHASE_SKILLS['cook-it']).toContain('GATE 3');
    expect(PHASE_SKILLS['cook-it']).toContain('GATE 4');
    expect(PHASE_SKILLS['cook-it']).toContain('FINAL GATE');
  });

  it('cook-it skill references phase-check init/start/gate flow', () => {
    expect(PHASE_SKILLS['cook-it']).toContain('phase-check init');
    expect(PHASE_SKILLS['cook-it']).toContain('phase-check start');
    expect(PHASE_SKILLS['cook-it']).toContain('phase-check gate post-plan');
    expect(PHASE_SKILLS['cook-it']).toContain('phase-check gate gate-3');
    expect(PHASE_SKILLS['cook-it']).toContain('phase-check gate gate-4');
    expect(PHASE_SKILLS['cook-it']).toContain('phase-check gate final');
  });

  it('cook-it skill contains phase control (skip/resume/retry)', () => {
    expect(PHASE_SKILLS['cook-it']).toMatch(/skip/i);
    expect(PHASE_SKILLS['cook-it']).toMatch(/resume/i);
    expect(PHASE_SKILLS['cook-it']).toMatch(/retry/i);
  });

  it('cook-it skill contains session close protocol', () => {
    expect(PHASE_SKILLS['cook-it']).toContain('SESSION CLOSE');
  });

  it('cook-it skill references verify-gates', () => {
    expect(PHASE_SKILLS['cook-it']).toContain('verify-gates');
  });

  // --- agentic codebase skill ---

  it('agentic skill contains all 15 principles', () => {
    const skill = PHASE_SKILLS.agentic;
    // Pillar I: Codebase Memory
    expect(skill).toContain('Repository is the only truth');
    expect(skill).toContain('Trace decisions');
    expect(skill).toContain('Never answer the same question twice');
    expect(skill).toContain('Knowledge is infrastructure');
    // Pillar II: Implementation Feedbacks
    expect(skill).toContain('Test is specification');
    expect(skill).toContain('Constraints are multipliers');
    expect(skill).toContain('Write feedback for machines');
    expect(skill).toContain('Fight entropy continuously');
    // Pillar III: Mapping the Context
    expect(skill).toContain('Map, not manual');
    expect(skill).toContain('Explicit over implicit');
    expect(skill).toContain('Modularity is non-negotiable');
    expect(skill).toContain('Structure in layers');
    // Cross-Cutting
    expect(skill).toContain('Simplicity compounds');
    expect(skill).toContain('Human designs the system');
    expect(skill).toContain('Parallelize by decomposition');
  });

  it('agentic skill contains scoring rubric (0, 1, 2)', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toMatch(/0.*absent/i);
    expect(skill).toMatch(/1.*partial/i);
    expect(skill).toMatch(/2.*present/i);
  });

  it('agentic skill contains pillar score aggregation', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toContain('Pillar I');
    expect(skill).toContain('Pillar II');
    expect(skill).toContain('Pillar III');
    expect(skill).toContain('Cross-Cutting');
  });

  it('agentic skill references AskUserQuestion for beads epic offer', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toContain('AskUserQuestion');
  });

  it('agentic skill contains stack detection guidance', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toMatch(/package\.json|pyproject\.toml|Cargo\.toml/);
  });

  it('agentic skill setup section references AGENTS.md generation', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toContain('AGENTS.md');
  });

  it('agentic skill references both audit and setup modes', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toMatch(/mode.*audit/i);
    expect(skill).toMatch(/mode.*setup/i);
  });

  it('agentic skill report format has markdown table separator row', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toContain('|---|');
  });

  it('agentic skill has setup remediation for all 15 principles (P1-P15)', () => {
    const skill = PHASE_SKILLS.agentic;
    // Verify all principles have remediation guidance in setup section
    for (const p of ['P1', 'P2', 'P3', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15']) {
      expect(skill, `missing setup remediation for ${p}`).toContain(`**${p}`);
    }
  });

  it('agentic skill has setup completion gate', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toContain('Setup Completion Gate');
  });

  it('agentic skill has stack-adaptive scoring guidance', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toMatch(/adapt.*criteria.*stack/i);
  });

  it('agentic skill mode is set by calling command, not parsed from $ARGUMENTS', () => {
    const skill = PHASE_SKILLS.agentic;
    expect(skill).toContain('Mode is set by the calling command');
    expect(skill).not.toMatch(/Parse.*\$ARGUMENTS.*to determine mode/);
  });

  // --- architect skill ---

  it('architect skill has 4 phases: Socratic, Spec, Decompose, Materialize', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('Socratic');
    expect(skill).toContain('Spec');
    expect(skill).toContain('Decompose');
    expect(skill).toContain('Materialize');
  });

  it('architect skill has 3 human gates (AskUserQuestion)', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('AskUserQuestion');
    // Should reference gates between phases
    expect(skill).toMatch(/Gate.*1|Gate.*Socratic/i);
    expect(skill).toMatch(/Gate.*2|Gate.*Spec/i);
    expect(skill).toMatch(/Gate.*3|Gate.*Decompose/i);
  });

  it('architect skill references DDD bounded contexts for decomposition', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/bounded context/i);
  });

  it('architect skill references 6 subagent roles for decomposition', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/context mapper/i);
    expect(skill).toMatch(/dependency analyst/i);
    expect(skill).toMatch(/scope sizer/i);
    expect(skill).toMatch(/interface designer/i);
    expect(skill).toMatch(/control structure analyst/i);
    expect(skill).toMatch(/gap analyst/i);
  });

  it('architect skill produces interface contracts between epics', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/interface contract/i);
  });

  it('architect skill creates beads via bd create', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('bd create');
  });

  it('architect skill wires dependencies via bd dep add', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('bd dep add');
  });

  it('architect skill writes spec to docs/specs/', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('docs/specs/');
  });

  it('architect skill references EARS notation', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('EARS');
  });

  it('architect skill references memory search', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('npx ca search');
    expect(skill).toContain('npx ca knowledge');
  });

  // --- Research-enriched content assertions ---

  // Architect: reversibility, Cynefin, implicit contracts, STPA, gap analysis, org alignment, assumptions, phase transitions
  it('architect skill contains reversibility analysis', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/reversibility/i);
    expect(skill).toMatch(/irreversible/i);
  });

  it('architect skill contains change volatility assessment', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/volatility/i);
    expect(skill).toMatch(/modularity investment/i);
  });

  it('architect skill contains STPA control structure analysis', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toContain('STPA');
    expect(skill).toMatch(/control structure/i);
    expect(skill).toMatch(/hazard/i);
  });

  it('architect skill contains implicit interface contracts', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/implicit contract/i);
    expect(skill).toMatch(/backpressure/i);
    expect(skill).toMatch(/delivery guarantee/i);
  });

  it('architect skill contains structural-semantic gap analysis', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/gap analyst/i);
    expect(skill).toMatch(/semantic partition/i);
  });

  it('architect skill contains organizational alignment check', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/org alignment/i);
    expect(skill).toMatch(/stream-aligned/i);
  });

  it('architect skill contains multi-criteria validation gate', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/multi-criteria/i);
    expect(skill).toContain('Structural');
    expect(skill).toContain('Semantic');
    expect(skill).toContain('Organizational');
    expect(skill).toContain('Economic');
  });

  it('architect skill contains assumption capture and fitness functions', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/assumption/i);
    expect(skill).toMatch(/fitness function/i);
    expect(skill).toMatch(/re-decomposition/i);
  });

  it('architect pitfalls reference Cynefin and Garlan', () => {
    const skill = PHASE_SKILLS.architect;
    expect(skill).toMatch(/Cynefin/i);
    expect(skill).toMatch(/Garlan/i);
  });

  // Spec-dev: Cynefin, composition EARS, change volatility
  it('spec-dev skill contains Cynefin classification', () => {
    const skill = PHASE_SKILLS['spec-dev'];
    expect(skill).toMatch(/Cynefin/i);
    expect(skill).toMatch(/Clear.*Complicated.*Complex/i);
  });

  it('spec-dev skill contains change volatility assessment', () => {
    const skill = PHASE_SKILLS['spec-dev'];
    expect(skill).toMatch(/volatility/i);
  });

  it('spec-dev skill contains composition EARS templates', () => {
    const skill = PHASE_SKILLS['spec-dev'];
    expect(skill).toMatch(/times out/i);
    expect(skill).toMatch(/retries/i);
  });

  // Plan: boundary stability, LRM, change coupling
  it('plan skill contains boundary stability check', () => {
    const skill = PHASE_SKILLS.plan;
    expect(skill).toMatch(/boundary.*stability|stability.*check/i);
  });

  it('plan skill contains Last Responsible Moment', () => {
    const skill = PHASE_SKILLS.plan;
    expect(skill).toMatch(/Last Responsible Moment/i);
    expect(skill).toMatch(/defer/i);
  });

  it('plan skill contains change coupling check', () => {
    const skill = PHASE_SKILLS.plan;
    expect(skill).toMatch(/change coupling/i);
  });

  // Work: tech debt quadrant, composition boundary verification
  it('work skill contains technical debt protocol', () => {
    const skill = PHASE_SKILLS.work;
    expect(skill).toMatch(/Technical Debt/i);
    expect(skill).toMatch(/Prudent.*Deliberate/i);
  });

  it('work skill contains composition boundary verification', () => {
    const skill = PHASE_SKILLS.work;
    expect(skill).toMatch(/Composition Boundary/i);
    expect(skill).toMatch(/metastable/i);
  });

  // Review: boundary, control structure, observability reviewers
  it('review skill contains composition-specific reviewers', () => {
    const skill = PHASE_SKILLS.review;
    expect(skill).toMatch(/boundary-reviewer/i);
    expect(skill).toMatch(/control-structure-reviewer/i);
    expect(skill).toMatch(/observability-reviewer/i);
  });

  it('review skill validates architect assumptions', () => {
    const skill = PHASE_SKILLS.review;
    expect(skill).toMatch(/assumption/i);
    expect(skill).toMatch(/change coupling/i);
  });

  // Compound: decomposition lessons, assumption tracking, emergence analysis
  it('compound skill contains decomposition quality assessment', () => {
    const skill = PHASE_SKILLS.compound;
    expect(skill).toMatch(/decomposition quality/i);
    expect(skill).toMatch(/boundary.*succeeded|boundary.*failed/i);
  });

  it('compound skill contains assumption tracking', () => {
    const skill = PHASE_SKILLS.compound;
    expect(skill).toMatch(/assumption tracking/i);
    expect(skill).toMatch(/predicted vs actual/i);
  });

  it('compound skill contains emergence analysis', () => {
    const skill = PHASE_SKILLS.compound;
    expect(skill).toMatch(/emergence analysis/i);
    expect(skill).toMatch(/Garlan/i);
    expect(skill).toMatch(/STPA/i);
    expect(skill).toMatch(/phase transition/i);
  });
});

describe('PHASE_SKILL_REFERENCES', () => {
  it('contains the spec-guide.md reference file', () => {
    expect(PHASE_SKILL_REFERENCES['spec-dev/references/spec-guide.md']).toBeDefined();
  });

  it('spec-guide.md contains EARS notation patterns', () => {
    const content = PHASE_SKILL_REFERENCES['spec-dev/references/spec-guide.md']!;
    expect(content).toContain('EARS');
    expect(content).toContain('Ubiquitous');
    expect(content).toContain('Event-driven');
    expect(content).toContain('State-driven');
  });

  it('spec-guide.md contains Mermaid diagram guide', () => {
    const content = PHASE_SKILL_REFERENCES['spec-dev/references/spec-guide.md']!;
    expect(content).toContain('Mermaid');
    expect(content).toContain('mindmap');
    expect(content).toContain('sequenceDiagram');
  });

  it('spec-guide.md contains ambiguity checklist', () => {
    const content = PHASE_SKILL_REFERENCES['spec-dev/references/spec-guide.md']!;
    expect(content).toContain('Ambiguity');
    expect(content).toContain('Vague adjectives');
  });

  it('spec-guide.md contains trade-off framework', () => {
    const content = PHASE_SKILL_REFERENCES['spec-dev/references/spec-guide.md']!;
    expect(content).toContain('Trade-off');
    expect(content).toContain('Reversibility');
  });
});
