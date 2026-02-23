# Authentication & Authorization Patterns

*February 23, 2026*

Reference for AI agents reviewing access control in web applications.
Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.7.

---

## Authentication vs Authorization

- **Authentication**: Verifying *who* the caller is (identity). Handled by login flows, tokens, sessions.
- **Authorization**: Verifying *what* the caller can do (permissions). Handled by middleware, guards, ownership checks.

Most vulnerabilities occur in authorization -- the caller is authenticated but accesses
resources or operations they should not.

---

## Common Broken Patterns

### Missing Auth Middleware

Route handlers that lack an auth guard present on sibling routes.

```typescript
// Express -- unprotected route among protected ones
router.get('/api/users', authMiddleware, listUsers);
router.get('/api/users/:id', authMiddleware, getUser);
router.delete('/api/users/:id', deleteUser);  // BUG: missing authMiddleware
```

**Detection**: List all route registrations. Flag any route that omits auth middleware
when the majority of routes at the same path prefix include it.

### Insecure Direct Object Reference (IDOR)

User-supplied IDs used in queries without ownership verification.

```typescript
// Unsafe -- any authenticated user can access any order
app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  res.json(order);
});

// Safe -- ownership check included
app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  const order = await db.get(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});
```

**Detection**: Find DB queries that use a URL/body parameter as the primary filter but
do not include the authenticated user's ID in the WHERE clause.

### Role Escalation

Admin endpoints accessible with regular user tokens.

```typescript
// Unsafe -- no role check
app.post('/api/admin/promote', authMiddleware, promoteUser);

// Safe -- role guard added
app.post('/api/admin/promote', authMiddleware, requireRole('admin'), promoteUser);
```

**Detection**: Flag routes under `/admin` or similar prefixes that lack role-checking
middleware beyond basic auth.

### JWT Pitfalls

| Pitfall | Description |
|---------|-------------|
| No signature verification | Accepting tokens without calling `jwt.verify()` |
| Algorithm confusion | Accepting `alg: "none"` or switching from RS256 to HS256 |
| No expiry check | Missing `exp` claim validation, tokens valid forever |
| Secret in source code | JWT signing secret hardcoded (see [secrets-checklist.md](secrets-checklist.md)) |

### CORS Misconfiguration

```typescript
// Unsafe -- wildcard origin with credentials
app.use(cors({ origin: '*', credentials: true }));

// Unsafe -- reflecting request origin without validation
app.use(cors({ origin: req.headers.origin, credentials: true }));

// Safe -- explicit allowlist
app.use(cors({ origin: ['https://app.example.com'], credentials: true }));
```

---

## Framework-Specific Patterns

### Express / NestJS (JS/TS)

| Check | What to look for |
|-------|-----------------|
| Missing global guard | Routes outside `app.use(authMiddleware)` scope |
| NestJS missing `@UseGuards` | Controller methods without `@UseGuards(AuthGuard)` |
| Route ordering | Unprotected catch-all route registered before auth middleware |

### Django / FastAPI (Python)

| Check | What to look for |
|-------|-----------------|
| Missing `@login_required` | Django view functions without the decorator |
| Missing `Depends(get_current_user)` | FastAPI endpoints without auth dependency |
| Missing permission classes | DRF views with `permission_classes = []` or `AllowAny` on sensitive endpoints |
| Django `@csrf_exempt` | State-changing views exempted from CSRF without justification |

---

## Detection Approach

### Route Audit

1. Extract all registered routes (paths + HTTP methods).
2. For each route, check if auth middleware/decorator/guard is applied.
3. Flag routes that modify data (POST/PUT/PATCH/DELETE) without auth.
4. Flag routes that return user-specific data without auth.

### Ownership Check Audit

1. Find all DB queries that accept a user-supplied ID parameter.
2. Check if the query also filters by the authenticated user's ID.
3. If no ownership filter exists and the resource is user-scoped, flag as IDOR (P1).

## Source

Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.7.
