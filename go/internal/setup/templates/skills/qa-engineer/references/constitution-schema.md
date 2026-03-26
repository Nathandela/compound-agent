# Testing Constitution Schema

> Loaded on demand. Read when you want to define persistent test definitions for repeated QA of the same pages.

## Overview

A testing constitution is a JSON file that describes what to test on a specific page. Constitutions are **optional** -- the QA Engineer skill works without them by using auto-discovery from the reconnaissance phase. Use constitutions when:

- You QA the same pages repeatedly and want consistent coverage
- You want to define specific boundary values for form fields
- You need to track which elements have been tested and which haven't

Constitutions live in `.qa/constitutions/` in the project root.

## Schema

```json
{
  "version": "1.0.0",
  "page": "/dashboard",
  "url": "http://localhost:3000/dashboard",
  "description": "Main dashboard page with charts and user settings",

  "smoke_checks": [
    "Page loads without console errors",
    "Dashboard heading is visible",
    "At least one chart renders",
    "Navigation sidebar is present"
  ],

  "elements": {
    "buttons": [
      {
        "name": "Save Settings",
        "selector": "button[type=submit]",
        "expected_behavior": "Saves form and shows success toast",
        "test_cases": [
          {"action": "click", "precondition": "form unchanged", "expected": "button disabled or no-op"},
          {"action": "click", "precondition": "form dirty", "expected": "saves and shows toast"},
          {"action": "double-click", "precondition": "form dirty", "expected": "saves once, not twice"}
        ]
      }
    ],

    "forms": [
      {
        "name": "User Profile",
        "selector": "form#profile",
        "fields": [
          {
            "name": "email",
            "selector": "input[name=email]",
            "type": "email",
            "required": true,
            "test_values": {
              "valid": ["user@example.com", "user+tag@example.com"],
              "invalid": ["notanemail", "@missing.com", "user@", ""],
              "boundary": ["a@b.co", "very-long-email-address-that-is-exactly-at-the-limit@extremely-long-domain-name.com"]
            }
          },
          {
            "name": "display_name",
            "selector": "input[name=display_name]",
            "type": "text",
            "required": false,
            "test_values": {
              "valid": ["Alice", "Bob Smith"],
              "invalid": [],
              "boundary": ["", " ", "A", "A very long display name that might overflow the UI container or exceed database column length limits and cause truncation issues"]
            }
          }
        ]
      }
    ],

    "navigation": [
      {
        "name": "Main Nav",
        "selector": "nav[role=navigation]",
        "links": [
          {"text": "Dashboard", "href": "/dashboard", "expected_status": 200},
          {"text": "Settings", "href": "/settings", "expected_status": 200},
          {"text": "Admin", "href": "/admin", "expected_status": 403, "note": "requires admin role"}
        ]
      }
    ]
  },

  "states_to_test": [
    {"name": "empty state", "condition": "no data loaded", "expected": "shows empty state message"},
    {"name": "loading state", "condition": "data fetch in progress", "expected": "shows skeleton or spinner"},
    {"name": "error state", "condition": "API returns 500", "expected": "shows error message with retry"}
  ],

  "accessibility": {
    "required_level": "AA",
    "focus_order": ["skip-link", "nav", "main-content", "footer"],
    "known_exceptions": []
  }
}
```

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Semver. Bump PATCH for selector fixes, MINOR for new elements, MAJOR for restructuring |
| `page` | Yes | Route path (e.g., `/dashboard`) |
| `url` | Yes | Full URL including port |
| `description` | No | Human-readable page description |
| `smoke_checks` | No | List of basic assertions (strings) |
| `elements` | No | Interactive elements organized by type |
| `elements.buttons[].test_cases` | No | Specific interaction scenarios |
| `elements.forms[].fields[].test_values` | No | Categorized input values for boundary testing |
| `states_to_test` | No | Application states that should be verified |
| `accessibility` | No | Accessibility testing configuration |

## Auto-Generation

When no constitution exists, the QA Engineer skill generates one from the reconnaissance phase. The auto-generated constitution includes:

1. All discovered buttons, forms, inputs, and links
2. Default smoke checks (page loads, no console errors, main content visible)
3. Default boundary values for common field types (email, text, number)

The generated constitution is written to `.qa/constitutions/<page-name>.json` and can be edited manually for subsequent runs.

## Using Constitutions

When a constitution exists for the page being tested:

1. Load the constitution before testing
2. Use the defined selectors (fall back to auto-discovery if a selector is broken)
3. Run all defined test_cases for each element
4. Test all test_values for form fields
5. Verify all smoke_checks
6. Test all states_to_test (may require API mocking)
7. Run accessibility checks at the specified level

If a selector in the constitution is broken (element not found), report it and attempt auto-discovery as a fallback. Update the constitution with the new selector if found.
