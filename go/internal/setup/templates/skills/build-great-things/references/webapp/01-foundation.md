# Phase 1: Foundation

**Scope:** Product vision, user mental models, information architecture for complex apps, design system strategy, and state architecture decisions. This phase answers the question: *before you write any code or push any pixels, what structural decisions determine whether the app will cohere or collapse at scale?*

---

## Planned Sections (V2)

- `product-vision-and-jobs.md` — Translating user jobs into product structure; mapping functional, social, and emotional job layers to interface surfaces
- `first-premium-slice.md` — Defining the canonical first-value journey that must feel complete before the app broadens; mapping the job to one vertical slice with happy path, edge states, trust signals, and finish criteria
- `mental-models-and-conceptual-design.md` — Building the user's conceptual model of how the app works; object-oriented UX; noun-verb mapping for complex domains
- `information-architecture.md` — IA for apps with thousands of states: hierarchy-breadth trade-offs, hybrid navigation structures, card sorting and tree testing, search-vs-browse strategy
- `design-system-strategy.md` — When to adopt, build, or extend a design system; Atomic Design as flexible metaphor; token architecture decisions (W3C DTCG spec); headless vs. composed component strategy
- `state-architecture.md` — Client state vs. server state vs. URL state; choosing between local-first, optimistic, and server-authoritative models; state machine foundations (Harel statecharts) for complex flows

---

## Key Principles

1. **Start from the job, not the feature.** Every structural decision should trace back to a user job. If you cannot articulate what job a screen serves, the screen should not exist. The JTBD framework (Christensen, Ulwick, Moesta) provides three complementary lenses: narrative strategy, quantitative opportunity sizing, and switch-interview signal for messaging.

2. **Define the first premium slice before the full system.** Before expanding breadth, identify one canonical journey that reaches first value and must feel complete end-to-end. This slice should include entry, core task flow, success state, loading/empty/error states, trust signals, and responsive behavior. Foundation decisions are good only if they support a shippable slice, not merely an elegant system map.

3. **IA is the skeleton; navigation is the skin.** Information architecture defines what the app *contains* and how concepts relate. Navigation is merely the visible expression of that structure. Designing navigation without IA produces interfaces that feel navigable at first but become disorienting at scale. Rosenfeld-Morville's four-component model (organization, labeling, navigation, search) remains the canonical decomposition.

4. **Design the mental model before designing the interface.** Users build a mental model of how your app works within the first few sessions. If that model is wrong or fragile, every subsequent feature compounds confusion. Norman's concept of the "design model" vs. the "user model" applies directly: your interface must communicate the system's conceptual structure, not merely its feature list.

5. **Token-first, not component-first.** A design system that starts with components produces beautiful inconsistency. One that starts with tokens (color, spacing, typography, motion) produces systematic coherence. The W3C Design Tokens specification (2025.10) provides the standard interchange format; the architectural decision is how many token tiers to maintain and how they map to themes and brands.

6. **State architecture is a product decision, not an engineering detail.** Whether your app is optimistic-update, server-authoritative, or local-first determines the entire UX of collaboration, offline behavior, conflict resolution, and perceived performance. This decision must be made at the foundation phase, not retrofitted.

7. **Strategic, not tactical (Ousterhout).** Ousterhout's distinction between strategic and tactical programming applies directly to foundation decisions. A tactical approach picks the first state management library that works; a strategic one evaluates the trade-offs between signals, atoms, server-state caches, and state machines against the app's collaboration model and offline requirements. Invest 10-20% more time in foundation decisions — it compounds throughout every subsequent phase.

8. **Design it twice.** Before committing to a state architecture, navigation structure, or design system strategy, sketch two meaningfully different approaches and compare their trade-offs. The first design that comes to mind is rarely the best — particularly for foundational decisions whose costs are amortized across the entire application lifecycle.

---

## Cross-References to Research

| Paper | Why it matters for this phase |
|-------|-------------------------------|
| [`docs/compound/research/design/web-apps/information-architecture-and-navigation.md`](docs/compound/research/design/web-apps/information-architecture-and-navigation.md) | Rosenfeld-Morville IA framework, hierarchy-breadth trade-off, command palette as third navigation paradigm, SPA wayfinding contract |
| [`docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md`](docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md) | Sweller's Cognitive Load Theory, Miller/Cowan working memory limits, Hick's Law for choice architecture — all constrain IA depth and breadth decisions |
| [`docs/compound/research/design/web-apps/design-systems-and-component-architecture.md`](docs/compound/research/design/web-apps/design-systems-and-component-architecture.md) | Atomic Design methodology, W3C DTCG token specification, multi-tier token layering, headless vs. composed component strategy, governance models |
| [`docs/compound/research/b2c_product/jobs-to-be-done-theory.md`](docs/compound/research/b2c_product/jobs-to-be-done-theory.md) | Three JTBD schools (Christensen narrative, Ulwick ODI, Moesta switch interview), Forces of Progress model, functional/social/emotional job layers |
| [`docs/compound/research/development/software-design/philosophy-of-software-design.md`](docs/compound/research/development/software-design/philosophy-of-software-design.md) | Strategic vs. tactical programming, complexity as root cause, design-it-twice metacognitive practice — the intellectual foundation for investing in foundation-phase decisions |
| [`docs/compound/research/development/web-apps/state-management-architecture.md`](docs/compound/research/development/web-apps/state-management-architecture.md) | Client/server/URL state taxonomy, signals vs. atoms vs. stores, state machines for UI, SSR hydration, cross-tab synchronization — grounds the state-architecture decision |
| [`docs/compound/research/development/web-apps/optimistic-ui-local-first-patterns.md`](docs/compound/research/development/web-apps/optimistic-ui-local-first-patterns.md) | CRDTs, sync engines (Replicache, ElectricSQL), optimistic mutation patterns, conflict resolution — the engineering landscape for local-first state architecture |

---

## Key Questions This Section Will Answer

- How do you translate a JTBD analysis into an information architecture? What is the concrete mapping from job layers to navigation surfaces?
- What is the single vertical slice that should be brought to premium quality first? What are its entry point, first-value moment, success criteria, and required edge states?
- When should you invest in a custom design system vs. adopting an existing one (Radix, shadcn/ui, Spectrum)? What signals indicate the tipping point?
- How do you choose between flat IA (high discoverability, choice overload risk) and deep IA (low complexity per level, disorientation risk)? What does the empirical evidence from card sorting and tree testing actually show?
- What is the right state architecture for your app's collaboration model? When is local-first (CRDTs) justified vs. simple optimistic updates vs. server-authoritative state?
- How do you design an IA that supports both directed search and exploratory browsing — the two modes that information-foraging theory (Pirolli & Card) identifies as fundamental?

---

## Foundation Artifact: First Premium Slice Brief

Before leaving Foundation, write down the first slice that the app must make feel complete. This is the slice that should be built and verified before broadening the app's surface area.

Include:

- **Job statement** — what user job this slice serves
- **Entry point** — where the user starts the journey
- **First-value moment** — the moment the app proves its value
- **Success signal** — what the user sees when the journey completes correctly
- **Edge states** — loading, empty, partial, error, permission, and offline/degraded conditions relevant to the slice
- **Trust signals** — copy, feedback, previews, confirmations, latency handling, and error recovery that make the flow feel safe
- **Responsive expectations** — what must remain excellent on mobile, tablet, and desktop
- **Measurement hooks** — the events or signals that will later confirm the slice is actually working in production

If the team cannot define this brief, it is usually a sign that the architecture is expanding before the product has a coherent first experience.

---

# References: Foundation

## Primary Sources

Read these for deep theoretical grounding on this phase's topics.

| Topic | Paper | Path |
|-------|-------|------|
| Information architecture and navigation | Information Architecture and Navigation | `docs/compound/research/design/web-apps/information-architecture-and-navigation.md` |
| Cognitive load and attention design | Cognitive Load and Attention Design | `docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md` |
| Design systems and component architecture | Design Systems and Component Architecture | `docs/compound/research/design/web-apps/design-systems-and-component-architecture.md` |
| Jobs-to-be-done theory | Jobs-to-Be-Done Theory | `docs/compound/research/b2c_product/jobs-to-be-done-theory.md` |
| Software design philosophy | A Philosophy of Software Design: Principles, Evidence, and Competing Perspectives | `docs/compound/research/development/software-design/philosophy-of-software-design.md` |
| State management architecture | State Management Architecture for Web Applications | `docs/compound/research/development/web-apps/state-management-architecture.md` |

## Supplementary Sources

Consult these for specific questions or adjacent concerns.

| Topic | Paper | Path |
|-------|-------|------|
| Consumer behavioral psychology | Consumer Behavioral Psychology | `docs/compound/research/b2c_product/consumer-behavioral-psychology.md` |
| Design thinking and ethnographic research | Design Thinking and Ethnographic Research | `docs/compound/research/b2c_product/design-thinking-ethnographic-research.md` |
| State, forms, and complex flow UX | State, Forms, and Complex Flow UX | `docs/compound/research/design/web-apps/state-forms-and-complex-flow-ux.md` |
| Optimistic UI and local-first patterns | Optimistic UI and Local-First Patterns for Web Applications | `docs/compound/research/development/web-apps/optimistic-ui-local-first-patterns.md` |
