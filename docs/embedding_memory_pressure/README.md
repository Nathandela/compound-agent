# Embedding & Test Memory Pressure Investigation

> **Date**: 2026-03-17
> **Status**: Completed — findings integrated into pipeline improvements v1 (SPEC-0007)

## Problem Statement

Running the test suite causes significant memory pressure on developer machines.
This report documents the root causes, empirical measurements, and proposed
solutions ranging from quick fixes to architectural changes.

## Contents

| Document | Purpose |
|----------|---------|
| [measurements.md](measurements.md) | Raw empirical data and methodology |
| [root-causes.md](root-causes.md) | Five identified root causes with code references |
| [proposals.md](proposals.md) | Tiered solution proposals with trade-off analysis |

## Key Findings (TL;DR)

- The embedding model costs **340 MB RSS** (not 150 MB as documented)
- Each load/dispose cycle leaks **~110 MB permanently**
- Two test files violate their own safety rules, loading the model at module level
- Unit tests alone peak at **572 MB** due to native module duplication across worker threads
- The test collection phase (154s) is nearly as expensive as execution (216s)

## Resolution

Investigation complete. Findings were incorporated into [Pipeline Improvements v1](../specs/pipeline-improvements-v1.md) (SPEC-0007). See [proposals.md](proposals.md) for the full menu with effort/impact ratings.
