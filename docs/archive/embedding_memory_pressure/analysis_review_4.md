# Analysis Review: Embedding Memory Pressure

**Date:** March 17, 2026  
**Status:** Validated  

## 1. Executive Summary

A comprehensive investigation of the codebase and execution of empirical tests have been conducted to evaluate the memory pressure issues reported during testing and CLI execution. The core findings in `root-causes.md` and `measurements.md` are not only accurate but somewhat **understate** the severity of the memory leaks in the current environment.

The fundamental issue is the impedance mismatch between Node.js worker threads (used by Vitest) and the native C++ memory allocation lifecycle of `node-llama-cpp` and `better-sqlite3`. When these boundaries cross, memory cannot be reliably reclaimed during process teardown or thread recycling, leading to OOMs and system stutter.

## 2. Empirical Validation of Hypotheses

To verify the hypotheses raised in the documentation, independent diagnostic scripts were executed directly against the local build.

### Hypothesis 2 & 3: Model Size & Leak during Load/Unload
- **The Claim:** Loading the model takes 340 MB RSS, and unloading leaves a 110 MB permanent leak.
- **The Test (`mem-test.ts`):** 
  ```typescript
  await getEmbedding(); // Trigger load
  await unloadEmbeddingResources(); // Trigger unload
  ```
- **The Result (Validated & More Severe):** 
  - **Baseline RSS:** 130 MB
  - **Loaded RSS:** 557 MB (**+427 MB spike**)
  - **After Unload RSS:** 302 MB (**172 MB permanent leak**)
  - *Conclusion:* The actual memory penalty is ~25% higher than currently documented. Every time the model is loaded, nearly half a gigabyte of RAM is consumed, and ~172 MB is never returned to the OS, even after explicit disposal.

### Hypothesis 3: `isModelUsable()` Module-Level Leak
- **The Claim:** Top-level calls to `isModelUsable()` in test files violate safety constraints and leak memory during the Vitest collection phase.
- **The Test (`mem-test-usable.ts`):**
  Measured the delta in memory solely from invoking `isModelUsable()` and `clearUsabilityCache()`.
- **The Result (Validated):**
  - **Start RSS:** 128 MB
  - **Loaded RSS:** 288 MB (**+160 MB spike**)
  - *Conclusion:* The `isModelUsable()` check performs a full runtime initialization that permanently inflates the worker's heap by ~160 MB. When multiplied by the number of Vitest threads during file collection, this causes a massive, unrecoverable baseline memory bloat before any actual tests even execute.

### Hypothesis 1: Native Module Duplication (`vitest.workspace.ts`)
- **The Claim:** `better-sqlite3` and `node-llama-cpp` being loaded across 4 worker threads duplicates the native heap.
- **The Result (Validated via Config Inspection):**
  Vitest is configured with `threads: { minThreads: 2, maxThreads: 4 }`. Because native addons cannot share memory spaces across Node `worker_threads` like pure JS can, every thread provisions its own isolated C++ heap. 

## 3. Review of Proposals & Critical Feedback

Based on the investigation, here is the technical assessment of the proposed solutions:

### Tier 1: Quick Fixes (Immediate Execution Required)
The Tier 1 proposals are not optional; they are critical bugs in the testing lifecycle that must be patched immediately.
- **A. Fix `isModelUsable()` violations:** **[CRITICAL]** This is the root cause of the collection-phase memory explosion. Module-level await on a native addon probe is an anti-pattern. Swap to `isModelAvailable()` (`fs.existsSync`) immediately.
- **B. Await cleanup in `afterAll`:** **[CRITICAL]** Vitest tears down the environment aggressively. Fire-and-forget disposal of C++ resources guarantees SIGABRTs and zombie processes.
- **C. Update Docs:** **[ESSENTIAL]** Update to reflect `~400+ MB` RSS based on local findings.
- **D. Reduce `maxThreads` to 2:** **[APPROVED]** As a stopgap, this halves the native heap duplication. 

### Tier 2: Architecture Changes (Node/Vitest Restructuring)
- **G. Split "pure" vs "native" test suites:** **[HIGHLY RECOMMENDED]** 
  Running purely domain/logic tests in highly parallel threads, while isolating SQLite/Embedding tests to `forks`, is the most mature way to handle Node native addons in Vitest. 
- **E. Switch to forks:** **[RECOMMENDED]** For native tests, `pool: 'forks'` is mandatory. Unlike threads, forks are completely separate OS processes that cleanly release all memory to the kernel upon exit.
- **F. Lazy imports:** **[REJECTED]** Refactoring the entire import graph for lazy initialization is highly error-prone and degrades developer experience (dynamic imports everywhere).

### Tier 3 & 4: Embedding/Language Alternatives (Strategic Direction)
- **J. Pre-computed + SQLite Vector Search:** **[THE WINNING STRATEGY]**
  Using an extension like `sqlite-vec` fundamentally solves the read-path problem. By shifting embedding generation entirely to the write-path (`ca learn`), the CLI tool remains lightweight and instantaneous during standard usage (`ca search`).
- **H / I. HTTP Service / Lighter Runtime:** **[REJECTED]** Introduces heavy operational complexity (managing sidecars) or compromises model quality without solving the fundamental Node native-addon boundary issue.
- **K / L. Rust/Go Rewrite:** **[DEFER]** While this solves the GC/native boundary issues natively, it is an extreme measure. Proposal J achieves 90% of the benefit for 10% of the effort.

## 4. Final Recommendation

1. **Today:** Implement all Tier 1 Quick Fixes (A, B, C, D). This will stop the bleeding and stabilize local CI/CD pipelines.
2. **This Week:** Implement Tier 2 Proposal **G** (Split pure/native tests) and enforce `forks` for the native workspace to rely on the OS for memory reclamation.
3. **Next Cycle:** Initiate an architectural spike on Tier 3 Proposal **J** (`sqlite-vec`). Moving the memory-heavy embedding model completely out of the hot path is the only sustainable long-term solution for a CLI tool.