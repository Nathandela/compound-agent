# Embedding Memory Pressure Remediation — System Spec

> **Date**: 2026-03-17
> **Status**: Approved (Gate 2 passed)
> **Meta-epic**: learning_agent-f4oj
> **Input**: docs/embedding_memory_pressure/ (measurements, root-causes, proposals, 4 independent reviews)

## Problem Statement

Running the test suite causes significant memory pressure on developer machines due to native C++ addon lifecycle issues (node-llama-cpp ~400 MB RSS, dispose leaks ~100-270 MB) and import graph coupling that forces heavyweight modules into lightweight contexts.

## EARS Requirements

### Ubiquitous (shall always hold)
- **U1**: Test suite runs on 8 GB machines without OS memory pressure warnings
- **U2**: Documented memory figures reflect empirical measurements on target Node.js version
- **U3**: Native C++ resources disposed in dependency order (child→parent), awaited to completion
- **U4**: Test skip-gating correctly skips on machines with present-but-unusable model

### Event-Driven
- **E1**: `ca search` embeds query without loading >150 MB additional RSS (target for lighter runtime)
- **E2**: `ca learn` computes and stores embedding in SQLite for future searches
- **E3**: Unit test imports that don't use embeddings shall not load node-llama-cpp
- **E4**: When Go binary available, `ca search` delegates via subprocess
- **E5**: When Go binary unavailable, falls back to node-llama-cpp transparently

### State-Driven
- **S1**: Without embedding model, system consumes <200 MB RSS per worker
- **S2**: Full test suite peak RSS <1 GB system-wide
- **S3**: Embedding model lifecycle via singleton with explicit async disposal
- **S4**: Embedding operations may delegate to external Go binary

### Unwanted
- **W1**: Prevent module-level isModelUsable() in test files
- **W2**: Prevent concurrent disposal of interdependent C++ objects
- **W3**: Prevent node-llama-cpp transitive loading by non-embedding unit tests

### Optional
- **O1**: sqlite-vec for SQL-side vector arithmetic (when available)
- **O2**: Lighter embedding runtime (ONNX/Transformers.js) if equivalent quality
- **O3**: HTTP sidecar for embeddings (when >10K lessons)
- **O4**: Broader language migration (Go/Rust) for CLI subsystems

## Epic Decomposition

### Processing Order

```
E1: Measure + Fix Baseline (learning_agent-j0fz)
├──→ E2: Import Graph Decoupling (learning_agent-863u)
│     └──→ E3: Pure Test Infrastructure (learning_agent-ye6s)
│              └──→ [Gate C: is Tier 3 needed?]
└──→ E4: Go Embedding Spike (learning_agent-6zbe)
      └──→ [Gate B: Go or lighter runtime?]
            └──→ E5: Go Embedding Implementation (learning_agent-i3hj)
                  └──→ E6: Broader Migration Assessment (learning_agent-qc00)
```

### Decision Gates

| Gate | After | Question | If Yes | If No |
|------|-------|----------|--------|-------|
| A | E1 | Is Tier 2 work needed? | Proceed to E2+E4 | Defer E2-E6 |
| B | E4 | Go binary viable? | Proceed to E5 | Evaluate lighter TS runtime |
| C | E3 | Is Tier 3 work needed? | Proceed to E5 | Defer E5-E6 |

### Epic Summary

| ID | Title | Priority | Concepts | Files | Duration |
|----|-------|----------|----------|-------|----------|
| learning_agent-j0fz | E1: Measure + Fix Baseline | P1 | 7 | ~15 | 2-3 days |
| learning_agent-863u | E2: Import Graph Decoupling | P2 | 5 | ~18 | 1-2 days |
| learning_agent-ye6s | E3: Pure Test Infrastructure | P2 | 9 | ~60 | 2-3 days |
| learning_agent-6zbe | E4: Go Embedding Spike | P2 | 8 | ~10 | 3-5 days |
| learning_agent-i3hj | E5: Go Embedding Implementation | P3 | 7/phase | ~30 | 1-2 weeks |
| learning_agent-qc00 | E6: Broader Migration Assessment | P4 | 5 | 0 code | 1-2 days |

## Top Hazards (STPA)

1. Concurrent C++ disposal → production SIGABRT (fix in E1)
2. Proposal A weakens skip-gate → CI breakage (mitigated with beforeAll gate in E1)
3. model-info.ts accidental native import → breaks E3+E5 (CI check in E2)
4. Go binary vector incompatibility → invalidates embedding cache (property tests in E5)
5. No measurement gate between tiers → decisions on stale data (gates A/B/C)

## Review Disagreement Resolution

| Topic | Resolution | Epic |
|-------|-----------|------|
| Primary unit-test memory driver | Measure in isolation to determine | E1 |
| Proposal A safety | beforeAll runtime gate, not removal | E1 |
| Exact memory figures | Re-measure on target Node v25.2.1 | E1 |
| Proposal F target | model-info.ts extraction + test-utils split | E2, E3 |
| Proposals I/J framing | Query embedding is the real gap; items already cached | E4 |
