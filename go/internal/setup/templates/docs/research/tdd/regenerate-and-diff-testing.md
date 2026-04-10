---
title: "Regenerate-and-Diff: Enforcing Source-of-Truth Synchronization Through Generative Testing"
date: 2026-04-10
summary: >
  Survey of the regenerate-and-diff testing pattern that enforces synchronization between generated artifacts and their authoritative sources, covering its instantiations across code generation, infrastructure tooling, and API development.
keywords: [test-driven-development, regenerate-and-diff, snapshot-testing, code-generation, synchronization]
---

# Regenerate-and-Diff: Enforcing Source-of-Truth Synchronization Through Generative Testing

*2026-04-10*

---

## Abstract

Software projects increasingly maintain generated artifacts -- code produced from schemas, manifests rendered from templates, API clients derived from specifications -- that must remain synchronized with their authoritative source. A recurring testing pattern enforces this constraint by regenerating the artifact from its source within a test or CI step, comparing the result against the committed version, and failing if they diverge. This paper surveys the landscape of such patterns across software engineering domains, examines their relationship to adjacent testing methodologies (snapshot testing, golden file testing, approval testing), and maps their instantiations in code-generation ecosystems, infrastructure tooling, package management, and API development. The core finding is that the pattern is widespread in practice but lacks a unified name or formal treatment in the testing literature. It appears under at least a dozen domain-specific names and idioms, and its distinguishing characteristic -- enforcing that a derivation relationship holds between a committed artifact and a designated source of truth -- differentiates it clearly from superficially similar patterns whose intent is regression detection rather than synchronization enforcement. This paper proposes calling the pattern the Regenerate-and-Diff test, describes its variants, and identifies open problems including the naming gap and the absence of language-agnostic tooling.

---

## 1. Introduction

### 1.1 Motivation

Consider the following test, simplified from a real codebase:

```python
def test_schema_alignment():
    actual = generate_schema_from_source()
    committed = load_committed_schema()
    assert actual == committed, (
        "Schema artifact is out of sync with source of truth. "
        "Run `make generate` and commit the result."
    )
```

The test is not checking whether the schema is *correct*. It is checking whether the committed artifact *reflects* its source. The failure message does not say "unexpected behavior detected" -- it says "run the generator and commit the output." This is a different intent from regression detection, and it implies a different mental model: there is a source of truth (the schema source), there is a derived artifact (the committed schema file), and the test exists to enforce that the derivation relationship has been honored.

This pattern appears across dozens of ecosystems. Protobuf users run `go generate ./... && git diff --exit-code`. GraphQL teams run code generation in CI followed by `git status --porcelain`. Kotlin library authors run `./gradlew apiCheck`, which internally regenerates a `.api` dump and diffs it against the committed file. Django projects run `python manage.py makemigrations --check` to detect model changes not yet reflected in migration files. The Rust SQLx library ships `cargo sqlx prepare --check` for exactly this purpose. Terraform's `plan` command is a large-scale version of the same idea.

Yet despite its prevalence, this pattern has no recognized name. Testing textbooks discuss snapshot testing, property-based testing, and mutation testing. They do not discuss *synchronization enforcement testing*.

### 1.2 Research Questions

This paper addresses five questions:

1. Is "regenerate artifact, diff against committed version, fail if different" a recognized, named testing pattern in the software engineering literature?
2. What related patterns exist, under what names, and how do they differ in intent?
3. In which application domains has this pattern been applied, and under what idioms?
4. What implementation strategies exist (git-diff, hash-comparison, in-memory comparison, AST comparison)?
5. What theoretical foundations underpin the pattern, and what open problems remain?

### 1.3 Methodology

Research was conducted through targeted web searches across practitioner literature (blog posts, framework documentation, GitHub issues and discussions), academic databases (ScienceDirect, ResearchGate, arXiv, ACM Digital Library), and direct inspection of tool documentation. The search covered snapshot testing, golden file testing, approval testing, infrastructure drift detection, code generation synchronization patterns, reproducible builds, and database schema migration verification. The naming gap hypothesis -- that the pattern exists in practice without a standard name -- guided inclusion of indirect evidence across heterogeneous domains.

### 1.4 Is This a Named Pattern?

The direct answer is: **no**. After extensive search across academic and practitioner literature, no unified name for "regenerate artifact from source of truth, diff against committed version, fail if different" was found. The closest candidate terms found in active use are:

- `check-generate` / `gen-check` (Makefile targets in Go and Terraform projects)
- "sync check" (informal, found in GraphQL codegen discussions)
- "freshness test" (used in data pipeline contexts, semantically adjacent)
- "offline check" (SQLx's `--check` flag documentation)

None of these terms has crossed into general testing vocabulary. The pattern is present in practice at high frequency but absent from named-pattern catalogs. This paper treats that gap as a primary finding rather than a limitation.

---

## 2. Foundations

### 2.1 Single Source of Truth

The foundational principle underlying the Regenerate-and-Diff test is the Single Source of Truth (SSOT) principle. In information science, SSOT architecture "structures information models and associated data schemas such that every data element is mastered in only one place" (Wikipedia, Single Source of Truth). The DRY principle (Don't Repeat Yourself) is its closest relative in software engineering practice: every piece of knowledge should have a single authoritative representation.

Recent formal work provides a mathematical grounding. A 2025 paper, *Formal Foundations for the Single Source of Truth Principle* (Zenodo record 18177320), machine-verifies in Lean 4 that DOF = 1 (degrees of freedom = 1) is the unique condition guaranteeing coherence -- the impossibility of disagreement among encodings of the same information. The key theorem states that achieving DOF = 1 requires "definition-time hooks AND introspectable derivation," and that the complexity gap between coherent and incoherent representations is unbounded: O(1) versus Ω(n). This formalizes the intuition that maintaining multiple copies of the same information grows arbitrarily expensive relative to maintaining a single authoritative source with derivations.

When a project commits a *derived artifact* alongside its source, it creates DOF = 2 by definition. The Regenerate-and-Diff test is the mechanism by which the project enforces DOF = 1 at the level of observable behavior: the committed artifact must at all times equal what would be produced by applying the generator to the source.

### 2.2 Idempotency and Determinism

The Regenerate-and-Diff test has a necessary precondition: the generation step must be deterministic. If applying the generator to the same source produces different outputs across invocations, the test cannot function as a synchronization check -- it becomes a flaky test that fails or passes arbitrarily.

Determinism in build systems is the subject of an entire research program: the Reproducible Builds movement, which defines a build as reproducible when "given the same source code, build environment, and build instructions, any party can recreate bit-for-bit identical copies of all specified artifacts" (reproducible-builds.org). The movement focuses on compiled binaries rather than generated code, but the underlying principle is identical: generation must be a pure function of its inputs.

Sources of non-determinism that break Regenerate-and-Diff tests include:
- Timestamps embedded in generated output
- Hash map iteration order affecting field ordering
- Tool version drift between developer and CI environments
- Locale or environment variable dependencies in generators
- Random identifiers in generated code

The Reproducible Builds ecosystem has catalogued these failure modes extensively and produced tooling (such as `diffoscope`, a deep diff tool) for diagnosing reproducibility failures.

Idempotency is a weaker but related property: applying the generator twice should produce the same result as applying it once. For the Regenerate-and-Diff test, idempotency is necessary but not sufficient -- determinism across environments is also required.

### 2.3 The Derivation Relationship

The pattern assumes a clear directional relationship: source S generates artifact A, written S → A. The test verifies that the committed version of A equals G(S), where G is the generator function. The constraint is:

```
committed(A) = G(current(S))
```

This is distinct from the question of whether A is *correct* (whether G is a correct generator), whether S is *valid* (whether S satisfies some schema or constraint), or whether A itself has any desirable properties. The Regenerate-and-Diff test is exclusively about *synchronization* -- whether the derivation relationship holds for the current state of S.

This directionality distinguishes the pattern from snapshot testing, where there is no designated source of truth: the snapshot *is* the record of what the system produced, with no prior authoritative source. In a Regenerate-and-Diff test, the source of truth exists independently of the test -- the test simply verifies that the committed artifact reflects it.

---

## 3. Taxonomy of Approaches

The following table situates the Regenerate-and-Diff test within the broader landscape of output-comparison testing approaches.

| Pattern | Primary Intent | Source of Truth | Update Mechanism | Failure Meaning | Examples |
|---------|---------------|-----------------|------------------|-----------------|----------|
| **Snapshot testing** | Regression detection | The snapshot file itself (set at first run) | `--update-snapshot` flag | "Output changed unexpectedly" | Jest `.snap`, pytest-snapshot, syrupy |
| **Golden file / approval testing** | Characterization + regression | Human-approved reference file | Manual approval or `--update` flag | "Output changed from approved baseline" | ApprovalTests, turnt, Helm unittest golden files |
| **Regenerate-and-Diff** | Synchronization enforcement | Designated external source (schema, spec, model) | Re-run generator + commit | "Committed artifact does not reflect current source" | `go generate && git diff --exit-code`, `apiCheck`, `cargo sqlx prepare --check` |
| **Hash verification** | Artifact integrity | Committed checksum/hash file | Recompute and update hash | "Artifact content has changed" | `go.sum`, `yarn.lock --frozen`, lockfile checks |
| **Schema drift detection** | Migration consistency | Migration history table vs. live DB | Run migration generator | "Database state diverges from migration scripts" | `flyway check -drift`, `django makemigrations --check`, `liquibase diff` |
| **Infrastructure drift detection** | State convergence | Declared configuration (IaC) | Plan against live state | "Infrastructure diverges from declared state" | `terraform plan`, Pulumi `refresh --preview-only`, `kubectl diff` |
| **Reproducible build verification** | Supply-chain integrity | Source code + build environment | Independent rebuild | "Binary does not match what source produces" | Debian reproducible builds, Bazel hermetic builds, `diffoscope` |
| **Property-based testing** | Behavioral invariant | Mathematical property specification | N/A (generative) | "Property violated for some generated input" | QuickCheck, Hypothesis, fast-check |
| **Frozen lockfile check** | Dependency version integrity | Declared dependencies (package manifest) | Re-solve + commit | "Lockfile doesn't match declared dependency graph" | `npm ci`, `yarn --frozen-lockfile`, `cargo --locked` |
| **API surface check** | Public API contract | Current compiled source code | `apiDump` + commit | "Committed API signature doesn't match compiled code" | Kotlin binary-compatibility-validator `apiCheck`, Android Metalava `m checkapi` |
| **Formatter check** | Code style consistency | Style rules (deterministic formatter) | `--write` mode | "Committed file is not formatted per style rules" | `prettier --check`, `black --check`, `ruff --check` |

**Key distinction.** The critical differentiator between Regenerate-and-Diff and snapshot testing is the *direction of authority*. In snapshot testing, the stored file *becomes* the truth when first written -- future runs verify that behavior has not changed. In Regenerate-and-Diff, the source of truth pre-exists the stored artifact -- the stored artifact is a *derivative* that must track the source. This means:
- A snapshot can be intentionally updated by any developer to record new expected behavior.
- A Regenerate-and-Diff artifact should only change when the *source* changes, and the generator must be rerun to produce the update.

---

## 4. Analysis

### 4.1 Snapshot Testing

**Mechanism.** Snapshot testing serializes the output of a function or component into a file and on subsequent runs compares current output against the stored file. Jest pioneered the approach in the JavaScript ecosystem with its `.snap` files stored in `__snapshots__/` directories. The Python ecosystem offers syrupy (the dominant pytest snapshot plugin) and pytest-snapshot, with syrupy's AmberSnapshotExtension producing human-readable `.ambr` files.

The mechanism is: generate output → serialize → compare to stored file → fail if different. The update path is a flag (`--snapshot-update` in syrupy, `--update-snapshot` in Jest) that overwrites the stored file with the current output.

**Intent.** The empirical study by Gazzinelli Cruz et al. (JSS, 2023) found that snapshot tests are "easy to implement and effective in preventing regressions." The primary stated benefit is catching unexpected UI or output changes. The primary drawback is fragility: snapshots break whenever any output detail changes, including formatting changes, added fields, and cosmetic updates. The study found snapshot tests are most prevalent in frontend components and mobile apps.

**Philosophical framing.** The Jest documentation makes the intent-mechanism distinction explicit: snapshot testing "helps to figure out whether the output of the modules covered by tests is changed, rather than giving guidance to design the code in the first place." The snapshot *is* the truth because nothing else is. Contrast with Regenerate-and-Diff: the committed artifact is *derivative of* an independently existing truth.

**Relationship to Regenerate-and-Diff.** Snapshot testing and Regenerate-and-Diff share the mechanism of storing output to disk and comparing on future runs. They differ in *authority*: snapshots have no external source of truth; the committed file is simultaneously the artifact and the truth. Adrian Sampson's "turnt" tool makes the distinction clearest: it is explicitly designed for programs that "turn text into other text" (compilers, code generators), where the stored output is a record of intentional output, not an enforcement of a derivation constraint.

TypeGraphQL's documentation hints at the boundary: it notes that some developers "use [schema emission] as a kind of snapshot for detecting schema regression" -- which is snapshot testing applied to a generated artifact, not a Regenerate-and-Diff test.

### 4.2 Golden File Testing and Approval Testing

**Mechanism.** Golden file testing (also called golden master testing) stores expected output as a reference file ("golden file") against which actual output is compared. ApprovalTests (a library by Llewellyn Falco, available for C++, Python, Java, C#, Node.js) formalizes this with `.approved.txt` and `.received.txt` files: the test captures actual output into `.received.txt` and compares it against `.approved.txt`. The approval step -- a human reviewing and renaming the received file to the approved file -- is deliberate.

The term "characterization test" (Michael Feathers, *Working Effectively with Legacy Code*, 2004) describes a closely related concept: capturing existing behavior of legacy systems to prevent unintended changes during refactoring. As Victor Rentea and others have noted, characterization tests, approval tests, and regression tests are "essentially the same technique with different names."

**Helm chart golden file testing** is a concrete practitioner application: `helm template` is run with specific `values.yaml` inputs and the rendered YAML manifests are stored as `.golden.yaml` files. In CI, `helm template` is run again and the output is compared byte-by-byte. Christopher Kujawa's documentation describes this explicitly: "The golden files are tracked in git, which allows us to see changes easily via a git diff." The update path is a `-update-golden` flag.

**Relationship to Regenerate-and-Diff.** Golden file testing occupies an intermediate position. When applied to compiler output or UI component rendering, it is true snapshot testing -- the stored output *is* the truth. When applied to generated artifacts (as in Helm chart testing), it more closely resembles Regenerate-and-Diff: the template plus values *is* the source of truth, and the golden file *derives from* it. The difference is subtle but real: a Helm golden file test fails when the template renders differently than it did when the golden file was created; a Regenerate-and-Diff test on an OpenAPI client fails when the client code doesn't reflect the current OpenAPI spec.

### 4.3 Code Generation Synchronization

This is the domain where the Regenerate-and-Diff pattern is most directly instantiated and where practitioners have most clearly articulated the problem it solves.

**Go and `go generate`.** The Go toolchain includes a `//go:generate` comment directive that embeds generator invocations in source files. The Go community broadly agrees that generated output should be committed to version control -- because Go distributes source packages, not binaries, consumers would otherwise need generator tools. But this creates the synchronization problem: if a developer modifies a source file without running `go generate`, the committed generated output is stale.

The standard CI solution is two shell commands:
```bash
go generate ./...
git diff --exit-code
```

A 2020 GitHub issue on golangci-lint proposed automating this as a linter rule. The maintainer closed it as "4 lines of shell code in CI" -- acknowledging that the pattern is valid but too simple to warrant a dedicated tool. The absence of a tool reflects the absence of a name: unnamed patterns are harder to abstract.

**Protobuf and gRPC.** The protobuf ecosystem has a similar convention. Generated `.pb.go` or `*_grpc.pb.go` files are committed alongside `.proto` source files. CI pipelines run `protoc` and diff the output. The `bufbuild/protoc-gen-validate` project's Makefile includes a `check-generated` target that regenerates from `.proto` sources and verifies that committed files match. The Buf ecosystem (buf.build) provides structured CI integration for protobuf workflows, including `buf generate` followed by `git diff`.

**OpenAPI and NSwag.** Johnny Reilly's documented pattern for NSwag-generated TypeScript clients is explicit: the CI integration test copies the committed client to a temporary location, regenerates from the OpenAPI spec, then uses Vitest's `expect(committedClient).toBe(newlyGeneratedClient)` to fail if they differ. The error message instructs developers to run `pnpm run generate-client`. This is a textbook Regenerate-and-Diff test, written as a standard unit test.

**GraphQL codegen.** The GraphQL Code Generator project received a feature request for a `--check` flag in 2020 (issue #2872). The requested behavior: "generate all the code in memory, compare to what's in my working directory and exit with an error if they are different" -- explicitly modeled on `prettier --check`. A contributor shared an existing workaround: `npm run codegen && git status --porcelain && git diff-index --quiet HEAD`. The `--check` flag was implemented in PR #8149 and released in 2022. The requestor referenced Prettier's check mode as the model: the "check" verb has become an informal but recognizable idiom for this pattern in the Node.js ecosystem.

**TypeScript and TypeGraphQL.** TypeGraphQL's `emitSchemaFile` option generates a `schema.graphql` SDL file that can be committed and used as a regression signal, with the documentation noting it can be "used as a kind of snapshot for detecting schema regression." The pattern sits exactly on the boundary between snapshot testing and Regenerate-and-Diff, depending on whether the SDL is treated as a regression baseline or as a canonical representation of the schema.

### 4.4 Schema and Migration Drift Detection

**Django migrations.** Django's ORM generates migration files from model changes via `manage.py makemigrations`. If a developer modifies a model without generating a corresponding migration, the committed migration history is out of sync with the current model state. The verification command is `python manage.py makemigrations --check`, which internally regenerates migrations in memory and exits with code 1 if any are pending (i.e., if committed migrations don't reflect the current model state). This is a clean Regenerate-and-Diff test: source is the Python model definitions, artifact is the migration files, the check regenerates and compares.

**Alembic.** The `pytest-alembic` library provides similar coverage for SQLAlchemy projects, with tests that verify the current database revision matches the head revision -- a migration-specific form of synchronization enforcement.

**Flyway and Liquibase.** Migration tools perform a more sophisticated version of the same check. Flyway computes checksums of migration scripts and stores them in a `flyway_schema_history` table. Running `flyway validate` detects any changes to previously-applied scripts. Liquibase's `diff` command compares a live database against a changelog file. Both implement a derivation constraint: the live schema must match what the migration history would produce. The schema drift detection literature (the term "schema drift" is well established) covers this domain extensively.

### 4.5 API Surface Enforcement

**Kotlin binary-compatibility-validator.** JetBrains' `binary-compatibility-validator` plugin is one of the cleanest implementations of the Regenerate-and-Diff pattern. The `apiDump` task generates `.api` files describing the public API surface; these files are committed. The `apiCheck` task "creates up-to-date `.api` dumps in temporary build folders, and compares them to the `.api` files in the repository." If they differ, the build fails with a detailed diff output. The workflow explicitly distinguishes intentional API changes (run `apiDump`, review the diff, commit) from accidental ones (CI fails). The committed `.api` file is the artifact; the compiled source code is the source of truth.

**Android Metalava.** Google's Metalava tool extracts API metadata from Java/Kotlin source into signature text files (`api.txt`). The `make checkapi` / `./gradlew :path:to:project:checkApi` target verifies that the current code matches the committed signature file. Developers who intentionally change the public API must run `./gradlew :path:to:project:updateApi` to regenerate the committed file. This is Regenerate-and-Diff at scale: the Android platform uses this to enforce that all public API changes are deliberate and reviewed.

### 4.6 Infrastructure Drift Detection

**Terraform.** Terraform plan is the canonical large-scale Regenerate-and-Diff operation in infrastructure: the tool queries actual cloud state, compares it against the declared configuration (HCL files), and reports differences. The analogy is approximate: Terraform does not compare a committed artifact against a generated one, but rather compares a declared desired state against an observed actual state. The structural parallel is clear: two representations of the same system that should be identical are compared, and divergence is reported as a failure. The term "drift" is well established in this context -- infrastructure drift detection is a named subdomain of DevOps.

**Pulumi.** Pulumi's drift detection uses `pulumi refresh --preview-only` to compare declared and actual state. The Pulumi blog explicitly uses the term "drift detection" and frames it as detecting when "actual state of your cloud environment deviates from the expected configuration." Scheduled drift detection runs are a documented Pulumi feature.

**Kubernetes.** The Kubernetes controller pattern formalizes the desired-versus-actual structure into a reconciliation loop: controllers continuously observe actual system state and work to make it match a declared desired state. This is not a test but a runtime enforcement mechanism -- effectively a self-healing version of the Regenerate-and-Diff pattern.

**Helm and `helm-diff`.** The `helm-diff` plugin shows what a `helm upgrade` would change before it is applied -- another Regenerate-and-Diff operation: the desired Helm chart configuration is rendered and compared against the currently deployed manifest.

### 4.7 Reproducible Builds

The Reproducible Builds movement (reproducible-builds.org), with significant involvement from Debian, Fedora, and Arch Linux, defines a build as reproducible when independent parties can recreate byte-for-byte identical artifacts from the same source. The verification mechanism is: rebuild the artifact independently → compare checksums → fail if different.

This is Regenerate-and-Diff applied to compiled binaries, with security as the primary motivation: divergence between a distributed binary and what the source would produce indicates potential supply-chain compromise. The Debian `rebuilderd` tool automates this: it rebuilds packages and compares them against the distributed versions. The `.buildinfo` file records the build environment needed for reproduction.

Bazel's hermetic build model is the compiler-side analog: Bazel assumes that identical inputs always produce identical outputs (determinism), caches based on SHA256 hashes, and uses this guarantee to enable remote caching and distributed execution.

### 4.8 Package Dependency Lockfiles

An underappreciated instance of the Regenerate-and-Diff pattern appears in package management. Lock files (`yarn.lock`, `package-lock.json`, `Cargo.lock`, `go.sum`, `pixi.lock`) are generated artifacts derived from declared dependencies (package manifests). CI tooling enforces synchronization by failing if the lockfile is inconsistent with the manifest:

- `npm ci` (clean install) fails if `package-lock.json` is out of sync with `package.json`
- `yarn install --frozen-lockfile` fails if `yarn.lock` needs updating
- `cargo build --locked` fails if `Cargo.lock` doesn't match `Cargo.toml`

These are all Regenerate-and-Diff tests in disguise: the manifest is the source of truth, the lockfile is the derived artifact, and the CI check enforces that the derivation relationship holds.

### 4.9 Rust SQLx Offline Mode

SQLx's offline mode is a particularly instructive example because it names the pattern explicitly in its tooling. `cargo sqlx prepare` queries a live database to generate a `.sqlx/` directory of query metadata. This directory is committed. In CI, `cargo sqlx prepare --check` regenerates the metadata and fails with a nonzero exit code if "the data in `.sqlx` is out of date with the current database schema or queries." The SQLx documentation frames this as an "intended for use in Continuous Integration" pattern. The source of truth is the database schema plus the SQL queries in source code; the artifact is the `.sqlx/` metadata directory; the test verifies their synchronization.

### 4.10 Formatter Check Mode

Tools like Prettier (`--check`), Black (`--check`), and Ruff (`--check`) implement a formatter-specific variant of the pattern. These tools are deterministic formatters: given a source file and a formatting configuration, they produce exactly one correctly-formatted version. The `--check` mode regenerates the formatted version in memory and compares it to the file on disk, failing if they differ. The formatter is the generator; the formatting rules are the source of truth; the committed file is the artifact.

This variant is notable because the "source of truth" is implicit (the formatting rules, not a separate artifact). It has spawned a recognizable idiom: the `--check` flag as a signal for "verify synchronization without writing changes." The GraphQL codegen team explicitly modeled their feature request on `prettier --check`.

---

## 5. Comparative Synthesis

### 5.1 Trade-off Table

| Dimension | Snapshot Testing | Golden File / Approval | Regenerate-and-Diff | Drift Detection (Infra) | Reproducible Builds |
|-----------|-----------------|----------------------|--------------------|-----------------------|---------------------|
| **Source of truth** | The stored file itself | Human-approved stored file | External source (schema, spec, model) | Declared IaC config | Published source code |
| **Directionality** | Circular (file is truth) | Human curates truth | Source → Artifact | Config → Live state | Source → Binary |
| **Update path** | `--update-snapshot` flag | Human reviews and approves | Rerun generator + commit | Re-apply config | No action needed (binary is wrong) |
| **Failure interpretation** | "Something changed" | "Approved behavior changed" | "Derivation not honored" | "Drift from declared state" | "Binary tampered or non-deterministic build" |
| **Determinism requirement** | High (but usually met for UI snapshots) | High | Strict | N/A (compares live state) | Strict |
| **Tooling maturity** | High (Jest, syrupy, ApprovalTests) | Medium (ApprovalTests, turnt) | Low (domain-specific only) | High (Terraform, Pulumi) | High (diffoscope, rebuilderd) |
| **Naming in literature** | Well-named and studied | Well-named (golden master, approval tests) | Unnamed | Well-named (drift detection) | Well-named (reproducible builds) |
| **CI integration** | Standard | Standard | Idiomatic (shell scripts) | Standard | Emerging |
| **Granularity** | Function/component output | Arbitrary output | Entire artifact or section | Entire resource graph | Entire build output |
| **Human review in loop** | No | Yes (explicit approval) | Optional (diff review) | Optional | Implicit (build maintainers) |

### 5.2 Intent Taxonomy

The patterns above separate cleanly into three intent categories:

**Regression detection**: Snapshot testing, approval testing, characterization testing. The stored artifact captures what the system *did* at a point in time. The test prevents unintended change. Authority resides in the stored file.

**Synchronization enforcement**: Regenerate-and-Diff, lockfile checks, formatter checks, API surface checks, migration checks. The stored artifact must reflect an external source of truth. Authority resides in the source. The test prevents the artifact from lagging behind the source.

**State convergence**: Infrastructure drift detection, Kubernetes reconciliation. The live system state must match a declared desired state. This is a runtime concern rather than a testing concern, though testing tools like `terraform plan` are used in its service.

### 5.3 Implementation Strategy Comparison

| Strategy | How It Works | Strengths | Limitations | Examples |
|----------|-------------|-----------|-------------|----------|
| **Git diff** | Run generator, compare git working tree to index | Simple, catches any change, works with any file type | Sensitive to whitespace, formatting, comments | `git diff --exit-code` after `go generate` |
| **In-memory comparison** | Generate in memory, compare to disk without writing | Clean, no working tree side effects | Requires generator to support in-memory mode | NSwag test, `prettier --check`, `graphql-codegen --check` |
| **Dedicated check flag** | Tool-provided `--check` or `prepare --check` | First-class support, good error messages | Only works for tools that implement it | `cargo sqlx prepare --check`, `apiCheck`, `makemigrations --check` |
| **Hash/checksum comparison** | Store hash of artifact, verify on each run | Fast, no diff output needed | Doesn't show what changed | `go.sum`, `yarn.lock` integrity, Flyway checksums |
| **Structural/AST comparison** | Parse artifact and compare semantics, ignoring formatting | Robust to formatting changes | Requires parser for artifact format | `liquibase diff` (schema-aware) |

---

## 6. Open Problems and Gaps

### 6.1 The Naming Gap

The most significant gap is the absence of a recognized name. In the testing literature, names matter: they enable pattern reuse, tool abstraction, documentation, and communication. A team member who knows what "snapshot testing" means can immediately understand a `syrupy` test. A team member encountering a `go generate && git diff --exit-code` shell script in CI has no name to attach to it, no literature to reference, and no generalized tooling to reach for.

The consequences of this naming gap are visible in the evidence:
- The golangci-lint issue (2020) was closed with "4 lines of shell code" -- a reasonable response to an unnamed pattern
- The GraphQL codegen feature request modeled the `--check` flag on `prettier --check` but didn't name the underlying pattern
- Individual ecosystems implement the same concept independently (NSwag tests, `apiCheck`, `makemigrations --check`, `cargo sqlx prepare --check`) with no cross-ecosystem knowledge transfer

Candidate names from this analysis: **Regenerate-and-Diff test**, **Synchronization enforcement test**, **Derivation integrity test**, **Freshness test** (the last is already used in dbt contexts for data freshness). "Regenerate-and-Diff" has the advantage of being descriptive and action-oriented.

### 6.2 The Tooling Gap

No general-purpose, language-agnostic library or framework exists for writing Regenerate-and-Diff tests. Each ecosystem implements the pattern independently:
- Shell scripts with `git diff --exit-code` (Go, general)
- Python assertions with file comparison (NSwag pattern, adapted)
- Gradle tasks (Kotlin binary-compatibility-validator)
- CLI flags in individual tools (Prettier, SQLx, Django, GraphQL codegen)

A general-purpose framework would provide:
1. An assertion primitive: `assert_files_match_generated(path, generator_fn)`
2. An update mechanism: `--update-generated` flag that reruns generators and commits
3. Determinism validation: warn if generator produces different output on repeated invocations
4. Clear, actionable error messages pointing developers to the correct update command

The closest existing tools are framework-specific. pytest-snapshot and syrupy solve a different problem (regression detection). ApprovalTests is more general but optimized for approval workflows, not source-of-truth enforcement.

### 6.3 The Determinism Problem

The Regenerate-and-Diff pattern fails if generators are not deterministic. In practice, many generators embed timestamps, use unordered data structures (hash maps), or depend on tool version. This produces CI failures that are not about synchronization violations but about non-determinism in the generator itself.

The Reproducible Builds ecosystem has extensive tooling for diagnosing non-determinism (`diffoscope`, `strip-nondeterminism`) but this tooling is oriented toward compiled binaries and is not integrated into general-purpose Regenerate-and-Diff testing frameworks.

### 6.4 The Partial Update Problem

When a large artifact (an OpenAPI client, a Protobuf-generated file) partially diverges -- perhaps because only some endpoints changed -- the diff output can be large and hard to interpret. The test correctly fails, but the developer must understand which part of the artifact diverged and why.

Infrastructure drift detection tools handle this better than code generation tools: `terraform plan` shows exactly which resources would change and why, with structured output. Most code generation Regenerate-and-Diff tests produce raw `git diff` output, which is correct but unstructured.

### 6.5 The "Should Generated Files Be Committed?" Debate

The Regenerate-and-Diff test only makes sense if generated files are committed. There is a recurring debate across ecosystems about whether generated files should be committed:

**Arguments for committing**: Consumers of Go packages receive source, so generated files must be there; CI doesn't require generator tools installed; debugging is easier (git log shows history of generated changes); guarantees that the version in the repo matches the generator version used.

**Arguments against committing**: Merge conflicts in generated files are painful; repo size grows; generated files may obscure intent; generators at build time are cleaner.

In practice, the debate resolves differently by ecosystem:
- Go: generated files committed (Go module system requires source)
- Protobuf/gRPC in polyglot shops: often generated at build time, not committed
- OpenAPI clients in frontend repos: often committed for stability
- Lockfiles: always committed (without debate)
- `.api` files (Kotlin): committed by design

The Regenerate-and-Diff test is only applicable to the "commit generated files" camp. This means its scope is inherently narrower than it might appear.

### 6.6 Academic Literature Gap

The academic software engineering literature does not treat this pattern directly. The empirical study by Gazzinelli Cruz et al. (JSS, 2023) on snapshot testing is the closest academic work, but it covers snapshot testing (regression detection) rather than synchronization enforcement. The formal SSOT paper (Zenodo, 2025) provides theoretical foundations but does not address testing methodology. No survey papers, empirical studies, or formal treatments of the "keep generated artifacts in sync with source" problem were found in academic databases. This represents a gap in the literature that the present paper begins to address.

---

## 7. Conclusion

The Regenerate-and-Diff pattern -- regenerate an artifact from its source of truth, compare against the committed version, fail if they differ -- is a widespread practice in software engineering that lacks a recognized name or formal treatment. It appears across at least the following domains:

- Code generation (Go, Protobuf, OpenAPI, GraphQL, Thrift, Avro)
- ORM migrations (Django, Alembic, Flyway, Liquibase)
- API surface tracking (Kotlin binary-compatibility-validator, Android Metalava)
- Package dependency management (npm, yarn, Cargo lockfiles)
- Database query metadata (Rust SQLx offline mode)
- Compiled artifact verification (Reproducible Builds, Bazel)
- Infrastructure state verification (Terraform, Pulumi -- structural analogue)
- Formatting verification (Prettier, Black, Ruff check modes)
- Configuration rendering (Helm chart golden files)

Its defining characteristics distinguish it from the superficially similar snapshot testing and approval testing patterns: it enforces a *derivation relationship* between an external source of truth and a committed artifact, rather than detecting change relative to a historical baseline.

The key open problems are:
1. **Naming**: No standard name exists; "Regenerate-and-Diff test" or "Synchronization enforcement test" are proposed candidates.
2. **Tooling**: No general-purpose framework exists; each ecosystem implements independently.
3. **Determinism**: Generator non-determinism causes false failures that are difficult to diagnose.
4. **Literature**: No academic treatment of the pattern as a distinct testing concern exists.

These gaps represent both a deficit in the current state of software testing practice and an opportunity for contribution: naming the pattern, abstracting a general testing framework, and conducting empirical studies of its prevalence, effectiveness, and failure modes.

---

## References

1. Jest documentation. "Snapshot Testing." https://jestjs.io/docs/snapshot-testing

2. Syrupy project. "The sweeter pytest snapshot plugin." https://syrupy-project.github.io/syrupy/

3. ApprovalTests. https://approvaltests.com/

4. Falco, L. ApprovalTests.Python. https://github.com/approvals/ApprovalTests.Python

5. Feathers, M. (2004). *Working Effectively with Legacy Code*. Prentice Hall.

6. Gazzinelli Cruz et al. (2023). "Snapshot testing in practice: Benefits and drawbacks." *Journal of Systems and Software*. https://www.sciencedirect.com/science/article/abs/pii/S0164121223001929

7. Sampson, A. "Try Snapshot Testing for Compilers and Compiler-Like Things." Cornell CS. https://www.cs.cornell.edu/~asampson/blog/turnt.html

8. Reproducible Builds. https://reproducible-builds.org/

9. Debian Wiki. "ReproducibleBuilds/About." https://wiki.debian.org/ReproducibleBuilds/About

10. Spacelift. "Terraform Drift Detection and Remediation." https://spacelift.io/blog/terraform-drift-detection

11. env0. "The Ultimate Guide to Terraform Drift Detection." https://www.env0.com/blog/the-ultimate-guide-to-terraform-drift-detection

12. Pulumi. "Drift Detection." https://www.pulumi.com/docs/pulumi-cloud/deployments/drift/

13. Reilly, J. "Keeping front end and back end in sync with NSwag generated clients." https://johnnyreilly.com/keeping-front-end-and-back-end-in-sync-with-nswag-generated-clients

14. GraphQL Code Generator issue #2872. "Add --check flag to detect stale code." https://github.com/dotansimha/graphql-code-generator/issues/2872

15. GraphQL Code Generator discussion #4253. "Do people check their generated files into Git?" https://github.com/dotansimha/graphql-code-generator/discussions/4253

16. Stream. "Keeping Public API in Check With the Kotlin Binary Validator Plugin." https://getstream.io/blog/keeping-public-api-in-check-with-the-kotlin-binary-validator-plugin/

17. Kotlin binary-compatibility-validator. https://github.com/Kotlin/binary-compatibility-validator

18. Android Open Source Project. "Metalava." https://android.googlesource.com/platform/tools/metalava/

19. golangci-lint issue #20. "idea: add linter to check that committed code is the same as that generated by go generate." https://github.com/golangci/golangci-lint/issues/20

20. Bendersky, E. "A comprehensive guide to go generate." https://eli.thegreenplace.net/2021/a-comprehensive-guide-to-go-generate

21. SQLx CLI. "Offline Mode." https://github.com/launchbadge/sqlx/blob/main/sqlx-cli/README.md

22. Metz, J. "Check your Django Migrations on every commit." https://johnnymetz.com/posts/check-django-migrations/

23. Obregon, A. "Schema Drift Detection in Spring Boot Migration Pipelines." https://medium.com/@AlexanderObregon/schema-drift-detection-in-spring-boot-migration-pipelines-8568b342f6ab

24. Liquibase. "Detect and Prevent Database Schema Drift." https://www.liquibase.com/blog/database-drift

25. Kujawa, C. "Advanced Test Practices For Helm Charts." https://medium.com/@zelldon91/advanced-test-practices-for-helm-charts-587caeeb4cb

26. DeveloperZen. "Golden Testing Helm Charts." https://developerzen.com/golden-testing-helm-charts/

27. Webel IT Australia. "About the Single Source of Truth (SSOT) and Don't Repeat Yourself (DRY) principles." https://www.webel.com.au/node/889

28. Wikipedia. "Single source of truth." https://en.wikipedia.org/wiki/Single_source_of_truth

29. Zenodo. "Formal Foundations for the Single Source of Truth Principle." https://zenodo.org/records/18177320

30. Wikipedia. "Characterization test." https://en.wikipedia.org/wiki/Characterization_test

31. understandlegacycode.com. "What's the difference between Regression Tests, Characterization Tests, and Approval Tests?" https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/

32. Bazel. "Hermeticity." https://bazel.build/basics/hermeticity

33. minio/minio PR #10579. "Makefile: Check for any non committed auto-generated code." https://github.com/minio/minio/pull/10579

34. HashiCorp. "Makefile Cheat Sheet - Terraform AWS Provider." https://hashicorp.github.io/terraform-provider-aws/makefile-cheat-sheet/

35. Buf build. "CI/CD integration with the Buf GitHub Action." https://buf.build/docs/bsr/ci-cd/github-actions/

36. Prettier. "CLI." https://prettier.io/docs/cli

37. Andreamedda. "A workflow for Protobuf using Buf and GitHub Actions." https://www.andreamedda.com/posts/go-buf-github-actions/

38. DAS Lab, Concordia. "Keeping Software Artifacts Synchronized with ArtifactSync." https://das.encs.concordia.ca/blog/publications/Keeping_Software_Artifacts_Synchronized_with_ArtifactSync

39. Kubernetes. "Controllers." https://kubernetes.io/docs/concepts/architecture/controller/

40. Testing Idempotence for Infrastructure as Code. (2013). Springer. https://link.springer.com/chapter/10.1007/978-3-642-45065-5_19

---

## Practitioner Resources

### Tools by Domain

**Go code generation verification**
- Standard pattern: `go generate ./... && git diff --exit-code`
- Reference: golangci-lint issue #20 (closed as "shell script is simpler")

**Protobuf / gRPC synchronization**
- Buf GitHub Action: https://github.com/bufbuild/buf-action
- Pattern: `buf generate && git diff --exit-code`

**OpenAPI / NSwag client synchronization**
- Pattern: Copy committed client, regenerate, assert equality in test
- Reference: Johnny Reilly's NSwag guide (see References #13)

**GraphQL codegen synchronization**
- `graphql-codegen --check` (implemented in v2+ via PR #8149)
- Fallback: `npm run codegen && git status --porcelain`

**Kotlin API surface tracking**
- JetBrains binary-compatibility-validator: `./gradlew apiCheck` / `apiDump`
- Repository: https://github.com/Kotlin/binary-compatibility-validator

**Android API surface tracking**
- Metalava: `m checkapi` (AOSP) or `./gradlew :module:checkApi` (AndroidX)
- Repository: https://android.googlesource.com/platform/tools/metalava/

**Django migration synchronization**
- `python manage.py makemigrations --check`
- pre-commit hook configuration: https://johnnymetz.com/posts/check-django-migrations/

**Rust SQLx query metadata synchronization**
- `cargo sqlx prepare --check`
- Documentation: https://github.com/launchbadge/sqlx/blob/main/sqlx-cli/README.md

**Helm chart template verification**
- Helm unittest with golden files (`-update-golden` flag)
- Terratest golden file pattern
- Reference: https://medium.com/@zelldon91/advanced-test-practices-for-helm-charts-587caeeb4cb

**Formatter verification (degenerate case)**
- `prettier --check .`
- `black --check .`
- `ruff check .` (formatting mode)

**Infrastructure drift detection (structural analogue)**
- `terraform plan -detailed-exitcode`
- `pulumi refresh --preview-only`
- `kubectl diff -f manifest.yaml`

**Reproducible builds verification**
- diffoscope: https://diffoscope.org/
- rebuilderd: https://github.com/kpcyrd/rebuilderd
- reproducible-builds.org tooling: https://reproducible-builds.org/tools/

### Implementation Patterns by Strategy

**Git diff strategy** (simplest, most general):
```bash
# Run generator
generate-tool --output path/to/artifact.ext

# Fail if working tree differs from committed
git diff --exit-code path/to/artifact.ext
```

**In-memory comparison strategy** (cleaner for test frameworks):
```python
def test_artifact_in_sync():
    expected = generate_artifact_from_source()
    committed = Path("path/to/artifact.ext").read_text()
    assert expected == committed, (
        "Artifact is out of sync with source. "
        "Run `make generate` and commit the result."
    )
```

**Dedicated check flag strategy** (when tool supports it):
```bash
# Tool implements --check internally
graphql-codegen --check
cargo sqlx prepare --check
python manage.py makemigrations --check
```

**Hash comparison strategy** (fastest, no diff output):
```bash
# Compute expected hash, compare to committed hash file
new_hash=$(generate-tool | sha256sum)
committed_hash=$(cat artifact.sha256)
[ "$new_hash" = "$committed_hash" ] || exit 1
```

### Key Error Message Design

A well-designed Regenerate-and-Diff test failure should:
1. State that the artifact is out of sync (not "test failed" or "assertion error")
2. Identify which artifact and which source diverged
3. Provide the exact command to fix the problem

Bad: `AssertionError`
Good: `Schema artifact (schemas/output.json) is out of sync with source of truth (models/schema.py). Run 'make generate-schema' and commit the result.`
