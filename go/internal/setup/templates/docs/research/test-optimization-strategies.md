# Test Optimization Strategies for Agent-Driven Codebases

*2026-02-20*

## Abstract

As autonomous coding agents transition from single-session pair-programming tools to long-running, multi-agent teams producing hundreds of thousands of lines of code, the testing infrastructure that governs their behavior becomes the primary mechanism of software quality control. Traditional testing assumptions -- that a human developer writes tests, reads output, and decides what to do next -- no longer hold when the "developer" is a language model operating in a loop with no human in the critical path. This creates a distinct set of engineering challenges: tests must be fast enough that agents do not waste context on waiting, structured enough that agents can parse results without polluting their context window, and comprehensive enough that autonomous agents do not silently regress existing functionality while pursuing new features.

This survey examines the emerging landscape of test optimization strategies purpose-built for or adapted to agent-driven development. We identify nine major areas of concern -- test segmentation, random subsampling, coverage-speed trade-offs, machine-readable output formats, parallel execution, entropy management, invariant-driven test design, anti-cargo-cult testing, and module-scoped independence -- and analyze each through the lens of both classical software engineering research and the nascent but rapidly growing body of practitioner evidence from teams operating at scale with autonomous agents (Anthropic's C compiler project, OpenAI's Codex-driven product, Meta's JiTTesting framework). Where the evidence is thin, we say so. Where approaches conflict, we present the tensions rather than resolving them.

The central finding is that test optimization in agent-driven codebases is not merely a performance problem (run tests faster) but an information design problem (present the right signal to the agent at the right time in the right format). The trade-offs between coverage, speed, context pollution, and determinism form a multi-dimensional space that no single strategy dominates.

## 1. Introduction

### 1.1 Problem Statement

When a human developer runs a test suite, they bring to the interaction a rich set of capabilities that testing frameworks have historically taken for granted: the ability to scan thousands of lines of output and focus on the relevant failure, the ability to remember what they changed and correlate it with what broke, the ability to estimate how long a test run will take and decide whether to wait or context-switch, and the ability to distinguish a meaningful failure from a flaky one based on institutional memory.

Autonomous coding agents possess none of these capabilities natively. A language model operating in a Claude Code session or OpenAI Codex task has a finite context window that test output competes with for space. It has no persistent memory across sessions unless explicitly provided. It cannot tell time and will, left unattended, spend hours running a full test suite when a 1% sample would suffice (Carlini, 2026). It pattern-matches on whatever text appears in its context, meaning that verbose, unstructured test output actively degrades its reasoning quality.

The problem, then, is: how should test infrastructure be designed, segmented, executed, and reported so that autonomous agents can maintain software quality at the speed and scale at which they operate?

### 1.2 Scope

This survey covers strategies for optimizing test execution and feedback in codebases where the primary "consumer" of test results is an AI coding agent rather than (or in addition to) a human developer. We address:

- **In scope**: Test segmentation and selection strategies, random subsampling with coverage guarantees, machine-readable output formats, parallel execution architectures, entropy and drift management, invariant-driven test design, property-based testing, anti-cargo-cult testing patterns, and module-scoped test independence.
- **Out of scope**: AI-generated test case synthesis (e.g., Meta's JiTTesting is discussed only as it relates to test optimization, not as a test generation technique), end-to-end UI testing automation, performance/load testing, and testing of the AI models themselves (evaluation harnesses for LLMs).

### 1.3 Key Definitions

- **Agent-driven codebase**: A codebase where the majority of code changes are produced by autonomous AI agents (LLMs operating with tool access) with human oversight at the steering/review layer rather than the keystroke layer.
- **Context pollution**: The degradation of agent reasoning quality caused by irrelevant or excessive text consuming space in the agent's context window.
- **Time-blindness**: The inability of current LLMs to perceive elapsed wall-clock time, leading to unbounded execution of long-running operations unless externally constrained.
- **Test entropy**: The gradual accumulation of test suite disorder -- flaky tests, redundant assertions, stale fixtures, orphaned helpers -- that degrades both signal quality and execution speed over time.
- **Deterministic subsampling**: A technique where each agent instance runs a consistent (reproducible) subset of tests, determined by a seed value, while the ensemble of agents collectively covers the full suite.
- **Machine-readable feedback**: Test output structured so that an agent can parse it programmatically (grep, JSON parsing, regex extraction) rather than relying on natural language comprehension of prose-formatted results.

## 2. Foundations

### 2.1 Classical Test Selection and Prioritization

The problem of selecting which tests to run and in what order predates agent-driven development by decades. Regression test selection (RTS) aims to identify the subset of tests affected by a code change, avoiding the cost of running the entire suite. Rothermel and Harrold (1997) established the foundational framework, distinguishing between safe RTS (guaranteed to include all change-revealing tests) and heuristic RTS (which may miss some). Test case prioritization (TCP) reorders tests to maximize early fault detection, typically measured by the Average Percentage of Faults Detected (APFD) metric (Elbaum et al., 2002).

Machine learning approaches to TCP have shown substantial improvements. A systematic literature review by Azizi (2021) covering over 100 studies found that ML-based prioritization achieves 30-45% reduction in testing time while maintaining equivalent or superior fault detection rates compared to full-suite execution. More recent work at the AST 2024 conference demonstrated that hyperparameter-optimized ML models for TCP can further close the gap between heuristic and safe selection approaches (ACM/IEEE AST, 2024).

These classical techniques form the theoretical substrate upon which agent-specific optimizations are built, but they were designed for a world where selection decisions are made by CI infrastructure or human developers -- not by the agents themselves.

### 2.2 The Agent Execution Model

To understand why agent-driven codebases require distinct test optimization strategies, it is necessary to understand the agent execution model. In the paradigm established by projects like Carlini's C compiler (Anthropic, 2026) and OpenAI's Codex-driven product (Lopopolo, 2026), the typical agent workflow is:

1. **Orient**: The agent reads project state (READMEs, progress files, test results) to determine what to work on.
2. **Plan**: The agent selects a task, often by examining failing tests or a task queue.
3. **Implement**: The agent writes or modifies code.
4. **Verify**: The agent runs tests to check its work.
5. **Commit**: The agent pushes changes (potentially merging with work from other agents).
6. **Loop**: The process repeats, often indefinitely.

Each step consumes context. The verification step is particularly expensive because test output can easily dominate the context window. If a full test suite produces 10,000 lines of output, an agent with a 200K-token context window has lost a significant fraction of its reasoning capacity to test noise. This is the fundamental tension: agents need comprehensive test feedback to avoid regressions, but comprehensive feedback can poison their ability to act on it.

### 2.3 Lamport's Safety and Liveness Framework

Leslie Lamport's distinction between safety properties ("bad things never happen") and liveness properties ("good things eventually happen"), first articulated for concurrent systems (Lamport, 1977) and later formalized with Alpern and Schneider (1985), provides a rigorous conceptual framework for reasoning about what tests should verify in agent-driven codebases.

Safety properties are verified by invariant arguments: one proves that no reachable state violates the property. Liveness properties require well-foundedness arguments: one proves that progress is always eventually made. In the testing domain, this maps to:

- **Safety tests**: Assertions that critical invariants hold after every change. "The compiler never generates invalid x86 instructions." "The API never returns a 500 error for valid input." These correspond to regression tests and invariant checks.
- **Liveness tests**: Assertions that the system can complete its intended tasks. "The compiler can compile a valid C program." "The API responds within the SLA." These correspond to integration tests and end-to-end scenarios.

The framework is valuable because it clarifies *what* to test rather than *how many* tests to run. An agent-driven codebase with 10,000 tests that thoroughly cover safety properties but neglect liveness properties is worse off than one with 500 tests that cover both. TLA+, Lamport's specification language, makes this distinction mechanical (Lamport, 2019), though its application to agent-driven testing harnesses remains largely unexplored.

### 2.4 Property-Based Testing

Property-based testing (PBT), originating with Haskell's QuickCheck (Claessen and Hughes, 2000), tests invariants over randomly generated inputs rather than asserting specific input-output pairs. This approach has natural affinity with agent-driven development because properties are more stable than example-based tests -- a property like "sorting is idempotent" survives code refactoring that would break tests asserting specific sorted outputs.

The convergence of PBT and fuzzing has produced coverage-guided property-based testing (CGPT). FuzzChick (Lampropoulos et al., 2019) demonstrated that combining QuickCheck-style property specifications with AFL-style coverage-guided input mutation dramatically outperforms either approach alone for finding bugs in Coq programs. JQF (Padhye et al., 2019) brought this approach to Java. The key insight -- that coverage feedback can steer random generation toward unexplored code paths -- is directly applicable to agent-driven test infrastructure, where the goal is to maximize fault detection per unit of agent context consumed.

Modern implementations include fast-check (TypeScript/JavaScript), Hypothesis (Python), and proptest (Rust). HypoFuzz extends Hypothesis with coverage-guided fuzzing, bridging the gap between PBT and traditional fuzzing for Python codebases.

## 3. Taxonomy of Approaches

The following taxonomy organizes test optimization strategies along two axes: **what is optimized** (selection, execution, feedback, or maintenance) and **who the optimization serves** (the individual agent, the agent ensemble, or the CI pipeline).

| Strategy | What is Optimized | Primary Consumer | Key Trade-off |
|---|---|---|---|
| Module-scoped segmentation | Selection | Individual agent | Isolation vs. integration coverage |
| Critical-path prioritization | Selection | CI pipeline | Speed vs. comprehensiveness |
| Random subsampling | Selection | Agent ensemble | Per-agent coverage vs. ensemble coverage |
| Predictive test selection | Selection | CI pipeline | Accuracy vs. computational overhead |
| Machine-readable output | Feedback | Individual agent | Parsability vs. human readability |
| Context-aware reporting | Feedback | Individual agent | Signal density vs. completeness |
| Parallel worker pools | Execution | Agent ensemble | Throughput vs. isolation |
| Deterministic replay | Execution | Individual agent | Reproducibility vs. flexibility |
| Entropy management | Maintenance | CI pipeline | Ongoing cost vs. accumulated debt |
| Invariant-driven design | Maintenance | All consumers | Precision vs. development effort |
| Anti-cargo-cult auditing | Maintenance | All consumers | Quality vs. velocity |
| Property-based testing | Selection + Maintenance | Individual agent | Exploration breadth vs. runtime cost |

The remainder of this document analyzes each strategy in detail.

## 4. Analysis

### 4.1 Module-Scoped Segmentation

**Theory & mechanism.** Module-scoped segmentation partitions the test suite along architectural boundaries, allowing an agent working on module X to run only the tests associated with module X and its direct dependents. This requires a dependency graph mapping source modules to test modules, enforced either statically (via build system configuration) or dynamically (via import analysis).

**Literature evidence.** The OpenAI harness engineering report describes a rigid architectural model where "each business domain is divided into a fixed set of layers, with strictly validated dependency directions and a limited set of permissible edges" (Lopopolo, 2026). These constraints are enforced mechanically via custom linters and structural tests. The structural tests serve double duty: they validate architectural boundaries and implicitly define test scope -- if an agent modifies a domain layer, only that domain's tests and its consumers' integration tests need to run.

Bidirectional traceability -- the ability to map any test to the production code it covers and vice versa -- is a prerequisite for safe module-scoped segmentation. Without it, changes to shared utilities may silently skip affected tests. The Anthropic C compiler project encountered this problem when agents implementing new features frequently broke existing functionality, necessitating a CI regression pipeline to catch cross-module regressions that per-module runs missed (Carlini, 2026).

**Implementations & benchmarks.** Build systems like Bazel and Buck2 provide native support for target-level test selection based on the reverse dependency graph. Vitest's `--changed` flag implements a lightweight version for JavaScript/TypeScript projects, running only tests in files affected by recent changes. Nx and Turborepo provide similar capabilities for monorepo architectures.

**Strengths & limitations.** Module-scoped segmentation is the most intuitive optimization and the easiest to implement given a well-structured codebase. Its primary limitation is that it provides no coverage guarantee across module boundaries. Integration bugs -- where module A works correctly in isolation and module B works correctly in isolation but A and B fail when composed -- are invisible to per-module runs. This is precisely the class of bug that autonomous agents are most likely to introduce, because they typically work on one module at a time without holistic system understanding.

### 4.2 Critical-Path Prioritization

**Theory & mechanism.** Critical-path prioritization identifies a small subset of tests that cover the most important code paths -- the "happy path" of core functionality, the most frequently exercised API endpoints, the most bug-prone modules -- and runs these first (or exclusively in fast-feedback modes). The prioritization can be static (human-curated lists), historical (based on fault detection history), or predictive (ML models trained on code changes and test outcomes).

**Literature evidence.** The classical APFD metric (Elbaum et al., 2002) measures how early in a prioritized test run faults are detected. ML-based prioritization consistently outperforms random and coverage-based orderings. A 2024 study presented at ICST demonstrated an end-to-end TCP framework using optimized ML models that achieved near-optimal APFD scores on industrial codebases (ICST, 2024). In the agent context, Carlini's `--fast` flag implements a two-tier prioritization: a 1% sample for rapid iteration and a 10% sample for broader validation, with the full suite reserved for CI (Carlini, 2026).

**Implementations & benchmarks.** Launchable (now part of Gradle Enterprise) and Buildkite's Test Analytics offer predictive test selection as a service, analyzing code diffs and historical test results to select the most relevant subset. Industry reports claim 40% reduction in testing cycles with 35% improvement in defect detection rates, though these figures come from vendor-published case studies and should be treated with appropriate skepticism.

**Strengths & limitations.** Critical-path prioritization dramatically reduces the time between code change and feedback, which is the most important metric for agent productivity. The primary risk is survivorship bias: if a test is never selected because it covers a rarely-changed path, bugs in that path accumulate silently. The Carlini approach of per-agent deterministic subsampling (Section 4.3) addresses this by ensuring that different agents cover different subsets, providing eventual full coverage across the ensemble.

### 4.3 Random Subsampling with Deterministic Seeding

**Theory & mechanism.** Random subsampling runs a random subset of the full test suite on each invocation. Deterministic seeding ensures that the same agent (identified by a seed value, e.g., its container ID or VM number) always runs the same subset, enabling reliable regression detection: if a test that was previously passing starts failing in agent N's subset, agent N can identify the regression. Across the ensemble of agents, different seeds produce different subsets, providing probabilistic full coverage.

**Literature evidence.** This approach was central to the Anthropic C compiler project. Carlini describes the design explicitly: "The harness prints incremental progress infrequently (to avoid polluting context) and includes a default `--fast` option that runs a 1% or 10% random sample. This subsample is deterministic per-agent but random across VMs, so Claude still covers all files but each agent can perfectly identify regressions" (Carlini, 2026).

The mathematical foundation is straightforward. If each of N agents runs a uniformly random k% sample with independent seeds, the probability that a specific test is skipped by all agents is (1 - k/100)^N. With 16 agents and a 10% sample, this is 0.9^16 ≈ 0.185 -- meaning approximately 81.5% of tests are covered per round. With a 1% sample across 16 agents, coverage drops to approximately 14.8% per round, but over multiple rounds (each agent session), coverage accumulates. After 10 rounds at 1%, per-test miss probability is (0.99)^160 ≈ 0.20, yielding roughly 80% ensemble coverage.

**Implementations & benchmarks.** The technique is simple to implement: hash the test name with the agent seed modulo a sampling rate. pytest-randomly and Vitest's `--shard` provide building blocks but do not natively support the per-agent deterministic seeding pattern. Custom harness code is typically required.

**Strengths & limitations.** Random subsampling elegantly solves the speed-coverage trade-off at the ensemble level. Its per-agent coverage is poor by construction -- any individual agent may miss a critical regression -- but the ensemble provides probabilistic guarantees. The approach requires multiple agents operating in parallel to achieve its coverage properties. For single-agent workflows, it degenerates to a simple (and risky) random skip. The deterministic seeding also introduces a subtle failure mode: if a bug only manifests in the interaction between tests (e.g., shared state leaks), it will be consistently missed by agents whose seed excludes one of the interacting tests.

### 4.4 Machine-Readable Output Formats

**Theory & mechanism.** Traditional test output is designed for human consumption: prose descriptions, color-coded terminal output, stack traces with source context, and summary lines. Agent-driven codebases require output optimized for programmatic parsing: structured formats (JSON, XML, YAML), grep-friendly error lines, and pre-computed aggregate statistics.

**Literature evidence.** Both the Anthropic and OpenAI projects identified this as critical. Carlini specifies that "logfiles should be easy to process automatically: if there are errors, Claude should write ERROR and put the reason on the same line so grep will find it. It helps to pre-compute aggregate summary statistics so Claude doesn't have to recompute them" (Carlini, 2026). The OpenAI team went further, writing custom linter error messages specifically "to inject remediation instructions into agent context" (Lopopolo, 2026) -- the error message itself tells the agent how to fix the problem, not just what went wrong.

The established formats in this space are:

- **JUnit XML**: The de facto standard for CI systems. Structured, machine-parseable, but verbose and optimized for CI dashboard rendering rather than agent consumption.
- **TAP (Test Anything Protocol)**: Minimal, line-oriented, grep-friendly. Version 14 supports YAML blocks for structured metadata. Well-suited to agent consumption due to its simplicity.
- **CTRF (Common Test Report Format)**: A modern JSON schema addressing JUnit XML's limitations, supporting retries, rich metadata, and consistent structure across test runners.
- **Custom structured output**: Both the Anthropic and OpenAI projects use bespoke output formats tailored to their agents' parsing capabilities. This is the most common approach in practice.

**Implementations & benchmarks.** Most test frameworks support multiple output formats: Vitest supports JUnit XML, JSON, and custom reporters. pytest has `--tb=short`, `--tb=line`, and `--json-report` options. The trend is toward JSON-based output with flat, grep-friendly structures.

**Strengths & limitations.** Machine-readable output is the lowest-cost, highest-impact optimization for agent-driven testing. The primary tension is with human readability: a pure JSON report is difficult for human reviewers to scan. The practical solution is dual output -- structured output for agents, formatted output for humans -- at the cost of maintaining two reporting paths. A subtler issue is that highly compressed output (e.g., only failure names with no context) can actually harm agent performance by providing insufficient information for diagnosis. The optimum lies between raw structured data and verbose prose.

### 4.5 Context-Aware Reporting

**Theory & mechanism.** Context-aware reporting goes beyond structured output formats to actively manage *how much* and *what kind* of test information enters the agent's context window. This includes truncating verbose output, summarizing results (e.g., "247 passed, 3 failed"), surfacing only failures, and logging detailed information to files that the agent can selectively read rather than streaming everything to stdout.

**Literature evidence.** Carlini's description of context window pollution is the most explicit treatment: "The test harness should not print thousands of useless bytes. At most, it should print a few lines of output and log all important information to a file so Claude can find it when needed" (Carlini, 2026). The OpenAI team's approach of "progressive disclosure" in documentation applies equally to test output: provide the summary up front, let the agent drill down into details as needed (Lopopolo, 2026).

This is related to the information foraging theory from HCI research (Pirolli and Card, 1999), adapted for non-human consumers. The "information scent" that guides a human developer's attention through test output does not exist for an LLM, which processes text sequentially. Instead, the harness must structure output as an inverted pyramid: the most important information (pass/fail summary, failure names) first, details available on demand.

**Implementations & benchmarks.** Practical implementations include:
- Summary-first output: Print "PASS: 247, FAIL: 3" before any details.
- Failure-only mode: Suppress passing test output entirely.
- File-based detail logging: Write full stack traces to a log file, print only the test name and error category to stdout.
- Incremental progress throttling: Print progress updates at intervals (e.g., every 100 tests) rather than per-test, to avoid flooding context.

**Strengths & limitations.** Context-aware reporting is essential for any agent workflow. The risk is information loss: if the harness suppresses too aggressively, the agent may lack the context needed to diagnose a failure and must perform additional tool calls (reading log files), which themselves consume context and time. There is no universal optimum; the right level of detail depends on the agent's capabilities, the context window size, and the complexity of the failures.

### 4.6 Parallel Execution Strategies

**Theory & mechanism.** Parallel test execution distributes tests across multiple workers (processes, containers, or machines) to reduce wall-clock time. In agent-driven codebases, parallelism operates at two levels: within-agent (the agent's test runner uses multiple workers) and across-agents (multiple agents run different test subsets simultaneously, as in the Carlini architecture).

**Literature evidence.** The Anthropic C compiler project used Docker containers for agent isolation, with each agent cloning the repo locally, working in isolation, and pushing to a shared upstream (Carlini, 2026). This coarse-grained parallelism (one agent per container) avoids shared-state issues but introduces merge conflicts as a coordination cost. The OpenAI project used git worktrees to provide per-agent isolation: "we made the app bootable per git worktree, so Codex could launch and drive one instance per change" (Lopopolo, 2026).

Within-agent parallelism is provided by test runners: Vitest uses worker threads by default, pytest-xdist distributes across processes, and Playwright supports `--workers` and `--shard` for browser test parallelism. The key constraint is test isolation: parallel execution requires that tests have no shared mutable state (no singletons, no shared databases, no global caches).

Docker's Cagent project (2026) addresses a related problem: deterministic replay of agent interactions. Using a proxy-and-cassette model, Cagent records LLM API calls and replays them deterministically, enabling CI pipelines to verify agent behavior without API costs or non-determinism. If agent execution diverges from the recording, the run fails deterministically (Docker, 2026). While not a test execution strategy per se, this approach enables testing *of* the agent's test-running behavior itself.

**Implementations & benchmarks.** Forked process models (e.g., Python's fork-based parallelism) provide copy-on-write isolation of globals and singletons, ensuring pristine state per worker without the overhead of full container isolation. Playwright's per-worker contexts and per-test fixtures provide equivalent isolation for browser testing. The Carlini architecture's use of one Docker container per agent represents the maximum-isolation end of the spectrum, trading overhead for guaranteed independence.

**Strengths & limitations.** Parallelism is the most straightforward way to reduce wall-clock test time, but it amplifies any test isolation failures. A test that passes in serial but fails in parallel (due to shared state, port conflicts, or filesystem races) is worse than useless -- it creates non-deterministic signals that are especially harmful to agents, which lack the institutional knowledge to identify flaky tests. Robust parallel execution requires significant upfront investment in test isolation, which pays dividends but has high initial cost.

### 4.7 Entropy Management and Drift Detection

**Theory & mechanism.** Entropy management addresses the gradual degradation of a test suite's signal-to-noise ratio over time. As a codebase grows -- especially under autonomous agents that replicate existing patterns including suboptimal ones -- the test suite accumulates flaky tests, redundant assertions, stale fixtures, and tests that verify mocked behavior rather than real functionality. This "test entropy" degrades both execution speed and signal quality.

**Literature evidence.** The OpenAI harness engineering report describes this phenomenon vividly: "Codex replicates patterns that already exist in the repository -- even uneven or suboptimal ones. Over time, this inevitably leads to drift" (Lopopolo, 2026). Their initial solution -- human engineers spending "every Friday (20% of the week) cleaning up 'AI slop'" -- did not scale. Instead, they encoded "golden principles" into the repository and built recurring cleanup processes. Background Codex tasks scan for deviations, update quality grades, and open targeted refactoring pull requests on a regular cadence. This is described as functioning "like garbage collection" -- continuous, incremental maintenance rather than periodic painful cleanups (Lopopolo, 2026).

The analogy to garbage collection is precise. Just as a runtime garbage collector prevents memory leaks by continuously reclaiming unreferenced objects, a test entropy management system prevents quality degradation by continuously removing or repairing defective tests. The cost is ongoing compute (running the cleanup agents), but the alternative -- letting entropy compound -- produces exponentially increasing remediation costs.

Drift detection is the diagnostic complement to entropy management. Where entropy management cleans up known anti-patterns, drift detection identifies when the test suite's actual behavior diverges from its intended behavior. This includes: tests whose coverage has decreased due to code changes, tests that always pass (and therefore provide no discriminative signal), tests whose execution time has increased dramatically, and tests that test mocked behavior rather than real code (see Section 4.9).

**Implementations & benchmarks.** Practical entropy management tooling includes:
- Flaky test quarantine systems (e.g., BuildPulse, Trunk Flaky Tests) that automatically identify and isolate non-deterministic tests.
- Coverage trend analysis tools that track per-test coverage over time and flag declining tests.
- Dead test detection via mutation testing: if no mutation of the code under test causes the test to fail, the test is providing no value. Meta's LLM-powered mutation testing system (2025) applies this approach at scale, generating targeted mutants and validating that tests detect them.
- The OpenAI "quality grades" system, where each domain and architectural layer receives a quality score that is tracked over time.

**Strengths & limitations.** Entropy management is high-leverage but easy to deprioritize. The costs of test entropy are diffuse (slightly slower CI, slightly noisier signals, slightly more agent confusion) while the costs of entropy management are concentrated (dedicated compute, dedicated agent time, organizational attention). Evidence from the OpenAI report suggests that the automated, continuous approach scales where periodic human cleanup does not.

### 4.8 Invariant-Driven Test Design

**Theory & mechanism.** Invariant-driven test design starts from the question "what must always be true about this system?" rather than "what specific behavior should this function exhibit?" This approach, rooted in Lamport's safety/liveness framework (Section 2.3), produces tests that are more resilient to refactoring (because they test properties rather than implementations), more meaningful for agent consumption (because violations of invariants are inherently more informative than violations of specific assertions), and more amenable to property-based testing.

**Literature evidence.** The concept is well-established in formal methods but underexplored in mainstream software testing. TLA+ specifications encode invariants that model checkers verify exhaustively over the state space (Lamport, 2019). Amazon's use of TLA+ for verifying distributed systems (Newcombe et al., 2015) demonstrated that invariant-driven approaches catch bugs that testing alone misses -- but at the cost of formal specification effort that is not yet practical for most codebases.

In the agent-driven context, invariant-driven test design has a specific advantage: invariants are stable across refactorings. When an agent restructures code, example-based tests that assert specific return values may break even though the behavior is correct, creating false-negative noise. Invariant-based tests (e.g., "the output of sort is always ordered" rather than "sort([3,1,2]) == [1,2,3]") survive refactoring and provide cleaner signals.

The Anthropic C compiler project used an invariant-driven approach implicitly: the primary test oracle was GCC -- if Claude's compiler produced different output than GCC for the same input, the compiler was wrong. This is an invariant ("our compiler's output is equivalent to GCC's output") rather than a specific assertion about any particular compilation step (Carlini, 2026).

**Implementations & benchmarks.** Fast-check (TypeScript), Hypothesis (Python), and proptest (Rust) enable property-based invariant testing without formal specification. The pattern is:

1. Define invariants as executable predicates over the system state.
2. Use random input generation to exercise the system.
3. Verify that invariants hold after each operation.
4. On violation, shrink the input to find a minimal failing case.

Coverage-guided property-based testing (FuzzChick, JQF, HypoFuzz) extends this by steering input generation toward uncovered code paths, dramatically improving fault-finding efficiency.

**Strengths & limitations.** Invariant-driven design produces the highest-quality tests per unit of test code. The primary barrier is that defining good invariants requires deep domain understanding -- exactly the kind of understanding that autonomous agents often lack. This makes invariant-driven test design an area where human judgment is most valuable and most difficult to automate. The hybrid approach -- humans define invariants, agents implement and run the tests -- is the most practical current pattern.

### 4.9 Anti-Cargo-Cult Testing

**Theory & mechanism.** Cargo-cult testing occurs when tests follow the *form* of good testing practice without the *substance*. Common manifestations include: tests that assert mocked return values (testing the mock, not the code), tests that pass trivially because they test nothing meaningful, tests that duplicate assertions without adding coverage, and tests written to satisfy a coverage metric rather than to catch bugs.

In agent-driven codebases, cargo-cult testing is an especially acute risk because agents are pattern replicators by nature. If the codebase contains one cargo-cult test, the agent will produce more of them, following the established pattern. This is a form of test entropy (Section 4.7) but distinct enough to merit separate analysis because it requires different detection and remediation strategies.

**Literature evidence.** The software testing anti-patterns literature is extensive. Codepipes' widely-cited taxonomy identifies "The Mockery" anti-pattern: "A unit test contains so many mocks, stubs, and/or fakes that the system under test isn't even being tested at all, instead data returned from mocks is what is being tested" (Codepipes, 2020). Yegor Bugayenko's full list of unit testing anti-patterns (2018) identifies additional forms including "The Free Ride" (adding unrelated assertions to passing tests), "The Local Hero" (tests that pass only on one machine), and "The Loudmouth" (tests that produce output but verify nothing).

The OpenAI team's approach addresses this structurally rather than through review: by encoding invariants as linters and structural tests, they make it mechanically impossible for agents to produce certain classes of cargo-cult tests. For example, if a linter enforces that all test files must import the module under test (not a mock of it), the most common form of mock-based cargo-culting is prevented at the structural level (Lopopolo, 2026).

Meta's mutation testing approach provides a direct measurement of cargo-cult testing: if a test does not fail when the code it purportedly tests is mutated, the test is cargo-cult by definition. Their LLM-powered mutation testing system (2025) generates semantically meaningful mutants and checks test suite sensitivity, achieving 73% acceptance rate from engineers who reviewed the results.

**Implementations & benchmarks.** Detection strategies include:
- **Mutation testing**: Stryker (JavaScript/TypeScript), mutmut (Python), cargo-mutants (Rust). If a mutant survives, the test is insufficient.
- **Structural analysis**: Linters that verify test files import and exercise real code, not exclusively mocks.
- **Coverage-assertion density**: Metrics that correlate test coverage with assertion count -- high coverage with few assertions suggests shallow testing.
- **Agent-based auditing**: Dedicated "critic" agents that review test code for anti-patterns, as Carlini used specialized agents for code quality review (Carlini, 2026).

**Strengths & limitations.** Anti-cargo-cult testing is critical for maintaining test suite value but is inherently a cost center. Mutation testing in particular is computationally expensive -- running the full test suite for each of potentially thousands of mutants. The agent-driven approach of dedicated reviewer agents can amortize this cost but introduces its own entropy (the reviewer agent may itself develop cargo-cult patterns). The most robust defense is structural: design the testing infrastructure so that cargo-cult tests are mechanically difficult to write.

### 4.10 Just-in-Time Test Generation

**Theory & mechanism.** Just-in-Time Testing (JiTTesting) is a paradigm where tests are generated by LLMs specifically for each code change, run to detect regressions, and discarded rather than persisted in the codebase. The approach eliminates test maintenance costs entirely, since tests do not accumulate. It also ensures that tests are tailored to the specific change being validated, rather than relying on a static suite that may not cover the changed code.

**Literature evidence.** Meta's JiTTesting framework (2026) is the most significant implementation of this approach. Their "Harden and Catch" system operates in two modes: Hardening tests verify that existing behavior is preserved (regression detection), and Catching tests verify that the intended new behavior works (acceptance testing). Tests are generated for each pull request, run as part of the pre-merge pipeline, and discarded after the merge. This eliminates the entropy problem entirely -- there are no persistent tests to go stale. Meta reports deployment at scale across Android Kotlin codebases, with 73% of generated tests accepted by engineers in manual review (Meta, 2025-2026).

The FSE 2025 paper "Harden and Catch for Just-in-Time Assured LLM-Based Software Testing" (Meta, 2025) formalizes the open research challenges, including the test oracle problem (how does the generated test know what correct behavior is?), the coherence problem (how to ensure generated tests are meaningful, not cargo-cult), and the scalability problem (generating tests for every change is expensive).

**Implementations & benchmarks.** Beyond Meta's internal system, the approach is nascent. Academic prototypes exist but no widely-deployed open-source implementation. The approach requires: (1) an LLM capable of understanding code changes well enough to generate meaningful tests, (2) an execution environment that can run generated tests safely, and (3) a mechanism for determining whether test failures indicate real bugs or test generation errors.

**Strengths & limitations.** JiTTesting elegantly solves the entropy problem but introduces new ones. Test generation quality is bottlenecked by LLM capability -- if the LLM generates cargo-cult JiTTests, the system provides false assurance. The test oracle problem is fundamental: without a specification of correct behavior, generated tests can only verify that behavior has not changed, not that behavior is correct. This makes JiTTesting complementary to, not a replacement for, persistent invariant-driven tests.

### 4.11 Module-Scoped Independence and Bidirectional Traceability

**Theory & mechanism.** Module-scoped independence ensures that each module's tests can run without requiring other modules to be built, configured, or present. This is stronger than module-scoped segmentation (Section 4.1): segmentation selects which tests to run, while independence ensures that selected tests can actually run in isolation. Bidirectional traceability maps every test to the code it covers and every piece of code to the tests that cover it, enabling safe test selection and gap detection.

**Literature evidence.** The OpenAI team's architectural approach -- "each business domain is divided into a fixed set of layers, with strictly validated dependency directions and a limited set of permissible edges" (Lopopolo, 2026) -- implicitly enforces module-scoped independence. If dependencies flow in one direction and are mechanically validated, tests at each layer can run with only their downward dependencies, not the entire application.

Bidirectional traceability in its full form (every line of code mapped to its covering tests and vice versa) is provided by tools like OpenClover (Java) and Coverage.py's `--source` mapping (Python), but is rarely maintained in practice because the mapping changes with every code change. In agent-driven codebases, maintaining traceability is both more feasible (agents can regenerate mappings after each change) and more valuable (agents use the mapping to select which tests to run).

**Implementations & benchmarks.** Build systems with fine-grained targets (Bazel, Buck2) provide implicit bidirectional traceability: the build graph records which targets depend on which, and test targets declare their dependencies explicitly. Lighter-weight approaches include filename conventions (tests for `src/foo/bar.ts` live at `tests/foo/bar.test.ts`) enforced by linters.

**Strengths & limitations.** Module-scoped independence is a prerequisite for most other optimizations in this survey. Without it, agents cannot safely run partial test suites, and parallel execution risks interference between modules. The investment required is primarily architectural -- designing the codebase for modularity from the start -- which is significantly easier in greenfield agent-driven projects than in legacy codebases being migrated to agent workflows.

## 5. Comparative Synthesis

The following table compares the analyzed strategies across dimensions relevant to agent-driven codebases.

| Criterion | Module Segmentation | Critical-Path Priority | Random Subsampling | Machine-Readable Output | Context-Aware Reporting | Parallel Execution | Entropy Management | Invariant-Driven Design | Anti-Cargo-Cult | JiT Testing | Module Independence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Speed improvement** | High | Very High | Very High | None (indirect) | None (indirect) | High | Low (long-term gain) | Low | None | Moderate | Moderate |
| **Coverage guarantee** | Partial (per-module) | Low (subset only) | Probabilistic (ensemble) | N/A | N/A | Full (same suite) | Indirect | High (per invariant) | Indirect | Per-change only | Full (if traced) |
| **Agent context cost** | Low | Low | Low | Very Low | Very Low | Low | Moderate (cleanup) | Low | Moderate (auditing) | Moderate (generation) | Low |
| **Setup complexity** | Moderate | Low-Moderate | Low | Low | Moderate | High | High (ongoing) | High | Moderate | Very High | High (architectural) |
| **Single-agent viable** | Yes | Yes | Weak | Yes | Yes | No benefit | Yes | Yes | Yes | Yes | Yes |
| **Multi-agent benefit** | Moderate | Moderate | Essential | Moderate | Moderate | Essential | High | Moderate | High | Moderate | High |
| **Entropy resistance** | Low | Low | Moderate | N/A | N/A | N/A | Very High | High | Very High | Very High | Moderate |
| **Human oversight needed** | Low | Moderate (curation) | Low | Low | Low | Moderate (isolation) | Low (once encoded) | High (invariant design) | Moderate (pattern ID) | High (oracle problem) | Low |
| **Maturity** | Established | Established | Emerging (agent-specific) | Established | Emerging | Established | Emerging | Theoretical + Emerging | Established (human), Emerging (agent) | Nascent | Established |

**Key trade-off clusters**:

1. **Speed vs. Coverage**: Random subsampling and critical-path prioritization offer the largest speed gains but sacrifice per-run coverage. The ensemble model (multiple agents with different subsets) is the only approach that provides both, but requires a multi-agent architecture.

2. **Signal Quality vs. Information Completeness**: Machine-readable output and context-aware reporting improve signal quality by reducing noise, but risk withholding information the agent needs for diagnosis. The inverted-pyramid pattern (summary first, details on demand) is the current best practice.

3. **Upfront Investment vs. Ongoing Cost**: Module-scoped independence and invariant-driven design require significant upfront architectural and intellectual investment but produce tests that are inherently resistant to entropy. Entropy management and anti-cargo-cult auditing have lower upfront costs but require continuous ongoing investment.

4. **Persistent vs. Ephemeral Tests**: JiTTesting eliminates entropy entirely by making tests ephemeral, but sacrifices the regression detection power of a curated persistent suite. The evidence suggests these are complementary rather than competing approaches -- persistent invariant tests for safety properties, ephemeral JiTTests for change-specific validation.

## 6. Open Problems & Gaps

### 6.1 The Optimal Subsampling Rate Is Unknown

While Carlini's 1%/10% split is a pragmatic choice, no theoretical or empirical framework exists for determining the optimal subsampling rate as a function of suite size, agent count, fault density, and acceptable miss probability. The probabilistic coverage analysis in Section 4.3 provides a starting point, but the assumption of uniform fault distribution across tests is almost certainly wrong. Faults cluster in complex, recently-changed, and poorly-tested code. A subsampling strategy that accounts for this heterogeneity would be strictly superior to uniform random sampling.

### 6.2 Context Pollution Quantification Is Missing

The claim that verbose test output degrades agent reasoning quality is widely accepted but poorly quantified. How many tokens of irrelevant output can an agent tolerate before its fault-diagnosis accuracy drops measurably? Does the degradation curve differ between failure types (compilation errors vs. assertion failures vs. timeout failures)? No published benchmarks address these questions. Without quantification, harness designers must rely on intuition and iterative experimentation.

### 6.3 Cross-Module Integration Testing in Multi-Agent Architectures

When multiple agents work on different modules simultaneously, integration bugs -- where changes that are individually correct produce failures in composition -- are the hardest class of bug to detect. The Carlini project encountered this when agents all hit the same Linux kernel compilation bug, but the general problem of multi-agent integration testing remains unsolved. Merge-time integration test runs catch some of these bugs but create serialization bottlenecks that negate the throughput gains of parallelism.

### 6.4 JiTTest Quality Assurance

Meta's JiTTesting framework reports a 73% test acceptance rate, which implies a 27% rate of generated tests that engineers rejected. The failure modes of generated tests -- whether they are predominantly cargo-cult, incorrect, or merely stylistically inconsistent -- are not well-characterized in the public literature. Understanding these failure modes is essential for deploying JiTTesting in fully autonomous (human-out-of-the-loop) agent workflows.

### 6.5 Invariant Discovery Automation

The highest-value tests are invariant-based (Section 4.8), but defining good invariants requires domain expertise that agents currently lack. Can LLMs be taught to propose candidate invariants from code inspection, with humans validating rather than inventing? Early work on specification mining (Ernst et al.'s Daikon, 2001) attempted this with dynamic analysis, but LLM-based approaches to invariant discovery are largely unexplored.

### 6.6 Deterministic Replay at Scale

Docker's Cagent demonstrates that deterministic replay of agent interactions is feasible for testing agent behavior. However, the approach records full request/response pairs, which means that any change to the agent's prompts, tools, or behavior invalidates the entire recording. This brittleness limits its utility for regression testing in rapidly evolving agent systems. More resilient replay mechanisms -- perhaps based on semantic similarity rather than exact matching -- remain a research challenge.

### 6.7 The Feedback Loop Problem

All optimization strategies assume that test results are fed back to agents as part of a tight loop. But the design of that feedback loop itself -- how results are summarized, when to present them, how to handle ambiguous results, when to re-run vs. investigate -- is under-theorized. The Anthropic and OpenAI projects both report iterative refinement of their feedback mechanisms but do not provide generalizable frameworks for reasoning about feedback loop design.

### 6.8 Evidence Base Limitations

The empirical evidence for agent-specific test optimization is thin by academic standards. The primary sources are two industry reports (Carlini/Anthropic, Lopopolo/OpenAI) and Meta's JiTTesting publications. Controlled experiments comparing optimization strategies across different agent architectures, codebase sizes, and fault profiles do not yet exist. Many claims in this survey (e.g., the value of per-agent deterministic seeding) rest on single-project evidence and may not generalize.

## 7. Conclusion

Test optimization for agent-driven codebases is an emerging discipline at the intersection of classical software testing research, information design, and AI systems engineering. The central insight from this survey is that the problem is not primarily about making tests run faster -- though speed matters -- but about delivering the right information to the right agent at the right time in a format it can act on.

The approaches analyzed here span a wide range of maturity, from established techniques adapted for agents (module segmentation, parallel execution, machine-readable output) to nascent paradigms purpose-built for the agent era (deterministic subsampling, JiTTesting, automated entropy management). No single strategy dominates; the effective test infrastructure for an agent-driven codebase is a composition of several approaches selected for the project's specific constraints (single vs. multi-agent, codebase size, fault tolerance, available compute).

Three tensions recur across every analysis:

1. **Per-agent speed vs. ensemble coverage**: Individual agents need fast feedback, but comprehensive coverage requires either running everything (slow) or distributing work across an ensemble (complex).
2. **Signal density vs. diagnostic completeness**: Agents need concise, parseable output to maintain reasoning quality, but also need sufficient detail to diagnose failures without additional tool calls.
3. **Test persistence vs. entropy**: Persistent test suites provide reliable regression detection but accumulate entropy; ephemeral tests eliminate entropy but sacrifice persistent regression coverage.

The evidence base is nascent. The community would benefit from controlled experiments comparing these strategies, from quantification of context pollution effects on agent reasoning, and from open-source reference implementations of the harness patterns described by Anthropic and OpenAI. Until such evidence materializes, practitioners must navigate these trade-offs based on the limited but instructive precedents documented here.

## References

- [Alpern, B. and Schneider, F.B., "Defining Liveness", Information Processing Letters, 1985](https://www.cs.cornell.edu/fbs/publications/DefLtic.pdf)
- [Azizi, M., "A Systematic Literature Review on Machine Learning for Test Case Prioritization", arXiv:2106.13891, 2021](https://arxiv.org/abs/2106.13891)
- [Carlini, N., "Building a C compiler with a team of parallel Claudes", Anthropic, 2026](https://www.anthropic.com/research/building-a-c-compiler-with-a-team-of-parallel-claudes)
- [Claessen, K. and Hughes, J., "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs", ICFP, 2000](https://dl.acm.org/doi/10.1145/351240.351266)
- [Docker, "Deterministic AI Testing with Session Recording in cagent", Docker Engineering Blog, 2026](https://www.docker.com/blog/deterministic-ai-testing-with-session-recording-in-cagent/)
- [Elbaum, S., Malishevsky, A.G., and Rothermel, G., "Test Case Prioritization: A Family of Empirical Studies", IEEE TSE, 2002](https://doi.org/10.1109/TSE.2002.1019480)
- [Ernst, M.D. et al., "Dynamically Discovering Likely Program Invariants to Support Program Evolution", IEEE TSE, 2001](https://doi.org/10.1109/32.908957)
- [Lamport, L., "Proving the Correctness of Multiprocess Programs", IEEE TSE, 1977](https://lamport.azurewebsites.net/pubs/proving.pdf)
- [Lamport, L., "Proving Safety Properties", 2019](https://lamport.azurewebsites.net/tla/proving-safety.pdf)
- [Lampropoulos, L., Hicks, M., and Pierce, B.C., "Coverage Guided, Property Based Testing", OOPSLA, 2019](https://dl.acm.org/doi/10.1145/3360607)
- [Lopopolo, R., "Harness engineering: leveraging Codex in an agent-first world", OpenAI, 2026](https://openai.com/index/harness-engineering/)
- [Meta Engineering, "The Death of Traditional Testing: Agentic Development Broke a 50-Year-Old Field, JiTTesting Can Revive It", 2026](https://engineering.fb.com/2026/02/11/developer-tools/the-death-of-traditional-testing-agentic-development-jit-testing-revival/)
- [Meta Engineering, "Revolutionizing software testing: Introducing LLM-powered bug catchers", 2025](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/)
- [Meta Engineering, "LLMs Are the Key to Mutation Testing and Better Compliance", 2025](https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/)
- [Newcombe, C. et al., "How Amazon Web Services Uses Formal Methods", CACM, 2015](https://doi.org/10.1145/2699417)
- [Padhye, R. et al., "JQF: Coverage-Guided Property-Based Testing in Java", ISSTA, 2019](https://dl.acm.org/doi/10.1145/3293882.3339002)
- [Pirolli, P. and Card, S.K., "Information Foraging", Psychological Review, 1999](https://doi.org/10.1037/0033-295X.106.4.643)
- [Rothermel, G. and Harrold, M.J., "A Safe, Efficient Regression Test Selection Technique", ACM TOSEM, 1997](https://doi.org/10.1145/253228.253284)
- [Codepipes, "Software Testing Anti-patterns", 2020](https://blog.codepipes.com/testing/software-testing-antipatterns.html)
- [Yegor Bugayenko, "Unit Testing Anti-Patterns, Full List", 2018](https://www.yegor256.com/2018/12/11/unit-testing-anti-patterns.html)

## Practitioner Resources

### Test Frameworks with Agent-Relevant Features

- **[Vitest](https://vitest.dev/)** -- TypeScript/JavaScript test runner with native `--shard`, `--changed`, JSON reporter, and worker-based parallelism. Well-suited to agent-driven TypeScript codebases.
- **[pytest](https://docs.pytest.org/)** -- Python test framework with extensive plugin ecosystem. pytest-xdist for parallelism, pytest-randomly for randomized ordering, `--json-report` for structured output.
- **[Playwright](https://playwright.dev/)** -- Browser testing with first-class parallelism (`--workers`, `--shard`), per-worker isolation, and trace artifacts per worker.

### Property-Based Testing Libraries

- **[fast-check](https://github.com/dubzzz/fast-check)** -- Property-based testing for TypeScript/JavaScript. Integrates with Vitest and Jest.
- **[Hypothesis](https://hypothesis.works/)** -- Property-based testing for Python with stateful testing and database-backed example persistence.
- **[HypoFuzz](https://hypofuzz.com/)** -- Coverage-guided fuzzing extension for Hypothesis, bridging PBT and fuzzing.
- **[proptest](https://github.com/proptest-rs/proptest)** -- Property-based testing for Rust.

### Mutation Testing Tools

- **[Stryker](https://stryker-mutator.io/)** -- Mutation testing for JavaScript/TypeScript. Identifies tests that pass regardless of code mutations.
- **[mutmut](https://github.com/boxed/mutmut)** -- Mutation testing for Python.
- **[cargo-mutants](https://github.com/sourcefrog/cargo-mutants)** -- Mutation testing for Rust, designed for CI integration.

### Agent Infrastructure

- **[Docker cagent](https://github.com/docker/cagent)** -- Agent builder and runtime with deterministic replay via proxy-and-cassette recording. Early stage but demonstrates the reproducible-agent-execution pattern.
- **[Bazel](https://bazel.build/)** -- Build system with fine-grained target-level dependency tracking, enabling precise test selection based on code changes.
- **[Nx](https://nx.dev/)** -- Monorepo build system for JavaScript/TypeScript with affected-test detection and computation caching.

### Test Output and Reporting

- **[TAP (Test Anything Protocol)](https://testanything.org/)** -- Minimal, line-oriented, grep-friendly test output protocol. Version 14 supports YAML metadata blocks.
- **[CTRF (Common Test Report Format)](https://ctrf.io/)** -- Modern JSON schema for test results, supporting retries and rich metadata. Successor to JUnit XML for structured agent consumption.

### Research and Analysis

- **[Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/2026-agentic-coding-trends-report)** -- Industry survey documenting how agent-driven workflows are reshaping software engineering practices including testing.
- **[Meta "Harden and Catch" paper, FSE 2025](https://arxiv.org/html/2504.16472v1)** -- Academic treatment of JiTTesting's open research challenges.
- **[Wopee.io Predictive Test Selection](https://wopee.io/blog/predictive-test-selection/)** -- Practitioner-oriented overview of ML-based test selection approaches.
