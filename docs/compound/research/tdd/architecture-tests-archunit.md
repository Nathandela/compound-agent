---
title: "Architecture Tests: Expressing Architectural Invariants as Executable Tests"
date: 2026-04-10
summary: >
  Survey of architecture testing tools that convert structural rules into executable test assertions, covering ArchUnit, fitness functions, and counterparts across Java, Python, TypeScript, and Go ecosystems.
keywords: [test-driven-development, architecture-tests, archunit, fitness-functions, dependency-analysis]
---

# Architecture Tests: Expressing Architectural Invariants as Executable Tests

*2026-04-10*

---

## Abstract

Software architecture, unlike the code it governs, has historically existed in documents, diagrams, and the heads of senior engineers. The resulting gap between documented intent and actual structure is known as architectural drift, and it accumulates quietly until accumulated technical debt forces an expensive remediation or a major incident exposes a violated boundary. This survey examines a class of tooling — architecture tests — that closes this gap by converting architectural rules into executable test assertions that run in continuous integration pipelines.

The field draws from two intellectual traditions: the ArchUnit library in the Java ecosystem (2017), which demonstrated that bytecode-level dependency graph analysis could be expressed in a developer-friendly fluent API and treated as a first-class testing concern; and the "fitness function" concept introduced in Neal Ford, Rebecca Parsons, and Patrick Kua's _Building Evolutionary Architectures_ (2017), which reframed architectural governance as a set of objective, measurable, continuously evaluated criteria analogous to genetic fitness functions in evolutionary computation.

This survey covers the full landscape: ArchUnit's design philosophy and internal mechanism, its counterparts in Python (import-linter, pytestarch, pytest-archon, Deply), the JavaScript/TypeScript ecosystem (dependency-cruiser), the Go ecosystem (arch-go), cross-cutting approaches using AST analysis and Semgrep, the theoretical framing of fitness functions, and CI integration patterns. The analysis includes the critical distinction between static linting (code style, local correctness) and architecture tests (inter-module structural constraints), identifies real-world adoption patterns and failure modes, and maps the open problems that current tooling does not address.

---

## 1. Introduction

A software architecture is a set of structural decisions that constrain how a system's components relate to each other. Layered architectures enforce unidirectional dependency flows. Hexagonal (ports-and-adapters) architectures isolate business logic from external systems. Domain-driven design isolates bounded contexts. In each case, the decision creates an invariant: a rule of the form "component A must not import from component B" or "all classes in the service layer must be accessed only through defined interfaces."

The enforcement problem is well-understood but persistently unsolved by traditional means. Architecture Decision Records (ADRs) describe the intended structure but do not prevent violations. Code reviews catch violations if the reviewer is experienced enough to recognize them and attentive enough to check in every PR. Static linters operate at the wrong level of abstraction: they reason about individual lines and local patterns, not cross-module dependency flows. The result is that architectural invariants are the least mechanically enforced category of software quality constraint.

Architecture tests address this by making invariants executable. Rather than recording that "the service layer must not depend on the presentation layer," a team writes a test that imports the actual codebase, constructs its dependency graph, and asserts that no edge from service to presentation exists. This test fails the build when violated, eliminating the enforcement gap.

The concept emerged at scale with ArchUnit (Java, TNG Technology Consulting, 2017), which provided a bytecode-level analysis engine and a fluent DSL expressive enough to write readable architectural rules. The Java ecosystem adopted the tool rapidly; by 2022, InfoQ was reporting widespread enterprise use. The Python ecosystem subsequently developed several analogues: import-linter (David Seddon), pytestarch, pytest-archon, and Deply, each with different design philosophies and expressiveness profiles.

This survey maps the current landscape across four axes: (1) the theoretical foundation in fitness functions and architectural invariants; (2) a taxonomy of implementation approaches; (3) a detailed analysis of each major tool; and (4) the open problems that remain unsolved.

---

## 2. Foundations

### 2.1 Architectural Invariants

An architectural invariant is a structural property of a codebase that must hold across all states of the system, for all time, regardless of which developer touches which file. Common invariants include:

- **Layer isolation**: Higher layers may import lower layers; lower layers must not import higher layers.
- **Bounded context isolation**: Modules belonging to different bounded contexts must not import each other directly.
- **Framework-free domain**: Domain logic classes must not import persistence framework classes (e.g., Spring Data, SQLAlchemy).
- **Cyclic dependency absence**: No set of modules may form a circular import chain.
- **Naming conventions**: All classes annotated with `@Service` must reside in a package ending in `.service` and must have names ending with `Service`.
- **API surface control**: A module's public API surface must not expose its internal implementation types.

These invariants share a structural character: they are claims about the dependency graph of the codebase, not about the runtime behavior of any particular function. This structural character is what makes them amenable to static analysis.

### 2.2 The Enforcement Gap

Documentation-based enforcement fails for several well-understood reasons. ADRs and architecture diagrams diverge from reality as code evolves; there is no mechanical check that a PR's changes remain consistent with documented decisions. Code review enforcement is inconsistent: not every reviewer checks architectural constraints, the same reviewer applies different judgment under time pressure, and junior developers may not know the constraints exist. Manual enforcement also scales poorly — a codebase with 200 modules and 50 developers generates many daily opportunities for violations that no reviewer can catch systematically.

The enforcement gap produces architectural drift: a gradual accumulation of violations that individually seem minor but collectively undermine the structural properties the architecture was designed to provide. A service layer that imports three presentation-layer utilities ceases to be independently deployable. A domain model that imports a persistence framework becomes untestable without the database. Once drift is established, it is self-reinforcing: each new developer who sees an existing violation treats it as permission for another.

### 2.3 Fitness Functions

Neal Ford, Rebecca Parsons, Patrick Kua, and Pramod Sadalage introduced the fitness function concept in _Building Evolutionary Architectures_ (O'Reilly, 1st ed. 2017, 2nd ed. 2022). The term borrows from evolutionary computation, where a fitness function scores a candidate solution on how well it meets the optimization objectives.

In their framework, an architectural fitness function is "any mechanism that provides an objective integrity assessment of some architectural characteristic or characteristics." The key word is objective: a fitness function must produce a deterministic pass/fail (or scored) result that does not depend on human judgment. Architecture tests are the most tractable class of fitness functions — they run as part of the standard test suite and produce a binary result.

The book classifies fitness functions across several dimensions:

**Atomic vs. holistic**: An atomic function checks a single characteristic (e.g., no circular dependencies). A holistic function checks a combination (e.g., the service is independently deployable: no circular deps AND no shared database tables AND bounded latency).

**Triggered vs. continual**: Triggered functions run at a specific pipeline stage (e.g., on every commit, on every nightly build). Continual functions run in production on live traffic (e.g., monitoring service call latency against an SLO).

**Static vs. dynamic**: Static functions analyze source code or bytecode without execution. Dynamic functions require the system to run.

Architecture tests in the sense covered by this survey are triggered, static, atomic fitness functions. They form the most tractable and widely deployed category.

The Thoughtworks Technology Radar has repeatedly featured architecture-testing tooling (ArchUnit appeared in 2017, 2018 cycles) precisely because it operationalizes the fitness function concept: convert architectural principles into measurable, automated checks embedded throughout the delivery pipeline.

### 2.4 Architecture Tests vs. Static Analysis

A persistent source of confusion is the relationship between architecture tests and traditional static analysis (linters, type checkers). The distinction is one of abstraction level and scope:

| Dimension | Static Analysis (pylint, ruff, mypy) | Architecture Tests (ArchUnit, import-linter) |
|-----------|--------------------------------------|----------------------------------------------|
| Unit of analysis | Individual statement or expression | Cross-module dependency graph |
| Typical rule | "Do not use bare `except`" | "Module A must not import module B" |
| Rule source | Language community conventions | Team-specific architectural decisions |
| Expressiveness | Local, intra-function | Inter-module, graph-level |
| False positive rate | Low (fixed rule set) | Moderate (depends on rule quality) |
| Maintenance burden | Low (tool-maintained) | High (team-maintained) |

Static analysis tools like pylint and ruff check whether individual lines of code comply with style conventions and local correctness rules. They reason about a single file, or at most a single function call graph. They do not reason about whether the `payments` module imports from the `notifications` module, or whether the import graph contains cycles.

Architecture tests reason at the module and package level, expressing policies about which modules may depend on which other modules. The rules are team-specific and domain-specific: they encode the particular architectural decisions made for the particular system.

Some tools (notably Deply and Semgrep) occupy a hybrid position: they analyze code structure at the AST level but express constraints that cross module boundaries. They are discussed in section 4.

---

## 3. Taxonomy of Approaches

The landscape of architecture testing tools spans several implementation strategies, each with different expressiveness, precision, and maintenance characteristics:

| Category | Mechanism | Scope | Examples | Rule Language |
|----------|-----------|-------|---------|---------------|
| **Bytecode / compiled artifact analysis** | Parse compiled output (JVM bytecode, .NET IL) | Class/package dependency graph | ArchUnit (Java), NetArchTest (.NET), ArchUnitNET | Fluent DSL in host language |
| **Source-level import graph analysis** | Parse `import` statements in source files | Module dependency graph | import-linter, pytestarch, pytest-archon, grimp | Config DSL (INI/TOML) or host-language fluent API |
| **AST-based structural analysis** | Parse full abstract syntax tree | Module + intra-module structure | Deply, Semgrep (custom rules), Python `ast` module | YAML rules or host-language predicates |
| **Static dependency graph with visualization** | Parse module resolution graph, apply JSON rules | Module dependency graph + diagrams | dependency-cruiser (JS/TS) | JSON rule configuration |
| **Custom codebase scanning** | Ad-hoc AST or regex traversal in test code | Any structural property | Hand-written pytest tests, route-scanning tests | Arbitrary host-language code |
| **Runtime/holistic fitness functions** | Execute system, measure properties | Behavior + structure | Custom monitoring assertions, contract tests | Monitoring DSLs, test frameworks |

The categories are not mutually exclusive: a project might use import-linter for module boundary enforcement (import graph) and a custom AST-based test to verify that all FastAPI route handlers are registered (custom scanning).

---

## 4. Analysis

### 4.1 ArchUnit (Java)

#### 4.1.1 Theory and Design Philosophy

ArchUnit, developed by TNG Technology Consulting and released as open source in 2017 (Apache 2.0), is the seminal architecture testing library. Its design rests on three principles: (1) architectural rules should be expressed in the same language and tooling as the code they govern; (2) the analysis should be performed on compiled artifacts (bytecode), not source text, to capture all structural relationships including those generated by annotation processors and bytecode manipulation; and (3) the rule DSL should be expressive enough that rules read nearly as natural-language requirements.

The library addresses a problem articulated repeatedly in its documentation: "Modern Java codebases tend to drift over time. A clean package structure becomes 'mostly clean,' then 'we'll fix it later.'" By making architectural rules into JUnit tests, violations fail the build — the same mechanism that prevents shipping code with failing unit tests now prevents shipping code with architectural violations.

#### 4.1.2 Internal Mechanism

ArchUnit operates in two phases: import and evaluation.

**Import phase**: The `ClassFileImporter` reads compiled `.class` files from specified locations (package paths, JAR files, the full classpath) using the ASM bytecode manipulation library. It constructs an in-memory object model — `JavaClass`, `JavaMethod`, `JavaField`, `JavaMethodCall`, `JavaFieldAccess` — that mirrors the Java reflection API but extends it with access and usage information. Crucially, this model includes the complete dependency graph: every method call, every field access, every class reference is recorded. The import phase is cached by the JUnit 5 integration (`@AnalyzeClasses`) so that multiple tests in a test class share the same imported class set.

**Evaluation phase**: A rule is an `ArchRule`, which combines a selector (which elements to check), a condition (what must hold), and a description (human-readable rule text). The rule is evaluated by iterating over the selected elements and applying the condition. Violations are collected and reported with full context: the violating class name, the package, the source file, and the line number.

The domain model is organized in three layers:
- **Core**: Low-level bytecode representation, corresponding closely to the JVM model
- **Lang**: Expressive rule DSL exposing the fluent API
- **Library**: Prepackaged rule patterns for common architectural styles

#### 4.1.3 Rule DSL

The fluent API is the primary user-facing abstraction. Rules read as:

```java
classes()
    .that().resideInAPackage("..service..")
    .should().onlyBeAccessed()
    .byAnyPackage("..controller..", "..service..")
```

The two core extension points are `DescribedPredicate` (filtering which elements to analyze) and `ArchCondition` (specifying what must hold). Both can be composed: `predicate.and(other)`, `predicate.or(other)`. This composability enables complex rules that would be difficult to express in a configuration DSL.

The Library API provides higher-level abstractions:

```java
layeredArchitecture()
    .consideringAllDependencies()
    .layer("Controller").definedBy("..controller..")
    .layer("Service").definedBy("..service..")
    .layer("Repository").definedBy("..repository..")
    .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
    .whereLayer("Service").mayOnlyBeAccessedByLayers("Controller")
    .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service")
```

The onion architecture variant:

```java
onionArchitecture()
    .domainModels("..domain.model..")
    .domainServices("..domain.service..")
    .applicationServices("..application..")
    .adapter("web", "..adapter.web..")
    .adapter("persistence", "..adapter.persistence..")
```

Slice-based rules detect cycles:

```java
slices().matching("..myapp.(*)..").should().beFreeOfCycles()
```

PlantUML integration allows deriving rules directly from component diagrams, keeping diagram and enforcement synchronized.

#### 4.1.4 Legacy Codebase Support: The Freeze Mechanism

ArchUnit's freeze mechanism addresses the practical barrier to adoption in established codebases: an existing project may have hundreds of existing violations that cannot be fixed immediately. The `FreezingArchRule` wrapper records all current violations in a violation store (by default, version-controlled text files). Subsequent test runs only report new violations — violations not present in the stored baseline. When stored violations are fixed, the store updates automatically.

Configuration:
```
freeze.store.default.path=/arch-violations
freeze.store.default.allowStoreCreation=true
freeze.store.default.allowStoreUpdate=false  # prevent accidental CI regression
```

This enables an incremental adoption strategy: introduce the rule, freeze existing violations as acknowledged technical debt, and prevent regression while addressing violations progressively. The violation store should live in version control; its changes are visible in PR diffs, making the architectural debt reduction explicit.

#### 4.1.5 Strengths and Limitations

**Strengths**:
- Bytecode analysis captures all structural relationships including annotation-generated code
- JUnit integration means zero additional toolchain requirements for Java projects
- The freeze mechanism solves the legacy adoption problem elegantly
- PlantUML integration keeps diagrams and enforcement synchronized
- Highly extensible: custom predicates and conditions support domain-specific rules
- The Library API provides well-tested patterns for common architectural styles

**Limitations**:
- Java/Kotlin/Groovy only; no cross-language application
- Rules that match on package names are silently vacuous if the package is renamed or misnamed — the test passes because no classes are checked, not because no violations exist
- Requires compiled artifacts: cannot run until after compilation, adding latency in feedback loops compared to source-level analysis
- Bytecode analysis cannot reason about build-time or runtime behavior, only structural properties
- Complex rules can be verbose; the fluent API, while readable, requires Java fluency

---

### 4.2 import-linter (Python)

#### 4.2.1 Theory and Design

import-linter (David Seddon, BSD-2-Clause, ~992 stars) takes a configuration-centric approach: architectural contracts are declared in INI or TOML configuration files, not in test code. The tool checks contracts against an import graph built by the grimp library, which constructs a directed graph where nodes are Python modules and edges are import relationships.

This design choice — configuration over code — reflects a philosophy that architectural rules are organizational policies best expressed declaratively, separated from the test code that implements features. The configuration lives in `setup.cfg` or `pyproject.toml`, making contracts visible alongside project metadata.

#### 4.2.2 Internal Mechanism

The execution pipeline:

1. **Graph construction**: grimp (version 3.14+) traverses all Python source files in the specified root package(s), recording all `import` statements into a directed graph. The graph supports queries for both direct and transitive (indirect) dependencies, enabling detection of deeply nested violations.

2. **Contract checking**: Each configured contract reads the graph and checks its specific constraint. Contracts return a `ContractCheck` with `kept` (pass/fail), `warnings`, and `metadata` fields.

3. **Reporting**: Human-readable output lists violated contracts with the specific import path that caused the violation.

#### 4.2.3 Contract Types

**Layers contract**: Enforces unidirectional dependencies in a layered architecture. Layers are listed from highest to lowest; imports may only flow downward:

```ini
[importlinter:contract:mypackage-layers]
name = Layered architecture
type = layers
layers =
    mypackage.ui
    mypackage.domain
    mypackage.infrastructure
```

Supports `independent_layers` to prevent sibling layers from importing each other within the same tier.

**Forbidden contract**: Prevents specified source modules from importing specific target modules, directly or transitively:

```ini
[importlinter:contract:no-orm-in-domain]
name = Domain must not use ORM
type = forbidden
source_modules = mypackage.domain
forbidden_modules = sqlalchemy
```

**Independence contract**: Ensures a set of modules share no dependencies in any direction — no imports between them, directly or indirectly:

```ini
[importlinter:contract:bounded-contexts]
name = Bounded contexts must be independent
type = independence
modules =
    mypackage.payments
    mypackage.notifications
    mypackage.inventory
```

**Protected contract**: Restricts which modules may import a protected module, implementing whitelist-based access control.

**Acyclic siblings contract**: Detects circular dependencies among sibling packages within a specified ancestor.

**Custom contracts**: The public API (`Contract` base class, `ContractCheck`, `fields` module) allows teams to implement project-specific contract types, registered via entry points.

#### 4.2.4 Strengths and Limitations

**Strengths**:
- Configuration-centric design keeps architectural rules in one visible location
- grimp's transitive dependency tracking catches violations hidden by intermediary modules
- Custom contract API enables domain-specific rules without forking the library
- `pyproject.toml` integration aligns with modern Python project conventions
- No test framework dependency — runs standalone or in CI

**Limitations**:
- Expressive power limited to import-graph constraints; cannot check naming conventions, decorator usage, class inheritance, or other structural properties
- Configuration DSL is less composable than a host-language fluent API
- Rules apply to entire module granularity; cannot express intra-module constraints
- `TYPE_CHECKING`-block imports (used for forward references) may produce spurious violations unless explicitly excluded
- No equivalent of ArchUnit's freeze mechanism for legacy codebase adoption

---

### 4.3 pytestarch (Python)

#### 4.3.1 Theory and Design

pytestarch (zyskarch, open source, ~155 stars) is explicitly "generally inspired by ArchUnit." It targets pytest integration and provides a fluent Python API for expressing module-level dependency rules. The design prioritizes familiarity for developers who know ArchUnit's style.

#### 4.3.2 Internal Mechanism

pytestarch scans Python files to build an `EvaluableArchitecture` representing the import graph. The scanning process is configured with a project root (to identify internal vs. external modules) and a source directory.

Rules are expressed as method chains on `Rule()` objects and evaluated against the `EvaluableArchitecture` via `.assert_applies(evaluable)`. The `LayeredArchitecture` abstraction groups modules into named layers, and `LayerRule` expresses inter-layer dependency constraints.

Fixtures in `conftest.py` make the architecture object available across test files without repeated construction:

```python
@pytest.fixture(scope="session")
def evaluable(src_dir):
    return get_evaluable_architecture(src_dir, f"{src_dir}/mypackage")

@pytest.fixture(scope="session")
def arch():
    return (LayeredArchitecture()
        .layer("presentation").containing_modules(["mypackage.api"])
        .layer("domain").containing_modules(["mypackage.domain"])
        .layer("persistence").containing_modules(["mypackage.db"]))
```

Layer rule expression:

```python
def test_presentation_cannot_access_persistence(evaluable, arch):
    rule = (LayerRule()
        .based_on(arch)
        .layers_that().are_named("presentation")
        .should_not().access_layers_that().are_named("persistence"))
    rule.assert_applies(evaluable)
```

Error messages name the specific module and the violated constraint: `src.mypackage.api.routes` (layer "presentation") imports `src.mypackage.db.models` (layer "persistence").

#### 4.3.3 Strengths and Limitations

**Strengths**:
- Fluent API mirrors ArchUnit's style, lowering adoption barrier for teams familiar with ArchUnit
- pytest integration means architectural rules run alongside unit tests without additional tooling
- Session-scoped fixtures prevent repeated codebase scanning for multiple tests
- Optional dependency graph visualization (matplotlib)

**Limitations**:
- Expressiveness limited to import-level constraints, similar to import-linter
- Smaller ecosystem and community than import-linter
- No configuration-file approach — all rules live in Python test code (advantage for composition; disadvantage for discoverability)
- Documentation is thinner than import-linter's
- No freeze/violation-store mechanism for incremental adoption

---

### 4.4 pytest-archon (Python)

#### 4.4.1 Theory and Design

pytest-archon (jwbargsten) positions itself as a lightweight alternative that integrates directly with pytest. Its API centers on the `archrule` function:

```python
archrule("domain-isolation")
    .match("mypackage.domain.*")
    .should_not_import("mypackage.infrastructure.*")
    .check("mypackage")
```

The `.match()` clause selects modules using fnmatch-style patterns or regular expressions. The `.check()` method traverses the package, resolves imports, and evaluates the rule.

#### 4.4.2 Scope and Transitive Analysis

pytest-archon offers fine-grained control over what constitutes a "dependency" through parameters on `.check()`:

| Mode | `TYPE_CHECKING` imports | Nested/conditional imports | Transitive imports |
|------|------------------------|---------------------------|-------------------|
| Default | included | included | included |
| `skip_type_checking=True` | excluded | included | included |
| `only_toplevel_imports=True` | excluded | excluded | included |
| `only_direct_imports=True` | included | included | excluded |

This granularity allows teams to express precise rules: for example, enforcing that the production import graph (excluding `TYPE_CHECKING` stubs) respects boundaries, while allowing forward-reference annotations.

Custom predicate functions extend the built-in rules:

```python
# Verify that a utility module is used by more than one consumer
archrule("utils-must-be-shared")
    .match("mypackage.utils")
    .should(lambda module, all_modules: 
        sum(1 for m in all_modules if "mypackage.utils" in m.imports) > 1)
    .check("mypackage")
```

#### 4.4.3 Real-World Usage Pattern

A Django project case study (162,595 lines) demonstrated three architectural rules enforced via pytest-archon and pre-commit hooks:

- BDD acceptance step files must not import Django ORM directly (steps interact through views, not the database)
- Page object modules must not import domain models
- Test files with AI-generated code must respect the same boundaries as production code

The pre-commit configuration:
```
entry: uv pytest tests/test_architecture.py -v
```

In AI-assisted development workflows, architectural tests have emerged as an important constraint mechanism: generated code respects architectural boundaries only when enforcement is automated.

#### 4.4.4 Strengths and Limitations

**Strengths**:
- Lightweight, minimal dependencies
- Fine-grained import-scope control (`TYPE_CHECKING`, nested, transitive)
- Custom predicate support enables rules beyond import topology
- Direct pytest integration
- fnmatch and regex pattern support provides flexible module selection

**Limitations**:
- Documentation is sparse; advanced features require reading source code
- No configuration-file approach; rules live in test code only
- No layer abstraction; each rule is expressed module-by-module
- No visualization support

---

### 4.5 Deply (Python)

#### 4.5.1 Theory and Design

Deply (Archil Vashkatsi) represents a different philosophical position: architectural rules should be expressed in YAML configuration, not test code, and should capture structural properties beyond import topology. Deply analyzes AST-level properties — class inheritance hierarchies, decorator usage, file path patterns, and naming conventions — in addition to import relationships.

This makes Deply the closest Python equivalent to ArchUnit's full expressiveness profile, though implemented at the source level rather than bytecode level.

#### 4.5.2 Layer Definition and Collectors

Deply defines "layers" as groups of code elements identified by collectors:

```yaml
layers:
  - name: models
    collectors:
      - type: class_inherits
        base_class: "django.db.models.Model"
  - name: views
    collectors:
      - type: decorator_usage
        decorator: "login_required"
  - name: services
    collectors:
      - type: file_regex
        pattern: ".*/services/.*\\.py$"
```

Collector types include: `class_inherits`, `decorator_usage`, `file_regex`, `class_name_regex`, `function_name_regex`. This allows layers to be defined semantically (what a class is, not where it lives) rather than purely by package path.

#### 4.5.3 Rule Expression

Rules specify dependency restrictions and naming requirements:

```yaml
ruleset:
  views:
    disallow_layer_dependencies:
      - models
    enforce_function_decorator_usage:
      - "csrf_protect"
  services:
    enforce_class_name_regex: ".*Service$"
```

The CI integration is a command-line check (`deply check`) with exit code semantics, requiring no test framework.

#### 4.5.4 Strengths and Limitations

**Strengths**:
- Expresses rules that import-graph tools cannot: naming conventions, decorator requirements, inheritance constraints
- YAML configuration requires no Python test-writing ability
- Semantic layer definition (by behavior, not by path) is more robust to package reorganization than path-based rules
- CI integration without test framework dependency

**Limitations**:
- AST-level analysis misses dynamically constructed imports and runtime class registration
- YAML rules are less composable than a host-language fluent API
- Smaller community and less documentation than import-linter
- No equivalent of ArchUnit's freeze mechanism
- Limited transitive dependency tracking compared to grimp-based tools

---

### 4.6 dependency-cruiser (JavaScript/TypeScript)

#### 4.6.1 Theory and Design

dependency-cruiser (Sander Verweij, MIT license, ~6,600 stars) is the dominant architecture testing tool for JavaScript and TypeScript ecosystems. It uses Acorn (a JavaScript parser) to resolve module dependencies across ES6 `import`, CommonJS `require`, and AMD `define` statements, constructing a module dependency graph that can be validated against JSON-configured rules and visualized as diagrams.

Unlike the import-graph tools above, dependency-cruiser combines enforcement (rule checking) and visualization (graph diagrams) in a single tool. This dual purpose reflects its origin as both a validation and exploration instrument.

#### 4.6.2 Rule Configuration

Rules are configured in `.dependency-cruiser.js` or `.dependency-cruiser.json`:

```json
{
  "forbidden": [
    {
      "name": "no-cross-context",
      "severity": "error",
      "from": { "path": "^src/payments/" },
      "to":   { "path": "^src/notifications/" }
    },
    {
      "name": "no-test-in-production",
      "severity": "error",
      "from": { "pathNot": "^test" },
      "to":   { "path": "^test" }
    }
  ],
  "required": [
    {
      "name": "must-use-index",
      "from": { "path": "^src/domain/" },
      "to":   { "path": "^src/infrastructure/index.ts$" }
    }
  ]
}
```

Severity levels — `error`, `warn`, `info`, `ignore` — provide graduated enforcement. `depcruise --init` generates a default configuration with sensible rules (circular dependency detection, missing `package.json` entries, orphan modules, dev-in-production violations).

#### 4.6.3 Visualization

Output formats include GraphViz dot (for SVG/PNG rendering), Mermaid diagrams, D2 diagrams, JSON, HTML, and ESLint-style text output. The visualization capability serves as a discovery mechanism: teams that have not previously analyzed their import graph often find the diagram revealing.

#### 4.6.4 Strengths and Limitations

**Strengths**:
- Multi-format language support: JavaScript, TypeScript, CoffeeScript, LiveScript, `.jsx`, `.tsx`, `.vue`, `.svelte`
- Combined enforcement and visualization in one tool
- Large community and mature documentation (~6,600 stars, 381 releases)
- Graduated severity levels enable progressive enforcement
- `--init` provides a sensible default configuration

**Limitations**:
- JSON rule configuration is less expressive than a host-language fluent API; complex conditions require `pathNot` + `path` combinations
- No equivalent of ArchUnit's bytecode-depth analysis; dynamic `require()` calls may not be tracked
- Visualization quality depends on GraphViz availability
- Rule expressiveness limited to path-pattern matching; cannot express semantic rules (decorator usage, inheritance constraints)

---

### 4.7 NetArchTest (.NET)

#### 4.7.1 Theory and Design

NetArchTest (Ben Morris, MIT license) is an ArchUnit-inspired library for .NET that uses Mono.Cecil to read Common Intermediate Language (CIL) — the .NET equivalent of JVM bytecode — rather than Roslyn (the .NET compiler API). This design choice prioritizes compatibility across .NET Framework and .NET Core without requiring the full build toolchain.

The fluent API mirrors ArchUnit's style:

```csharp
var result = Types.InAssembly(assembly)
    .That().ResideInNamespace("MyApp.Domain")
    .ShouldNot().HaveDependencyOn("MyApp.Infrastructure")
    .GetResult();
Assert.True(result.IsSuccessful);
```

#### 4.7.2 Strengths and Limitations

**Strengths**:
- CIL analysis captures all structural relationships in compiled .NET assemblies
- Familiar fluent API for teams knowing ArchUnit
- .NET Standard 2.0 compatibility (both .NET Framework and .NET Core)

**Limitations**:
- Smaller community than ArchUnit
- Less extensive Library API (fewer prepackaged patterns)
- No documented freeze/violation-store mechanism for legacy codebases

---

### 4.8 arch-go (Go)

#### 4.8.1 Theory and Design

arch-go (Francisco Daines) is a YAML-driven architecture checking tool for Go projects. Unlike most tools in this survey, arch-go is declarative-first: all rules are expressed in `arch-go.yml`, not in Go test code. The tool integrates with `go test` but can also run standalone.

#### 4.8.2 Rule Categories

arch-go supports five rule categories:

**Dependency rules**: "Components in the `presentation` package may only depend on components in the `businesslogic` package."

**Content rules**: "Packages matching `**.impl.model` must not contain functions or methods."

**Function rules**: "Functions must not have more than 50 lines, more than 4 parameters, or more than 2 return values."

**Naming rules**: "Structs implementing interfaces matching `*Verification` must have names ending in `Verification`."

**Cycle rules**: Detection of circular package dependencies.

**Compliance threshold**: Rather than binary pass/fail, arch-go supports a compliance level — the fraction of rules met — with a configurable threshold. A project at 75% compliance (3 of 4 rules met) fails if the threshold is 80%.

#### 4.8.3 Strengths and Limitations

**Strengths**:
- YAML-driven configuration requires no Go test code for rule definition
- Compliance threshold enables gradual adoption (not all-or-nothing)
- Function-level rules extend beyond import topology to code complexity metrics
- `go test` integration

**Limitations**:
- Less expressive than ArchUnit's fluent API for complex composed rules
- Smaller community and less documentation
- Compliance thresholds may mask systematic violations

---

### 4.9 Custom Codebase Scanning

#### 4.9.1 Theory and Motivation

The tools above cover the well-defined space of import-topology rules and common architectural patterns. But many important architectural invariants do not fit neatly into import-graph constraints. Examples:

- "Every FastAPI route handler must be registered in the router registry"
- "Every command must have a corresponding handler in the command bus"
- "No file in the acceptance test suite may contain more than one test function"
- "Every database migration file must include a corresponding rollback migration"

These rules require scanning the codebase for structural patterns that are not captured by import relationships. Custom codebase scanning — ad-hoc tests written using Python's `ast` module, `pathlib` for file traversal, or regular expressions — addresses this class of invariant.

The "Citadel" pattern of dynamic route scanning, referenced in the research question, is an instance of this class: a test that traverses the codebase, collects all route definitions (by scanning for decorator patterns or registry registrations), and asserts that the discovered routes match the expected set.

#### 4.9.2 Python `ast` Module Approach

Python's `ast` module provides full access to the abstract syntax tree of any Python source file. An `ast.NodeVisitor` subclass can traverse the tree and extract structural information:

```python
import ast, pathlib

class RouteCollector(ast.NodeVisitor):
    def __init__(self):
        self.routes = []
    def visit_FunctionDef(self, node):
        for deco in node.decorator_list:
            if (isinstance(deco, ast.Call)
                    and isinstance(deco.func, ast.Attribute)
                    and deco.func.attr in ("get", "post", "put", "delete")):
                self.routes.append(node.name)
        self.generic_visit(node)

def collect_all_routes(src_dir):
    routes = []
    for path in pathlib.Path(src_dir).rglob("*.py"):
        tree = ast.parse(path.read_text())
        collector = RouteCollector()
        collector.visit(tree)
        routes.extend(collector.routes)
    return routes

def test_all_routes_are_registered():
    discovered = set(collect_all_routes("src/myapp/api"))
    registered = set(app.routes.keys())  # from the router registry
    assert discovered == registered, f"Unregistered routes: {discovered - registered}"
```

This pattern generalizes to any structural invariant expressible by AST traversal.

#### 4.9.3 Semgrep for Architectural Rules

Semgrep (AST-level pattern matching with YAML rules) occupies a hybrid position: it is commonly used for security linting, but its pattern language is expressive enough to encode architectural constraints. A rule enforcing that all Flask routes have an authentication decorator:

```yaml
rules:
  - id: route-missing-auth
    patterns:
      - pattern: |
          @app.route(...)
          def $FUNC(...):
              ...
      - pattern-not: |
          @require_auth
          @app.route(...)
          def $FUNC(...):
              ...
    message: Route $FUNC is missing the @require_auth decorator
    severity: ERROR
    languages: [python]
```

Semgrep's multi-language support and rule-sharing ecosystem (semgrep-rules repository) make it practical for cross-language enforcement.

#### 4.9.4 Strengths and Limitations

**Strengths**:
- Unbounded expressiveness: any property representable in the AST or file system can be tested
- No additional tool dependency beyond the host language's standard library
- Rules live in the test suite, maintaining version-controlled alignment with the code they guard
- Semgrep provides a structured rule language and CI integration without bespoke code

**Limitations**:
- High maintenance burden: each custom rule is a bespoke implementation requiring understanding of both AST structure and the rule semantics
- Fragile to refactoring: renaming a decorator or moving a file can silently break a rule
- No standardized violation reporting format
- Requires deeper Python knowledge than configuration-file approaches
- Semgrep YAML rules, while structured, lack the composability of a host-language fluent API

---

## 5. Comparative Synthesis

### 5.1 Tool Comparison Table

| Tool | Language | Mechanism | Rule Expression | Transitive Deps | Legacy Support | Naming Rules | Decorator/Inheritance Rules | Visualization | Maturity |
|------|----------|-----------|----------------|-----------------|----------------|--------------|----------------------------|---------------|---------|
| ArchUnit | Java/Kotlin | Bytecode (ASM) | Fluent DSL | Yes | Freeze/store | Yes | Yes (annotations) | Via PlantUML | High (~3.7k stars, 8+ years) |
| import-linter | Python | Import graph (grimp) | INI/TOML config | Yes | No | No | No | No | Medium (~992 stars) |
| pytestarch | Python | Import graph | Fluent API (pytest) | Partial | No | No | No | Optional (matplotlib) | Low (~155 stars) |
| pytest-archon | Python | Import graph | Fluent API (pytest) | Configurable | No | Via predicates | Via predicates | No | Low |
| Deply | Python | AST | YAML config | Limited | No | Yes | Yes | No | Low |
| dependency-cruiser | JS/TS | Module resolution (Acorn) | JSON config | Configurable | No | No | No | Yes (GraphViz, Mermaid) | High (~6.6k stars) |
| NetArchTest | .NET | CIL (Mono.Cecil) | Fluent DSL | Yes | No | Yes | Yes (attributes) | No | Medium |
| arch-go | Go | Source analysis | YAML config | Yes | Compliance % | Yes | Yes | No | Low |
| Custom AST | Any | `ast` / Semgrep | Host language / YAML | Manual | Manual | Yes | Yes | Manual | N/A |

### 5.2 Design Space Trade-offs

**Expressiveness vs. Discoverability**: Tools with fluent host-language APIs (ArchUnit, pytestarch, pytest-archon) offer higher expressiveness through composition but require developers to read code to understand what rules exist. Tools with configuration-file approaches (import-linter, Deply, dependency-cruiser, arch-go) make rules immediately visible in one location but express a more constrained rule language.

**Source vs. Compiled artifact analysis**: Bytecode/CIL analysis (ArchUnit, NetArchTest) captures structural relationships invisible at the source level — annotation-processor generated code, bytecode manipulation libraries. Source-level analysis (all Python tools, dependency-cruiser) is faster, requires no compilation step, and provides earlier feedback but may miss some relationships.

**Import-only vs. full structural analysis**: All Python import-graph tools (import-linter, pytestarch, pytest-archon) are limited to import relationships. Deply and custom AST approaches extend to naming conventions, decorator usage, and class inheritance — a significantly richer structural vocabulary.

**All-or-nothing vs. graduated adoption**: ArchUnit's freeze mechanism and arch-go's compliance threshold both address the practical challenge of introducing architectural tests to established codebases. Most Python tools offer no equivalent, which raises the adoption cost for large existing projects.

**Rule maintenance as code evolves**: Path-based rules (most tools) are fragile to package reorganization. ArchUnit's package wildcard syntax (`..service..`) provides partial mitigation; Deply's semantic collectors (defined by decorator or inheritance rather than path) are more robust. This is an unsolved problem across most tools.

---

## 6. Open Problems and Gaps

### 6.1 Runtime and Behavioral Properties

All tools in this survey analyze structural, static properties of codebases. They cannot enforce behavioral invariants: that a service always calls `SecurityService.assertPermission()` before processing a request (as opposed to merely importing it), that a database query is always parameterized, or that a circuit breaker is always wrapped around external calls. Dmitry Ivanov's observation is precise: "architecture tests verify compliance, not correctness — they confirm methods call `SecurityService.assertPermission()` but don't validate the permission is appropriate."

Addressing runtime invariants requires dynamic fitness functions: monitoring assertions, chaos engineering probes, or contract tests. No tool currently bridges the static/dynamic boundary in a unified architecture testing framework.

### 6.2 Cross-Service Architectural Rules in Microservices

Current tools reason within a single service's codebase. In microservices architectures, important invariants are inter-service: "service A must not call service B's internal API directly," "event schemas must be backward-compatible," "no service may own data belonging to another bounded context's aggregate." These invariants are not expressible in import-graph tools because the boundaries are at the network level, not the module level.

Consumer-driven contract testing (Pact) addresses one dimension; architectural fitness functions monitoring API call graphs address another. But no tool provides a unified framework for cross-service architectural invariants analogous to ArchUnit's per-service analysis.

### 6.3 Vacuous Pass Problem

Rules that filter on package or module names are silently vacuous when the names change. A rule asserting "all classes in `..service..` must be accessed only by `..controller..`" passes trivially — and incorrectly — if the services package is renamed to `..svc..`. This is the most serious reliability issue for path-based architecture tests; it appears in multiple practitioner reports.

Mitigation strategies include: requiring rules to assert that at least N elements matched the selector (a "non-vacuous" postcondition), using AST-level semantic collectors (Deply's approach), or automated rule audits that verify selectors against the current module graph. No tool currently provides this automatically.

### 6.4 AI-Generated Code and Automated Enforcement

The emergence of AI-assisted code generation (GitHub Copilot, Claude, ChatGPT) has increased the rate at which structural violations can be introduced. Practitioners report that AI agents, absent explicit architectural guardrails, tend to generate code that violates layering constraints. pytest-archon's case study in the 162,595-line Django project makes this explicit: architectural tests serve as automated guardrails for generated code.

The interaction between AI code generation and architecture testing is a new frontier: generated code is syntactically correct but architecturally inconsistent at much higher rates than human-written code. Tools that provide fast, local-loop feedback (before CI, at the IDE level) would address this gap.

### 6.5 Rule Discovery and Inference

All current tools require developers to express rules explicitly. An open problem is rule inference: given a codebase's import history (from version control), infer which architectural rules were implicitly maintained and propose them as explicit constraints. This would lower the adoption barrier for projects that have maintained some structural discipline implicitly.

### 6.6 Performance at Scale

Python's import graph tools (import-linter, pytestarch, pytest-archon) perform full codebase traversal on every run. For codebases with hundreds of thousands of lines, this may take tens of seconds. pytestarch's roadmap acknowledges "optimize the implementation with regards to speed" as an open item. Incremental analysis — checking only files changed since the last commit — would significantly reduce CI latency but requires careful graph update logic.

### 6.7 Cross-Language Architecture

Modern systems often combine multiple languages: a Python FastAPI backend, a TypeScript frontend, a Go sidecar, a Java batch processor. Architectural invariants may span language boundaries: "the Python backend must not call the Go sidecar's internal endpoints directly." No current tool enforces cross-language structural rules. This gap will grow as polyglot systems become more common.

### 6.8 LLM-Based Fitness Functions

A nascent area is using large language models as evaluators for architectural properties that are difficult to express deterministically. Examples include: "this module's public API is not leaking implementation details," "this service's responsibility is coherent with its name," "this abstraction is not introducing unnecessary coupling." LLM-based evaluation is non-deterministic, expensive to run on every commit, and difficult to version. Practitioners who have experimented with this approach report running such checks on nightly schedules rather than per-commit.

---

## 7. Conclusion

Architecture tests represent a mature and growing category of software quality tooling that closes the historically problematic gap between documented architectural intent and actual codebase structure. The field has a clear theoretical foundation in fitness functions (Building Evolutionary Architectures), a seminal implementation in ArchUnit (Java), and a set of younger but functional counterparts across Python, JavaScript/TypeScript, Go, and .NET.

The core insight — that architectural invariants can be expressed as executable assertions over a dependency graph constructed from the codebase — is straightforward, but the practical challenges are real: vacuous pass conditions, fragility to package reorganization, the barrier of adopting enforcement in legacy codebases, and the expressiveness gap between import-only rules and the full vocabulary of structural constraints.

ArchUnit remains the most mature and expressive tool in the landscape, with its freeze mechanism, PlantUML integration, and three-layer API (Core, Lang, Library) representing solutions to practical problems that most Python tools have not yet addressed. In the Python ecosystem, import-linter offers the most mature configuration-centric approach; pytest-archon offers the most granular control over import-scope analysis; Deply extends beyond imports to AST-level structural properties. In JavaScript/TypeScript, dependency-cruiser's combination of enforcement and visualization has earned substantial adoption.

Custom AST-based tests and Semgrep rules extend the vocabulary of expressible invariants to properties no import-graph tool can capture: that all routes are registered, that all commands have handlers, that all files in a module follow a naming discipline. These bespoke approaches carry high maintenance costs but address a different point in the expressiveness space.

The open problems — runtime behavioral invariants, cross-service enforcement, vacuous pass detection, AI-generated code guardrails, and cross-language architectural rules — define the frontier of this field. The tools that address these problems will determine whether architecture testing achieves the same ubiquity as unit testing, or remains a specialized practice adopted by architecturally disciplined teams.

---

## References

1. Ford, N., Parsons, R., Kua, P., & Sadalage, P. (2022). _Building Evolutionary Architectures: Automated Software Governance_ (2nd ed.). O'Reilly Media. https://books.google.com/books/about/Building_Evolutionary_Architectures.html?id=CGudEAAAQBAJ

2. TNG Technology Consulting. (2017–2024). ArchUnit User Guide. https://www.archunit.org/userguide/html/000_Index.html

3. TNG Technology Consulting. (2017–2024). ArchUnit GitHub Repository. https://github.com/TNG/ArchUnit

4. Seddon, D. (2019–2024). import-linter documentation. https://import-linter.readthedocs.io/

5. python-grimp. (2024). grimp GitHub Repository. https://github.com/python-grimp/grimp

6. zyskarch. (2022–2024). pytestarch GitHub Repository. https://github.com/zyskarch/pytestarch

7. Bargsten, J. (2022–2024). pytest-archon GitHub Repository. https://github.com/jwbargsten/pytest-archon

8. Vashkatsi, A. (2024). Deply GitHub Repository. https://github.com/vashkatsi/deply

9. Verweij, S. (2018–2024). dependency-cruiser GitHub Repository. https://github.com/sverweij/dependency-cruiser

10. Morris, B. (2019–2024). NetArchTest GitHub Repository. https://github.com/BenMorris/NetArchTest

11. Daines, F. (2021–2024). arch-go GitHub Repository. https://github.com/arch-go/arch-go

12. Thoughtworks. (2019). Fitness function-driven development. https://www.thoughtworks.com/insights/articles/fitness-function-driven-development

13. Ivanov, D. (2024). Architecture testing. _Medium_. https://medium.com/@dmitry-ivanov/architecture-testing-d918a3df2ba5

14. Faherty, E. (2024). Keeping Your Django Codebase in Line: Testing Architectural Integrity with pytest-archon. _Medium_. https://medium.com/@eamonn.faherty_58176/keeping-your-django-codebase-in-line-testing-architectural-integrity-with-pytest-archon-7ddc208d28ad

15. Niessen, L. (2026). Fitness Functions: Automating Your Architecture Decisions. _Medium_. https://lukasniessen.medium.com/fitness-functions-automating-your-architecture-decisions-08b2fe4e5f34

16. InfoQ Editorial. (2022). ArchUnit Verifies Architecture Rules for Java Applications. https://www.infoq.com/news/2022/10/archunit/

17. Handson Architects. (2026). Protecting Architecture with Automated Tests in Python. https://handsonarchitects.com/blog/2026/protecting-architecture-with-automated-tests-in-python/

18. Alkan, A. (2024). Ensuring Clean Architecture with ArchUnit. _Medium_. https://medium.com/java-and-beyond/ensuring-clean-architecture-with-archunit-91d43959e648

19. Girardelli, B. (2024). How I Built an Architecture Analyzer with Tree-Sitter AST. _DEV Community_. https://dev.to/girardellibaptista/how-i-built-an-architecture-analyzer-with-tree-sitter-ast-and-what-i-learned-about-code-quality-4m0c

20. Deepwiki. (2024). ArchUnit: Freezing Architecture Rules. https://deepwiki.com/TNG/ArchUnit/2.3.2-freezing-architecture-rules

21. Deepwiki. (2024). import-linter architecture documentation. https://deepwiki.com/seddonym/import-linter

22. Semgrep. (2024). Writing Semgrep rules. https://semgrep.dev/blog/2020/writing-semgrep-rules-a-methodology/

---

## Practitioner Resources

### Getting Started by Language

**Java/Kotlin**: ArchUnit is the default choice. Start with the Library API (`layeredArchitecture()`, `onionArchitecture()`) before writing custom rules. Use `@AnalyzeClasses` for JUnit 5 caching. For legacy codebases, use `.freeze()` from day one.
- User guide: https://www.archunit.org/userguide/html/000_Index.html
- Examples repository: https://github.com/TNG/ArchUnit-Examples
- Baeldung tutorial: https://www.baeldung.com/java-archunit-intro

**Python (configuration-centric)**: import-linter with `pyproject.toml` provides the most maintainable approach for teams that prefer declarative rules.
- Documentation: https://import-linter.readthedocs.io/
- PyPI: https://pypi.org/project/import-linter/

**Python (ArchUnit-style API)**: pytestarch for teams familiar with ArchUnit; pytest-archon for more granular import-scope control.
- pytestarch: https://github.com/zyskarch/pytestarch
- pytest-archon: https://github.com/jwbargsten/pytest-archon

**Python (beyond imports)**: Deply for YAML-configured rules covering decorator usage, inheritance, and naming conventions.
- https://github.com/vashkatsi/deply

**JavaScript/TypeScript**: dependency-cruiser is the mature standard, combining enforcement and visualization.
- https://github.com/sverweij/dependency-cruiser
- Rules reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md

**Go**: arch-go for YAML-driven enforcement with compliance threshold support.
- https://github.com/arch-go/arch-go

**.NET**: NetArchTest for CIL-level analysis with a fluent API.
- https://github.com/BenMorris/NetArchTest

### CI Integration Checklist

1. Run architecture tests in the same pipeline stage as unit tests (not a separate late stage)
2. Fail the build on any violation — `warn` severity should be reserved for temporary states during migration
3. For import-linter, commit the `.importlinter` configuration to version control alongside the code it governs
4. For ArchUnit, commit the violation store files from the freeze mechanism to version control — their changes document debt reduction
5. Session-scope pytest fixtures (pytestarch, pytest-archon) to avoid repeated codebase traversal
6. Add a pre-commit hook for fast local feedback, so violations surface before CI
7. Document each rule with a comment explaining the architectural decision it enforces — rules without rationale become cargo cult configurations

### Key Concepts for Rule Design

- **Non-vacuous rules**: Verify that rules actually select elements. A rule matching zero modules passes trivially. Consider adding an assertion that the selector matches at least one class/module.
- **Semantic vs. path-based selectors**: Where possible, define layers by semantic properties (class inheritance, decorator usage) rather than package paths. Semantic rules are more robust to refactoring.
- **Transitive vs. direct dependencies**: Most violations surface through transitive chains. Ensure the tool being used checks transitively (all Python tools above do by default, with pytest-archon offering explicit control).
- **Freeze before enforce**: In established codebases, record the existing violation baseline before failing the build. Enforce the freeze invariant (no new violations) while addressing the stored violations progressively.
- **Rules as documentation**: Write rules to be readable by a developer who has not read the ADRs. The rule text — "domain must not depend on infrastructure" — is the living documentation of the architectural decision.
