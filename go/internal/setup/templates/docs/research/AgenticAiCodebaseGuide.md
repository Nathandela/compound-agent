# Building Agentic AI-Prone Codebases: A Comprehensive Developer's Guide

A codebase optimized for agentic AI differs fundamentally from one designed purely for human teams. While human developers accumulate project knowledge over time, AI agents operate within fixed context windows and must work with explicit, accessible information. This guide distills research-backed practices and real-world patterns for structuring and maintaining codebases that leverage agentic AI at its best.

## Core Principles

The foundation of agentic AI-prone development rests on three interconnected principles:

**Clarity and Simplicity**: AI agents reason locally within their context window. When you minimize cognitive load on the agent, you improve both code generation quality and development velocity. Simple, straightforward code outperforms clever abstractions.

**Modularity and Decomposition**: Break systems into small, self-contained units with clear boundaries. This allows agents to reason about isolated problems without carrying excessive context. Monolithic files and tightly coupled systems force agents to maintain too much state simultaneously.

**Explicit Context and Observability**: Agents lack the intuitive knowledge humans develop. Documentation, logging, and type systems must be explicit and comprehensive. What seems obvious to you requires articulation for an agent.

---

## I. Codebase Architecture for Agentic Development

### A. Structural Organization

#### Modularity as First-Class Citizen

Design your codebase so each module has:

1. **Single Responsibility**: Each file or component should solve one specific problem
2. **Clear Public Interface**: Explicit APIs that define what the module exposes
3. **Localized Dependencies**: Minimize cross-module dependencies; when they exist, make them explicit
4. **Self-Contained Testing**: Tests should live near their code and run independently

For example, in a Python project:

```
# GOOD: Clear module boundaries
src/
├── auth/
│   ├── __init__.py          # Exports public API
│   ├── authenticator.py     # Single responsibility
│   ├── token_manager.py
│   ├── _internal.py         # Private implementation
│   └── test_authenticator.py
├── data/
│   ├── __init__.py
│   ├── loader.py
│   └── test_loader.py
└── processing/
    ├── __init__.py
    ├── transformer.py
    └── test_transformer.py

# AVOID: Monolithic structures
src/
├── utils.py                 # 2000 lines of mixed utilities
├── main.py                  # 1500 lines of mixed logic
└── test.py                  # Tests for everything
```

Agents struggle when a 1000-line file handles authentication, validation, data transformation, and logging simultaneously. Each agent call that touches this file must carry the entire context, wasting tokens and reducing clarity.

#### File Size and Function Length Guidelines

Enforce architectural limits through CI/CD rules:

- **Maximum file size**: 400-500 lines (enforced via ESLint, pylint)
- **Maximum function length**: 50-80 lines
- **Rationale**: Agents can reason more reliably about smaller scopes. They generate fewer hallucinations when operating on focused problems

Configure your linter:

```json
// .eslintrc.json example
{
  "rules": {
    "max-lines": ["error", { "max": 400, "skipBlankLines": true, "skipComments": true }],
    "max-lines-per-function": ["error", { "max": 80, "skipBlankLines": true }]
  }
}
```

When agents hit these limits during code generation, the structure signals that refactoring is needed—exactly the right moment for intervention.

#### Dependency Management as Architecture

Make your dependency graph visible and controllable:

```bash
# Tools like dependency-cruiser help agents understand relationships
npx dependency-cruiser --validate .dependency-cruiserrc.json

# Create explicit layer rules
# config/.dependency-cruiserrc.json restricts:
# - components cannot import from utils
# - services cannot import from UI
# - lib code cannot import from app
```

Agents often violate architectural boundaries unintentionally. Explicit rules fail fast, providing feedback the agent can learn from.

### B. Monorepo vs. Multi-Repo: An AI Perspective

**Modern AI context windows (128K to 1M tokens) favor monorepos** because agents can understand cross-component relationships within a single pass.

#### Monorepo Advantages for Agents

1. **Cross-cutting Understanding**: When writing a backend endpoint, the agent can see the matching frontend consumer and data model simultaneously
2. **Consistency Checking**: Style, configuration, and patterns stay synchronized across services because they're visible in one context
3. **Intelligent Refactoring**: Large-scale changes are safer when the agent sees all affected components

#### Multi-Repo Mitigation Strategies

If you use multiple repositories, adopt:

- **Shared Type Definitions**: Export TypeScript interfaces as npm packages so agents regenerate consistent contracts
- **OpenAPI Specifications**: Keep API contracts in git-versioned `.yaml` files; agents can reference these
- **Unified Documentation**: Maintain an `AGENTS.md` in every repo following the same specification
- **Consistent Configuration**: Lint rules, prettier configs, and test frameworks should be identical

### C. The AGENTS.md Specification

Create a file specifically designed for AI agents (separate from `README.md` which targets humans).

```markdown
# AGENTS.md

## Project Overview
Next.js 15 e-commerce platform. Frontend with React, backend with FastAPI.
Uses PostgreSQL + Redis. Deployment via Docker to AWS ECS.

## Architecture Summary
- `frontend/`: React SPA, TypeScript strict mode, Tailwind CSS
- `backend/`: FastAPI, async/await, Pydantic models
- `shared/`: Protocol Buffers for service communication

## Build & Test Commands
- **Install**: `make install` (runs pnpm install && pip install -r requirements.txt)
- **Dev server**: `make dev` (starts both services, logs to logs/dev.log)
- **Tests**: `pytest tests/ -v --cov=app` (branch coverage target: 90%)
- **Format**: `make format` (prettier + black + isort)
- **Lint**: `make lint` (eslint + pylint)
- **Type check**: `make typecheck` (tsc + mypy)

## Coding Standards

### Naming Conventions
- **Functions**: verb_noun pattern (e.g., `fetch_user_by_id`, `validate_email`)
- **Classes**: PascalCase, singular nouns (e.g., `UserValidator`, `OrderProcessor`)
- **Constants**: SCREAMING_SNAKE_CASE
- **Private members**: leading underscore (e.g., `_internal_helper`)

### Code Style
- TypeScript: ES2020+ syntax, no `var`, use `const` by default
- Python: PEP 8, type hints on all public functions
- Indentation: 2 spaces (frontend), 4 spaces (backend)
- Line length: 100 characters (strict)

### Error Handling Patterns
Always validate input before processing:
```python
def process_order(order_id: int) -> Order:
    if order_id <= 0:
        raise ValueError("order_id must be positive")
    # ...
```

Never catch bare exceptions:
```python
# DO
try:
    result = external_service.call()
except ExternalServiceError as e:
    logger.error(f"Service failed: {e}")
    raise

# DON'T
try:
    result = external_service.call()
except:
    logger.info("Something failed")
```

### Avoiding Common Anti-Patterns
1. **No helper functions that override class functionality** (agents often add these; ban them explicitly)
2. **No overly defensive fallback cases** for every imaginable interface variation
3. **No magical type coercion** without explicit documentation
4. **No circular imports** at any level

## Testing Requirements
- All public functions require unit tests
- Happy path + error cases + boundary conditions
- Use property-based testing for algorithms (Hypothesis library)
- Fixtures must be deterministic
- Test file naming: `test_<module>.py`

## Dependency Strategy
- Minimize external dependencies; prefer stdlib + 1-2 mature libraries per domain
- Never add dependencies without explicit business justification
- Version lock everything via requirements.txt and package-lock.json

## Documentation
- Every public module needs a module-level docstring
- Functions with more than 3 parameters need parameter descriptions
- Non-obvious algorithms need inline comments explaining the approach
- Architecture decisions recorded in ADRs (docs/adr/)

## Logs and Observability
In debug mode:
- Logs written to `logs/debug.log`
- Email sent during signup is logged: search logs for "email_token:"
- Database queries logged with execution time
- Agent can tail logs with: `tail -f logs/debug.log | grep <pattern>`

## Known Gotchas
- The database connection pool times out after 5 minutes of inactivity
- CORS headers required for all `/api/*` endpoints
- Email verification tokens expire after 24 hours (configurable in .env)
```

**Why AGENTS.md matters**: Agents process this file directly. It's specific, actionable guidance that fits their operating model. A good AGENTS.md reduces prompt refinement iterations by 30-40%.

---

## II. Code Organization Patterns

### A. Layered Architecture with AI-Friendly Boundaries

Structure your application with clear, non-negotiable layer separation:

```
src/
├── domain/                  # Business logic, models, rules
│   ├── user.py             # User entity and rules
│   ├── order.py
│   └── validators.py       # Domain validators
├── application/            # Use cases, orchestration
│   ├── create_order_use_case.py
│   ├── fetch_user_use_case.py
│   └── dto.py              # Data Transfer Objects
├── infrastructure/         # Technical concerns
│   ├── database.py
│   ├── email_service.py
│   └── external_apis.py
├── presentation/           # HTTP handlers, serialization
│   ├── user_handler.py
│   └── order_handler.py
└── tests/
    ├── unit/
    ├── integration/
    └── fixtures.py
```

**Why this structure helps agents**:
1. Agents understand that domain logic never imports infrastructure
2. Use cases are where orchestration happens; they never leak into domain
3. Tests clearly separate unit (fast, mocked) from integration (real services)

Enforce these boundaries with import rules:

```python
# In pyproject.toml (using pylint or similar)
# domain/ cannot import from any other layer
# application/ can only import from domain/
# infrastructure/ can import from domain/ and application/
# presentation/ can import from application/ and infrastructure/
```

### B. Component-Based Design

Treat each reusable unit as a component with explicit boundaries:

```typescript
// components/Button.tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export const Button = ({ label, onClick, variant = 'primary', disabled = false }: ButtonProps) => {
  // Clear props, explicit types, single responsibility
};

// components/UserCard.tsx
import { Button } from './Button'; // Reuse existing component

export const UserCard = ({ user }) => {
  return (
    <div>
      <h3>{user.name}</h3>
      <Button label="View Profile" onClick={() => navigate(user.id)} />
    </div>
  );
};
```

**Key for agents**: When components compose from existing components, agents learn to do the same. They avoid reinventing utilities and maintain consistency automatically.

### C. Avoiding Monolithic Structures

The worst situation for agents is a single 2000-line file handling multiple concerns:

```python
# BAD: src/app.py (2000 lines)
# Contains: authentication, validation, database queries, email sending, logging, error handling
# Agents either: refuse to touch it, or break something
```

When agents encounter such files, they:
1. Struggle to understand what they can safely modify
2. Generate changes that cause regressions
3. Require constant human intervention

**Refactoring monoliths for agents**:

1. **Extract by feature**: Identify logical sections within the monolith
2. **Create thin public interfaces**: Export only what's necessary
3. **Move step-by-step**: Multiple small PRs vs. one massive rewrite
4. **Use the strangler fig pattern**: Route new calls through new module, gradually migrate old calls

```python
# Step 1: Create auth.py with new structure
# Step 2: auth.py calls into old monolith for specific functions
# Step 3: Gradually migrate internal calls to auth.py
# Step 4: Monolith shrinks; auth.py expands
# Step 5: Delete monolith when empty
```

---

## III. Naming Conventions and Readability

Agents rely heavily on naming to infer intent. Poor naming forces them to read more code to understand context.

### A. Function Naming

**Principle**: Function names should express intent clearly. Err on the side of verbosity.

```python
# GOOD: Clear intent
def fetch_user_by_id(user_id: int) -> User:
    pass

def validate_email_format(email: str) -> bool:
    pass

def send_password_reset_email(email: str) -> None:
    pass

# AVOID: Ambiguous or abbreviated
def get_user(id):           # Which data source? All fields?
def check_email(e):         # Check what? Format? Existence?
def email_reset(email):     # Is this sending or consuming?
```

**Verb-noun pattern**: Start with action (verb), then object (noun). Agents learn this pattern and apply it consistently.

### B. Class and Type Naming

```typescript
// GOOD: Singular, clear purpose
class UserValidator { }
class OrderProcessor { }
class EmailNotificationService { }

// AVOID: Plural (ambiguous), vague
class UserHandlers { }       // Handler for what?
class Service { }            // What service?
class Processor { }          // Process what?
```

### C. Variable Naming

```python
# GOOD: Specific, contextual
users_with_active_subscriptions = filter_active_users(users)
valid_email_addresses = validate_emails(raw_emails)
retry_count = 3

# AVOID: Generic, requires reading surrounding code
result = filter_users(users)     # result of what?
data = validate(raw_data)        # what kind of data?
count = 3                        # count of what?
```

### D. Constant Naming

```python
# GOOD: SCREAMING_SNAKE_CASE for module-level constants
MAX_PASSWORD_LENGTH = 128
MIN_PASSWORD_LENGTH = 8
DEFAULT_RETRY_ATTEMPTS = 3
EMAIL_VERIFICATION_TIMEOUT_HOURS = 24

# In functions: local_snake_case
def send_email(address: str) -> None:
    retry_delay_seconds = 5
    for attempt in range(max_attempts):
        pass
```

---

## IV. Documentation for AI Agents

Documentation serves a different purpose when AI agents are your audience. Agents need specific, actionable information.

### A. Module-Level Documentation

```python
"""User authentication and session management module.

This module handles user login, JWT token generation, and session validation.
It does NOT handle password reset (see reset module) or user registration (see register module).

Public API:
- authenticate_user(): Validates credentials, returns JWT
- validate_session(): Checks token validity

Dependencies:
- database: User lookup
- crypto: JWT signing
"""
```

### B. Function Documentation

```python
def fetch_user_by_email(email: str) -> Optional[User]:
    """Retrieve user from database by email address.

    Args:
        email: User email address. Must be valid format (validated upstream).

    Returns:
        User object if found, None if not found.

    Raises:
        DatabaseConnectionError: If database is unreachable.
        ValueError: If email is empty string (should be validated before calling).

    Performance:
        O(1) lookup via indexed email field. ~10ms typical.

    Notes:
        Email comparison is case-insensitive (normalized at insert time).
        Does NOT validate email format; assumes validation happened upstream.
    """
```

**Why this matters for agents**:
- Explicit return types and exceptions mean agents know what to expect
- Performance notes help agents make optimization decisions
- Assumptions stated clearly prevent agents from re-validating

### C. Architecture Decision Records (ADRs)

Document why you made architectural choices. Agents that understand the reasoning make better decisions:

```markdown
# ADR: Why we use plain SQL instead of ORM

## Context
Backend queries required complex joins and subqueries. ORM abstractions became harder to read than raw SQL.

## Decision
Use plain SQL with Alembic migrations. Generate typed query results using dataclasses.

## Rationale
- SQL queries are testable and performant
- Agents can match SQL in logs to SQL in code
- Migrations are explicit and reviewable

## Consequences
- Must write query parameter validation explicitly
- New developers need SQL proficiency
- Performance is predictable and tunable
```

Agents reading this understand your constraints and apply them in new code.

### D. Avoiding Over-Documentation

**Agents struggle with documentation that's divorced from code**:

```python
# BAD: Outdated comment, AI gets confused
def create_order(user_id: int, items: List[Item]) -> Order:
    """
    This creates an order. Updated: Jan 2024.

    Note: This used to require payment authorization but we removed that
    in Q3 2023 (story #4521). Now payment is handled asynchronously.
    """
```

Instead, let code speak for itself or add inline comments only where non-obvious:

```python
def create_order(user_id: int, items: List[Item]) -> Order:
    """Create order without payment authorization (async payment via queue)."""
    order = Order(user_id=user_id, items=items, status='pending')
    self.db.save(order)
    self.payment_queue.enqueue(order.id)  # Clear: payment happens async
    return order
```

---

## V. Testing Strategies for Agentic Development

Agents need tests to validate their generated code. Well-structured tests become specification and validation layer simultaneously.

### A. Specification-First Testing

Write tests before asking agents to implement:

```python
# tests/test_user_authentication.py
def test_authenticate_user_with_valid_credentials():
    # Spec: Given valid email/password, return JWT token
    user = create_test_user(email="test@example.com", password="secure123")

    token = authenticate_user("test@example.com", "secure123")

    assert token is not None
    assert isinstance(token, str)

def test_authenticate_user_returns_none_for_invalid_password():
    # Spec: Given correct email but wrong password, return None
    create_test_user(email="test@example.com", password="secure123")

    result = authenticate_user("test@example.com", "wrongpassword")

    assert result is None

def test_authenticate_user_handles_nonexistent_email():
    # Spec: Given nonexistent email, handle gracefully
    result = authenticate_user("nonexistent@example.com", "anypassword")

    assert result is None
```

Agents see these tests as specification. They generate code to satisfy the tests.

### B. Property-Based Testing

Use property-based testing (Hypothesis in Python, Jest property checks in JS) to catch edge cases agents miss:

```python
from hypothesis import given, strategies as st

@given(
    email=st.emails(),
    password=st.text(min_size=8, max_size=128)
)
def test_authenticate_accepts_valid_input(email, password):
    # Spec: authenticate() accepts any valid email and reasonable password
    # This catches: encoding issues, special characters, edge cases
    user = create_test_user(email=email, password=password)

    token = authenticate_user(email, password)

    assert token is not None
```

Agents generating code see these properties and understand the expected robustness.

### C. Error Case Testing

Explicitly test error conditions:

```python
def test_authenticate_raises_on_database_error():
    """Spec: When database is unavailable, raise DatabaseError (don't return None)."""
    mock_db.side_effect = ConnectionError("DB unreachable")

    with pytest.raises(DatabaseError):
        authenticate_user("test@example.com", "password")

def test_authenticate_validates_email_format():
    """Spec: Reject invalid email formats before querying database."""
    # This ensures agents add validation, not just rely on database

    result = authenticate_user("invalid.email", "password")

    assert result is None
```

### D. Test Structure and Naming

```python
# Use AAA pattern (Arrange, Act, Assert)
def test_create_order_deducts_inventory():
    # Arrange: Set up initial state
    product = create_test_product(quantity=10)
    user = create_test_user()

    # Act: Perform the action
    order = create_order(user.id, [product])

    # Assert: Verify result
    refreshed_product = db.get_product(product.id)
    assert refreshed_product.quantity == 9

# Name tests as: test_<subject>_<condition>_<expected_outcome>
def test_create_order_with_insufficient_inventory_raises_error():
    pass

def test_create_order_with_valid_items_returns_order_with_pending_status():
    pass
```

Clear test names serve as specifications agents can follow.

---

## VI. Handling Errors and Edge Cases

AI-generated code often fails on edge cases. Proactive patterns prevent these failures.

### A. Explicit Input Validation

```python
# GOOD: Validate at function entry
def process_payment(amount: float, currency: str) -> bool:
    if amount <= 0:
        raise ValueError("amount must be positive")
    if currency not in SUPPORTED_CURRENCIES:
        raise ValueError(f"unsupported currency: {currency}")

    # ... now we know inputs are valid

# AVOID: Implicit assumptions
def process_payment(amount, currency):
    # Assumes amount > 0, currency is supported
    # Agents won't add these checks; they'll pass bad values through
```

### B. Defensive Programming at Boundaries

```python
# When receiving data from external sources
def handle_webhook(payload: dict) -> None:
    # External data is untrusted; validate everything
    if not isinstance(payload, dict):
        raise ValueError("payload must be dict")

    event_type = payload.get('type')
    if event_type not in VALID_EVENT_TYPES:
        raise ValueError(f"unknown event type: {event_type}")

    user_id = payload.get('user_id')
    if not isinstance(user_id, int) or user_id <= 0:
        raise ValueError("invalid user_id")

    # Now we can safely process
```

### C. Null/None Handling

```python
# GOOD: Handle None explicitly
def get_user_full_name(user_id: int) -> str:
    user = db.get_user(user_id)
    if user is None:
        raise UserNotFoundError(f"user {user_id} not found")

    return f"{user.first_name} {user.last_name}".strip()

# AVOID: Implicit None handling that crashes
def get_user_full_name(user_id):
    user = db.get_user(user_id)
    return f"{user.first_name} {user.last_name}"  # Crashes if user is None
```

### D. Timeout and Resource Limits

```python
def fetch_data_from_external_api(url: str) -> dict:
    """Fetch with explicit timeout and error handling."""
    try:
        response = requests.get(url, timeout=5)  # Explicit timeout
        response.raise_for_status()
        return response.json()
    except requests.Timeout:
        logger.error(f"API timeout fetching {url}")
        raise
    except requests.RequestException as e:
        logger.error(f"API error: {e}")
        raise
```

---

## VII. Language-Specific Considerations

### A. Python

**Strengths for agents**:
- Type hints (Python 3.9+) provide explicit contracts
- Simple syntax with less ambiguity
- Virtual environments keep dependencies isolated

**Challenges**:
- Async/await and event loops confuse agents
- Pytest fixture magic isn't obvious to agents
- Import system subtleties (relative imports, circular imports)

**Recommendations**:
- Always use type hints on public functions
- Avoid pytest fixtures; use direct test data creation instead
- Use explicit async patterns; avoid "magic" event loop management
- Prefer `asyncio` library functions agents have seen in training data

### B. JavaScript/TypeScript

**Strengths for agents**:
- TypeScript strict mode forces explicit types
- Clear async/await patterns
- Familiar frameworks (React, Next.js)

**Challenges**:
- JavaScript's implicit type coercion trips up agents
- Complex async patterns (promises, callbacks)
- Module system confusion (ES6 modules vs. CommonJS)

**Recommendations**:
- Use TypeScript strict mode; never allow `any`
- Prefer `async`/`await` over promise chains
- Use ES6 modules consistently
- Enforce linting rules strictly

### C. Go

**Why Go excels for agents**:
- Explicit error handling (no exceptions to guess at)
- Context parameter patterns are clear and consistent
- Simple syntax minimizes surprises
- Package structure is standard across codebases
- Low ecosystem churn

**Use Go for**:
- Backend services agents will modify frequently
- Infrastructure tools
- Data processing pipelines

### D. Avoid in Agentic Workflows

- **Rust**: Complex error handling, trait system, borrow checker create too much friction
- **Ruby**: Too much implicit magic; agents generate code that "works" but violates conventions
- **Perl**: Syntax ambiguity creates hallucinations

---

## VIII. Practical Workflows and Habits

### A. The Double-Loop Model

Structure your work around two distinct loops:

**Loop 1: Exploration (Vibe Coding)**
- Use agents for rapid feature exploration
- Don't worry about code quality yet
- Iterate on UX and functionality
- Explore multiple approaches in parallel (agents can parallelize)
- Fast iteration matters more than polish

**Loop 2: Refinement (Engineering)**
- Review generated code with engineering standards
- Refactor for clarity, performance, maintainability
- Add comprehensive tests if agent didn't
- Update documentation
- Ensure architectural patterns are followed

**Why this works**: Agents are great explorers but mediocre craftspeople. Use them for speed, then apply human judgment for quality.

### B. Prompt Engineering for Code Generation

Structure your prompts (when directly interacting with agents) using the S.C.A.F.F. pattern:

**S - Situation**: Context about the project and domain
```
"We're building a Python FastAPI backend for an e-commerce platform.
We use PostgreSQL for persistence and Redis for caching."
```

**C - Challenge**: The specific problem to solve
```
"Implement a function that fetches a user's order history,
including aggregated stats (total spent, average order value, most frequent category)."
```

**A - Audience**: Who will use this code
```
"This will be used by other backend engineers and potentially junior developers.
Keep it straightforward."
```

**F - Format**: Expected structure and style
```
"Follow our code style: type hints on all functions, error handling with explicit exceptions,
docstrings following Google style guide."
```

**F - Foundations**: Core principles and constraints
```
"The database query must run in under 100ms for a user with 1000+ orders.
Never perform N+1 queries. Use database aggregation functions, not Python loops."
```

### C. Setting Up for Parallelization

Agents work better when running in parallel on independent tasks:

```bash
# Bad: Sequential tasks create bottlenecks
# Good: Parallel agents on independent modules
Agent 1: Implement authentication module
Agent 2: Implement payment processing module
Agent 3: Implement notification service module

# Coordinate through explicit APIs
# Each agent knows exactly what data flows between modules
```

Use feature flags to prevent conflicts:
```python
# Agents can work on different features simultaneously
if FEATURE_FLAGS.new_recommendation_engine:
    recommendations = new_engine.get_recommendations(user_id)
else:
    recommendations = legacy_engine.get_recommendations(user_id)
```

### D. Observability and Debugging

Structure your code to provide observability:

```python
# Good: Structured logging that agents can understand
logger.info("order_created", extra={
    "user_id": user_id,
    "order_id": order.id,
    "total_amount": order.total,
    "item_count": len(order.items)
})

# During development, agents can read logs to debug
# Example: Agent adds logging output to help with iteration
```

### E. CI/CD Integration

Make your CI/CD pipeline a teaching tool for agents:

```yaml
# .github/workflows/quality.yml
name: Code Quality

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Lint
        run: make lint  # Fails immediately if rules violated

  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test
        run: pytest --cov=app --cov-fail-under=80

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - name: Type Check
        run: mypy app/
```

When agents see tests failing in CI, they learn the boundaries. This feedback loop is crucial.

---

## IX. Anti-Patterns to Avoid

### A. Over-Engineering with Unnecessary Abstraction

```python
# AVOID: Too many layers for a simple operation
class UserRepositoryFactory:
    def __init__(self, db_connection):
        self.connection = db_connection

    def create_repository(self):
        return UserRepository(self.connection)

# GOOD: Direct, simple
def get_user(user_id: int) -> User:
    return db.query(User).filter(User.id == user_id).first()
```

Agents see unnecessary abstractions and mimic them, creating confusing code.

### B. Magic Functions that Recreate Functionality

```python
# AVOID: Agents often add these
class User:
    def to_dict(self): return {...}
    def __dict__(self): return {...}
    def to_json(self): return {...}
    def serialize(self): return {...}

    # All doing the same thing in different ways!

# GOOD: One way, clearly named
class User:
    def to_dict(self) -> dict: return {...}
```

Ban these explicitly in AGENTS.md.

### C. Context Overload in Prompts

```python
# AVOID: Asking agents to consider 10 different edge cases in one prompt
"Implement a user authentication system that handles:
- Standard email/password
- OAuth2 with Google
- OAuth2 with GitHub
- Two-factor authentication
- Session management
- Token refresh
- Password reset
- Account recovery"

# GOOD: Break into smaller prompts
# Prompt 1: "Implement standard email/password authentication"
# Prompt 2: "Add OAuth2 support (Google)"
# Prompt 3: "Add OAuth2 support (GitHub)"
# etc.
```

Simpler prompts lead to better code. Agents do better with focused tasks.

### D. Ignoring Security in Initial Generation

```python
# AVOID: Assuming agents will add security
"Implement a user registration endpoint."

# GOOD: Explicit security requirements
"""Implement a user registration endpoint that:
- Validates email format and checks for duplicates
- Requires passwords 8-128 characters with character variety
- Never logs passwords
- Uses bcrypt for hashing (algorithm: bcrypt, cost: 12)
- Implements rate limiting (5 attempts per hour)
- Sanitizes all inputs
"""
```

---

## X. Scaling: When to Refactor

Agentic development changes when to refactor:

### A. Signs You Need Refactoring

1. **File size creeping**: When you next modify a file, it's already at size limits
2. **Circular dependencies**: Agents can't reason about circular imports
3. **Context complexity**: Feature requests take 3+ agent iterations
4. **Test failures**: Tests start failing unexpectedly despite code looking right

### B. Strategic Refactoring Points

Rather than refactoring continuously, refactor at decision points:

```markdown
## When to refactor for agents

1. **Before scaling to 2+ agents**: Ensure boundaries are clear
   - If agents will work on this simultaneously, extract it to separate modules

2. **After adding 50% more code**: Original structure might not hold 150% size
   - Profile: where are the dependencies? Can you split cleanly?

3. **When patterns repeat 3+ times**: Opportunities for component extraction
   - Agents should use existing components, not rewrite

4. **Before major feature work**: Clean foundation prevents downstream issues
   - Add comprehensive tests for current functionality
   - Untangle dependencies
   - Document what exists
```

### C. Preventing Refactoring Debt

Enforce refactoring discipline with guardrails:

```python
# In your CI/CD:
1. File size limits (max 400 lines)
2. Function complexity metrics (max 10 cyclomatic complexity)
3. Test coverage minimums (min 80% for modified files)
4. Dependency cycle detection (must pass in CI)
5. Type coverage (min 90% type hints in Python)
```

When limits are hit, agents know refactoring is needed before adding features.

---

## XI. Team Practices and Governance

### A. Code Review for AI-Generated Code

When reviewing agent-generated code, focus on:

1. **Architectural adherence**: Does it follow your layered structure?
2. **Edge cases**: Are error paths handled?
3. **Performance**: Will it scale? Any N+1 queries?
4. **Security**: Input validation, output sanitization?
5. **Consistency**: Does it match existing patterns?

Don't review for style; that's what linters are for.

### B. Prompt Library and Versioning

Create a shared prompt library:

```
prompts/
├── authentication.md
│   version: 1.2
│   last_updated: 2025-01-15
│   effectiveness: 95% (18/19 attempts successful)
├── payment_processing.md
├── email_sending.md
└── README.md (links to our AGENTS.md, architectural diagrams)
```

Version successful prompts. When agents (or teams) reuse them, add to their effectiveness rating.

### C. Documentation as Living Practice

Your AGENTS.md should evolve:

- **Weekly**: Update when new patterns emerge
- **Per-feature**: Add notes when something proved tricky
- **Quarterly**: Review against actual agent output; what do agents misunderstand?

---

## XII. Advanced Patterns

### A. Compositional Code Generation

Structure code so agents naturally compose from existing pieces:

```typescript
// Base component
export const Input = ({ value, onChange }: InputProps) => {...}

// Composed component (agents should do this, not rewrite Input)
export const SearchInput = ({ onSearch }: SearchInputProps) => {
  const [value, setValue] = useState('');

  return (
    <Input
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onSearch(e.target.value);
      }}
    />
  );
}
```

When agents see this pattern, they learn: reuse existing components, don't rebuild them.

### B. Executable Specifications (Property-Based Testing at Scale)

```python
# Define properties your system must maintain
PROPERTY_CONSTRAINTS = {
    "inventory_never_negative": lambda db: all(
        item.quantity >= 0 for item in db.all_items()
    ),
    "order_total_equals_sum_of_items": lambda db: all(
        order.total == sum(item.price for item in order.items)
        for order in db.all_orders()
    ),
    "user_email_is_unique": lambda db: len(db.all_users()) == len(set(u.email for u in db.all_users())),
}

# Agents generate code that must satisfy these properties
# Any violation triggers immediate test failure
```

### C. Feedback-Driven Refinement

Set up automated feedback loops:

```python
# After agent generates code:
1. Run tests
2. Check coverage (must be 80%+)
3. Run performance benchmarks (must be < previous avg)
4. Static analysis (no security warnings)
5. Type checking (100% typed)
6. Return report; agent refines based on failures
```

---

## XIII. Measuring Success

Track these metrics to understand your agentic workflow effectiveness:

### A. Velocity Metrics

- **Code generation success rate**: % of agent attempts that don't require human rework
- **Time to production**: Elapsed time from spec to merged code
- **Iteration count**: How many refinement loops before code is merge-ready

### B. Quality Metrics

- **Test coverage**: % of generated code covered by tests
- **Security issues**: Vulnerabilities found in agent-generated code (should trend toward zero with good prompts)
- **Performance**: Code performance vs. baseline
- **Tech debt**: Complexity, code duplication, architectural violations

### C. Team Metrics

- **Developer satisfaction**: Do developers feel productive?
- **Code review time**: Is AI-generated code faster to review?
- **Rework rate**: % of agent code that requires significant changes

---

## XIV. Future Adaptability

The agentic landscape evolves rapidly. Design for change:

### A. Principle of Least Surprise

Structure your code so agents from different models/vendors generate similar code. This means:
- Clear conventions over clever patterns
- Explicit over implicit
- Simple over abstract

### A. Tool Agnosticism

Avoid locking into one agent:

```python
# GOOD: Use AGENTS.md and clear patterns that work across tools
# Any competent agent can understand and follow them

# AVOID: Proprietary annotations or custom prompt syntax
# If tied to one tool, migration is expensive
```

### C. Continuous Learning

Track what works and what doesn't:

```markdown
## Prompt Patterns That Work Well
- Specification-first (tests before code): 95% success
- Chained prompts (step-by-step): 88% success
- Example-driven (show patterns): 85% success

## Anti-Patterns to Avoid
- Context overload: 40% success
- Implicit requirements: 50% success
- Magic frameworks (pytest fixtures, Rails conventions): 60% success

## Recent Learnings
- Go performs better than Python for concurrent services
- Modular frontend components reduce AI hallucinations
- Property-based testing catches AI edge cases that unit tests miss
```

---

## Conclusion

Building agentic AI-prone codebases is fundamentally about clarity, modularity, and explicit reasoning. The same practices that make code easier for humans to understand—good names, clear structure, explicit error handling—make it significantly easier for AI agents to generate and modify correctly.

The most successful teams with agentic AI:

1. **Invest in fundamentals**: Strong architecture, clear naming, comprehensive documentation
2. **Automate standards**: CI/CD rules enforce boundaries; agents learn from failures
3. **Iterate systematically**: Exploration phase (speed), refinement phase (quality)
4. **Measure and adapt**: Track what works; evolve practices based on evidence
5. **Treat documentation as code**: AGENTS.md, ADRs, and architectural diagrams are specifications agents follow

The code generated by competent agents today is indistinguishable from code written by competent human developers. The difference lies in preparation: how well you've structured your codebase to communicate intent, constraints, and patterns to an agent that reasons within fixed context windows.

Your codebase isn't just code anymore—it's a specification that agents execute against. Make it clear, make it explicit, make it modular. Do that, and agentic AI becomes a force multiplier rather than a liability.