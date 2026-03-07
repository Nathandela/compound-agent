# The Big Picture: What Are These Papers About?

These 8 papers form a coherent body of research around one central question:

How do we precisely describe what software systems should do, and why is that so hard?

They attack this question from different angles. Here's how they fit together:

                    THE SPECIFICATION LANDSCAPE

    ┌─────────────────────────────────────────────────────────┐
    │                                                         │
    │   PROBLEM SPACE              SOLUTION SPACE             │
    │   (What do we need?)         (How do we express it?)    │
    │                                                         │
    │   ┌──────────────┐           ┌───────────────────┐      │
    │   │ Requirements │──────────>│ Formal Spec       │      │
    │   │ Engineering  │           │ Methods           │      │
    │   └──────┬───────┘           │ (TLA+, Alloy, Z)  │      │
    │          │                   └─────────┬─────────┘      │
    │          │                             │                │
    │   ┌──────▼───────┐           ┌─────────▼─────────┐      │
    │   │ Domain-Driven│           │ Design by         │      │
    │   │ Design       │──────────>│ Contract          │      │
    │   └──────┬───────┘           └─────────┬─────────┘      │
    │          │                             │                │
    │          │     WHY IT'S HARD           │                │
    │          │  ┌────────────────┐         │                │
    │          └──│ NL Ambiguity   │─────────┘                │
    │             └────────────────┘                          │
    │                                                         │
    │   DEEPER FOUNDATIONS         AT SCALE                   │
    │   ┌──────────────┐           ┌───────────────────┐      │
    │   │ Curry-Howard │           │ Systems Eng.      │      │
    │   │ (proofs =    │           │ (emergent         │      │
    │   │  programs)   │           │  behavior)        │      │
    │   └──────────────┘           └───────────────────┘      │
    │                                                         │
    │   WHEN OBJECTIVES CONFLICT                              │
    │   ┌──────────────────────────────────────┐              │
    │   │ Decision Theory & Multi-Criteria     │              │
    │   │ Trade-offs                           │              │
    │   └──────────────────────────────────────┘              │
    └─────────────────────────────────────────────────────────┘

---
# Paper by Paper: Key Concepts Explained

## 1. Requirements Engineering -- "What do we actually need?"

This is the starting point of any software project. Requirements Engineering (RE) is about discovering, writing down, and maintaining what a system should do.

Core insight: RE isn't one method -- it's 8 families of approaches, each with trade-offs:

    Accessibility                              Precision
    (anyone can                               (mathematically
    understand)                                rigorous)
        │                                         │
        ▼                                         ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
    │Interviews│  │Templates │  │Goal      │  │Formal   │
    │Scenarios │  │Standards │  │Models    │  │Methods  │
    │Stories   │  │Patterns  │  │Use Cases │  │Proofs   │
    └──────────┘  └──────────┘  └──────────┘  └─────────┘
    Easy to       Scalable     Systematic    Provably
    do, but       but rigid    but costly    correct but
    imprecise                                expert-only

Key takeaway: No single approach dominates. Teams combine methods based on risk. Safety-critical systems need formal methods; startups need lightweight stories. The pain points remain: incomplete
requirements, communication flaws, and volatile requirements.

---
## 2. Natural Language & Ambiguity -- "Why plain English specs fail"

This paper explains why writing specs is fundamentally hard. It's not a process problem -- it's a linguistic one. Natural language is inherently ambiguous.

The 9 sources of trouble:

┌──────────────────────┬───────────────────────────────────────────────────────────────┐
│        Source        │                       Example in a Spec                       │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Lexical ambiguity    │ "The system shall handle errors" (log? retry? ignore?)        │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Structural ambiguity │ "Every user reads some report" (same report? different ones?) │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Vagueness            │ "The system shall be fast" (how fast?)                        │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Indexicals           │ "The current user" (current when?)                            │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Presupposition       │ "Resume the process" (assumes it was running)                 │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Implicature          │ "Some tests passed" (implies not all)                         │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Speech acts          │ "The system should..." (obligation? suggestion?)              │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Context-dependence   │ Meaning shifts across teams/domains                           │
├──────────────────────┼───────────────────────────────────────────────────────────────┤
│ Underspecification   │ Deliberately leaving details open                             │
└──────────────────────┴───────────────────────────────────────────────────────────────┘

Key takeaway: Ambiguity isn't sloppy writing. It's built into how language works. You can't eliminate it -- you can only manage it by choosing the right level of formality for your context.

---
## 3. Domain-Driven Design -- "Speak the same language"

DDD tackles the gap between how domain experts think and how developers code. The thesis: projects fail not from bad specs, but from specs that encode a wrong understanding of the domain.

Three pillars:

    ┌──────────────────────────────────────────────┐
    │           UBIQUITOUS LANGUAGE                │
    │  A shared vocabulary used by EVERYONE:       │
    │  domain experts, devs, docs, and code        │
    │                                              │
    │  "Policy" means the same thing in meetings,  │
    │   in Jira tickets, AND in class names        │
    └────────────────────┬─────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
    ┌─────────────────┐   ┌───────────────────┐
    │ BOUNDED CONTEXTS│   │ SUBDOMAIN         │
    │                 │   │ CLASSIFICATION    │
    │ A boundary where│   │                   │
    │ one model and   │   │ Core: your edge   │
    │ one language    │   │ Supporting: needed│
    │ stay consistent │   │ Generic: buy it   │
    └─────────────────┘   └───────────────────┘

Why this matters for specs: If your "Order" means one thing in billing and another in shipping, your specification is already broken before you write a single line of formal logic. DDD ensures the conceptual foundation is right before you formalize anything.

---
## 4. Formal Specification Methods -- "Math instead of prose"

Once you understand the domain, how do you express behavior precisely? These four methods use mathematics:

                    BEHAVIORAL                    STRUCTURAL
                    (what happens                 (what exists
                     over time)                    and relates)
                        │                             │
        ┌───────────────┤                  ┌──────────┤
        ▼               ▼                  ▼          ▼
    ┌─────────┐    ┌─────────┐        ┌─────────┐  ┌──────┐
    │  TLA+   │    │   VDM   │        │  Alloy  │  │  Z   │
    │         │    │         │        │         │  │      │
    │Temporal │    │Stepwise │        │SAT-based│  │Schema│
    │logic +  │    │refine-  │        │bounded  │  │calc- │
    │set      │    │ment     │        │analysis │  │ulus  │
    │theory   │    │         │        │         │  │      │
    └─────────┘    └─────────┘        └─────────┘  └──────┘

    Concurrent      Abstract →         "Show me a    Modular
    systems,        Concrete,          counter-      math specs
    safety &        proof-driven       example"      for data-
    liveness                           exploration   intensive
                                                     systems

The core trade-off: Automation vs. Expressiveness

- Alloy: Fully automatic (SAT solver finds bugs for you), but only checks bounded scopes
- TLA+: Rich temporal reasoning, but model checking hits state explosion
- Z/VDM: Expressive and modular, but proof effort is manual

Key takeaway: Each lives in a different sweet spot. Use Alloy for fast "what-if" exploration, TLA+ for concurrent algorithm verification, Z/VDM for data-heavy systems with refinement paths.

---
## 5. Design by Contract -- "Agreements between code components"

DbC makes behavior explicit at the code level through three elements:

    CALLER                          CALLEE
    ──────                          ──────

    "I promise the input            "I promise the output
     is valid"                       is correct"
        │                               │
        ▼                               ▼
    ┌────────────┐    call    ┌────────────────┐
    │PRECONDITION│───────────>│ POSTCONDITION  │
    │            │            │                │
    │ x > 0      │            │ result = √x    │
    └────────────┘            └────────────────┘
                                    │
                             ┌──────▼──────┐
                             │  INVARIANT  │
                             │ (always     │
                             │  true)      │
                             │ balance >= 0│
                             └─────────────┘

The paper covers four levels of contracts:

1. Code-level DbC (Eiffel, JML): Pre/post/invariants in the language itself
2. Behavioral subtyping: Subtypes must honor parent contracts (Liskov principle)
3. Example-based specs (BDD/Gherkin): Given-When-Then scenarios as executable contracts
4. Component contracts: Assume-guarantee reasoning at architecture level

Key takeaway: Contracts work at every scale -- from a single function to an entire system architecture. The trade-off is always formality vs. accessibility: formal contracts enable proofs, BDD scenarios enable communication with stakeholders.

---
## 6. Curry-Howard Correspondence -- "Proofs ARE programs"

This is the deepest theoretical paper. Its insight is profound:

    LOGIC WORLD                    PROGRAMMING WORLD
    ───────────                    ─────────────────

    Proposition      ═══════════   Type
    Proof            ═══════════   Program
    Proof checking   ═══════════   Type checking
    Proof            ═══════════   Program
    simplification                 execution

    A → B            ═══════════   Function: A → B
    A ∧ B            ═══════════   Tuple: (A, B)
    A ∨ B            ═══════════   Either A or B
    ∀x.P(x)         ═══════════   Dependent function
    ∃x.P(x)         ═══════════   Dependent pair

What this means practically: Writing a type signature is stating a theorem. Writing a program that compiles is proving that theorem. A type checker is an automated proof verifier.

The paper traces this through 5 increasingly powerful systems:

    Simple types ──> Dependent types ──> HoTT
    (Haskell)        (Coq, Agda)        (cutting edge)
                                              │
    Linear logic ──> Session types            │
    (resources)      (protocols)              │
                                              ▼
    Classical logic via CPS            Types = Spaces
    (control flow = proof)             Proofs = Paths
                                       Equality = Equivalence

Key takeaway: This isn't just theory. Proof assistants like Coq and Agda use Curry-Howard to let you write programs that are mathematically guaranteed correct. The spec IS the code.

---
## 7. Systems Engineering -- "When the whole is more than the parts"

This paper tackles what happens at scale: individual components can each meet their specs perfectly, yet the whole system fails due to emergent behavior.

    Component A: ✓ meets spec     ┐
    Component B: ✓ meets spec     ├──> System: ✗ FAILS
    Component C: ✓ meets spec     │    (unexpected interaction)
    Interface AB: ✓ defined       │
    Interface BC: ✓ defined       ┘

    WHY? Implicit interfaces, resource contention, timing dependencies, environmental factors

Five approaches to manage this:

1. Lifecycle standards (NASA, DoD, ISO 15288): Structured processes with iterative verification
2. Interface management: ICDs, IRDs -- treating interfaces as first-class engineering objects
3. MBSE (SysML): Replace documents with analyzable models
4. Formal methods (CSP, model checking): Mathematically verify interaction properties
5. Emergent-behavior architectures: Design for monitoring and adapting to surprises

Key takeaway: No single technique catches everything. You need layers of defense: process governance + structural models + formal verification + runtime monitoring.

---
## 8. Decision Theory & Trade-offs -- "When you can't have it all"

Every spec involves trade-offs: performance vs. cost, security vs. usability, speed vs. accuracy. This paper presents three frameworks for handling them:

    MCDA                    PARETO                  SATISFICING
    "Score and rank"        "Show all options"      "Good enough"

    Criteria × Weights      Find the frontier       Set thresholds
         │                       │                       │
         ▼                       ▼                       ▼
    ┌──────────┐           ○ ○                      ─ ─ ─ ─ ─ ─
    │ Alt A: 87│          ○   ○  ← Pareto          threshold  │
    │ Alt B: 72│            ○   ○   frontier          │       │
    │ Alt C: 91│ ← pick      ○  ○                   ──┼───────┼──
    └──────────┘           ○  ○                       │  ✓    │
                                                   "first one │
                                                   that clears│
                                                   the bar"   │

    When: Regulatory       When: Design             When: Large
    decisions, clear       exploration,             search space,
    stakeholders           engineering              limited time

The fundamental tension: When do you commit to value judgments?
- MCDA: upfront (you assign weights first)
- Pareto: deferred (explore all efficient options, then choose)
- Satisficing: adaptive (set aspiration levels, adjust as you go)

---
# The Unifying Thread

All 8 papers converge on one insight: there is no silver bullet for specification. Every approach trades off along these axes:

    Formal ◄──────────────────────────► Informal
    (precise, verifiable,                (accessible, flexible,
    expensive, expert-only)              cheap, ambiguous)

    Upfront ◄──────────────────────────► Emergent
    (commit early,                       (discover as you go,
    stable but rigid)                    adaptive but risky)

    Local ◄────────────────────────────► Global
    (one component,                      (whole system,
    tractable)                           intractable)

The best practitioners combine approaches: lightweight elicitation to start, DDD to align language, formal methods for critical components, contracts for interfaces, and decision frameworks to navigate trade-offs. The papers collectively make a strong case that understanding why specification is hard (linguistics, logic, emergence, competing objectives) is the prerequisite for doing it well.