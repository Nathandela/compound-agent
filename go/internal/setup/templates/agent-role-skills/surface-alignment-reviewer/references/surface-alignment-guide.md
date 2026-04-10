# Surface Alignment Quick Reference

> Loaded on demand by SKILL.md. Not always in context.

## Table of Contents

1. [Regenerate-and-Diff Patterns by Stack](#regenerate-and-diff-patterns-by-stack)
2. [Architecture Test Tools by Language](#architecture-test-tools-by-language)
3. [Database Testing Fidelity Signals](#database-testing-fidelity-signals)
4. [Schema Evolution Guards](#schema-evolution-guards)
5. [Auth Surface Scanning Patterns](#auth-surface-scanning-patterns)

---

## Regenerate-and-Diff Patterns by Stack

### Detection: Is Regenerate-and-Diff in Use?

Look for these CI patterns:
- `git diff --exit-code` after a generation step
- `--check` flags (`prettier --check`, `graphql-codegen --check`, `makemigrations --check`)
- Makefile targets named `check-generate`, `verify-generated`, `sync-check`
- CI jobs named `schema-validation`, `type-check`, `api-sync`

### Stack-Specific Patterns

| Stack | Source of Truth | Derived Artifact | Verification Command |
|-------|----------------|------------------|---------------------|
| **Go** | Go source | `*_gen.go`, `*_string.go` | `go generate ./... && git diff --exit-code` |
| **Protobuf/gRPC** | `.proto` files | `*.pb.go`, `*_grpc.pb.go` | `buf generate && git diff --exit-code` or `buf breaking` |
| **OpenAPI → TypeScript** | Python/Go API | `api-generated.ts`, `types/` | Regenerate OpenAPI JSON → `openapi-typescript` → diff |
| **GraphQL** | Schema `.graphql` | `__generated__/`, `gql/` | `graphql-codegen --check` |
| **Django** | Models | Migration files | `python manage.py makemigrations --check` |
| **SQLAlchemy/Alembic** | Models | Alembic versions | `alembic check` or `pytest-alembic` |
| **Prisma** | `schema.prisma` | `@prisma/client` | `prisma migrate diff --exit-code` |
| **Rails** | Models | `db/schema.rb` | `rails db:migrate:status` |
| **Package lockfiles** | `package.json` etc. | `package-lock.json` etc. | `npm ci` (fails if out of sync) |

### Error Message Pattern

When reporting DRIFT findings, include a remediation command:

```
DRIFT: Generated artifact `frontend/types/api-generated.ts` is stale relative to 
backend API models. Run `cd backend && uv run python -c "..." | npx openapi-typescript 
--stdin -o ../frontend/types/api-generated.ts` and commit the result.
```

---

## Architecture Test Tools by Language

### Detection Matrix

| Language | Tool | Config File | Maturity |
|----------|------|-------------|----------|
| **Java/Kotlin** | ArchUnit | `*ArchTest*.java` in test/ | Very High |
| **Python** | import-linter | `.importlinter` or `[importlinter]` in setup.cfg | High |
| **Python** | pytestarch | `test_arch*.py` with `evaluable_architecture` | Low |
| **Python** | pytest-archon | `archrule()` calls in test files | Low |
| **JavaScript/TypeScript** | dependency-cruiser | `.dependency-cruiser.cjs` or `.dependency-cruiser.json` | High |
| **Go** | arch-go | `arch-go.yml` or `arch-go.yaml` | Medium |
| **.NET** | NetArchTest | `*ArchTest*.cs` in test/ | High |

### What to Check

1. **Layer rules exist**: Higher layers can import lower; lower cannot import upward
2. **Bounded context isolation**: Domain modules don't cross-import
3. **Framework isolation**: Domain/business logic doesn't import ORM/HTTP framework
4. **Cycle detection**: No circular dependencies between packages/modules
5. **Non-vacuous rules**: Rules match at least one element (empty rules pass silently)

### Setup Recommendations by Stack

**Go**:
```yaml
# arch-go.yml
dependenciesRules:
  - package: "internal/domain/**"
    shouldNotDependsOn:
      - "internal/infrastructure/**"
      - "internal/api/**"
```

**Python**:
```ini
# .importlinter
[importlinter:contract:layers]
type = layers
layers =
    myapp.api
    myapp.domain
    myapp.infrastructure
```

**JavaScript/TypeScript**:
```json
{
  "forbidden": [{
    "name": "no-domain-to-infra",
    "from": { "path": "^src/domain/" },
    "to": { "path": "^src/infrastructure/" }
  }]
}
```

---

## Database Testing Fidelity Signals

### Anti-Patterns to Detect

| Anti-Pattern | Detection | Severity |
|-------------|-----------|----------|
| **SQLite substitution** | `sqlite:///:memory:` or `sqlite3` in test config when prod uses PostgreSQL/MySQL | WEAK |
| **Mocked queries** | `mock.patch("app.db.query")`, `vi.mock("../db")` on data access | WEAK |
| **No DB in tests** | Test files import models but no DB fixture/setup | DISCONNECTED |
| **Factory without persist** | Only `build()` calls, never `create()` — tests never hit DB | WEAK |
| **H2 substitution** (Java) | `spring.datasource.url=jdbc:h2:mem` in test properties | WEAK |

### Positive Signals

| Signal | Detection | Rating |
|--------|-----------|--------|
| **Testcontainers** | `testcontainers` in dependencies, `@Testcontainers` annotation | GOOD |
| **Transaction rollback** | `@pytest.mark.django_db`, `@Transactional`, savepoint fixtures | GOOD |
| **Template database** | `pgtestdb`, `IntegreSQL` usage | GOOD |
| **Migration tests** | `pytest-alembic`, `flyway validate`, migration test files | GOOD |
| **Real connection string** | `postgresql://` or `mysql://` in test config | GOOD |
| **Factory with create** | `create()` calls that persist to real DB | GOOD |

### Migration Testing Checklist

- [ ] Single head test: exactly one migration head (no divergence)
- [ ] Upgrade test: migrations apply cleanly from base to head
- [ ] Model-DDL match: ORM models match actual DDL
- [ ] Up-down consistency: every migration is reversible
- [ ] Data migration tests: non-trivial data transformations have tests

---

## Schema Evolution Guards

### By Format

| Format | Tool | CI Command | What It Catches |
|--------|------|-----------|-----------------|
| **Protobuf** | Buf | `buf breaking --against .git#branch=main` | Field deletion, type changes, package renames |
| **OpenAPI** | oasdiff | `oasdiff breaking base.yaml revision.yaml` | Required field changes, endpoint removal |
| **GraphQL** | graphql-inspector | `graphql-inspector diff old.graphql new.graphql` | Field removal, type changes, argument changes |
| **Avro** | Confluent Schema Registry | Registry-level check at publish | Incompatible schema evolution |
| **Database** | Alembic/Flyway | `alembic check` / `flyway validate` | Stale migrations, checksum mismatch |

### Breaking Change Checklist

When reviewing schema changes:
- [ ] No required fields removed (or marked with deprecation + migration path)
- [ ] No type narrowing (string → enum, number → integer)
- [ ] Deleted fields have reserved numbers/names (protobuf)
- [ ] New required fields have defaults or migration backfill
- [ ] Expand-and-contract used for breaking structural changes
- [ ] Version bump if breaking (major semver)

---

## Auth Surface Scanning Patterns

### Dynamic Route Scanning Pattern

The gold standard (from Citadel's `test_auth_protection.py`):

```python
def get_all_routes(app):
    """Discover all registered routes dynamically."""
    routes = []
    for route in app.routes:
        if hasattr(route, "methods"):
            for method in route.methods:
                routes.append((method, route.path))
    return routes

PUBLIC_ROUTES = {"/health", "/docs", "/openapi.json", "/api/v1/public/"}

def test_all_routes_require_auth(client, app):
    for method, path in get_all_routes(app):
        if path in PUBLIC_ROUTES:
            continue
        response = getattr(client, method.lower())(path)
        assert response.status_code == 401, f"{method} {path} returns {response.status_code} without auth"
```

### Detection by Framework

| Framework | Auth Pattern | What to Check |
|-----------|-------------|---------------|
| **FastAPI** | `Depends(get_current_user)` | All non-public routes have dependency |
| **Express** | Middleware chain | Auth middleware before route handler |
| **Django** | `@login_required`, `IsAuthenticated` | Decorator/permission on all views |
| **Spring** | `@PreAuthorize`, SecurityConfig | Security config covers all endpoints |
| **Go (chi/gin)** | Middleware groups | Auth middleware on route groups |

### What to Flag

- New route without auth middleware → DISCONNECTED
- Route group missing auth but individual routes have it → WEAK (fragile)
- No dynamic route scanning test → WEAK (new unprotected routes can slip through)
- Public route list not maintained → DRIFT (public routes may accumulate)
