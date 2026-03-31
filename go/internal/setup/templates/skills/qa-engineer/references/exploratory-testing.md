# Exploratory Testing Playbook

> Loaded on demand. Read when SKILL.md directs you to Strategy 2 (Break Things).

## Table of Contents

1. [Philosophy](#philosophy)
2. [Boundary Value Testing](#boundary-value-testing)
3. [State Manipulation](#state-manipulation)
4. [Authentication Edge Cases](#authentication-edge-cases)
5. [Network Condition Testing](#network-condition-testing)
6. [Input Fuzzing Patterns](#input-fuzzing-patterns)
7. [Concurrency and Race Conditions](#concurrency-and-race-conditions)
8. [Error Recovery Testing](#error-recovery-testing)

---

## Philosophy

Exploratory testing is not random clicking. It is systematic hypothesis-driven testing: "If I do X in state Y, I expect Z. What actually happens?" The goal is to find bugs that structured test suites miss because they only test the happy path and a few known edge cases.

The best exploratory testers think adversarially but constructively. They ask: "What would a confused user do? What would a malicious user try? What happens when the network drops mid-request?"

Each section below provides concrete test actions. For every action, record:
- What you did (the input/action)
- What you expected
- What actually happened
- Severity if it's a bug

## Boundary Value Testing

### String Inputs
| Test | Input | Why |
|------|-------|-----|
| Empty string | `""` | Most common validation miss |
| Single space | `" "` | Passes "not empty" checks but is semantically empty |
| Very long string | 10,000 character string | Buffer overflows, UI overflow, database column limits |
| Unicode | `"你好世界🎉"` | Encoding issues, display problems |
| RTL text | `"مرحبا بالعالم"` | Layout direction bugs |
| Newlines in single-line field | `"line1\nline2"` | Injection, display issues |
| Leading/trailing whitespace | `"  value  "` | Trimming issues |
| Null bytes | `"hello\x00world"` | String termination bugs |
| HTML entities | `"&lt;script&gt;"` | Double-encoding issues |
| Path traversal | `"../../../etc/passwd"` | File access vulnerability |

### Numeric Inputs
| Test | Input | Why |
|------|-------|-----|
| Zero | `0` | Division by zero, falsy checks |
| Negative numbers | `-1`, `-999999` | Sign handling |
| Very large numbers | `999999999999999` | Integer overflow, display overflow |
| Decimal precision | `0.1 + 0.2` | Floating point display |
| Leading zeros | `007` | Octal interpretation |
| Scientific notation | `1e10` | Unexpected parsing |
| NaN-producing inputs | `"abc"` in number field | Type coercion bugs |

### Date/Time Inputs
| Test | Input | Why |
|------|-------|-----|
| Epoch boundary | `1970-01-01` | Zero-date handling |
| Far future | `2099-12-31` | Range validation |
| Leap day | `2024-02-29` | Calendar edge case |
| Invalid date | `2023-02-29` | Non-leap-year Feb 29 |
| Timezone boundary | `23:59:59` to `00:00:00` | Day rollover |

### File Uploads (if applicable)
| Test | Input | Why |
|------|-------|-----|
| Empty file | 0 bytes | Null handling |
| Very large file | 100MB+ | Size limits, timeout |
| Wrong extension | `.jpg` containing text | MIME type validation |
| Double extension | `file.jpg.exe` | Security bypass |
| Special chars in name | `file (1) [copy].txt` | Path handling |
| No extension | `README` | Type detection |

## State Manipulation

These tests exploit the fact that users don't follow the intended flow linearly.

### Navigation Attacks
- **Back button after form submission**: Does it resubmit? Show stale data? Crash?
- **Forward button after back**: Is state preserved correctly?
- **Refresh during loading**: Does the page recover? Is data lost?
- **Direct URL access**: Can you skip to step 3 of a wizard without completing steps 1-2?
- **Deep link to protected content**: Does auth redirect work? Does it return to the deep link after login?
- **Bookmark and return later**: Does the page still work with stale session state?

### Multi-Tab/Window Scenarios
- **Same form open in two tabs**: Submit in both -- does the second submission fail gracefully?
- **Login in one tab, use another**: Is the session shared correctly?
- **Logout in one tab**: Are other tabs invalidated?
- **Different users in different tabs**: Does session isolation work?

### Timing Attacks
- **Double-click submit button**: Does it create duplicate records?
- **Rapid consecutive actions**: Click delete-undo-delete rapidly
- **Slow input**: Type one character every 5 seconds -- do debounce/autocomplete features handle it?
- **Leave page idle for 30 minutes**: Does the session timeout gracefully?

### Browser State
- **Disabled JavaScript**: Does the page degrade gracefully or show a blank screen?
- **Disabled cookies**: Does the app explain why it needs cookies?
- **Clear localStorage mid-session**: Does the app recover or crash?
- **Fill form, then clear browser data, then submit**: What happens?

## Authentication Edge Cases

- **Access protected pages without login**: Should redirect to login, not 403 or crash
- **Access admin pages as regular user**: Should get 403, not a broken admin panel
- **Use expired token**: Should redirect to login, not show cryptic errors
- **Use modified token** (change a character): Should reject, not partially work
- **Login with email variations**: `User@example.com` vs `user@example.com` vs `user+tag@example.com`
- **Password with special characters**: `p@$$w0rd!#%&` -- do all characters survive encoding?
- **Empty password submit**: Should the form submit at all?
- **Login after account deletion/deactivation**: Clear error message, not server error
- **CSRF token reuse**: Submit a form with a previously used CSRF token
- **Concurrent sessions**: Login from two devices -- does session limit work?

## Network Condition Testing

Use Playwright's network throttling to simulate real-world conditions:

```javascript
// Simulate slow 3G
await page.route('**/*', route => {
  setTimeout(() => route.continue(), 2000); // 2s delay on every request
});

// Simulate offline
await page.route('**/*', route => route.abort('internetdisconnected'));

// Simulate flaky connection (50% failure rate)
let requestCount = 0;
await page.route('**/api/**', route => {
  if (requestCount++ % 2 === 0) {
    route.abort('connectionfailed');
  } else {
    route.continue();
  }
});
```

**What to check under degraded network:**
- Does the UI show loading indicators?
- Do API failures show user-friendly error messages (not raw JSON/stack traces)?
- Does retry logic work? Does it avoid infinite retry loops?
- Is there a timeout after which the app gives up gracefully?
- Does offline mode work if claimed?
- Are partial page loads handled (some API calls succeed, others fail)?

## Input Fuzzing Patterns

### Security-Focused Inputs
These are not exploit attempts -- they test whether the application correctly sanitizes and rejects dangerous input.

```
// XSS probes (should be displayed as text, not executed)
<script>alert('xss')</script>
<img onerror="alert('xss')" src="x">
javascript:alert('xss')
" onmouseover="alert('xss')

// SQL injection probes (should be treated as literal strings)
' OR '1'='1
'; DROP TABLE users; --
1 UNION SELECT * FROM users

// Command injection probes
; ls -la
| cat /etc/passwd
$(whoami)
`id`

// LDAP injection
*)(uid=*))(|(uid=*
```

For each probe: enter it into every text field on the page and verify it is displayed literally (as text), not interpreted. Check both immediate display and after page reload (stored XSS).

### Paste vs Type
Some applications validate on keypress but not on paste. For each input field:
1. Type the value character by character -- does validation trigger?
2. Paste the same value -- does validation still trigger?
3. Use autofill -- does the application handle programmatic input?

## Concurrency and Race Conditions

These require multiple rapid actions to trigger timing-dependent bugs:

- **Like/unlike rapid toggle**: Click 20 times in 2 seconds. Is the final state correct? Is the count accurate?
- **Add to cart from two tabs**: Does inventory tracking handle it?
- **Submit form while previous submit is in-flight**: Does the second request queue, fail gracefully, or create a duplicate?
- **Real-time updates + user action**: If a notification arrives while the user is typing, does it steal focus or corrupt input?
- **Pagination + data mutation**: Navigate to page 2, delete an item on page 1 (in another tab). Does page 2 shift correctly or show stale data?

## Error Recovery Testing

After causing an error, verify the application can recover:

- **After a server error (5xx)**: Can the user retry the action? Is the form state preserved?
- **After network timeout**: Does the UI return to a usable state?
- **After validation error**: Are previously entered (valid) fields preserved?
- **After session expiry**: Can the user re-authenticate and resume?
- **After JavaScript error**: Does the app still function? (Check console for unrecoverable errors)
- **After failed file upload**: Can the user try again without re-entering other form data?

The key question for each: "Can the user recover without refreshing the page?" If recovery requires a refresh, that's a P2. If recovery requires re-entering lost data, that's a P1.
