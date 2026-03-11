# Linter Custom Rule APIs: Cross-Ecosystem Research

**Research for**: `learning_agent-i72b`
**Date**: 2026-03-11
**Purpose**: Understand what's possible per linter for compound-agent's lint rule proposal feature

---

## Executive Summary

Every major linter provides some degree of config-only pattern enforcement, but the depth varies significantly. ESLint and golangci-lint offer the richest config-only surfaces, while Ruff explicitly has no custom rule API (by design). For compound-agent's use case of *proposing* lint rules, the practical division is: config-only rules (immediately actionable), custom rule stubs (require code, but can be templated), and universal tools like Semgrep or ast-grep (YAML-only, language-agnostic, self-contained).

---

## Per-Linter Analysis

### 1. ESLint (JavaScript/TypeScript)

**Config-only rules** (no code required):
- `no-restricted-syntax` — CSS-selector syntax for ESTree ASTs (ESQuery). Example: `"CallExpression[callee.name='eval']"`. Custom messages per entry.
- `no-restricted-imports` — bans imports by path/pattern with custom messages
- `no-restricted-globals` — bans global variable access
- `no-restricted-properties` — bans property access patterns

**Custom rule API**: Single JS file with `meta` (type, docs, messages, fixable, schema) + `create(context)` returning AST visitors. `meta.docs.url` for clickable doc links. `suggest` for in-editor quick-fixes.

**Detection**: `eslint.config.js/mjs/cjs` (flat, v9+), `.eslintrc.*` (legacy), `eslint` in `package.json` devDependencies.

**Rule installation**: Flat config: inline plugin in `eslint.config.js`. Legacy: `eslint-plugin-local-rules`.

**Verdict**: Best config-only surface. `no-restricted-syntax` alone covers many compound-agent use cases.

### 2. Ruff (Python)

**Config-only rules**:
- `banned-api` (TID251) — bans module members with custom messages in `pyproject.toml`
- `banned-module-level-imports` (TID253) — forces lazy imports
- `extend-select`/`ignore`/`per-file-ignores` — rule toggling by code prefix

**Custom rule API**: **None exists.** Explicitly stated in FAQ. GitHub issue #283 tracks plugin system RFC, still open.

**Detection**: `ruff.toml`, `.ruff.toml`, `pyproject.toml` with `[tool.ruff]`.

**Verdict**: Config-only via `banned-api` is the only path. For AST-level Python rules, must target Flake8 plugins or universal tools.

### 3. Clippy (Rust)

**Config-only rules**:
- `disallowed-methods` — bans method calls by path with `reason` field
- `disallowed-types` — bans type usage
- `disallowed-macros` — bans macro invocations
- Numeric thresholds for complexity lints

**Custom rule API**: Requires `dylint` (Trail of Bits) — compiles `.so/.dylib` using `rustc` nightly internals. High complexity.

**Detection**: `Cargo.toml`, `clippy.toml`/`.clippy.toml`.

**Verdict**: `disallowed-*` config covers banned API patterns. Custom AST rules are impractical to propose.

### 4. golangci-lint (Go)

**Config-only rules**:
- `depguard` — import allow/deny lists with `desc` messages
- `forbidigo` — bans identifier patterns via regexp with `msg`
- `revive` — highly configurable drop-in `golint` replacement
- `gomodguard` — module-level import restrictions

**Custom rule API**: Go plugin (`.so` via `go/analysis` API, ~30-50 lines minimum) or module plugin system. Moderate complexity but version-sensitive.

**Detection**: `.golangci.yml/yaml/toml/json`, GitHub Actions workflows.

**Verdict**: Rich config-only surface via `depguard` + `forbidigo`. Good target for compound-agent proposals.

### 5. RuboCop (Ruby)

**Config-only rules**: Enable/disable/tune 400+ cops in `.rubocop.yml`. No built-in equivalent of `no-restricted-syntax`.

**Custom rule API**: Ruby class subclassing `RuboCop::Cop::Base` with `def_node_matcher` (s-expression AST patterns). Concise but requires `ruby-parse` knowledge.

**Detection**: `.rubocop.yml`, `rubocop` in `Gemfile`.

**Verdict**: Config tuning is rich but pattern banning requires custom cop code.

---

## Universal Lint Rule Formats

### Semgrep

Pure YAML, 30+ languages. Key features:
- Metavariables (`$X`, `$...ARGS`), ellipsis operator (`foo(...)`)
- Boolean composition (`pattern-either`, `pattern-not`, `pattern-inside`)
- `fix` field for autofixes, `message` for remediation
- Taint tracking (Pro/paid feature)

```yaml
rules:
  - id: no-eval
    languages: [javascript, typescript, python]
    message: "Avoid eval(). Use safe alternatives."
    severity: ERROR
    pattern: eval(...)
    fix: safe_eval(...)
```

### ast-grep

Newer, faster (Rust + Tree-sitter). Pure YAML:
- Structural matching via Tree-sitter grammars
- `has`, `inside`, `follows`, `precedes` relational operators
- `fix` field, `note` field for context

```yaml
id: no-console-log
language: JavaScript
message: "Use project logger instead of console.log"
severity: warning
rule:
  pattern: console.log($$$ARGS)
fix: logger.info($$$ARGS)
```

**Both tools** are strong candidates as a universal target for compound-agent rule proposals — YAML-only, no per-linter code generation needed.

---

## Recommendation for compound-agent

| Strategy | Effort | Coverage | Reliability |
|----------|--------|----------|-------------|
| Config-only entries per linter | Low | Medium (banned APIs, imports) | High |
| Custom rule code per linter | High | High (AST-level) | Medium (version sensitivity) |
| Semgrep/ast-grep YAML rules | Low | High (multi-language AST) | High |

**Recommended primary target**: Config-only entries for the user's detected linter (covers ~60% of lintable lessons). **Secondary target**: Semgrep/ast-grep YAML rules for AST-level patterns that config-only can't express.
