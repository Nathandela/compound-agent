# Dependency Security Reference

*February 23, 2026*

Reference for AI agents reviewing dependency changes and supply chain risk.
Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.9.

---

## Risk Model

### Direct Dependencies
- Explicitly chosen by the project (listed in `package.json`, `pyproject.toml`, etc.).
- Developer has evaluated fitness and should track updates.

### Transitive Dependencies
- Pulled in by direct deps. Often invisible to the developer.
- A vulnerability in a transitive dep can be exploitable even if the direct dep's API seems safe.
- Transitive deps are the primary source of surprise CVEs.

---

## Audit Tools

| Ecosystem | Tool | Command |
|-----------|------|---------|
| Node.js / pnpm | pnpm audit | `pnpm audit` |
| Node.js / npm | npm audit | `npm audit` |
| Node.js / yarn | yarn audit | `yarn audit` |
| Python | pip-audit | `pip-audit` |
| Python | safety | `safety check` |
| Multi-language | Snyk | `snyk test` |
| Multi-language | Trivy | `trivy fs .` |

Run the appropriate audit command during CI and before merging dependency changes.

---

## Risky Patterns to Flag

### Pinned Old Major Versions
- Direct dependency 3+ major versions behind latest.
- Older major versions often stop receiving security patches.
- Flag and recommend evaluating upgrade feasibility.

### Unmaintained Packages
- No commits or releases in 2+ years.
- No response to open security issues.
- Consider whether a maintained alternative exists.

### Packages with postinstall Scripts
- `postinstall` (and `preinstall`, `install`) scripts execute arbitrary code during `npm install` / `pnpm install`.
- A compromised or malicious package can use this to exfiltrate secrets or modify the filesystem.
- Flag any newly added dependency that includes lifecycle scripts.

### Typosquat Risk
- New or unfamiliar packages with names similar to popular packages.
- Check download counts, repository links, and publisher history.
- Examples: `lodahs` vs `lodash`, `coolor` vs `color`.

---

## What to Check on Lockfile Changes

When a PR modifies `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, or
`requirements.txt` / `poetry.lock`, review the following:

| Change | Question | Risk |
|--------|----------|------|
| New direct dependency | Was this intentional and discussed? | Supply chain expansion |
| Version downgrade | Why was a version lowered? | May reintroduce patched CVE |
| New postinstall script | Does the new dep run code at install time? | Arbitrary code execution |
| Removed integrity hashes | Were `integrity` / `hash` fields deleted? | Tamper detection weakened |
| Large transitive tree addition | Does the new dep pull in many transitive deps? | Expanded attack surface |
| Dependency removed | Was the removal intentional? | May break functionality or remove security fix |

---

## Triage Rules

| Condition | Severity |
|-----------|----------|
| Known CVE with active exploitation and RCE impact | P0 |
| Known CVE with high CVSS but no known active exploitation | P1 |
| Outdated dep, no known CVE but unmaintained | P2 |
| Missing audit in CI pipeline | P3 |
| New dep with postinstall script, no prior discussion | P2 |

## Source

Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.9.
