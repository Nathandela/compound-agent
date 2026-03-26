# Browser Automation Patterns

> Loaded on demand. Read when you need detailed Playwright patterns for QA testing.

## Table of Contents

1. [Execution Model](#execution-model)
2. [Server Lifecycle](#server-lifecycle)
3. [Reconnaissance Patterns](#reconnaissance-patterns)
4. [Selector Strategy](#selector-strategy)
5. [Screenshot Capture](#screenshot-capture)
6. [Console and Error Capture](#console-and-error-capture)
7. [Network Request Capture](#network-request-capture)
8. [Viewport and Responsive Testing](#viewport-and-responsive-testing)
9. [Accessibility Testing with axe-core](#accessibility-testing-with-axe-core)
10. [Common Playwright Patterns](#common-playwright-patterns)

---

## Execution Model

Write Playwright scripts as standalone Python or Node.js files and execute them via the Bash tool. Use Playwright **library APIs** (code generation), NOT browser MCP tools (like get_screenshot, navigate, etc.). The library approach gives full control over browser lifecycle, network interception, and console capture that MCP tools cannot provide.

```python
# Python pattern (preferred for compound-agent projects)
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Attach listeners BEFORE navigation
    console_logs = []
    page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
    page.on('pageerror', lambda err: console_logs.append(f"[ERROR] {err}"))

    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')

    # ... testing actions ...

    browser.close()
```

**Headless by default** for speed. Use `headless=False` only when debugging visually. Set explicit viewport to ensure consistent screenshots.

**Timeout**: Set a 10-minute timeout on the Bash call (`timeout: 600000`). Individual page operations should timeout at 30 seconds. If a script hangs, the Bash timeout catches it.

## Server Lifecycle

### Starting a Dev Server

```python
import subprocess, time, requests

def start_server(cmd, port, timeout=30):
    """Start a dev server and wait for HTTP readiness."""
    process = subprocess.Popen(
        cmd, shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    # HTTP readiness check (not TCP!)
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(f'http://localhost:{port}', timeout=1)
            if r.status_code < 500:
                return process
        except requests.ConnectionError:
            time.sleep(1)

    # Timeout - capture diagnostics
    process.terminate()
    _, stderr = process.communicate(timeout=5)
    raise RuntimeError(
        f"Server failed to start on port {port} within {timeout}s.\n"
        f"stderr: {stderr.decode()[:500]}"
    )
```

Why HTTP, not TCP: a server can accept TCP connections while still initializing (loading routes, connecting to databases). An HTTP check confirms the server is actually serving requests.

### Framework Detection

Check these markers in order:

```python
import os, json

def detect_framework(project_root):
    """Detect web framework and return (command, port)."""
    pkg_path = os.path.join(project_root, 'package.json')
    if os.path.exists(pkg_path):
        with open(pkg_path) as f:
            pkg = json.load(f)
        scripts = pkg.get('scripts', {})
        deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}

        if 'vite' in deps:
            return ('npm run dev', 5173)
        if 'next' in deps:
            return ('npm run dev', 3000)
        if '@angular/core' in deps:
            return ('npm start', 4200)
        if 'react-scripts' in deps:
            return ('npm start', 3000)
        if 'dev' in scripts:
            return ('npm run dev', 3000)
        if 'start' in scripts:
            return ('npm start', 3000)

    if os.path.exists(os.path.join(project_root, 'manage.py')):
        return ('python manage.py runserver', 8000)
    if os.path.exists(os.path.join(project_root, 'app.py')):
        return ('python app.py', 5000)
    if os.path.exists(os.path.join(project_root, 'main.py')):
        return ('python main.py', 8000)  # FastAPI default

    # Fallback: static file server
    return ('python3 -m http.server 8000', 8000)
```

### Cleanup

Always stop the server when done:

```python
import signal

def cleanup_server(process):
    """Gracefully stop, then force kill if needed."""
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
```

## Reconnaissance Patterns

### Full Page Reconnaissance

```python
def reconnoiter(page, url):
    """Observe everything before acting."""
    page.goto(url)
    page.wait_for_load_state('networkidle')

    # Visual channel
    page.screenshot(path='/tmp/qa-recon.png', full_page=True)

    # DOM channel - enumerate interactive elements
    elements = page.evaluate('''() => {
        const result = { buttons: [], forms: [], inputs: [], links: [], navs: [] };

        document.querySelectorAll('button, [role="button"], input[type="submit"]')
            .forEach(el => result.buttons.push({
                text: el.textContent.trim().substring(0, 100),
                selector: el.id ? '#' + el.id : null,
                visible: el.offsetParent !== null
            }));

        document.querySelectorAll('form')
            .forEach(el => result.forms.push({
                action: el.action,
                method: el.method,
                fields: [...el.querySelectorAll('input, textarea, select')]
                    .map(f => ({ name: f.name, type: f.type, required: f.required }))
            }));

        document.querySelectorAll('a[href]')
            .forEach(el => result.links.push({
                text: el.textContent.trim().substring(0, 50),
                href: el.href,
                external: el.hostname !== window.location.hostname
            }));

        return result;
    }''')

    return elements
```

### Static HTML Shortcut

For static HTML files, read the file directly with the Read tool instead of launching a browser. Only fall back to browser automation if the HTML requires JavaScript to render.

## Selector Strategy

Use selectors in this priority order (most to least resilient):

1. **Text-based**: `page.click('text=Submit')` -- resilient to DOM refactoring
2. **Role-based**: `page.click('role=button[name="Submit"]')` -- semantic, accessible
3. **Label-based**: `page.fill('label=Email', 'test@example.com')` -- follows form semantics
4. **data-testid**: `page.click('[data-testid="submit-btn"]')` -- explicit test hook
5. **CSS selector**: `page.click('.btn-primary')` -- breaks when styles change
6. **XPath**: Last resort only

Why this order: text and role selectors match what the user sees. CSS classes are implementation details that change during refactoring. XPath is brittle and hard to read.

## Screenshot Capture

```python
# Full page (scrolls the entire page)
page.screenshot(path='/tmp/qa-full.png', full_page=True)

# Viewport only (what the user sees without scrolling)
page.screenshot(path='/tmp/qa-viewport.png')

# Specific element
page.locator('.error-message').screenshot(path='/tmp/qa-error.png')

# Multiple viewports for responsive testing
for width, name in [(375, 'mobile'), (768, 'tablet'), (1440, 'desktop')]:
    page.set_viewport_size({'width': width, 'height': 900})
    page.screenshot(path=f'/tmp/qa-{name}.png', full_page=True)
```

Always save screenshots to `/tmp/` with descriptive names. Reference them in the QA report.

## Console and Error Capture

Attach listeners **before** navigation to capture errors from initial page load:

```python
console_logs = []
page_errors = []

page.on('console', lambda msg: console_logs.append({
    'type': msg.type,
    'text': msg.text,
    'url': msg.location.get('url', '') if hasattr(msg, 'location') else ''
}))

page.on('pageerror', lambda error: page_errors.append(str(error)))

# Navigate AFTER attaching listeners
page.goto(url)
page.wait_for_load_state('networkidle')

# Classify console output
errors = [l for l in console_logs if l['type'] == 'error']
warnings = [l for l in console_logs if l['type'] == 'warning']
```

Console errors during normal operation are **P1 findings**. Console warnings are **P3** unless they indicate deprecation of a critical API.

## Network Request Capture

```python
network_log = []

def log_request(request):
    network_log.append({
        'method': request.method,
        'url': request.url,
        'resource_type': request.resource_type,
    })

def log_response(response):
    for entry in network_log:
        if entry['url'] == response.url and 'status' not in entry:
            entry['status'] = response.status
            break

page.on('request', log_request)
page.on('response', log_response)

# After testing, analyze:
failed = [r for r in network_log if r.get('status', 0) >= 400]
slow = []  # Timing requires performance API; flag based on user-observed latency instead
api_calls = [r for r in network_log if '/api/' in r['url']]
```

**What to flag:**
- 4xx/5xx responses during normal operation: **P1**
- Requests > 2 seconds: **P2**
- Excessive duplicate requests (N+1 pattern): **P2**
- CORS errors: **P1**
- Mixed content (HTTP on HTTPS page): **P1**
- Sensitive data in URLs (tokens, passwords in query strings): **P0**

## Viewport and Responsive Testing

Standard breakpoints to test:

```python
BREAKPOINTS = [
    (375, 812, 'iPhone SE'),
    (390, 844, 'iPhone 14'),
    (768, 1024, 'iPad'),
    (1024, 768, 'iPad landscape'),
    (1440, 900, 'Desktop'),
    (2560, 1440, 'Ultrawide'),
]

for width, height, name in BREAKPOINTS:
    page.set_viewport_size({'width': width, 'height': height})
    page.wait_for_timeout(500)  # Allow responsive reflow
    page.screenshot(path=f'/tmp/qa-responsive-{name.replace(" ", "-")}.png')
```

**What to check at each breakpoint:**
- No horizontal scrollbar (content fits viewport)
- Text is readable (not too small on mobile, not too wide on desktop)
- Navigation is accessible (hamburger menu on mobile, full nav on desktop)
- Touch targets are >= 44x44px on mobile viewports
- Images don't overflow their containers
- Tables have a mobile-friendly alternative (scroll or stack)

## Accessibility Testing with axe-core

If the project has `@axe-core/playwright` or you can install it:

```python
# Using axe-core via Playwright
results = page.evaluate('''async () => {
    // Inject axe-core if not already present
    if (!window.axe) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
    }
    return await axe.run();
}''')

violations = results.get('violations', [])
for v in violations:
    severity = {'critical': 'P0', 'serious': 'P1', 'moderate': 'P2', 'minor': 'P3'}
    print(f"[{severity.get(v['impact'], 'P3')}] {v['description']}")
    for node in v.get('nodes', []):
        print(f"  Element: {node.get('html', '')[:100]}")
```

Map axe-core impact to QA severity:
- `critical` -> **P0** (unusable for assistive technology users)
- `serious` -> **P1** (significant barrier)
- `moderate` -> **P2** (creates difficulty)
- `minor` -> **P3** (best practice)

## Common Playwright Patterns

### Wait for specific element

```python
# Wait for element to appear (auto-retry for 30s)
page.locator('.content-loaded').wait_for(state='visible')
```

### Fill a form

```python
page.fill('input[name="email"]', 'test@example.com')
page.fill('input[name="password"]', 'TestP@ss123!')
page.click('button[type="submit"]')
page.wait_for_url('**/dashboard')  # Wait for redirect after submit
```

### Handle file uploads

```python
page.set_input_files('input[type="file"]', '/tmp/test-upload.txt')
```

### Intercept and modify network

```python
# Block analytics/tracking
page.route('**/*analytics*', lambda route: route.abort())

# Mock an API response
page.route('**/api/users', lambda route: route.fulfill(
    status=200,
    content_type='application/json',
    body='{"users": [{"id": 1, "name": "Test User"}]}'
))

# Simulate slow API
import time
def slow_handler(route):
    time.sleep(3)
    route.continue_()
page.route('**/api/**', slow_handler)
```

### Keyboard navigation testing

```python
# Tab through interactive elements
page.keyboard.press('Tab')
focused = page.evaluate('document.activeElement.tagName + ":" + document.activeElement.textContent')
# Repeat, building a list of focus order

# Test Escape key on modals/dropdowns
page.keyboard.press('Escape')

# Test Enter key on focused buttons
page.keyboard.press('Enter')
```
