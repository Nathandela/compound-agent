# Playwright Test Patterns for Runtime Verification

## Overview
This reference provides code snippets and patterns for generating ephemeral Playwright tests during runtime verification. Tests are generated dynamically based on the project under review and executed against a running application instance.

## API Testing Patterns

### Basic Endpoint Smoke Test
```typescript
import { test, expect } from '@playwright/test';

test.describe('API Smoke Tests', () => {
  test('health endpoint responds', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
  });

  test('main API endpoint returns valid JSON', async ({ request }) => {
    const response = await request.get('/api/v1/resource');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeDefined();
  });
});
```

### Schema Validation Test
```typescript
import { test, expect } from '@playwright/test';

test('GET /api/users returns array with expected shape', async ({ request }) => {
  const response = await request.get('/api/users');
  expect(response.status()).toBe(200);
  const body = await response.json();

  // Validate top-level shape
  expect(body).toHaveProperty('data');
  expect(Array.isArray(body.data)).toBe(true);

  // Validate item shape (if non-empty)
  if (body.data.length > 0) {
    const item = body.data[0];
    expect(item).toHaveProperty('id');
    expect(typeof item.id).toBe('string');
  }
});
```

### Error Handling Test
```typescript
import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('invalid endpoint returns 404 not 500', async ({ request }) => {
    const response = await request.get('/api/nonexistent');
    expect(response.status()).toBe(404);
    // Should NOT be a 5xx server error
    expect(response.status()).toBeLessThan(500);
  });

  test('invalid input returns 400 with error message', async ({ request }) => {
    const response = await request.post('/api/resource', {
      data: { invalid: true }
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test('malformed JSON returns 400', async ({ request }) => {
    const response = await request.post('/api/resource', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not-json'
    });
    expect(response.status()).toBe(400);
  });
});
```

## UI Testing Patterns

### Page Load Smoke Test
```typescript
import { test, expect } from '@playwright/test';

test.describe('Page Load', () => {
  test('homepage renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);

    // Check for console errors
    expect(errors).toHaveLength(0);
  });

  test('main content area is visible', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('main, [role="main"], #app, #root');
    await expect(main).toBeVisible();
  });
});
```

### Navigation Test
```typescript
import { test, expect } from '@playwright/test';

test('primary navigation links are functional', async ({ page }) => {
  await page.goto('/');

  // Find all nav links
  const navLinks = page.locator('nav a[href]');
  const count = await navLinks.count();

  // Test each link responds (no 404/500)
  for (let i = 0; i < Math.min(count, 5); i++) {
    const href = await navLinks.nth(i).getAttribute('href');
    if (href && href.startsWith('/')) {
      const response = await page.goto(href);
      expect(response?.status()).toBeLessThan(500);
      await page.goBack();
    }
  }
});
```

### Form Validation Test
```typescript
import { test, expect } from '@playwright/test';

test('form shows validation errors on empty submit', async ({ page }) => {
  await page.goto('/form-page');

  // Try submitting empty form
  const submitButton = page.locator('button[type="submit"], input[type="submit"]');
  if (await submitButton.isVisible()) {
    await submitButton.click();

    // Check for validation feedback (either native or custom)
    const hasValidation =
      await page.locator('[aria-invalid="true"], .error, .invalid, :invalid').count() > 0;
    expect(hasValidation).toBeTruthy();
  }
});
```

## Accessibility Patterns

### axe-core Integration
```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('homepage passes automated accessibility checks', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag21a'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
```

### Basic Accessibility Checks (without axe-core)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Basic Accessibility', () => {
  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });

  test('page has exactly one h1', async ({ page }) => {
    await page.goto('/');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('interactive elements are keyboard-focusable', async ({ page }) => {
    await page.goto('/');
    const buttons = page.locator('button, a[href], input, select, textarea');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const tabIndex = await buttons.nth(i).getAttribute('tabindex');
      // tabindex should not be negative (which removes from tab order)
      if (tabIndex !== null) {
        expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
```

## Configuration Pattern

### Generated Playwright Config
```typescript
// playwright.config.ts (generated for runtime verification)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 120_000,        // 2 min per test (RV timeout)
  globalTimeout: 300_000,  // 5 min total suite (RV timeout)
  retries: 0,              // No retries for ephemeral tests
  reporter: [['json', { outputFile: 'rv-results.json' }]],
  use: {
    baseURL: process.env.RV_BASE_URL || 'http://localhost:3000',
    trace: 'off',          // No trace for ephemeral tests
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

## Project Detection Heuristics

### Web UI Detection
```
package.json dependencies containing:
  react, react-dom, vue, @angular/core, svelte, next, nuxt, gatsby, remix

OR changed files matching:
  **/*.html, **/*.jsx, **/*.tsx, **/*.vue, **/*.svelte
  **/pages/**, **/app/**, **/components/**
```

### HTTP API Detection
```
package.json dependencies containing:
  express, fastify, hono, koa, @nestjs/core

requirements.txt / pyproject.toml containing:
  flask, django, fastapi, starlette

go.mod containing:
  net/http (stdlib), gin-gonic/gin, labstack/echo, gofiber/fiber

Cargo.toml containing:
  actix-web, axum, rocket, warp

OR files containing:
  app.get(, app.post(, router.get(, @app.route(, @router.get(
  openapi.yaml, openapi.json, swagger.yaml, swagger.json
```

### CLI/Library Detection (SKIP triggers)
```
No web/API framework in dependencies
AND no HTML/template files in changed set
AND no HTTP route definitions in changed files

Common indicators:
  - main.go with cobra/urfave-cli but no net/http
  - src/lib.rs with no actix/axum
  - Python package with no flask/django/fastapi
  - npm package with "bin" field but no server framework
```

## Finding Format
All findings must match the standard reviewer output format:

```
## Runtime Verification Findings

### P1: Application returns 500 on valid GET /api/users
- **File**: src/routes/users.ts:45
- **Evidence**: Playwright test `api-smoke.spec.ts` line 12
- **Details**: Unhandled TypeError when users table is empty
- **Suggestion**: Add null check for empty result set

### P2: Response schema mismatch on POST /api/items
- **File**: src/routes/items.ts:78
- **Evidence**: Playwright test `schema-validation.spec.ts` line 23
- **Details**: Response missing `createdAt` field documented in OpenAPI spec
- **Suggestion**: Include timestamp in response serializer

### P3/INFO SKIPPED: Runtime verification skipped
- **Reason**: CLI project detected (go binary with cobra, no HTTP handlers)
```
