# Phase 5: Performance & Polish

**Scope:** Perceived performance, skeleton screens, optimistic UI, empty/error/loading states, accessibility, and offline resilience. This phase answers the question: *how do you make the app feel fast, handle every edge state gracefully, and work for everyone — including users on slow networks, with disabilities, or in unexpected conditions?*

---

## Planned Sections (V2)

- `perceived-performance.md` — The psychology of waiting (Maister's eight propositions, Attentional Gate Model); 0.1/1/10s thresholds; skeleton screens and their mixed empirical record; progress indicators vs. spinners; the RAIL model and Core Web Vitals (LCP, INP, CLS)
- `optimistic-ui.md` — Local mutation with server reconciliation; optimistic updates for common actions (create, update, delete); rollback patterns for failed mutations; conflict resolution strategies; local-first architecture as the optimistic UI endpoint
- `edge-states.md` — Empty states as onboarding surfaces; error states that preserve user work and suggest recovery; loading states at component, route, and app levels; partial failure (some data loaded, some failed); timeout and retry patterns
- `accessibility.md` — WCAG 2.2 AA as the baseline, not the ceiling; semantic HTML as the foundation; ARIA as the supplement, not the replacement; keyboard navigation architecture; screen reader testing methodology; cognitive accessibility (plain language, consistent layout, error prevention); focus management in SPAs
- `offline-and-resilience.md` — Service worker strategies (cache-first, network-first, stale-while-revalidate); the Speculation Rules API for instant navigation; progressive enhancement as architectural strategy; Network Information API for adaptive loading; handling degraded conditions (slow network, stale cache, partial offline)
- `experience-verification.md` — Converting polish into ship gates; defining canonical user journeys; browser-based verification across breakpoints; screenshots and recordings as evidence; console/network cleanliness; proving that loading, empty, partial, error, and success states all work in a running product

---

## Key Principles

1. **Perceived performance is as commercially significant as actual performance.** The psychology research is clear: subjective duration is highly malleable. Maister's propositions (occupied time feels shorter than unoccupied time, uncertain waits feel longer than certain waits, unexplained waits feel longer than explained waits) translate directly to design interventions that can rival infrastructure improvements in their impact on user satisfaction and conversion. A two-second wait with a skeleton screen feels fundamentally different from a two-second blank screen.

2. **Every state is a design surface.** A web app has at least five states for every data-dependent view: loading, empty, partial, complete, and error. Most apps design only for the complete state and leave the other four to framework defaults (blank screens, generic error pages, console warnings). Treating empty states as onboarding opportunities, loading states as communication moments, and error states as trust-building surfaces transforms edge cases into quality signals.

3. **Polish must be falsifiable.** Claims like "this feels premium" are meaningless unless they are backed by evidence from a running product. For user-facing work, the definition of done includes browser-based verification of canonical user journeys, screenshots across breakpoints, clean console and network behavior, accessibility checks, and proof that non-happy-path states are handled. If quality cannot be demonstrated, it is not yet quality.

4. **Accessibility is a structural requirement, not a compliance checkbox.** WCAG 2.2 Level AA provides the minimum standard; genuine inclusive design goes beyond compliance to consider cognitive accessibility, motor impairment accommodation, and the full spectrum of sensory capability. Semantic HTML handles approximately 80% of accessibility requirements for free — the remaining 20% (ARIA roles, live regions, focus management in SPAs, keyboard trap prevention) requires deliberate engineering. The disability models research (social model, medical model, ICF biopsychosocial model) matters because it determines whether you treat accessibility as "fixing users" or "fixing environments."

5. **Optimistic UI is a spectrum, not a binary.** At one end: fire-and-forget local mutations with background sync. At the other: server-authoritative state with loading spinners for every action. The right position on this spectrum depends on the cost of inconsistency (low for a "like" button, high for a financial transaction), the frequency of the action, and the user's expectation of immediacy. Local-first architecture (CRDTs, sync engines) represents the endpoint of the optimistic spectrum, enabling full offline capability at the cost of conflict resolution complexity.

6. **Progressive enhancement is an architecture, not a fallback.** Building from a functional baseline (semantic HTML, server-rendered content) and layering enhancements (JavaScript interactivity, service workers, speculation rules) produces apps that degrade gracefully under any condition — slow network, disabled JavaScript, assistive technology, legacy browser. This is not idealism; it is the only strategy that handles the combinatorial explosion of device/network/capability states that real users encounter.

7. **Define errors out of existence (Ousterhout).** The best error message is one that never needs to appear. Before designing error handling for a form field or flow, ask: can this error be eliminated entirely? Constrained input types (`<input type="email">`, date pickers, dropdowns), smart defaults, autofill, and type coercion can remove entire categories of validation errors. For the errors that remain, design for recovery — preserve user work, explain what happened, and offer a clear next action. The goal is an error surface area that shrinks with each design iteration, not one that grows with each new feature.

---

## Cross-References to Research

| Paper | Why it matters for this phase |
|-------|-------------------------------|
| [`docs/compound/research/design/web-apps/performance-perception-and-loading-ux.md`](docs/compound/research/design/web-apps/performance-perception-and-loading-ux.md) | Psychology of waiting (Maister, Attentional Gate Model); 0.1/1/10s framework (Card/Moran/Newell, Nielsen); skeleton screen evidence; RAIL model; Core Web Vitals; Speculation Rules API; streaming SSR; business-impact evidence linking latency to conversion |
| [`docs/compound/research/design/web-apps/accessibility-and-inclusive-design.md`](docs/compound/research/design/web-apps/accessibility-and-inclusive-design.md) | Disability models (social, medical, ICF); WCAG 2.2 and 3.0; ARIA mechanics; screen reader interaction model; keyboard navigation; cognitive accessibility; automated vs. manual testing; legal frameworks; the overlay controversy |
| [`docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md`](docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md) | Sweller's triarchic load taxonomy; working memory limits; progressive disclosure as cognitive load management; the attention economy; F-shaped scanning under high load; decision fatigue in settings panels |
| [`docs/compound/research/development/web-apps/optimistic-ui-local-first-patterns.md`](docs/compound/research/development/web-apps/optimistic-ui-local-first-patterns.md) | CRDT theory and implementations (Yjs, Automerge); sync engines (Replicache, ElectricSQL, PowerSync); optimistic mutation with rollback; offline-first architecture; conflict resolution strategies |
| [`docs/compound/research/development/web-apps/web-application-security.md`](docs/compound/research/development/web-apps/web-application-security.md) | Authentication patterns (OAuth/OIDC, passkeys, JWT); XSS/CSRF defense; CSP and security headers; OWASP Top 10 mapping; client-side secure storage; SPA vs SSR security profiles |
| [`docs/compound/research/development/web-apps/spa-seo-crawlability.md`](docs/compound/research/development/web-apps/spa-seo-crawlability.md) | Rendering strategy SEO implications (CSR/SSR/SSG/ISR/RSC); Googlebot two-wave indexing; Core Web Vitals; structured data; URL design; social media crawler support |
| [`docs/compound/research/development/software-design/philosophy-of-software-design.md`](docs/compound/research/development/software-design/philosophy-of-software-design.md) | "Define errors out of existence" principle — design flows so error categories are eliminated rather than handled; pull complexity downward into component internals |

---

## Key Questions This Section Will Answer

- What does the empirical evidence actually say about skeleton screens? When do they reduce perceived wait time, and when do they backfire by setting expectations that content will appear faster than it does?
- How do you implement optimistic UI for create/update/delete operations with graceful rollback when the server rejects a mutation? What is the state management architecture?
- What are the five states every data-dependent view should design for (loading, empty, partial, complete, error), and what are concrete design patterns for each?
- What evidence proves that a surface is polished in a running browser rather than merely implemented in code? Which screenshots, recordings, breakpoint checks, console checks, and task-completion checks are required?
- What is the minimum viable accessibility architecture for an SPA? How do you handle focus management on route changes, live region announcements for dynamic content, and keyboard navigation through complex components (trees, grids, comboboxes)?
- How do you design for degraded conditions (3G network, stale service worker cache, partial offline) without building a completely separate offline experience? What service worker caching strategies map to which app types?

---

## Operational Ship Gate: Evidence of Polish

Before calling a user-facing feature complete, verify it in a running browser. The goal is to prove that the feature feels finished, not merely that the underlying code exists.

At minimum:

- Define **1-3 canonical user journeys** that represent the app's core value
- Exercise each journey on **mobile, tablet, and desktop** breakpoints
- Verify the relevant **loading, empty, partial, success, error, and degraded** states
- Check **keyboard navigation**, **focus visibility**, and **reduced-motion** behavior
- Confirm **console output is clean** and **core network requests succeed** under normal use
- Capture **screenshots or short recordings** of the finished states for later comparison and review

For complex web apps, this evidence is part of implementation. It should not be deferred to a separate QA phase if the goal is premium quality.

---

# References: Performance and Polish

## Primary Sources

Read these for deep theoretical grounding on this phase's topics.

| Topic | Paper | Path |
|-------|-------|------|
| Performance perception and loading UX | Performance Perception and Loading UX | `docs/compound/research/design/web-apps/performance-perception-and-loading-ux.md` |
| Accessibility and inclusive design | Accessibility and Inclusive Design | `docs/compound/research/design/web-apps/accessibility-and-inclusive-design.md` |
| Cognitive load and attention design | Cognitive Load and Attention Design | `docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md` |
| Optimistic UI and local-first patterns | Optimistic UI and Local-First Patterns for Web Applications | `docs/compound/research/development/web-apps/optimistic-ui-local-first-patterns.md` |
| Software design philosophy | A Philosophy of Software Design: Principles, Evidence, and Competing Perspectives | `docs/compound/research/development/software-design/philosophy-of-software-design.md` |

## Supplementary Sources

Consult these for specific questions or adjacent concerns.

| Topic | Paper | Path |
|-------|-------|------|
| Responsive and adaptive design | Responsive and Adaptive Design | `docs/compound/research/design/web-apps/responsive-and-adaptive-design.md` |
| Real-time and collaborative UX | Real-Time and Collaborative UX | `docs/compound/research/design/web-apps/real-time-and-collaborative-ux.md` |
| Web application security | Web Application Security Architecture | `docs/compound/research/development/web-apps/web-application-security.md` |
| SPA SEO and crawlability | SEO and Crawlability for Single-Page Applications | `docs/compound/research/development/web-apps/spa-seo-crawlability.md` |
