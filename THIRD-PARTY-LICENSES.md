# Third-Party Licenses

## Overview

compound-agent is licensed under the MIT License. This document lists notable third-party dependencies and their licenses.

## Dependency License Summary

All 413 packages in the dependency tree use permissive open-source licenses. No copyleft (GPL, AGPL, LGPL) licenses are present.

| License | Package Count |
|---------|--------------|
| MIT | 332 |
| ISC | 38 |
| Apache-2.0 | 17 |
| BlueOak-1.0.0 | 8 |
| BSD-3-Clause | 8 |
| BSD-2-Clause | 7 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| (MIT OR WTFPL) | 1 |
| Python-2.0 | 1 |

## Key Production Dependencies

| Package | License | Notes |
|---------|---------|-------|
| better-sqlite3 | MIT | Bundles SQLite (public domain) |
| node-llama-cpp | MIT | Wraps llama.cpp (MIT) |
| commander | MIT | CLI framework |
| zod | MIT | Schema validation |
| chalk | MIT | Terminal colors |

## Runtime Model Download

The embedding model (EmbeddingGemma-300M) is **not bundled** with this package. It is downloaded on-demand when the user runs `npx ca download-model` or `npx ca setup`.

The model is a GGUF quantization of Google's Gemma model family, hosted by ggml-org on HuggingFace. It is subject to Google's [Gemma Terms of Use](https://ai.google.dev/gemma/terms), which allow free use for research, development, and commercial purposes.

Key points:
- The model weights are downloaded directly by the end user
- compound-agent does not redistribute the model
- Users should review the Gemma Terms of Use before downloading
- The model download destination is `~/.node-llama-cpp/models/` (shared across projects)

## Notes

- **BlueOak-1.0.0**: A modern permissive license by the Blue Oak Council. Equivalent in permissiveness to MIT/BSD. Used by packages in the npm/Isaac Z. Schlueter ecosystem (tar, minimatch, etc.).
- **Python-2.0**: Used by the `argparse` transitive dependency. OSI-approved, permissive. Requires copyright notice retention (standard).
- **(MIT OR WTFPL)**: The `expand-template` package. We consider this MIT-licensed (choosing MIT from the dual license).

## Audit Date

This audit was performed on 2026-02-24 against compound-agent v1.4.4 with 413 total packages in the dependency tree.

---
