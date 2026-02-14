# Research Index

External articles and research that informed project design decisions and architecture.

## Documents

| Document | Description |
|----------|-------------|
| [BuildingACCompilerAnthropic.md](BuildingACCompilerAnthropic.md) | Anthropic's article on building a C compiler with parallel Claude agent teams |
| [HarnessEngineeringOpenAi.md](HarnessEngineeringOpenAi.md) | OpenAI's article on harness engineering and leveraging Codex in agent-first workflows |
| [AgenticAiCodebaseGuide.md](AgenticAiCodebaseGuide.md) | Guide to building codebases optimized for agentic AI development |

## Key Synthesis

Across all three sources, consistent themes emerge: mechanical enforcement (lint rules, tests) is more reliable than documentation for steering agents; agent-targeted error messages that inject remediation into context are critical; and context window budget must be treated as a scarce resource -- concise, actionable output over verbose explanations.

## When to Read

- **Exploring agent architecture patterns** -- All three articles discuss agent coordination and feedback loops
- **Understanding design influences** -- These directly informed compound-agent's approach
- **Designing lint rules for agents** -- See key synthesis and the OpenAI/Anthropic articles for error message patterns
