# Spec Development Quick Reference

> Loaded on demand by SKILL.md. Not always in context.

## Table of Contents

1. [EARS Notation](#ears-notation)
2. [Mermaid Diagram Selection](#mermaid-diagram-selection)
3. [NL Ambiguity Detection](#nl-ambiguity-detection)
4. [Trade-off Documentation](#trade-off-documentation)

---

## EARS Notation

EARS (Easy Approach to Requirements Syntax) reduces ambiguity by enforcing explicit conditions, triggers, and responses.

### Core Patterns

| Pattern | Template | Use When |
|---------|----------|----------|
| **Ubiquitous** | The system shall `<action>`. | Always-on behavior, no conditions |
| **Event-driven** | **When** `<trigger>`, the system shall `<action>`. | Response to a discrete event |
| **State-driven** | **While** `<state>`, the system shall `<action>`. | Behavior during a continuous state |
| **Unwanted behavior** | **If** `<condition>`, **then** the system shall `<action>`. | Error handling, recovery, edge cases |
| **Optional** | **Where** `<feature>`, the system shall `<action>`. | Configurable or feature-flagged behavior |

### Combined Pattern Ordering

When combining patterns, use this fixed ordering:

```
Where → While → When → If/then → the system shall <action>.
```

**Example (combined):**
> Where the premium tier is enabled, while the user is authenticated, when a file upload completes, the system shall generate a preview thumbnail within 2 seconds.

### Common EARS Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Missing trigger | "The system shall validate input" | Add **when**: "When the user submits the form, the system shall validate input" |
| Passive voice | "The data shall be encrypted" | Active: "The system shall encrypt all data at rest using AES-256" |
| Compound shall | "The system shall validate and store and notify" | Split into 3 separate requirements |
| Ambiguous quantities | "The system shall respond quickly" | Quantify: "within 200ms at p95" |
| Implementation in requirement | "The system shall use Redis to cache" | Intent: "The system shall cache responses with < 50ms retrieval" |

### EARS + Kiro SDD Integration

Kiro's Structured Design Documents use EARS for requirements. Map phases:

| Spec-Dev Phase | Kiro Equivalent | Output |
|----------------|-----------------|--------|
| Explore | Requirements gathering | User stories |
| Understand | EARS requirements | Structured requirements |
| Specify | Design document | Technical design |
| Hand off | Implementation tasks | Beads epic |

---

## Mermaid Diagram Selection

Use diagrams as **thinking tools** during spec development, not just documentation.

### Diagram Selection Matrix

| Diagram Type | Use During Phase | Best For | Syntax Start |
|-------------|-----------------|----------|--------------|
| `mindmap` | Explore | Domain concepts, stakeholder concerns | `mindmap` |
| `sequenceDiagram` | Understand | Workflows, API interactions, message flows | `sequenceDiagram` |
| `stateDiagram-v2` | Understand | Entity lifecycles, state machines | `stateDiagram-v2` |
| `erDiagram` | Specify | Data models, entity relationships | `erDiagram` |
| `C4Context` | Specify | System boundaries, external integrations | `C4Context` |
| `flowchart` | Specify | Decision logic, branching flows | `flowchart TD` |
| `requirementDiagram` | Hand off | Requirement traceability | `requirementDiagram` |

### Templates

**Discovery mindmap (Explore phase):**
```
mindmap
  root((Feature Name))
    Stakeholders
      User type A
      User type B
    Core Capabilities
      Capability 1
      Capability 2
    Constraints
      Performance
      Security
    Open Questions
      Question 1
```

**Workflow sequence (Understand phase):**
```
sequenceDiagram
    actor User
    participant System
    participant External

    User->>System: Action
    activate System
    System->>External: Request
    External-->>System: Response
    System-->>User: Result
    deactivate System
```

**Entity lifecycle (Understand phase):**
```
stateDiagram-v2
    [*] --> Created
    Created --> Active: validate
    Active --> Suspended: suspend
    Suspended --> Active: resume
    Active --> Archived: archive
    Archived --> [*]
```

**Data model (Specify phase):**
```
erDiagram
    ENTITY_A ||--o{ ENTITY_B : "has many"
    ENTITY_A {
        string id PK
        string name
        datetime created
    }
    ENTITY_B {
        string id PK
        string entity_a_id FK
        string status
    }
```

### Diagram Selection Heuristic

1. **Unsure what the domain looks like?** Start with `mindmap`
2. **Multiple actors interacting?** Use `sequenceDiagram`
3. **Entity with distinct states?** Use `stateDiagram-v2`
4. **Data with relationships?** Use `erDiagram`
5. **System boundaries unclear?** Use `C4Context`
6. **Branching decision logic?** Use `flowchart`

---

## NL Ambiguity Detection

Natural language requirements are prone to 9 types of ambiguity. Use this checklist during the Understand phase to catch them.

### Ambiguity Types and Detection

| Type | Signal Words | Example Problem | Fix Pattern |
|------|-------------|-----------------|-------------|
| **Lexical** | Words with multiple meanings | "The system shall *process* the order" (compute? handle? manufacture?) | Replace with domain-specific verb |
| **Structural** | Unclear modifier attachment | "fast file upload system" (fast upload or fast system?) | Restructure: "system that uploads files within 2s" |
| **Vagueness** | Gradable adjectives, no threshold | "large", "fast", "many", "reasonable" | Quantify: "< 200ms", "> 1000 items" |
| **Indexical** | Context-dependent references | "the user", "the system", "it", "this" | Name explicitly: "the authenticated user" |
| **Presupposition** | Assumes unstated facts | "When the cache is refreshed..." (assumes cache exists) | State prerequisite: "Given the system uses a cache..." |
| **Implicature** | Relies on implied meaning | "The system should handle errors" (log? retry? alert?) | Enumerate: "log to stderr, retry 3x, then alert ops" |
| **Speech act** | Unclear obligation level | "should", "may", "could", "might" | Use EARS shall/should hierarchy |
| **Context-dependent** | Meaning shifts by reader | "administrator" (system admin? org admin?) | Define roles in glossary |
| **Underspecification** | Missing information | "The system shall send notifications" (to whom? when? how?) | Fill blanks: who, what, when, where, how |

### Quick Scan Checklist

Run this on every requirement:

```
[ ] No vague adjectives without thresholds
[ ] No pronouns without clear antecedents
[ ] No passive voice hiding the actor
[ ] No compound "and/or" requirements (split them)
[ ] No implementation details (HOW vs WHAT)
[ ] All quantities specified (time, size, count)
[ ] All error/edge cases have unwanted-behavior patterns
[ ] Domain terms defined in glossary
```

### Red Flag Words

These words almost always signal ambiguity:

| Word | Problem | Replacement |
|------|---------|-------------|
| etc. | Undefined scope | List all items explicitly |
| appropriate | Subjective | Define criteria |
| user-friendly | Vague | Specify UX requirements |
| efficient | No threshold | "< X ms" or "< X MB" |
| handle | Ambiguous action | Specify: log, retry, reject, alert |
| support | Unclear scope | "The system shall allow X to Y" |
| various | Undefined set | Enumerate the set |
| some/any/all | Quantifier scope | Specify exact scope |

---

## Trade-off Documentation

When a spec contains competing requirements, document the trade-off explicitly using one of these frameworks.

### Framework Selection

| Framework | Use When | Output |
|-----------|----------|--------|
| **MCDA (Weighted Scoring)** | 3+ options, quantifiable criteria | Ranked list with scores |
| **Satisficing** | Need "good enough", hard constraints | First option meeting all thresholds |
| **Pareto Analysis** | 2-3 criteria, no clear weights | Set of non-dominated options |

### MCDA Template

```markdown
### Trade-off: [Decision Name]

| Criterion | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| Performance | 0.3 | 8 | 6 | 9 |
| Simplicity | 0.3 | 9 | 7 | 4 |
| Security | 0.2 | 7 | 9 | 8 |
| Maintainability | 0.2 | 8 | 5 | 6 |
| **Weighted Total** | | **8.1** | **6.6** | **6.7** |

**Decision**: Option A (highest weighted score)
**Rationale**: [Why these weights, what was considered]
```

### Satisficing Template

```markdown
### Trade-off: [Decision Name]

| Criterion | Threshold | Option A | Option B |
|-----------|-----------|----------|----------|
| Latency | < 200ms | 150ms OK | 300ms FAIL |
| Memory | < 512MB | 400MB OK | 200MB OK |
| Complexity | < 500 LOC | 300 OK | 800 FAIL |

**Decision**: Option A (first to satisfy all thresholds)
```

### Pareto Template

```markdown
### Trade-off: [Decision Name]

Options plotted on [Criterion 1] vs [Criterion 2]:

| Option | Performance | Simplicity | Dominated? |
|--------|-------------|------------|------------|
| A | High | Medium | No |
| B | Medium | High | No |
| C | Low | Low | Yes (by A and B) |

**Pareto set**: {A, B} -- present both to stakeholder for final choice.
```

### Combined Decision Flow

1. **Eliminate** dominated options (Pareto)
2. **Filter** by hard constraints (Satisficing)
3. **Rank** remaining options (MCDA)

This three-step flow prevents wasting time scoring options that fail hard constraints or are objectively worse on all dimensions.
