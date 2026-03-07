# Research Index

> Shipped by compound-agent. Source: `docs/research/` in the compound-agent package.

Research documents that inform project design decisions, agent methodology, and domain knowledge.

## External Articles

External articles that directly influenced compound-agent's architecture.

| Document | Description |
|----------|-------------|
| [BuildingACCompilerAnthropic.md](BuildingACCompilerAnthropic.md) | Anthropic's article on building a C compiler with parallel Claude agent teams |
| [HarnessEngineeringOpenAi.md](HarnessEngineeringOpenAi.md) | OpenAI's article on harness engineering and leveraging Codex in agent-first workflows |
| [AgenticAiCodebaseGuide.md](AgenticAiCodebaseGuide.md) | Guide to building codebases optimized for agentic AI development |

## PhD Research Surveys

Deep research produced via `/compound:get-a-phd` for agent domain knowledge. Each follows the researcher skill template.

### Code Review

| Document | Target Agents |
|----------|---------------|
| [code-review/systematic-review-methodology.md](code-review/systematic-review-methodology.md) | review phase, security-reviewer, architecture-reviewer, performance-reviewer, simplicity-reviewer, test-coverage-reviewer |

### Learning Systems

| Document | Target Agents |
|----------|---------------|
| [learning-systems/knowledge-compounding-for-agents.md](learning-systems/knowledge-compounding-for-agents.md) | compound phase, context-analyzer, lesson-extractor, pattern-matcher, solution-writer, compounding |

### TDD

| Document | Target Agents |
|----------|---------------|
| [tdd/test-driven-development-methodology.md](tdd/test-driven-development-methodology.md) | work phase, test-writer, implementer, cct-subagent |

### Property Testing

| Document | Target Agents |
|----------|---------------|
| [property-testing/property-based-testing-and-invariants.md](property-testing/property-based-testing-and-invariants.md) | invariant-designer, property-test-generator, anti-cargo-cult-reviewer, module-boundary-reviewer, drift-detector |

### Security

| Document | Target Agents |
|----------|---------------|
| [security/secure-coding-failure.md](security/secure-coding-failure.md) | security-reviewer, security-injection, security-secrets, security-auth, security-data, security-deps |
| [security/overview.md](security/overview.md) | security-reviewer |
| [security/injection-patterns.md](security/injection-patterns.md) | security-reviewer, security-injection |
| [security/secrets-checklist.md](security/secrets-checklist.md) | security-reviewer, security-secrets |
| [security/auth-patterns.md](security/auth-patterns.md) | security-reviewer, security-auth |
| [security/data-exposure.md](security/data-exposure.md) | security-reviewer, security-data |
| [security/dependency-security.md](security/dependency-security.md) | security-reviewer, security-deps |

## Existing Analysis

| Document | Description |
|----------|-------------|
| [test-optimization-strategies.md](test-optimization-strategies.md) | Analysis of test suite optimization approaches |

## How to Add Research

Use `/compound:get-a-phd` to produce new research documents. The command:
1. Analyzes beads epics for knowledge gaps
2. Checks all `docs/` for existing coverage
3. Proposes PhD topics for user confirmation
4. Spawns parallel researcher subagents
5. Stores output at `docs/compound/research/<topic>/<slug>.md`

## How Agents Use Research

Skills and agents reference research via `## Literature` sections. Agents can also query indexed knowledge:
```bash
npx ca knowledge "relevant query"  # Search docs knowledge base
npx ca search "relevant query"     # Search lessons memory
```
