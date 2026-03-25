# Injection Pattern Reference

*February 23, 2026*

Actionable patterns for detecting injection vulnerabilities during code review.
Covers SQL, Command, XSS, SSRF, and SSTI (survey sections 4.1-4.5).

---

## SQL Injection (OWASP A03 -- P0/P1)

### Unsafe -- JS/TS
```typescript
// Template literal interpolation into SQL
const q = `SELECT * FROM users WHERE id = ${req.query.id}`;
db.query(q);

// String concatenation into SQL
db.query('SELECT * FROM users WHERE name = \'' + name + '\'');
```

### Safe -- JS/TS
```typescript
// Parameterized query
db.query('SELECT * FROM users WHERE id = $1', [req.query.id]);

// ORM with bound parameters (Knex example)
knex('users').where({ id: req.query.id });
```

### better-sqlite3 (project-specific)
```typescript
// UNSAFE: db.exec() has NO parameterization support
db.exec(`INSERT INTO items VALUES ('${userInput}')`);  // P0

// SAFE: Use db.prepare().run() with bound parameters
db.prepare('INSERT INTO items VALUES (?)').run(userInput);
```

### Unsafe -- Python
```python
# f-string in SQL
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# Percent formatting in SQL
cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)
```

### Safe -- Python
```python
# Parameterized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# ORM (SQLAlchemy)
session.query(User).filter(User.id == user_id).first()
```

---

## Command Injection (OWASP A03 -- P0)

### Unsafe -- JS/TS
```typescript
// exec invokes shell, allows metacharacter injection
const { exec } = require('child_process');
exec('convert ' + req.query.file + ' output.png');
```

### Safe -- JS/TS
```typescript
// execFile bypasses shell, arguments are array elements
const { execFile } = require('child_process');
execFile('convert', [req.query.file, 'output.png']);

// spawn with explicit args array
const { spawn } = require('child_process');
spawn('convert', [req.query.file, 'output.png']);
```

### Unsafe -- Python
```python
# shell=True allows metacharacter injection
import subprocess
subprocess.run("tar xf " + archive_name, shell=True)

# os.system always invokes shell
import os
os.system("tar xf " + archive_name)
```

### Safe -- Python
```python
# shell=False (default), args as list
import subprocess
subprocess.run(["tar", "xf", archive_name])

# shlex.quote if shell is unavoidable (rare, last resort)
import shlex
subprocess.run(f"tar xf {shlex.quote(archive_name)}", shell=True)
```

---

## Cross-Site Scripting / XSS (OWASP A03 -- P1)

### Unsafe -- JS/TS
```typescript
// Direct innerHTML assignment
element.innerHTML = userInput;

// Raw HTML in response
res.send('<div>' + req.query.name + '</div>');

// React escape hatch
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// Vue escape hatch
<div v-html="userInput"></div>
```

### Safe -- JS/TS
```typescript
// textContent does not parse HTML
element.textContent = userInput;

// Framework auto-escaping (React default)
<div>{userInput}</div>

// DOMPurify for cases requiring HTML
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
```

### Unsafe -- Python (Jinja2/Django)
```python
# Marking user input as safe bypasses auto-escaping
{{ user_input | safe }}

# Disabling auto-escape globally
app.jinja_env.autoescape = False
```

### Safe -- Python (Jinja2/Django)
```python
# Default auto-escaping (leave it enabled)
{{ user_input }}

# Explicit escaping if autoescape is off for some reason
{{ user_input | e }}
```

---

## Server-Side Request Forgery / SSRF (OWASP A10 -- P1, escalate to P0 for cloud metadata)

### Unsafe -- JS/TS
```typescript
// User-controlled URL passed directly to HTTP client
const response = await axios.get(req.query.url);
```

### Safe -- JS/TS
```typescript
// Allowlist validation before request
const ALLOWED_HOSTS = new Set(['api.example.com', 'cdn.example.com']);
const parsed = new URL(req.query.url);
if (!ALLOWED_HOSTS.has(parsed.hostname)) {
  return res.status(400).json({ error: 'Host not allowed' });
}
const response = await axios.get(parsed.toString());
```

### Unsafe -- Python
```python
# User-controlled URL with no validation
import requests
resp = requests.get(request.args['url'])
```

### Safe -- Python
```python
# Allowlist validation
from urllib.parse import urlparse

ALLOWED_HOSTS = {'api.example.com', 'cdn.example.com'}
parsed = urlparse(request.args['url'])
if parsed.hostname not in ALLOWED_HOSTS:
    abort(400, 'Host not allowed')
resp = requests.get(request.args['url'])
```

---

## Server-Side Template Injection / SSTI (OWASP A03 -- P0)

### Unsafe -- JS/TS (Nunjucks example)
```typescript
// User input as template source -- attacker controls template syntax
const nunjucks = require('nunjucks');
const output = nunjucks.renderString(req.body.template, { data: someData });
```

### Safe -- JS/TS
```typescript
// User input as data only, template is a constant
const nunjucks = require('nunjucks');
const output = nunjucks.render('page.njk', { data: req.body.data });
```

### Unsafe -- Python (Jinja2)
```python
# User input compiled as template source
from jinja2 import Template
output = Template(user_input).render()
```

### Safe -- Python (Jinja2)
```python
# Constant template, user input as render data only
from jinja2 import Template
output = Template("Hello {{ name }}").render(name=user_input)

# Or use SandboxedEnvironment for extra protection
from jinja2.sandbox import SandboxedEnvironment
env = SandboxedEnvironment()
template = env.from_string("Hello {{ name }}")
output = template.render(name=user_input)
```

---

## Detection Heuristics Summary

| API / Pattern | Language | Risk Level | Injection Type |
|---------------|----------|------------|----------------|
| `db.query` with template literal or concat | JS/TS | HIGH | SQL |
| `cursor.execute` with f-string or `%` format | Python | HIGH | SQL |
| `child_process.exec` with user input | JS/TS | HIGH | Command |
| `os.system`, `subprocess.run(..., shell=True)` with user input | Python | HIGH | Command |
| `innerHTML` assignment from user input | JS/TS | MEDIUM | XSS |
| `dangerouslySetInnerHTML`, `v-html` | JS/TS | MEDIUM | XSS |
| `{{ var \| safe }}` with user-sourced var | Python | MEDIUM | XSS |
| `axios.get(req.query.url)`, `requests.get(user_url)` | Both | HIGH | SSRF |
| `Template(user_input)` or `renderString(user_input, ...)` | Both | HIGH | SSTI |
| `eval()`, `new Function()` with user input | JS/TS | HIGH | Code injection |

## Source

Derived from [secure-coding-failure.md](secure-coding-failure.md) sections 4.1-4.5.
