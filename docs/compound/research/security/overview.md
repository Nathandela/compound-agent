# Security Review Overview

*February 23, 2026*

Quick-reference guide for AI code review agents performing security triage.
Distilled from [secure-coding-failure.md](secure-coding-failure.md) (survey section 4.10).

## Severity Classification

| Level | Label | Description | Examples |
|-------|-------|-------------|----------|
| **P0** | Critical | Unauthenticated RCE, credential compromise, mass data breach | Unauth command injection, leaked production DB credentials, unauth SQL injection yielding full table dump |
| **P1** | High | Auth-required exploit, targeted data breach, privilege escalation | Authenticated SQLi, IDOR exposing other users' data, JWT signature bypass |
| **P2** | Medium | Harder to exploit, limited blast radius | Reflected XSS requiring user interaction, SSRF blocked by network policy but code-level vuln present |
| **P3** | Hardening | Best practice gap, defense-in-depth improvement | Missing rate limiting, verbose error messages in staging, outdated dep with no known exploit path |

## OWASP Category to Default Severity

| OWASP Category | Default Severity | Escalation Condition |
|----------------|-----------------|----------------------|
| A01 Broken Access Control | P1 | Escalate to P0 if unauthenticated access to admin or sensitive data |
| A02 Cryptographic Failures | P1 | Escalate to P0 if plaintext credentials stored or transmitted |
| A03 Injection (SQL/Cmd/XSS/SSTI) | P0 (RCE) or P1 (data-only) | P0 if command/template injection yields RCE; P1 if SQLi yields data leak only |
| A04 Insecure Design | P2 | Escalate to P1 if missing security controls enable auth bypass |
| A05 Security Misconfiguration | P2 | Escalate to P1 if default credentials or debug mode exposed in production |
| A06 Vulnerable Components | P2 | Escalate to P0/P1 if CVE is actively exploited or yields RCE |
| A07 Auth Failures | P1 | Escalate to P0 if credential stuffing or brute force is trivially possible |
| A08 Software/Data Integrity Failures | P2 | Escalate to P0 if CI/CD pipeline compromise or unsigned updates possible |
| A09 Security Logging Failures | P3 | Escalate to P2 if no logging on auth events or admin actions |
| A10 SSRF | P1 | Escalate to P0 if cloud metadata endpoint (169.254.169.254) is reachable |

## Escalation Triggers

When the review agent detects one of the following patterns, it should invoke the
corresponding specialist skill for deeper analysis.

### /security-injection
Trigger when:
- String concatenation or template interpolation inside a SQL query
- `child_process.exec` or `os.system` called with user-derived arguments
- Template engine receives user input as the template source (not data)

### /security-secrets
Trigger when:
- Hardcoded strings matching API key or token patterns (see [secrets-checklist.md](secrets-checklist.md))
- `.env` files tracked in git
- Variables named `password`, `secret`, `token`, `apiKey` assigned string literals

### /security-auth
Trigger when:
- Route handlers missing auth middleware present on sibling routes
- Database queries using user-supplied IDs without ownership filter
- CORS configured with `origin: '*'` alongside `credentials: true`

### /security-data
Trigger when:
- Logging calls receive entire request objects (`console.log(req.body)`)
- Error handlers pass `err.stack` or `err.message` directly to HTTP response
- Tokens or PII appear in URL query parameters

### /security-deps
Trigger when:
- Lockfile changes introduce new direct dependencies
- Package version downgrades appear in diffs
- Packages with `postinstall` scripts are added
- Dependencies are 3+ major versions behind latest

## Domain-Specific References

| Domain | Reference Document |
|--------|--------------------|
| Injection (SQL, Cmd, XSS, SSRF, SSTI) | [injection-patterns.md](injection-patterns.md) |
| Secrets and credentials | [secrets-checklist.md](secrets-checklist.md) |
| Authentication and authorization | [auth-patterns.md](auth-patterns.md) |
| Data exposure and logging | [data-exposure.md](data-exposure.md) |
| Dependency and supply chain | [dependency-security.md](dependency-security.md) |

## Source

All patterns derived from the research survey:
[secure-coding-failure.md](secure-coding-failure.md) -- sections 4.1-4.10 and comparative synthesis.
