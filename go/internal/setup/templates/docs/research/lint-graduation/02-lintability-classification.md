# LLM-Driven Lintability Classification

**Research for**: `learning_agent-ddky`
**Date**: 2026-03-11
**Purpose**: How to classify whether a lesson can be mechanically enforced by a linter

---

## Executive Summary

Whether a lesson is lintable reduces to: does it describe a property determined entirely by static code artifacts (text, tokens, AST, imports, file paths), or does it require runtime state, process knowledge, or human judgment? Of the 52 lessons in the current corpus, ~11 are clearly lintable, ~8 are partially lintable, and ~33 are not lintable. An LLM classifier with reasoning-first structured output and few-shot boundary examples is the recommended approach, with HIGH confidence threshold for automatic rule proposal.

---

## Taxonomy of Lintable Pattern Categories

| Category | Description | Check Type | Example |
|----------|-------------|------------|---------|
| **A: Token/String** | Forbidden/required string or regex pattern | `file-pattern` | "don't use template literals in `db.query()`" |
| **B: AST Structural** | Syntactic relationship between code elements | ESLint/ast-grep | "`if(condition){expect()}`" in tests |
| **C: Import Graph** | Forbidden/required import relationships | `no-restricted-imports` | "import from barrel exports, not internal paths" |
| **D: File Structure** | File names, directory conventions, existence | `file-size`/structural test | "every skill needs a test" |
| **E: Script/Exit-Code** | Property verifiable by shell command | `script` | "bash templates must pass `bash -n`" |

**Not lintable**: requires runtime state, cross-session knowledge, human intent, semantic meaning, or workflow ordering.

---

## Classification Signals

### Strong Lintability Signals

| Signal | Example | Check Type |
|--------|---------|------------|
| "never call `X()`" / "don't use `X()`" | "Never call `isModelUsable()` at top-level" | AST |
| "use `A()` instead of `B()`" | "`isModelAvailable()` instead of `isModelUsable()`" | file-pattern |
| "never use `X` in `Y` context" | "template literals in db.query()" | file-pattern |
| Named structural pattern | "`if (condition) { expect() }`" | AST |
| "import from `X`, not `Y`" | "barrel exports" | import rule |

### Strong Non-Lintability Signals

| Signal | Example | Reason |
|--------|---------|--------|
| "causes context drift" / "causes confusion" | Inlining instructions | Semantic effect |
| Timing/sequence references | "must be closed before..." | Workflow |
| "always verify" / "when delegating" | Subagent verification | Human process |
| "sessions", "compaction", "context windows" | Runtime concepts | Cross-process state |

---

## Ground Truth: Corpus Classification

### Clearly Lintable (11 of 52)

| ID | Insight | Check Type | Status |
|----|---------|------------|--------|
| Lb594d59f | No `if(condition){expect()}` in tests | AST | Not enforced |
| La68cf5cd | No `isModelUsable()` at test module top-level | AST | Not enforced |
| P67358a62 | `isModelAvailable()` over `isModelUsable()` in hot paths | file-pattern | Pattern exists |
| P984a1128 | `readAllFromSqlite()` over `readMemoryItems()` after sync | file-pattern | Pattern exists |
| Pd3c69ab5 | Bulk embedding cache, not N individual calls | file-pattern | Pattern exists |
| Paea1950e | Keep `Float32Array`, don't convert to `number[]` | file-pattern | Pattern exists |
| Lba2cfb20 | `writeFileSync` with flag `'wx'` for atomic locks | file-pattern | Not enforced |
| L318e5cf6 | Functions max 75 lines | ESLint | Already enforced |
| L0173ed04 | Quality filter terms before capture terms | file-pattern | Structural test |
| L72632ad4 | Guaranteed-nonexistent path in tests, not `""` | file-pattern | Not enforced |
| Lffd6c774 | Don't `replace_all` on constant definition lines | file-pattern | Not enforced |

### Partially Lintable (8 of 52)
Process/architectural lessons where some subset is syntactically checkable.

### Not Lintable (33 of 52)
Architectural, process, deployment, cross-tool, and performance insights.

---

## Recommended Classifier Prompt Design

**Key principles** (from classification research):
1. Reasoning-first output — generate rationale before verdict (sequential token generation constrains the label)
2. Few-shot with boundary cases — include PARTIAL examples, not just easy cases
3. Discrete confidence tiers — HIGH/MEDIUM/LOW, not float probabilities (LLMs are systematically over-confident)
4. Balanced few-shot examples across all classes despite unbalanced corpus

```
You are classifying whether a software development lesson can be mechanically
enforced by a code linter (static analysis without running the code).

DEFINITION OF LINTABLE:
A lesson is LINTABLE if and only if:
  - It describes a property determinable from source code alone
  - The check would return deterministic yes/no without running the program
  - The bad pattern can be expressed as regex, AST selector, or import constraint
  - It does NOT require: runtime state, human intent, cross-session history,
    deployment processes, or semantic meaning

CLASSES:
  LINTABLE     — Check can be written as regex / AST / import rule
  PARTIAL      — A subset is lintable; the rest is process/semantic
  NOT_LINTABLE — Requires runtime state, process knowledge, or human judgment

CONFIDENCE:
  HIGH   — Named code construct + prohibitive imperative. Check is unambiguous.
  MEDIUM — Pattern is conditional on context, or needs AST analysis not yet supported.
  LOW    — Genuinely ambiguous. Flag for human review.

[Few-shot examples with reasoning]

LESSON: {lesson_text}

Reason step by step, then output:
VERDICT: [LINTABLE|PARTIAL|NOT_LINTABLE]
CONFIDENCE: [HIGH|MEDIUM|LOW]
CHECK_TYPE: [file-pattern|ast|import-rule|file-structure|script|N/A]
RATIONALE: One sentence summary
```

---

## Pattern Extraction Pipeline

Once classified as LINTABLE, a two-stage extraction (inspired by KNighter, SOSP '25):

```
Stage 1 — Extract semantics
  Input: lesson text
  Output: {bad_pattern, good_pattern, scope}

Stage 2 — Choose check type
  Named function call/API?  → AST check
  String/token in source?   → file-pattern (regex + glob)
  Import paths?             → import-rule
  File size/existence?      → file-size / structural test
  Shell-verifiable?         → script check

Stage 3 — Generate check expression
  Output: concrete regex, AST selector, or glob pattern
  Mark as "suggested, verify before use"
```

---

## Confidence Threshold

**Automatic rule proposal: HIGH confidence only.**

Asymmetric cost: a false positive (proposing a rule for a non-lintable lesson) wastes engineering time and creates noisy lint. A false negative (missing a lintable lesson) has no negative side effects — the lesson remains searchable via semantic retrieval.

---

## Related Work

- **KNighter** (SOSP '25): NL bug description -> analysis plan -> checker code. Two-stage planning approach directly applicable.
- **IRIS** (arxiv 2405.17238): LLM binary classification of static analysis findings. Confirms structured prompts work.
- **Semgrep Assistant** (deprecated Oct 2025): Auto-generated rules from NL had quality control problems at scale. Lesson: human-in-the-loop, not fully automated.
