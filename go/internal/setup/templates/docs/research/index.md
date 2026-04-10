# Research Index

> Shipped by compound-agent. Source: `docs/compound/research/` in the compound-agent repo.
> **This directory is fully managed by `ca init`.** Do not add files here -- they will be pruned on the next run. Place user-authored research in `docs/research/` instead.

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
| [tdd/architecture-tests-archunit.md](tdd/architecture-tests-archunit.md) | surface-alignment-reviewer, architecture-reviewer, drift-detector, agentic-setup |
| [tdd/regenerate-and-diff-testing.md](tdd/regenerate-and-diff-testing.md) | surface-alignment-reviewer, drift-detector, build-great-things |
| [tdd/database-testing-patterns.md](tdd/database-testing-patterns.md) | surface-alignment-reviewer, test-coverage-reviewer, anti-cargo-cult-reviewer |
| [tdd/test-infrastructure-as-code.md](tdd/test-infrastructure-as-code.md) | surface-alignment-reviewer, test-coverage-reviewer, agentic-setup |

### Schema Evolution

| Document | Target Agents |
|----------|---------------|
| [spec_design/protobuf-schema-evolution.md](spec_design/protobuf-schema-evolution.md) | surface-alignment-reviewer, architecture-reviewer, spec-dev |

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

### Web Design & UX

| Document | Target Skills/Agents |
|----------|---------------------|
| [design/web-apps/refactoring-ui-design-principles.md](design/web-apps/refactoring-ui-design-principles.md) | build-great-things |
| [design/web-apps/web-typography-and-reading-ergonomics.md](design/web-apps/web-typography-and-reading-ergonomics.md) | build-great-things |
| [design/web-apps/color-theory-for-digital-interfaces.md](design/web-apps/color-theory-for-digital-interfaces.md) | build-great-things |
| [design/web-apps/information-architecture-and-navigation.md](design/web-apps/information-architecture-and-navigation.md) | build-great-things |
| [design/web-apps/cognitive-load-and-attention-design.md](design/web-apps/cognitive-load-and-attention-design.md) | build-great-things |
| [design/web-apps/interaction-design-and-micro-interactions.md](design/web-apps/interaction-design-and-micro-interactions.md) | build-great-things |
| [design/web-apps/design-systems-and-component-architecture.md](design/web-apps/design-systems-and-component-architecture.md) | build-great-things |
| [design/web-apps/state-forms-and-complex-flow-ux.md](design/web-apps/state-forms-and-complex-flow-ux.md) | build-great-things |
| [design/web-apps/performance-perception-and-loading-ux.md](design/web-apps/performance-perception-and-loading-ux.md) | build-great-things |
| [design/web-apps/accessibility-and-inclusive-design.md](design/web-apps/accessibility-and-inclusive-design.md) | build-great-things |
| [design/web-apps/responsive-and-adaptive-design.md](design/web-apps/responsive-and-adaptive-design.md) | build-great-things |
| [design/web-apps/content-strategy-ux-writing.md](design/web-apps/content-strategy-ux-writing.md) | build-great-things |
| [design/web-apps/onboarding-and-progressive-feature-disclosure.md](design/web-apps/onboarding-and-progressive-feature-disclosure.md) | build-great-things |
| [design/web-apps/real-time-and-collaborative-ux.md](design/web-apps/real-time-and-collaborative-ux.md) | build-great-things |
| [design/frontend-design/computational-motion-design.md](design/frontend-design/computational-motion-design.md) | build-great-things |
| [design/frontend-design/award-winning-websites-anatomy.md](design/frontend-design/award-winning-websites-anatomy.md) | build-great-things |
| [design/frontend-design/advanced-css-and-wbgl-visual-craft.md](design/frontend-design/advanced-css-and-wbgl-visual-craft.md) | build-great-things |
| [design/frontend-design/theme-specific-structural-differentiation.md](design/frontend-design/theme-specific-structural-differentiation.md) | build-great-things |
| [design/financial-reports/kpi-dashboard-design.md](design/financial-reports/kpi-dashboard-design.md) | build-great-things |
| [design/financial-reports/financial-data-visualisation-for-investment-vehicle-factsheets.md](design/financial-reports/financial-data-visualisation-for-investment-vehicle-factsheets.md) | build-great-things |
| [design/financial-reports/information-density-and-layered-reading-in-financial-documents.md](design/financial-reports/information-density-and-layered-reading-in-financial-documents.md) | build-great-things |
| [design/financial-reports/the-design-of-financial-tables.md](design/financial-reports/the-design-of-financial-tables.md) | build-great-things |
| [design/grid/mueller-brockmann-grid-systems.md](design/grid/mueller-brockmann-grid-systems.md) | build-great-things |
| [design/style/swiss-international.md](design/style/swiss-international.md) | build-great-things |
| [design/style/swiss-brutalist-design.md](design/style/swiss-brutalist-design.md) | build-great-things |
| [design/style/editorial-design.md](design/style/editorial-design.md) | build-great-things |
| [design/style/luxury-design.md](design/style/luxury-design.md) | build-great-things |
| [design/style/academic-design-style.md](design/style/academic-design-style.md) | build-great-things |
| [design/style/synthwave-retrofuturist-design.md](design/style/synthwave-retrofuturist-design.md) | build-great-things |

### B2C Product & Growth

| Document | Target Skills/Agents |
|----------|---------------------|
| [b2c_product/visual-brand-identity-at-speed.md](b2c_product/visual-brand-identity-at-speed.md) | build-great-things |
| [b2c_product/positioning-theory-category-design.md](b2c_product/positioning-theory-category-design.md) | build-great-things |
| [b2c_product/jobs-to-be-done-theory.md](b2c_product/jobs-to-be-done-theory.md) | build-great-things |
| [b2c_product/landing-page-conversion-science.md](b2c_product/landing-page-conversion-science.md) | build-great-things |
| [b2c_product/storytelling-narrative-positioning.md](b2c_product/storytelling-narrative-positioning.md) | build-great-things |
| [b2c_product/consumer-behavioral-psychology.md](b2c_product/consumer-behavioral-psychology.md) | build-great-things |
| [b2c_product/trust-deficit-economy.md](b2c_product/trust-deficit-economy.md) | build-great-things |
| [b2c_product/design-thinking-ethnographic-research.md](b2c_product/design-thinking-ethnographic-research.md) | build-great-things |
| [b2c_product/market-growth/product-led-growth.md](b2c_product/market-growth/product-led-growth.md) | build-great-things |
| [b2c_product/market-growth/retention-engineering-lifecycle-optimization.md](b2c_product/market-growth/retention-engineering-lifecycle-optimization.md) | build-great-things |
| [b2c_product/market-growth/experimentation-growth-analytics.md](b2c_product/market-growth/experimentation-growth-analytics.md) | build-great-things |
| [b2c_product/market-growth/content-seo-product-strategy.md](b2c_product/market-growth/content-seo-product-strategy.md) | build-great-things |
| [b2c_product/market-growth/go-to-market-launch-strategy.md](b2c_product/market-growth/go-to-market-launch-strategy.md) | build-great-things |
| [b2c_product/market-growth/community-led-growth.md](b2c_product/market-growth/community-led-growth.md) | build-great-things |
| [b2c_product/market-growth/growth-loops-compound-growth.md](b2c_product/market-growth/growth-loops-compound-growth.md) | build-great-things |

### Software Design

| Document | Target Skills/Agents |
|----------|---------------------|
| [development/software-design/philosophy-of-software-design.md](development/software-design/philosophy-of-software-design.md) | build-great-things, architect |

### Web Application Development

| Document | Target Skills/Agents |
|----------|---------------------|
| [development/web-apps/state-management-architecture.md](development/web-apps/state-management-architecture.md) | build-great-things |
| [development/web-apps/optimistic-ui-local-first-patterns.md](development/web-apps/optimistic-ui-local-first-patterns.md) | build-great-things |
| [development/web-apps/analytics-instrumentation-design.md](development/web-apps/analytics-instrumentation-design.md) | build-great-things |
| [development/web-apps/spa-seo-crawlability.md](development/web-apps/spa-seo-crawlability.md) | build-great-things |
| [development/web-apps/web-application-security.md](development/web-apps/web-application-security.md) | build-great-things |

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
5. Stores output at `docs/research/<topic>/<slug>.md`

## How Agents Use Research

Skills and agents reference research via `## Literature` sections. Agents can also query indexed knowledge:
```bash
ca knowledge "relevant query"  # Search docs knowledge base
ca search "relevant query"     # Search lessons memory
```
