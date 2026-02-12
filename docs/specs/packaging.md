# Pnpm Packaging for Compound Agent

> Spec ID: 0006
> Status: Approved
> Author: Nathan Delacretaz
> Created: 2026-01-31

## Goal

Ship Compound Agent as a pnpm package (library + CLI) that developers can add to their repo with minimal friction, without Docker.

## Context

The target users are developers installing this tool on their own machines to extend their local Claude Code workflow. The repository already builds to `dist/` and exposes a CLI, but we need a clear, documented packaging plan that guarantees install, build, and usage are predictable across machines. The model download is large and should remain an explicit user action, not a postinstall side effect.

## Requirements

- [x] Package can be installed with `pnpm add -D compound-agent` and used as a library via ESM imports.
- [x] CLI is available after install as `compound-agent` (and `learn` alias) and works via `pnpm dlx compound-agent <cmd>`.
- [x] `dist/` artifacts are the only required runtime output and are included in the published tarball.
- [x] No postinstall scripts download the embedding model; model download is explicit (`compound-agent download-model`).
- [x] Documentation clearly describes install, build, and usage flows.
- [x] Publish checklist is defined and verifiable with `pnpm pack` and `pnpm publish --dry-run`.

## Acceptance Criteria

- [x] Given a fresh repo, when running `pnpm add -D compound-agent`, then `import { LessonSchema } from 'compound-agent'` works in ESM and resolves to `dist/index.js` and `dist/index.d.ts`.
- [x] Given a fresh repo, when running `pnpm dlx compound-agent --help`, then CLI help prints and exits with code 0.
- [x] Given `pnpm pack`, when inspecting the tarball, then it includes `dist/` and excludes source, tests, and local caches.
- [x] Given a machine without a downloaded model, when running `compound-agent search`, then a clear error instructs to run `compound-agent download-model`.
- [x] Given `pnpm publish --dry-run`, then the output matches the intended file list and no large binary model file is included.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No model downloaded | CLI commands that need embeddings fail with a clear message and exit non-zero; other commands still work. |
| Native dependency install fails | Install surfaces the underlying error clearly; docs provide troubleshooting guidance. |
| Running with Node < 20 | Install or runtime fails with engines mismatch; docs state Node 20+ requirement. |
| Offline machine | Install works for cached deps only; model download fails with network error message. |
| Windows path differences | CLI uses Node path APIs; no hardcoded POSIX paths in packaging instructions. |

## Constraints

- **Technical**: ESM-only package, Node >= 20, pnpm as package manager.
- **Performance**: No large downloads during install.
- **Size**: Published tarball should be minimal and exclude models and caches.
- **Compatibility**: Must keep CLI and library usage consistent with current docs.

## Out of Scope

- Shipping Docker images for install or runtime.
- Bundling the embedding model inside the package.
- Providing a globally installed system service.

## Dependencies

- **Upstream**: `tsup` build output in `dist/`, `package.json` `bin` and `exports` configuration.
- **Downstream**: README installation section, CONTRIBUTING publish steps.
- **External**: Node.js official runtime behavior, pnpm publishing pipeline.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Native deps fail to build on some machines | Medium | High | Document prerequisites; recommend Node 20+; provide troubleshooting notes. |
| CLI entrypoint missing shebang in build output | Low | Medium | Verify `dist/cli.js` is executable in pack verification. |
| Accidental inclusion of large assets (model) | Low | High | Enforce `files: ["dist"]` and validate via `pnpm pack`. |
| Consumers rely on deprecated types | Medium | Medium | Document breaking changes and provide migration notes. |

## Test Strategy

- **Unit tests**: Not required for packaging itself; rely on existing unit tests for runtime behavior.
- **Integration tests**: Manual verification in a temp repo: install, import, CLI help, and `download-model`.
- **Property tests**: Not applicable.
- **Manual testing**: `pnpm pack`, inspect tarball contents, `pnpm publish --dry-run` output.

## Definition of Done

- [x] All acceptance criteria pass
- [x] Tests written and passing (if changes require new tests)
- [x] Code reviewed
- [x] Documentation updated (README and CONTRIBUTING references)
- [x] No regressions in existing tests
- [x] Spec approved (implementation in compound_agent-3uc)
