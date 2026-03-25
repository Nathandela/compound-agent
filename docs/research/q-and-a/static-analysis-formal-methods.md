# Static Analysis & Formal Methods for Automated Code Quality Assurance

*2026-03-25*

---

## Abstract

Static analysis and formal methods span a spectrum from millisecond-fast syntactic linting to multi-hour deductive proofs requiring PhD-level annotations. This survey maps that spectrum as a research landscape, covering six interconnected domains: (1) abstract interpretation and its mathematical foundations in Galois connections and lattice fixpoints, from Cousot & Cousot's 1977 POPL paper to Astrée's industrial-scale soundness proofs; (2) type system theory as lightweight formal methods, including dependent types, refinement types, gradual typing, and effect systems, with Rust's ownership model and LiquidHaskell as the leading industrial expressions; (3) dataflow analysis — taint tracking, null-safety analysis, resource-leak detection, and information flow control, as realized in CodeQL, Semgrep, and Joern's code property graph; (4) security static analysis, covering SAST tool families, OWASP coverage mapping, secrets scanning, and supply-chain provenance; (5) linting theory, examining the boundary between mechanically enforceable syntactic rules and semantic judgments that require full program reasoning; and (6) LLM-augmented static analysis, a rapidly maturing domain where models reduce false positives, infer taint specifications, and generate verified fixes. Across domains, the central tension is the soundness-completeness-scalability trilemma: tools that are sound over-approximate and generate false positives; tools that scale under-approximate and miss bugs; hybrid neuro-symbolic approaches attempt to recover precision without sacrificing throughput. Empirical benchmarks from 2024--2025 on the OWASP Benchmark v1.2 and CWE-Bench-Java quantify this trilemma concretely.

---

## 1. Introduction

The question of whether a program is correct -- or at least free from a defined class of faults -- is older than digital computers. Turing's halting-problem proof (1936) established that the question in its most general form is undecidable. Everything that follows in this survey is an engineering response to that fact: a collection of principled approximations, each trading coverage for tractability along different dimensions.

The modern practitioner encounters static analysis as a collection of semi-overlapping tools with opaque internals: a linter fires on a missing semicolon; a SAST scanner flags a potentially injectable SQL string; a borrow-checker refuses to compile code that would have compiled in C. These surface phenomena share a deep theoretical substrate -- program semantics, lattice theory, type theory, and proof theory -- that this survey attempts to make explicit.

The six sections that follow proceed roughly from most theoretical to most applied, though the domains are heavily interdependent. Abstract interpretation (Section 3.1) provides the mathematical foundations for sound static analysis. Type systems (Section 3.2) embed verification into the language itself, making some proofs automatic. Dataflow analysis (Section 3.3) traces how values propagate through program graphs. Security SAST (Section 3.4) applies these techniques to the OWASP vulnerability taxonomy. Linting theory (Section 3.5) examines the lower end of the formalism spectrum where most engineers spend their time. LLM augmentation (Section 3.6) represents the newest layer, using language models to improve precision and explainability.

**Scope and exclusions.** This survey covers source-level static analysis. It does not cover dynamic analysis (fuzzing, runtime monitoring, symbolic execution at test-time), binary-only reverse engineering, or formal hardware verification. Where these adjacent fields illuminate the static analysis landscape, they are noted but not surveyed.

**Temporal scope.** The literature base extends to March 2026. Sections note where findings come specifically from 2024--2026 research to distinguish new developments from established foundations.

---

## 2. Foundations

### 2.1 The Soundness-Completeness-Scalability Trilemma

Rice's theorem generalizes the undecidability of the halting problem to all non-trivial semantic properties of programs. Any static analysis that is both sound (never misses a real bug) and complete (never reports a false positive) for a non-trivial property is impossible for Turing-complete languages. Every practical tool therefore chooses two of three desiderata:

- **Sound + complete, but not scalable**: Decision procedures for restricted program fragments (loop-free code, finite-state systems) can be sound and complete but do not scale to industrial codebases.
- **Sound + scalable, but not complete**: Abstract interpretation and type checking over-approximate program behavior. They prove absence of bug classes but generate false positives.
- **Complete + scalable, but not sound**: Pattern-matching linters, taint-tracking tools with user-defined rules, and under-approximate bug finders like Pulse (based on Incorrectness Logic) only report reachable bugs, eliminating false positives at the cost of missing others.

This trilemma is not a limitation of current technology; it is a mathematical constraint. Understanding which corner of the trilemma a tool occupies is prerequisite knowledge for interpreting its output.

### 2.2 Program Semantics Hierarchy

Static analysis tools reason about programs at varying levels of semantic abstraction:

| Level | Representation | Used by |
|---|---|---|
| Token stream | Raw text / regex | Secrets scanners, Gitleaks |
| Concrete syntax tree | Parse tree with whitespace | Formatters (gofmt) |
| Abstract syntax tree (AST) | Logical program structure | ESLint, revive, many linters |
| Control flow graph (CFG) | Execution order of basic blocks | Null-safety analyzers |
| Data flow graph (DFG) | Value propagation paths | Taint analyzers |
| Program dependence graph (PDG) | Combined CFG + DFG | Joern's CPG |
| Heap graph | Allocated memory relationships | Infer, Pulse |
| Abstract semantic domain | Over-approximate program behaviors | Astrée, polyhedra analysis |

The choice of representation determines both what can be detected and what cannot. A pure AST tool cannot determine whether a value reaching a SQL call originated from user input three function calls back; that requires inter-procedural dataflow. A dataflow-only tool cannot verify the absence of integer overflow on all paths; that requires abstract interpretation over numerical domains.

### 2.3 Soundness in Practice

In academic literature, "sound" means: if the analysis says property P holds, then P holds in all executions. In industry usage, "sound" is often applied loosely to tools that are merely conservative. The distinction matters. Astrée is sound in the strict sense: a zero-warning result guarantees absence of runtime errors in the verified code subset. Semgrep with OWASP rules is not sound in any formal sense; it reports a pattern-matched subset of a vulnerability class and makes no claims about the rest of the codebase.

---

## 3. Taxonomy of Approaches

### 3.1 Abstract Interpretation

#### Theoretical Foundations

Abstract interpretation was introduced by Patrick Cousot and Radhia Cousot in their landmark 1977 POPL paper, "Abstract Interpretation: A Unified Lattice Model for Static Analysis of Programs by Construction or Approximation of Fixpoints." The framework provides a general methodology for deriving sound static analyses from the concrete semantics of a programming language.

The core construction proceeds in four steps:

1. **Concrete semantics**: Define the collecting semantics of the program -- the set of all possible states reachable at each program point across all executions and all possible inputs. This is the "ground truth" that analysis approximates.

2. **Abstract domain**: Choose a mathematical domain (a complete lattice) where each element represents a set of concrete states. For numerical analysis, the interval domain `[l, u]` represents all integers between `l` and `u`. The polyhedra domain represents convex polytopes in n-dimensional space, capturing linear relationships between variables.

3. **Galois connection**: Define a pair of monotone functions `(alpha, gamma)` -- abstraction and concretization -- forming a Galois connection between the concrete powerset lattice and the abstract domain. The connection formalizes what it means for an abstract value to be a sound over-approximation of a set of concrete values.

4. **Fixpoint computation**: Compute the least fixpoint of the abstract transfer functions using Tarski's fixpoint theorem. To ensure termination over infinite-height lattices (e.g., when loops could in principle iterate arbitrarily), widening operators accelerate convergence to a fixpoint by jumping upward in the lattice. Narrowing operators then refine the result without losing soundness.

The theoretical guarantee: if the abstract fixpoint produces no alarm, then the concrete program has the verified property for all inputs and all executions. The analysis is sound by construction.

A 2024 historical retrospective by Patrick Cousot ("A Personal Historical Perspective on Abstract Interpretation") traces the evolution of the framework from these 1977 foundations through to recent integration with interactive theorem provers.

#### Astrée

Astrée is the most celebrated industrial application of abstract interpretation. Developed jointly by ENS Paris, INRIA, and several partners, Astrée targets embedded control-command software written in a restricted subset of C (no dynamic allocation, no recursive calls). Its abstract domain combines:

- **Interval analysis**: bounds on scalar variables
- **Octagonal relations**: constraints of the form `±x ± y ≤ c`
- **Linear invariants**: equalities and inequalities between variables
- **Trace partitioning**: splitting the analysis along control-flow paths to recover precision lost by merging at join points
- **Hierarchical domain combination**: domains cooperate through reduced products, sharing information to mutually refine each other's approximations

The killer application: Astrée was used to verify the flight control software of the Airbus A380, proving absence of runtime errors (integer overflow, division by zero, buffer overrun, null dereference) before the aircraft's maiden flight in January 2005. A zero-warning result from Astrée is a formally meaningful guarantee. Astrée is now commercially distributed by AbsInt GmbH and is in active use in automotive (IEC 61508), avionics (DO-178C), and railway domains.

The practical limitation of Astrée is its domain restriction: general-purpose C with dynamic allocation requires extensions that are still research-grade. The tool is expensive, requires expert configuration, and is impractical outside safety-critical domains.

#### Frama-C and Deductive Verification

Frama-C is a modular open-source framework for analysis of C programs, targeting safety-critical systems. Its WP (Weakest Precondition) plugin implements deductive verification against ACSL (ANSI/ISO C Specification Language) annotations. Verification proceeds by:

1. The developer annotates functions with preconditions (`requires`), postconditions (`ensures`), and loop invariants (`loop invariant`).
2. WP generates verification conditions (VCs) -- logical formulas that, if valid, prove the annotated property.
3. VCs are dispatched to SMT solvers (Alt-Ergo, Z3, CVC5) or proof assistants (Coq, PVS).

A 2024 chapter in "Guide to Software Verification with Frama-C" (Springer) documents current encoding of ACSL and C into first-order logic, including memory models. A 2024 paper presented at formal methods workshops introduced automatic proof script generation for Frama-C/WP, where proof strategies are user-defined and scripts are automatically generated and applied -- a significant productivity improvement for large annotated codebases.

Frama-C/WP has been applied at Thales for smart card JavaCard virtual machine verification, and at CEA for nuclear industry code. The ceiling is the annotation burden: non-trivial functions require preconditions, postconditions, and loop invariants, all written in a first-order logic dialect. Automation covers simple numerical properties; pointer-heavy code requires manual lemmas.

#### Incorrectness Logic: The Under-Approximate Dual

Peter O'Hearn introduced Incorrectness Logic (IL) in 2019 as a formal complement to Hoare Logic. Where Hoare Logic uses over-approximation to prove correctness (if the precondition holds and the postcondition holds, no bug occurred), IL uses under-approximation to prove the presence of bugs:

- **Hoare Logic**: `{P} C {Q}` means every execution starting from a P-state ends in a Q-state (over-approximate, for correctness proofs, may have false positives)
- **Incorrectness Logic**: `[P] C [Q]` means every Q-state is reachable from some P-state (under-approximate, for bug finding, no false positives by construction)

The practical significance: a tool built on IL can report only real bugs. False positives are theoretically excluded. The trade-off is completeness -- the tool only finds bugs for which it has reachable under-approximate witnesses.

Meta's Pulse analyzer implements Incorrectness Separation Logic (ISL), combining IL with separation logic for heap reasoning. Pulse detects null dereferences, use-after-free, and resource leaks with a guarantee of no false positives (within its semantic model). A 2025 paper describes Pulse∞ applied to over 100 million lines of C, C++, and Hack, finding over 30 previously unknown bugs in production code. The 2024 POPL workshop "Formal Methods for Incorrectness" witnessed growing academic engagement with this direction.

### 3.2 Type Systems as Lightweight Formal Methods

#### Foundations: Types as Proofs

The Curry-Howard correspondence establishes an isomorphism between type systems and proof systems: a type is a proposition, a term that inhabits the type is a proof of that proposition, and type-checking is proof-checking. This correspondence is not merely theoretical -- it motivates the design of type systems that carry enough expressive power to encode properties ordinarily requiring separate verification tools.

#### Dependent Types

In a dependently typed language, types can depend on values. `Vector n a` is the type of lists of `a` with exactly `n` elements; the vector concatenation function has type `Vector m a -> Vector n a -> Vector (m+n) a`, encoding the length invariant in the type. Programs that type-check are proofs that the invariant holds.

Idris and Agda are research languages with full dependent types. F* (Microsoft Research) occupies the mid-ground: a dependently typed language with refinement types and effects, designed specifically for security-critical code. F*'s proof assistant has been used to verify cryptographic implementations in miTLS (TLS 1.3) and the HACL* cryptography library used in Firefox, Signal, and the Linux kernel.

The limitation is ergonomic: full dependent types require the programmer to write proofs alongside programs. The proof burden is comparable to Frama-C/WP annotations, though more compositional.

#### Refinement Types

Refinement types decorate base types with logical predicates. In LiquidHaskell, `{v:Int | v > 0}` is the type of positive integers. The type of a safe array access function can be expressed as `arr -> {i:Int | 0 <= i && i < length arr} -> a`. The checker verifies that every call site satisfies the refinement using an SMT solver, without requiring the programmer to write proofs.

LiquidHaskell (Vazou et al., ICFP 2014) is the mature research instance. Its "Refinement Reflection" extension (POPL 2018) enables complete verification by reflecting Haskell functions into the refinement logic, allowing arbitrarily complex properties to be stated and verified. Recent work (PACMPL 2021) demonstrates refinement types applied to replicated data types with typeclass constraints.

Liquid types work best for numerical invariants, null safety, and resource bounds. They are weaker at expressing temporal properties (ordering, protocol compliance) or heap structure.

#### Gradual Typing

Gradual typing (Siek & Taha, 2006) allows types to be omitted where they are inconvenient and checked where they are useful, with dynamic checks inserted at boundaries. TypeScript is the industrial archetype: a structurally typed superset of JavaScript that is deliberately unsound in exchange for ergonomics and compatibility with existing JavaScript.

TypeScript documents seven categories of intentional unsoundness (Vanderkam, 2021): bivariant method parameters, function return type assignment, type assertions, non-null assertion operator, enums, object index signatures, and implicit any in some contexts. The design philosophy is explicit: "TypeScript's type system is not designed to be sound." The goal is to catch common errors cheaply while remaining compatible with the vast universe of JavaScript.

TypeScript 5.8 (March 2025) added granular return-expression branch checking, independently verifying each branch of ternary expressions against declared return types. The `noUncheckedIndexedAccess` flag (TypeScript 4.1), not yet part of `strict`, adds `T | undefined` to indexed array access, catching a common class of runtime error at the cost of additional null checks.

Dart takes the opposite design choice: Dart's null safety is sound by construction, making `dart analyze` a sound null-safety checker in the Cousot sense for the null-pointer class.

#### Effect Systems

Effect systems extend types to track computational effects alongside values: what I/O a function performs, what exceptions it may throw, what state it reads or writes. A function typed as `IO[State[Config], String]` makes its effects manifest in the signature.

Practical effect systems exist at various points on the expressiveness spectrum:
- **Java checked exceptions**: track thrown exception types, unsound (callers can suppress)
- **Rust's `?` and `Result<T, E>`**: monadic effect tracking for fallibility
- **Rust `unsafe`**: effect annotation marking regions that may violate memory safety invariants
- **Koka** (Microsoft Research): row-polymorphic effect system for full effect inference
- **F*'s STEEL**: proof-oriented effect system combining separation logic with effects (Hoare types)

Rust's ownership system is the most widely deployed formal-methods-adjacent type system in production. The borrow checker enforces: (a) each value has a single owner; (b) borrows are either one mutable reference or any number of immutable references, never both; (c) references do not outlive the owner (lifetime analysis). These rules, enforced by the compiler, statically eliminate the following bug classes entirely: use-after-free, dangling pointers, data races in safe Rust, and buffer overruns in safe Rust.

Creusot (POPL 2026 tutorial) extends Rust verification beyond the borrow checker: it allows specification of functional correctness properties via annotations and discharges verification conditions to Why3 / SMT solvers. A 2025 paper ("Lessons Learned from Verifying the Rust Standard Library") documents a semi-automated hybrid approach applied to `std` library functions.

### 3.3 Dataflow Analysis

#### Theoretical Basis

Dataflow analysis computes abstract properties at each program point by solving dataflow equations over the control flow graph. The standard formulation (Kildall, 1973) proceeds as a fixpoint computation over a semilattice of abstract properties, using a monotone transfer function for each statement and a meet/join at merge points.

Classical intraprocedural analyses include:
- **Reaching definitions**: which definitions of a variable can reach a given use
- **Live variable analysis**: which variables are live (will be read) after a given point
- **Available expressions**: which expressions have been computed and not invalidated
- **Constant propagation**: which variables have a known constant value at each point

Interprocedural analysis extends these across function call boundaries. Context sensitivity is the key design dimension: a context-insensitive analysis merges results from all callers, causing false positives (a value tainted in one call-site contaminates analysis of all call-sites). Context-sensitive analysis maintains separate summaries per call context, trading precision for scalability.

#### Taint Analysis

Taint analysis is a specific interprocedural dataflow analysis that tracks whether values originating from user-controlled sources can reach security-sensitive sinks without passing through sanitizers:

- **Sources**: HTTP request parameters, database reads, file contents, environment variables
- **Sinks**: SQL query string construction, shell command arguments, HTML output, file paths
- **Sanitizers**: input validation, escaping functions, parameterized query APIs

The analysis computes a taint relation: pairs (program point, variable) where the variable is tainted at that point. If any sink can be reached by a tainted value without an intervening sanitizer, the analysis reports a vulnerability.

False positives in taint analysis arise from two sources: (a) missing sanitizer models (a custom validation function is not in the tool's database), and (b) over-approximate merge (a tainted value from a different path is conflated with a clean value on the actual execution path).

#### CodeQL

CodeQL (GitHub/Microsoft, formerly Semmle) takes a database-centric approach. Source code is compiled into a relational database encoding the AST, CFG, and interprocedural call graph. Queries are written in QL, a Datalog-derived declarative language with a class system. A taint query specifies sources, sinks, and sanitizers as predicates; the query engine evaluates all paths through the code satisfying those predicates.

This approach has several consequences:
- **Completeness of representation**: the entire codebase is statically available to the query
- **Expressive queries**: the QL type system allows polymorphic specifications (e.g., "any string argument to a function named `exec`")
- **Build requirement**: CodeQL needs to observe the build to capture macro expansions and generated code
- **Scan latency**: full analysis takes minutes to hours on large codebases

Performance on the OWASP Benchmark v1.2 (2,740 Java vulnerability instances, ground-truth labeled): F1 score 74.4%, precision 60.3%, recall 97.0%, false positive rate 68.2% (arXiv:2601.22952, 2025). The high recall at the cost of false positives reflects CodeQL's bias toward being conservative.

#### Semgrep

Semgrep (r2c/Semgrep Inc.) uses tree-sitter to parse source code into a language-generic AST and matches patterns expressed in YAML resembling the target language's syntax. Rules are cross-language (a taint rule for SQL injection can share structure across Python, Ruby, and Java with minor adjustments).

The Community Edition (CE) operates within a single function. The commercial Pro Engine adds cross-file and cross-function dataflow, bringing it closer to CodeQL's semantic depth.

OWASP Benchmark baseline (CE, open-source rules): F1 69.4%, precision 56.3%, recall 90.4%, false positive rate 74.8%. However, the EASE 2024 study found that custom Semgrep rules tailored to the specific codebase patterns achieved 44.7% detection -- a 181% improvement over baseline CE performance and better than the four-tool combination of CodeQL + Semgrep + SonarQube + Joern. Rule coverage, not analysis sophistication, drove most of the detection difference.

Scan speed: ~10 seconds and ~150 MB memory on large codebases, versus CodeQL's minutes-to-hours and ~450 MB. This makes Semgrep practical for every-PR feedback and CodeQL appropriate for nightly or release-gated scans.

#### Joern and Code Property Graphs

Joern (ShiftLeft Security, now open source) introduces the Code Property Graph (CPG), a unified graph representation merging AST, CFG, and program dependence graph (PDG) into a single queryable structure. The CPG enables queries that jointly reason about syntax, control flow, and data dependencies in a single traversal.

CPG-based queries express patterns like: "find all string format calls where any argument transitively flows from a network socket read and the call path passes through no input validation function." These patterns are difficult to express in AST-only tools and expensive to compute without the pre-built graph index.

A 2024 literature review found Joern is "by far the most popular tool for code analysis/compilation in the context of automated software vulnerability detection using machine learning." Its graph export format is the standard input for graph neural network (GNN)-based vulnerability detectors.

On the OWASP Benchmark: F1 14.3%, precision 54.7%, recall 8.2%, false positive rate 7.2%. Joern's extremely low false positive rate reflects its conservative, precision-oriented design -- it only reports when a complete, high-confidence evidence path is found.

#### Information Flow Control

Information flow control (IFC) is a generalization of taint analysis to a lattice of security labels. The classic policy is non-interference: high-confidentiality inputs must not influence low-confidentiality outputs. The classic formulation uses a two-point lattice {`High`, `Low`}; real systems use multi-level labels (Top Secret, Secret, Unclassified) with a partial order.

IFC type systems enforce the policy at compile time. Every variable receives a security label; operations propagate labels according to rules (join of input labels propagates to output). A program type-checks if and only if it satisfies non-interference.

Dynamic IFC (DIFT -- Dynamic Information Flow Tracking) instruments program execution to track label propagation at runtime, detecting policy violations that static analysis might miss due to imprecision. Hardware-assisted DIFT (HDFI, FlexiTaint) implements label tracking in hardware for performance.

A 2025 paper ("Securing AI Agents with Information-Flow Control," Costa & Kopf, arXiv:2505.23643) applies dynamic IFC to AI agent planners, using taint tracking to enforce non-interference for integrity (preventing prompt injection from corrupting execution) and explicit secrecy for confidentiality.

### 3.4 Security Static Analysis (SAST)

#### SAST Taxonomy

Security SAST tools can be categorized along two axes:

**Analysis depth**:
1. **Pattern/signature scanning**: regex or AST pattern matching on known-bad constructs (Bandit for Python, gosec for Go, basic Semgrep rules)
2. **Taint analysis**: interprocedural dataflow from sources to sinks (CodeQL full taint mode, Semgrep Pro, Checkmarx)
3. **Semantic analysis**: sound abstract interpretation over security-relevant domains (limited to specialized tools like Coverity, Polyspace)

**Integration point**:
1. **IDE plugin**: immediate feedback during authoring (SonarLint, Snyk IDE)
2. **Pre-commit hook**: blocking commit of obvious issues (gitleaks, custom gosec wrappers)
3. **CI PR check**: scan on every pull request (Semgrep, CodeQL via GitHub Actions)
4. **Scheduled deep scan**: nightly or release-gated full analysis (CodeQL, Infer)
5. **Audit mode**: one-time assessment of existing codebase (Joern, SonarQube Community)

#### Tool Profiles

**SonarQube / SonarCloud**: polyglot platform covering 30+ languages. Rule set is approximately 85% code quality (style, complexity, duplication) and 15% security. Security vulnerability detection added through "Advanced Security" add-on released in 2025 (SCA capabilities). SonarSource claims a 3.2% false positive rate across 137 million reviewed issues -- a self-reported figure without independent academic validation. OWASP Benchmark: F1 67.3%, precision 51.9%, recall 95.6%, false positive rate 94.6%.

**Snyk Code**: AI-augmented SAST component of the Snyk platform, whose primary strength is SCA (software composition analysis -- dependency vulnerability scanning). Snyk Code trains on open-source repositories. The EASE 2024 benchmark tested detection rate on 170 manually curated commits with known vulnerabilities in production Java code: Snyk Code 11.2%, lowest of the four tools tested (FindSecBugs 26.5%, CodeQL 18.4%, Semgrep CE 14.3%).

**gosec**: Go-specific SAST tool bundled with many Go pipelines. Rule-based scanner checking for common Go security anti-patterns: SQL injection (G201/G202), command injection (G204), TLS misconfiguration (G402/G403), use of math/rand instead of crypto/rand (G404), file path manipulation (G304). The compound-agent codebase enables G201 and G202 specifically, targeting SQL injection patterns in its SQLite query code.

**Bandit**: Python-specific SAST scanner operating at the AST level. Checks for use of `subprocess.call` with `shell=True`, use of MD5/SHA1 for cryptographic purposes, use of `assert` in non-test code, `pickle` deserialization of untrusted data, and similar Python-idiomatic vulnerabilities.

**Checkmarx, Veracode, Coverity**: enterprise commercial SAST with deeper semantic analysis, workflow integration, and compliance reporting (SOC 2, HIPAA, PCI-DSS). These tools generally trade scan latency for higher precision and offer human triage workflows built into the UI.

#### Secrets Detection

Secrets scanning occupies a distinct niche: detecting hardcoded credentials, API keys, and tokens committed to version control. The analysis is pattern-based (entropy analysis + regex matching for known key formats) rather than semantic.

**TruffleHog** (Truffle Security): supports 800+ credential types across git history, local files, S3 buckets, Docker images, and CI/CD pipelines. Distinctive feature: live credential verification via API calls -- only reports credentials that are currently valid, dramatically reducing false positives relative to pure pattern matching.

**Gitleaks**: lightweight, fast scanner for git history. Scans the entire commit history, not just the current HEAD. Used as a pre-commit hook via `gitleaks protect`.

**SLSA (Supply-chain Levels for Software Artifacts)**: a Google-originated framework for software supply-chain integrity. SLSA defines four levels of provenance assurance: source tracking, build-process integrity, reproducible builds, and tamper-evident provenance. Secrets scanning sits at SLSA Level 1 (source tracking). Higher levels require signed build provenance (Sigstore: cosign, fulcio, rekor) and SBOM (Software Bill of Materials) generation.

#### OWASP Coverage Mapping

The OWASP Top 10 (2021) maps to SAST capabilities as follows:

| OWASP Category | SAST Coverage | Best Tool Class |
|---|---|---|
| A01 Broken Access Control | Partial -- IDOR requires runtime context | Taint analysis (code-level only) |
| A02 Cryptographic Failures | Good -- algorithm use is static | Pattern matching + semantic |
| A03 Injection | Good -- taint from input to sink | Interprocedural taint analysis |
| A04 Insecure Design | Poor -- requires architectural reasoning | Manual review |
| A05 Security Misconfiguration | Moderate -- config file parsing | Infra-as-code scanners |
| A06 Vulnerable Components | Excellent -- dependency graph is static | SCA (Snyk, Dependabot, SLSA) |
| A07 Auth Failures | Poor -- auth logic requires semantic model | Limited taint + manual |
| A08 Integrity Failures | Partial -- unsigned deps detectable | SCA + build provenance |
| A09 Logging Failures | Partial -- presence of logging is static | AST-level checks |
| A10 SSRF | Moderate -- URL construction is traceable | Taint analysis |

### 3.5 Linting Theory

#### What Linting Is

A linter is a static analysis tool that enforces a subset of coding rules without requiring proof-theoretic machinery. The word derives from `lint`, the Unix tool for C (Johnson, 1978), which was itself an early static checker. Modern linters operate on one of three representations:

1. **Token stream**: raw text matching (detect `TODO` comments, enforce line length)
2. **AST**: structural pattern matching (detect unreachable code, enforce naming conventions)
3. **Type-aware AST**: patterns conditioned on type information (detect incorrect type assertions, misuse of generic APIs)

#### The Style-Correctness Boundary

The distinction between style rules and correctness rules is fuzzy and worth examining explicitly.

**Purely stylistic (no bearing on correctness)**:
- Indentation and formatting (gofmt handles automatically)
- Naming conventions (exported identifiers in Go must be capitalized; enforced by the compiler, not a linter)
- Comment format (godoc conventions)

**Style with safety implications**:
- Maximum function length (cyclomatic complexity correlates with defect density; a `funlen` limit of 50 lines or `cyclop` max-complexity 10, as in compound-agent's `.golangci.yml`, reduces the probability of logic errors in long functions)
- Blank imports (importing for side effects is fragile; `revive`'s `blank-imports` rule rejects unexplained blank imports)
- Error return position (`error-return` rule: return errors as the last return value; inconsistency increases the probability of unchecked errors)

**Correctness-adjacent** (detectable by AST analysis):
- Unreachable code (`revive`'s `unreachable-code`)
- Shadowed variables (`revive`'s `superfluous-else`)
- Incorrect error type names (`error-naming`, `error-strings`)
- Redefines built-in identifiers (`redefines-builtin-id`)

**True correctness (requires semantic reasoning)**:
- Null/nil dereference (requires dataflow)
- Race conditions (requires concurrency model)
- SQL injection (requires taint analysis)
- Integer overflow (requires numerical abstract interpretation)

The compound-agent `.golangci.yml` configuration illustrates a practical production philosophy: enable linters in the style-with-safety-implications tier (cyclop, funlen, revive) plus one correctness-adjacent security linter (gosec targeting SQL injection patterns G201/G202), while explicitly excluding common false-positive categories (`common-false-positives` preset) and relaxing rules in test files (funlen and cyclop excluded for `_test.go`).

#### AST-Based Rules

AST-based linting proceeds by traversing the AST and matching patterns at specific node types. ESLint's rule API exposes node visitor hooks: `FunctionDeclaration`, `CallExpression`, `BinaryExpression`. A rule fires when the visitor matches and the pattern condition holds.

The expressiveness ceiling of AST-based rules is intrafile, intraprocedural analysis. Rules can detect:
- Missing return statements in all branches
- Use of deprecated API functions
- Incorrect argument count to known-arity functions
- Suspicious patterns (comparing to `null` with `==` instead of `===`)

Rules cannot detect, using AST alone:
- Whether a value passed as an argument originates from user input
- Whether a function called with a string is safe to call with an attacker-controlled string
- Whether a mutex is correctly locked/unlocked across all execution paths

Type-aware linting (TypeScript's type checker in ESLint type-checking mode; `go vet` in Go) extends AST analysis with type information, enabling rules like "detect calls to methods on potentially-nil interface values" or "detect format string mismatches in `fmt.Sprintf`."

#### Custom Rules as Organizational Policy

The ability to write custom lint rules is a vector for encoding domain-specific correctness properties as mechanical checks. Examples:

- Forbid `context.Background()` outside of `main()` in a codebase that uses request-scoped contexts
- Require all SQL queries to use parameterized form (rather than detect string concatenation, positively require a specific API)
- Forbid direct `os.Getenv()` calls outside a designated config package
- Enforce that all exported functions in a package have doc comments (Go's `exported` revive rule)

Custom rules shift the correctness boundary: properties that would otherwise require code review become mechanically enforced. The limitation is that writing correct, low-false-positive custom rules requires deep familiarity with the linting framework's AST model.

#### The False Positive Problem

False positive fatigue is the primary reason organizations disable linters or override findings. Studies find that developers spend 10--20 minutes per alarm reviewing and dismissing false positives from enterprise SAST tools (Tencent internal study, arXiv:2601.18844). At enterprise scale (thousands of developers, dozens of codebases), this produces measurable productivity drag.

The golangci-lint configuration pattern in compound-agent addresses this explicitly: `exclusions.presets: [comments, common-false-positives, legacy, std-error-handling]` suppresses rules with high noise-to-signal ratios in Go codebases. The `max-issues-per-linter: 0` and `max-same-issues: 0` settings disable the default cap on reported issues, choosing to see all issues rather than a sampled subset -- the opposite of reducing noise, reflecting a project that has tuned its rules well enough that all reported issues are actionable.

### 3.6 LLM-Augmented Static Analysis

#### The Role of LLMs

Large language models bring capabilities to static analysis that are categorically different from traditional analysis:

1. **Natural language understanding**: LLMs can read comments, variable names, and documentation to understand programmer intent, which pure dataflow cannot.
2. **Cross-file semantic reasoning**: LLMs have internalized API usage patterns from training data and can reason about library semantics without explicit specifications.
3. **Path feasibility**: LLMs can evaluate whether a flagged execution path is actually reachable given the broader code context, reducing false positives on infeasible paths.
4. **Explainability**: LLMs generate human-readable explanations of detected issues, reducing triage time.
5. **Fix generation**: LLMs can suggest or generate patches for detected issues.

#### False Positive Reduction

The dominant 2024--2025 application of LLMs in static analysis is post-processing SAST output to filter false positives.

**Datadog approach** (2024): Datadog integrated an LLM filter on Semgrep findings before surfacing them to developers. The LLM receives the flagged code snippet and surrounding context and classifies findings as true or false positives. Reported significant reduction in developer-visible false positives without increasing missed vulnerabilities.

**LLM4PFA** (Tencent, arXiv:2601.18844, 2025): A hybrid LLM + static analysis approach evaluated on 433 real bug alarms (328 false positives, 105 true positives) from enterprise C code. The approach achieves 94--98% false positive elimination while maintaining 0.86--0.88 recall, at a cost of $0.001--$0.12 per alarm. Models tested include GPT-4o, Claude Opus, Qwen-3-Coder, and DeepSeek-R1. The false positive prevalence in the dataset (76%) reflects the observed enterprise reality where Infer-class tools generate large alarm volumes.

**Sifting the Noise** (arXiv:2601.22952, 2025): Evaluated three agentic frameworks (Aider, OpenHands, SWE-agent) paired with Claude Sonnet 4, DeepSeek Chat, and GPT-5 as false positive filters for CodeQL, Semgrep, SonarQube, and Joern output on the OWASP Benchmark v1.2. SWE-agent + Claude Sonnet 4 achieves the best result: reduces the false positive rate from 98.3% (union of all tool alerts) to 6.3% -- a 92.1% reduction. However, agents incorrectly suppressed 22.25% of actual vulnerabilities, making unconditional automatic suppression inadvisable for production security pipelines.

**ZeroFalse** (arXiv:2510.02534, 2025): A structured pipeline -- CodeQL alert canonicalization, contextual enrichment, CWE-specific micro-rubric prompting, dynamic code path reconstruction -- applied to ten LLMs. Grok-4 and Gemini 2.5 Pro achieve F1 ~0.91 on OWASP Benchmark with near-perfect precision and recall above 0.85. GPT-5 leads on real-world (OpenVuln) data at F1 0.955.

#### IRIS: Neuro-Symbolic Taint Specification Inference

IRIS (arXiv:2405.17238, ICLR 2025) is a four-stage pipeline combining LLMs with CodeQL for interprocedural taint analysis:

1. **API classification**: LLMs label external library APIs as sources, sinks, or propagators using few-shot prompting. Manual evaluation of 960 sampled specifications found GPT-4 achieves >70% precision and 87.11% recall against CodeQL's documented specs.
2. **Internal API identification**: zero-shot LLM prompting identifies internal methods that introduce taint.
3. **CodeQL analysis**: taint queries run with LLM-inferred specifications, extending CodeQL's reach beyond its manually curated library.
4. **Contextual filtering**: LLMs evaluate flagged paths for true vulnerability, filtering spurious alerts.

On CWE-Bench-Java (120 real-world vulnerabilities): IRIS detects 55 versus CodeQL's baseline 27 (+103.7%). False discovery rate: 84.82% with GPT-4 versus 90.03% for baseline CodeQL (5.21 percentage point improvement). IRIS v2 (July 2025) added support for 7 additional CWEs.

Key limitation: IRIS makes many LLM calls per codebase scan, increasing cost substantially. On million-line projects, this translates to non-trivial API cost per scan.

#### GitHub Copilot Code Review

GitHub's Copilot code review (October 2025 public preview) blends LLM detection with deterministic tools (ESLint, CodeQL). It reviews pull requests across all languages and provides multi-angle feedback on style, logic, and security. The architecture is not fully documented publicly, but the product positions itself as a complement to existing SAST rather than a replacement. Independent evaluations note that Copilot PR review tends toward surface-level findings (style, obvious bugs) rather than architectural or subtle logic errors.

#### Amazon CodeGuru Reviewer

Amazon CodeGuru Reviewer (ML-driven, Java and Python) is optimized for AWS environments. It detects OWASP Top 10 and AWS-specific security best practices via ML models trained on code. Limitations: language support restricted to Java and Python, higher false positive rate than specialized tools like CodeQL, and limited extensibility for custom vulnerability patterns.

---

## 4. Analysis

### 4.1 The Benchmark Reality

Four major benchmarks provide empirical grounding for tool comparisons:

**OWASP Benchmark v1.2**: 2,740 synthetic Java test cases across 10 CWE categories with known ground truth. Advantage: clean ground truth. Disadvantage: synthetic tests may not reflect real-world code complexity or exploit patterns.

**CWE-Bench-Java** (IRIS dataset): 120 real-world CVEs in Java projects averaging 300K LOC. Better reflects production conditions. Smaller sample.

**EASE 2024**: 170 manually curated commits with known vulnerabilities in production Java code. Smallest but most ecologically valid.

**Vul4J**: 50 triaged CodeQL alerts from real-world Java projects; designed for LLM evaluation.

The consistent finding across benchmarks: no tool dominates. CodeQL achieves highest recall at the cost of high false positive rate. Joern achieves lowest false positive rate at the cost of near-zero recall on standard queries. Semgrep's performance is rule-quality-dependent more than analysis-depth-dependent.

### 4.2 Scalability vs. Soundness

The fundamental engineering tension in deploying formal methods in CI/CD is scan latency. The constraint hierarchy is:

- **Pre-commit hooks** must complete in under 5 seconds or developers bypass them
- **PR-blocking checks** should complete in under 10 minutes to avoid blocking developer flow
- **Nightly / scheduled scans** can tolerate hours

This maps to tool capabilities:
- Secrets scanning (Gitleaks, TruffleHog): 2--10 seconds, pre-commit feasible
- AST linting (golangci-lint, ESLint): 5--30 seconds, pre-commit feasible
- Fast taint scanning (Semgrep CE): minutes, PR-check feasible
- Deep taint / interprocedural (CodeQL, Semgrep Pro): minutes to hours, PR-check only on incremental mode
- Sound abstract interpretation (Astrée, Frama-C): hours to days, release-gate only
- Deductive verification (Frama-C/WP, Dafny): manual annotation burden limits to specific modules

LLM-augmented post-processing adds 0.001--0.19 seconds per alert (processing cost) but may add significant API latency on high-volume finding streams.

### 4.3 Interprocedural Analysis: The Precision Cliff

A recurring theme across Section 3 is that intrafile / intrafunction analysis is tractable for AST-based tools, but interprocedural analysis -- following values across function call boundaries -- dramatically increases both analysis depth and computational cost.

Semgrep CE's move to the Pro Engine (cross-file dataflow) is the clearest commercial illustration: the detection rate for injection-class vulnerabilities approximately doubles, but scan time increases proportionally. CodeQL's relational database architecture was designed precisely to make interprocedural queries tractable by pre-computing the call graph and data flow graph; the build-time overhead is the price of this pre-computation.

The IRIS neuro-symbolic approach sidesteps some of this cost by using LLMs to generate the taint specifications that drive CodeQL's interprocedural queries -- essentially using LLM knowledge about library APIs to replace the expensive task of manually annotating sources, sinks, and sanitizers.

### 4.4 Annotation Burden vs. Automation Level

Formal methods tools can be classified by the degree of user annotation required:

| Annotation burden | Tool examples | Guarantee class |
|---|---|---|
| None | Linters, basic SAST | Style + shallow correctness |
| Source/sink config | Semgrep rules, CodeQL taint queries | Vulnerability class coverage |
| Type annotations | TypeScript strict, Go generics | Type safety within language |
| Preconditions / postconditions | Dafny, Frama-C/WP, LiquidHaskell | Functional correctness |
| Full specification + proof | Coq, Agda, F* (HACL*, miTLS) | Machine-checked correctness proof |

Each step up the ladder requires more developer investment and provides stronger guarantees. The "sweet spot" for most organizations is somewhere between row 2 and row 3: enforce strong type discipline and configure taint analysis with project-specific source/sink models.

### 4.5 The LLM Augmentation Layer

The 2024--2025 research consensus on LLM-augmented static analysis can be summarized as:

1. LLMs are effective at false positive reduction (ZeroFalse: F1 0.91; Sifting the Noise: 92.1% FPR reduction), but they also suppress some true positives (22.25% in "Sifting the Noise").
2. LLMs are effective at specification inference (IRIS: +103.7% vulnerability detection vs. CodeQL baseline), especially for library API taint classification.
3. LLM performance is model-dependent: Claude Sonnet 4 and GPT-5 are strongest in agentic workflows; DeepSeek Chat performs better with vanilla prompting than with agent scaffolding.
4. CWE-class variation is large: injection flaws (CWE-78, CWE-89, CWE-79) are well-served by current approaches; cryptographic and policy-class flaws (CWE-327, CWE-614) remain challenging.
5. Cost is non-trivial at scale: 20--27 LLM interaction rounds per analysis (OpenHands) multiplied by millions of lines of code requires careful cost management.

The emerging architecture is: traditional static analysis for coverage and reachability, LLM for specification enrichment, false positive filtering, and explainability, with human review remaining mandatory for high-severity findings.

---

## 5. Comparative Synthesis

### 5.1 Tool Landscape Table

| Tool | Analysis depth | Soundness | False positive rate | Scalability | Annotation burden | Languages | Open source |
|---|---|---|---|---|---|---|---|
| Astrée | Abstract interp. | Sound | Low (tuned) | Low (embedded C only) | High (domain config) | C subset | No |
| Frama-C/WP | Deductive | Sound per annotation | Very low | Very low | Very high (ACSL) | C | Yes |
| LiquidHaskell | Refinement types | Sound | Low | Moderate | Moderate (refinements) | Haskell | Yes |
| Infer / Pulse | Separation logic / ISL | Under-approx (Pulse) | Very low (Pulse) | High | None | Java/C/C++/ObjC | Yes |
| CodeQL | Interprocedural taint | Unsound | High (68%) | Moderate | Low (queries) | 12 languages | Partial |
| Semgrep CE | AST taint | Unsound | High (75%) | High | Low (YAML rules) | 35+ languages | Yes |
| Semgrep Pro | Cross-file taint | Unsound | Moderate | Moderate | Low | 35+ | No |
| Joern | CPG traversal | Under-approx | Very low (7%) | Moderate | Low (queries) | Multi | Yes |
| SonarQube | AST + basic flow | Unsound | Very high (95%) | High | None | 30+ | Partial |
| gosec | AST pattern | Unsound | Low (tunable) | High | None | Go | Yes |
| Bandit | AST pattern | Unsound | Low | High | None | Python | Yes |
| Gitleaks | Regex + entropy | Unsound | Low (with verify) | Very high | None | All | Yes |
| TruffleHog | Regex + live verify | Unsound | Very low | High | None | All | Yes |
| IRIS (LLM+CodeQL) | Neuro-symbolic | Unsound | Moderate | Moderate | None (LLM infers) | Java | Yes |
| ZeroFalse | LLM post-filter | N/A | Very low (post) | Moderate | None | Java | Research |
| TypeScript strict | Type system | Deliberately unsound | Low | High | None (type annotations) | TypeScript | Yes |
| Rust borrow checker | Ownership types | Sound (safe Rust) | None | High | None | Rust | Yes |

### 5.2 Tool Selection Framework by Objective

**Objective: prevent memory safety bugs in systems software**
Rust's ownership system (eliminates the class statically) > Frama-C/WP (proves properties in C, high cost) > Infer/Pulse (finds leaks and use-after-free in C/Java, no annotation) > Valgrind/ASan (dynamic, not static)

**Objective: detect injection vulnerabilities in web application CI**
CodeQL (scheduled, high recall) + Semgrep Pro (fast PR checks, custom rules) + human triage for high-severity CodeQL findings

**Objective: prevent secrets in git**
TruffleHog pre-commit (active credential verification) + Gitleaks pre-commit (history scanning) + GitHub Secret Scanning (server-side backup)

**Objective: enforce code quality standards across a polyglot codebase**
SonarQube (centralized quality gate, 30+ languages) + language-native linters in CI (golangci-lint, ESLint, pylint) + custom rules for organizational conventions

**Objective: prove absence of runtime errors in safety-critical embedded C**
Astrée (sound, DO-178C compatible) or Frama-C/WP with ACSL annotations

**Objective: reduce developer exposure to false positives from existing SAST**
LLM post-filtering (ZeroFalse architecture, or Datadog's approach) with human override for high-severity suppressed findings

### 5.3 The Abstract Interpretation - Type Theory Unification

A theoretical thread connecting Sections 3.1 and 3.2 is Cousot's observation that types are abstract interpretations. The type `Int` in a language is an abstract interpretation of the concrete set of all integer values: it over-approximates (says nothing about the range) but ensures type-consistent operations. Refinement types (LiquidHaskell's `{v:Int | v > 0}`) are more precise abstract domains -- they restrict the over-approximation. Dependent types are precise enough to encode exact mathematical invariants.

This unification has practical implications: type inference is fixpoint computation over a type lattice (Hindley-Milner), and the extensions to richer type systems are extensions of the abstract domain lattice. The engineering trade-off is the same: more expressive abstract domains give more precise guarantees but require more annotation and compute.

---

## 6. Open Problems & Gaps

### 6.1 The False Positive Trilemma at Scale

Despite the progress documented in Section 3.6, LLM-augmented false positive reduction has not solved the problem. The best results (ZeroFalse, F1 ~0.91) come from research pipelines on benchmarks; production deployments are conservative because: (a) models incorrectly suppress real vulnerabilities at a rate (22.25% in "Sifting the Noise") unacceptable for high-severity classes; (b) model outputs are non-deterministic, making audit trails difficult; (c) cost at scale (millions of alerts) remains significant.

A principled framework for when to trust LLM suppression -- calibrated confidence intervals per CWE class, per model, per alert type -- does not yet exist in deployable form.

### 6.2 Sound Analysis of Modern Language Features

Sound abstract interpretation tools like Astrée were designed for restricted subsets of C without dynamic allocation, higher-order functions, or concurrency. Modern systems software uses Rust (ownership types but not deductively verified), Go (garbage collected, goroutines), TypeScript (deliberately unsound types), and Python (dynamically typed). Extending sound abstract interpretation to these languages remains an open research problem.

Sound analysis of Rust's `unsafe` blocks is a particularly difficult case: the borrow checker guarantees for safe Rust are precise and machine-checked, but `unsafe` code can violate those guarantees and is not covered by the borrow checker's proofs. Projects like Miri (a Rust interpreter that detects undefined behavior in `unsafe` code) and RustBelt (a formal model of Rust's type safety) address this partially, but sound static analysis of production unsafe Rust is not industrialized.

### 6.3 Compositional Verification at Repository Scale

Deductive verification (Frama-C/WP, Dafny, LiquidHaskell) works well on individual functions. Composing proofs across large module graphs -- where each module's proof relies on specifications of its dependencies -- is theoretically supported but practically difficult. Specification drift (a module's implementation changes but its specification does not) invalidates downstream proofs silently unless checked continuously.

The specification language gap is also real: ACSL (Frama-C), ACSL++ (Frama-C for C++), and Dafny's annotation language are sufficiently different that no organization has standardized on a common specification layer across languages.

### 6.4 Supply Chain Static Analysis

Static analysis of dependencies -- rather than the codebase itself -- is underdeveloped. Current SCA tools (Snyk, Dependabot, SLSA) check dependency versions against CVE databases. They do not perform semantic analysis of dependency code to detect malicious behavior introduced in compromised packages (the SolarWinds or xz-utils supply chain attack class). The 2024 xz-utils backdoor was found by dynamic observation (unexpected CPU usage), not static analysis. Static detection of obfuscated malicious code in dependencies is an open research problem.

### 6.5 Formal Methods for Concurrent and Distributed Systems

Separation logic with concurrency extensions (Concurrent Separation Logic, Iris framework, Concurrent Incorrectness Separation Logic) provides theoretical foundations for reasoning about concurrent programs. Industrial application is limited. Go's race detector (`-race` flag) is dynamic; static race detection via tools like RacerD (Infer) operates on conservative approximations. Formally verifying distributed consensus protocols (Raft, Paxos) requires specialized model checkers (TLA+, Alloy) that are not integrated into standard CI pipelines.

### 6.6 LLM-Generated Code Verification

As LLMs generate increasing fractions of production code, the question of how static analysis tools interact with LLM-generated code becomes pressing. Preliminary evidence (emergentmind.com LLM-Generated Code Security survey, 2024) suggests LLM-generated code has different vulnerability distributions from human-written code: more boilerplate-class vulnerabilities (copied insecure patterns from training data), fewer logic errors per line, but potentially systematic blind spots reflecting training data biases. Existing SAST rules were designed and tuned for human-written code; their false positive and false negative rates on LLM-generated code have not been systematically benchmarked.

---

## 7. Conclusion

Static analysis and formal methods constitute a rich ecosystem of complementary techniques, not a single technology. The theoretical foundations laid by Cousot & Cousot (1977), Hoare (1969), O'Hearn (2019), and the type theory community (Curry-Howard, 1934/1969) remain the organizing principles, even as the tooling landscape has become dramatically more accessible.

The practical picture in 2026 is a layered defense:

- **Compile-time type checking** (Rust's ownership, TypeScript strict, Dart null safety) eliminates whole bug classes for free in languages that support it
- **Linting** (golangci-lint, ESLint with type-awareness) enforces coding standards and catches shallow correctness issues in seconds
- **SAST taint analysis** (CodeQL for depth, Semgrep for speed) finds injection vulnerabilities in CI pipelines
- **Secrets scanning** (TruffleHog, Gitleaks) prevents credential leakage with near-zero false positives
- **LLM augmentation** reduces the false positive burden on SAST output and enriches taint specifications
- **Sound abstract interpretation** (Astrée, Frama-C/WP) provides mathematical guarantees for safety-critical software at high annotation and operational cost

The frontier is LLM-native static analysis: systems like IRIS that use language model knowledge to generate taint specifications, ZeroFalse that uses CWE-specific micro-rubric prompting to eliminate false positives, and agentic frameworks that iteratively reason about code. Results are promising but not yet production-ready without human oversight on high-severity findings.

The soundness-completeness-scalability trilemma is not solved; it is managed. The tools and techniques in this survey provide the current set of management strategies.

---

## References

1. Cousot, P. & Cousot, R. (1977). "Abstract Interpretation: A Unified Lattice Model for Static Analysis of Programs by Construction or Approximation of Fixpoints." *Proceedings of the 4th ACM POPL*, pp. 238--252. https://dl.acm.org/doi/10.1145/512950.512973

2. Cousot, P. & Cousot, R. (1992). "Comparing the Galois Connection and Widening/Narrowing Approaches to Abstract Interpretation." *PLILP 1992*, LNCS 631, pp. 269--295. https://www.di.ens.fr/~cousot/publications.www/CousotCousot-PLILP-92-LNCS-n631-p269--295-1992.pdf

3. Cousot, P. (2024). "A Personal Historical Perspective on Abstract Interpretation." *Festschrift Symposium Proceedings*. https://cs.nyu.edu/~pcousot/publications.www/Cousot-FSP-2024.pdf

4. Blanchet, B., et al. (2003). "A Static Analyzer for Large Safety-Critical Software." *PLDI 2003*. (Astrée original paper)

5. Cousot, P. (2007). "The ASTRÉE Static Analysis Tool." Talk at ES/PASS Berlin 2007. https://cs.nyu.edu/~pcousot/COUSOTtalks/ES_PASS-Berlin07.shtml

6. The Astrée Analyzer project page. https://www.astree.ens.fr/

7. Cuoq, P., Kirchner, F., et al. (2012). "Frama-C: A Software Analysis Perspective." *Formal Aspects of Computing*, 27(3):573--609. https://frama-c.com/

8. Frama-C Days 2024 Gallery and Publications. https://www.frama-c.com/html/publications/frama-c-days-2024/index.html

9. O'Hearn, P.W. (2020). "Incorrectness Logic." *Proc. ACM Program. Lang.*, 4(POPL), Article 10. https://dl.acm.org/doi/10.1145/3371078

10. Le, Q.L., et al. (2022). "Finding Real Bugs in Big Programs with Incorrectness Logic." *ICSE 2022*. http://www0.cs.ucl.ac.uk/staff/p.ohearn/RealBigDraft.pdf

11. Raad, A., et al. (2022). "Concurrent Incorrectness Separation Logic." *Proc. ACM Program. Lang.*, 6(POPL). https://dl.acm.org/doi/pdf/10.1145/3498695

12. Vanegue, J., et al. (2025). "Non-Termination Proving: 100 Million LoC and Beyond." arXiv:2509.05293. https://arxiv.org/html/2509.05293

13. Leino, K.R.M. (2010). "Dafny: An Automatic Program Verifier for Functional Correctness." *LPAR 2010*. https://en.wikipedia.org/wiki/Dafny

14. Dafny 2024 Workshop at POPL. https://popl24.sigplan.org/home/dafny-2024

15. Vazou, N., et al. (2014). "Refinement Types for Haskell." *ICFP 2014*. https://dl.acm.org/doi/10.1145/2628136.2628161

16. Vazou, N., et al. (2018). "Refinement Reflection: Complete Verification with SMT." *Proc. ACM Program. Lang.*, 2(POPL). https://dl.acm.org/doi/10.1145/3158141

17. LiquidHaskell tutorial. https://ucsd-progsys.github.io/liquidhaskell-tutorial/book.pdf

18. Protzenko, J., et al. (2017). "Verified Low-Level Programming Embedded in F*." *Proc. ACM Program. Lang.*, 1(ICFP). (HACL* and F*)

19. Creusot: Formal verification of Rust programs. POPL 2026 Tutorial. https://popl26.sigplan.org/details/POPL-2026-tutorials/6/Creusot-Formal-verification-of-Rust-programs

20. Ullrich, S., et al. (2025). "Lessons Learned So Far From Verifying the Rust Standard Library (work-in-progress)." arXiv:2510.01072. https://arxiv.org/html/2510.01072v2

21. Siek, J. & Taha, W. (2006). "Gradual Typing for Functional Languages." *Scheme and Functional Programming Workshop 2006*.

22. TypeScript type compatibility documentation. https://www.typescriptlang.org/docs/handbook/type-compatibility.html

23. Vanderkam, D. (2021). "The Seven Sources of Unsoundness in TypeScript." *Effective TypeScript*. https://effectivetypetype.com/2021/05/06/unsoundness/

24. Kildall, G.A. (1973). "A Unified Approach to Global Program Optimization." *POPL 1973*.

25. Avgustinov, P., et al. (2016). "QL: Object-Oriented Queries on Relational Data." *ECOOP 2016*. (CodeQL/QL foundations)

26. CodeQL official site. https://codeql.github.com/

27. Semgrep vs CodeQL: Technical Comparison (2026). Konvu. https://konvu.com/compare/semgrep-vs-codeql

28. Semgrep vs CodeQL: Patterns vs Semantic Analysis. AI Code Review. https://aicodereview.cc/blog/semgrep-vs-codeql/

29. Fabian, N., et al. (2024). "Sifting the Noise: A Comparative Study of LLM Agents in Vulnerability False Positive Filtering." arXiv:2601.22952. https://arxiv.org/html/2601.22952v1

30. Yamaguchi, F., et al. (2014). "Modeling and Discovering Vulnerabilities with Code Property Graphs." *IEEE S&P 2014*. (Joern/CPG foundations)

31. Joern documentation -- Code Property Graph. https://docs.joern.io/code-property-graph/

32. Joern GitHub repository. https://github.com/joernio/joern

33. Hedin, D. & Sabelfeld, A. (2011). "A Perspective on Information-Flow Control." *IFIP WG 2.3 International Summer School 2011*. https://www.cse.chalmers.se/~andrei/mod11.pdf

34. Costa, M. & Kopf, B. (2025). "Securing AI Agents with Information-Flow Control." arXiv:2505.23643. https://arxiv.org/pdf/2505.23643

35. Scandariato, R., et al. (2024). "EASE 2024 SAST Benchmark." *Empirical Software Engineering*.

36. Shiraishi, J., et al. (2025). "Reducing False Positives in Static Bug Detection with LLMs: An Empirical Study in Industry." arXiv:2601.18844. https://arxiv.org/html/2601.18844v1

37. Using LLMs to filter out false positives from static code analysis. Datadog Engineering. https://www.datadoghq.com/blog/using-llms-to-filter-out-false-positives/

38. ZeroFalse: Improving Precision in Static Analysis with LLMs. arXiv:2510.02534. https://arxiv.org/html/2510.02534

39. Cheng, D., et al. (2024/2025). "IRIS: LLM-Assisted Static Analysis for Detecting Security Vulnerabilities." arXiv:2405.17238, ICLR 2025. https://arxiv.org/abs/2405.17238

40. LLMxCPG: Context-Aware Vulnerability Detection Through Code Property Graph-Guided Large Language Models. arXiv:2507.16585. https://arxiv.org/html/2507.16585v1

41. GitHub Copilot code review documentation. https://docs.github.com/en/copilot/concepts/agents/code-review

42. New features in Copilot code review (October 2025). GitHub Changelog. https://github.blog/changelog/2025-10-28-new-public-preview-features-in-copilot-code-review-ai-reviews-that-see-the-full-picture/

43. TruffleHog GitHub repository. https://github.com/trufflesecurity/trufflehog

44. CNCF: The importance of secrets detection and redaction within the SLSA framework. https://www.cncf.io/blog/2024/07/29/the-importance-of-secrets-detection-and-redaction-within-the-slsa-framework/

45. OWASP Top 10 (2021). https://owasp.org/Top10/

46. Johnson, S.C. (1978). "Lint, a C Program Checker." Bell Labs Technical Memorandum.

47. golangci-lint documentation. https://golangci-lint.run/docs/linters/

48. revive linter rules. https://github.com/mgechev/revive

49. gosec -- Go security checker. https://github.com/securego/gosec

50. Infer Static Analyzer documentation. https://fbinfer.com/

51. Calcagno, C., et al. (2015). "Infer: Interprocedural Memory Safety for Mobile Apps." *IEEE S&P 2015*. https://fbinfer.com/

52. O'Hearn, P., et al. (2019). "Scaling Static Analyses at Facebook." *Communications of the ACM*, 62(8):62--70. https://cacm.acm.org/research/scaling-static-analyses-at-facebook/

53. Maksimovic, P., et al. (2022). "Exact Separation Logic." https://www.doc.ic.ac.uk/~pg/publications/Maksimovic2022Exact.pdf

54. On Understanding and Forecasting Fuzzers Performance with Static Analysis. CCS 2024. https://dl.acm.org/doi/abs/10.1145/3658644.3670348

55. Best AI Code Security Tools 2025: Snyk vs Semgrep vs CodeQL. https://sanj.dev/post/ai-code-security-tools-comparison

56. 35 Best SAST Tools Compared (2026 Review). AppSec Santa. https://appsecsanta.com/sast-tools

---

## Practitioner Resources

### Learning and Reference

| Resource | Type | URL |
|---|---|---|
| Abstract Interpretation course (Cousot, Verona 2004) | Lecture notes | https://www.di.ens.fr/~cousot/summerschools/Verona04-P-Cousot-course/index.shtml |
| LiquidHaskell Tutorial | Book (PDF) | https://ucsd-progsys.github.io/liquidhaskell-tutorial/book.pdf |
| Frama-C/WP Tutorial (Blanchard) | GitHub | https://github.com/AllanBlanchard/tutoriel_wp |
| Incorrectness Logic and Under-approximation (POPL 2023 TutorialFest) | Slides | https://popl23.sigplan.org/details/POPL-2023-tutorialfest/6/Incorrectness-Logic-and-Under-approximation-Foundations-of-Bug-Catching |
| CodeQL documentation | Official | https://codeql.github.com/ |
| Semgrep rule registry | Official | https://semgrep.dev/r |
| Joern documentation | Official | https://docs.joern.io/ |
| OWASP Benchmark | Benchmark | https://owasp.org/www-project-benchmark/ |
| golangci-lint linter reference | Official | https://golangci-lint.run/docs/linters/ |

### Key Papers (Chronological)

| Year | Paper | Contribution |
|---|---|---|
| 1969 | Hoare, "An Axiomatic Basis for Computer Programming" | Hoare Logic foundations |
| 1973 | Kildall, "A Unified Approach to Global Program Optimization" | Dataflow analysis fixpoint framework |
| 1977 | Cousot & Cousot, "Abstract Interpretation: A Unified Lattice Model" | Abstract interpretation foundations |
| 1978 | Johnson, "Lint, a C Program Checker" | First practical linter |
| 2001 | O'Hearn, Reynolds, Yang, "Local Reasoning about Programs that Alter Data Structures" | Separation logic |
| 2006 | Siek & Taha, "Gradual Typing for Functional Languages" | Gradual typing theory |
| 2006 | Calcagno et al., "Footprint Analysis: A Shape Analysis That Discovers Preconditions" | Biabduction (Infer foundations) |
| 2014 | Yamaguchi et al., "Modeling and Discovering Vulnerabilities with Code Property Graphs" | CPG / Joern foundations |
| 2014 | Vazou et al., "Refinement Types for Haskell" | LiquidHaskell |
| 2015 | Calcagno et al., "Infer: Interprocedural Memory Safety for Mobile Apps" | Infer production deployment |
| 2018 | Rust 2018 Edition | Borrow checker stability, production-ready |
| 2019 | O'Hearn, "Incorrectness Logic" | Under-approximate bug finding theory |
| 2022 | Raad et al., "Concurrent Incorrectness Separation Logic" | Concurrency + incorrectness |
| 2025 | Cheng et al., "IRIS: LLM-Assisted Static Analysis" | Neuro-symbolic taint inference |
| 2025 | Fabian et al., "Sifting the Noise" | LLM agent false positive filtering benchmark |
| 2025 | ZeroFalse, "Improving Precision in Static Analysis with LLMs" | CWE-specific LLM prompting for SAST |

### Tooling Quick Reference

| Goal | Tool | Language | Cost |
|---|---|---|---|
| Go linting + security | golangci-lint (gosec, revive, cyclop) | Go | Free |
| Python security | Bandit | Python | Free |
| Multi-language SAST (fast) | Semgrep CE | 35+ | Free (OSS) |
| Multi-language SAST (deep) | CodeQL | 12 | Free (OSS) / Paid |
| Secrets in git history | Gitleaks | All | Free |
| Secrets with live verification | TruffleHog | All | Free |
| Dependency vulnerabilities | Dependabot / Snyk | All | Free / Paid |
| Enterprise quality gate | SonarQube CE | 30+ | Free CE / Paid |
| Java/C memory safety | Facebook Infer | Java/C/C++ | Free |
| Safety-critical C | Astrée | C subset | Commercial |
| C formal verification | Frama-C/WP | C | Free |
| Haskell refinements | LiquidHaskell | Haskell | Free |
| Rust formal verification | Creusot | Rust | Free (research) |
| LLM false positive filter | ZeroFalse architecture | Any (post-SAST) | API cost only |
