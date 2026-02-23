# Data Exposure Patterns

*February 23, 2026*

Reference for AI agents reviewing code for sensitive data leakage.
Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.8.

---

## PII in Logs

Logging calls that dump unfiltered request data or user records.

### Unsafe patterns

```typescript
// Logging entire request body (may contain passwords, tokens, PII)
console.log('Request:', req.body);
logger.info('User login', { body: req.body });

// Logging user records with sensitive fields
logger.info('User fetched', user);  // user object may include password_hash

// Logging authorization headers
console.log('Headers:', req.headers);  // includes Authorization: Bearer ...
```

```python
# Logging full request object
logging.info("Request: %s", request.json)

# Logging user record
logger.info("User: %s", user.__dict__)
```

### Safe patterns

```typescript
// Log only what you need
logger.info('User login', { userId: req.body.userId });

// Explicitly exclude sensitive fields
const { password, ...safeBody } = req.body;
logger.info('Request:', safeBody);
```

```python
# Log specific fields only
logger.info("User login: user_id=%s", request.json.get("user_id"))
```

---

## Verbose Error Responses

Stack traces and internal details sent to clients.

### Unsafe patterns

```typescript
// Stack trace sent to client
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

// DB connection string in error
catch (err) {
  res.status(500).json({ error: `DB error: ${err.message}` });
  // err.message may contain: "connection to postgres://user:pass@host:5432 failed"
}
```

```python
# Django DEBUG=True in production exposes full stack traces and settings
# Flask returning exception details
@app.errorhandler(500)
def handle_error(e):
    return {"error": str(e), "trace": traceback.format_exc()}, 500
```

### Safe patterns

```typescript
// Generic error to client, detailed error to logs
app.use((err, req, res, next) => {
  logger.error('Internal error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});
```

```python
@app.errorhandler(500)
def handle_error(e):
    app.logger.error("Internal error: %s", e)
    return {"error": "Internal server error"}, 500
```

---

## Sensitive Data in URLs

Tokens and PII in query parameters leak through referrer headers, browser history,
server logs, and proxy logs -- even with TLS.

### Unsafe patterns

```typescript
// Token in query string
app.get('/api/verify?token=abc123', verifyEmail);
// Leaks in: server access logs, browser history, Referer header

// PII in URL
app.get('/api/users?email=user@example.com', findUser);
```

### Safe patterns

```typescript
// Token in request body or header
app.post('/api/verify', verifyEmail);  // token in POST body

// Use path params for non-sensitive IDs only; sensitive data in body/headers
app.get('/api/users/:id', findUser);  // opaque ID, not email
```

---

## Overly Broad API Responses

Returning full database records instead of selecting specific fields.

### Unsafe patterns

```typescript
// Returns entire user record including internal fields
app.get('/api/users/:id', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  res.json(user);
  // Response includes: password_hash, internal_id, created_by_admin, etc.
});
```

```python
# Django serializer with all fields
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = '__all__'  # includes password_hash, is_superuser, etc.
```

### Safe patterns

```typescript
// Select only needed fields
const user = await db.get(
  'SELECT id, name, email FROM users WHERE id = ?',
  [req.params.id]
);
res.json(user);
```

```python
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email']
```

---

## Detection Heuristics

| Pattern to match | What it indicates | Severity |
|-----------------|-------------------|----------|
| `console.log(req.body)`, `console.log(req.headers)` | PII/credentials in logs | P2 |
| `logger.info(user)`, `logger.info(request.json)` | Unfiltered record in logs | P2 |
| Error handler returning `err.stack` or `err.message` to response | Internal details exposed to client | P2 |
| `DEBUG = True` in production config | Full stack traces and settings exposed | P1 |
| Query params named `token`, `key`, `auth`, `password`, `secret` | Sensitive data in URL | P2 |
| `SELECT * FROM` in API handler without field filtering before response | Overly broad response | P3 |
| `fields = '__all__'` in serializer for user-facing API | Internal fields in response | P2 |

## Source

Derived from [secure-coding-failure.md](secure-coding-failure.md) section 4.8.
