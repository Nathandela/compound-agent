# Secrets Detection Checklist

*February 23, 2026*

Reference for AI agents performing secret detection during code review.
Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.6.

---

## What Counts as a Secret

**Flag these:**
- API keys and access tokens (AWS, GCP, Azure, GitHub, Slack, Stripe, etc.)
- Passwords and passphrases
- Private keys (RSA, EC, PGP)
- Database connection strings with credentials
- JWT signing secrets
- Webhook secrets and HMAC keys
- OAuth client secrets

**Ignore these (not secrets):**
- Test fixtures prefixed with `test_`, `fake_`, `mock_`, `dummy_`
- Example placeholders: `YOUR_API_KEY_HERE`, `xxx`, `changeme`, `REPLACE_ME`
- Public keys (designed to be shared)
- Hash algorithm names or constants (`sha256`, `aes-256-cbc`)
- Empty strings assigned to secret-named variables (skeleton config)

---

## Common Hiding Spots

| Location | Detection Method |
|----------|-----------------|
| Source code (`.ts`, `.js`, `.py`) | Scan string literals and variable assignments |
| `.env` files committed to git | Check if `.env` is tracked (should be in `.gitignore`) |
| CI/CD config (`.github/workflows/*.yml`, `.gitlab-ci.yml`) | Scan for inline secrets vs `${{ secrets.X }}` references |
| Docker files (`Dockerfile`, `docker-compose.yml`) | Check `ENV` and `ARG` directives for credential values |
| Git history | Secrets removed from HEAD may persist in older commits |
| Config files (`config.json`, `settings.py`) | Scan for credential fields with literal values |

---

## Known Key Format Patterns

| Provider / Type | Regex Pattern |
|----------------|---------------|
| AWS Access Key | `AKIA[0-9A-Z]{16}` |
| AWS Secret Key | 40-char base64 string near `aws_secret_access_key` |
| GitHub PAT | `ghp_[a-zA-Z0-9]{36}` |
| GitHub OAuth | `gho_[a-zA-Z0-9]{36}` |
| GitHub App | `ghs_[a-zA-Z0-9]{36}` |
| Slack Bot Token | `xoxb-[0-9]+-[0-9a-zA-Z]+` |
| Slack User Token | `xoxp-[0-9]+-[0-9a-zA-Z]+` |
| Stripe Secret Key | `sk_live_[a-zA-Z0-9]{24,}` |
| Stripe Publishable | `pk_live_[a-zA-Z0-9]{24,}` (lower risk, still flag) |
| Google API Key | `AIza[0-9A-Za-z_-]{35}` |
| Private Key Header | `-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----` |
| Generic high-entropy | 20+ chars, mixed case + digits + special, not a known non-secret format |

---

## Variable Name Patterns to Flag

Scan assignment targets and object property names for these patterns (case-insensitive):

- `password`, `passwd`, `pwd`
- `secret`, `secret_key`, `secretKey`
- `token`, `access_token`, `accessToken`, `auth_token`
- `api_key`, `apiKey`, `api_secret`
- `credential`, `credentials`
- `private_key`, `privateKey`
- `connection_string`, `connectionString`, `database_url`, `databaseUrl`
- `signing_key`, `signingKey`, `hmac_key`

When a flagged variable name is assigned a string literal (not an env var reference or
placeholder), report it. If the value also matches a known key pattern, escalate to P0.

---

## Triage Rules

| Condition | Severity |
|-----------|----------|
| Known provider key format + production context | P0 |
| Generic high-entropy string in secret-named variable | P1 |
| `.env` file committed with credential values | P1 |
| Secret in CI config as inline value (not a secret ref) | P1 |
| Secret-named variable assigned a placeholder or empty string | P3 (informational) |

## Source

Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.6.
