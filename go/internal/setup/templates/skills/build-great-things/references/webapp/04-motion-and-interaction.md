# Phase 4: Motion & Interaction

**Scope:** Micro-interactions, state transitions, drag-and-drop, real-time feedback, keyboard shortcuts, gesture vocabulary, and animation as communication. This phase answers the question: *how do you make an interface feel alive, responsive, and trustworthy through the accumulated quality of hundreds of small interactive moments?*

---

## Planned Sections (V2)

- `micro-interactions.md` — Saffer's four-part anatomy (trigger, rules, feedback, loops/modes); feedback timing thresholds (0.1s/1s/10s); button states, toggle transitions, form field focus animations; the delight-vs-utility tension
- `state-transitions.md` — View Transitions API; shared-element transitions; layout animation with FLIP technique; enter/exit choreography; spring physics vs. duration-based easing; motion as spatial orientation cue
- `drag-and-drop.md` — Direct manipulation principles (Shneiderman); drag affordances and signifiers; drop zone feedback; reorder vs. transfer semantics; accessible drag-and-drop (keyboard alternatives); library landscape (dnd-kit, pragmatic-drag-and-drop)
- `real-time-feedback.md` — Presence indicators, cursor sharing, typing indicators, collaborative selection highlights; notification design for async events; real-time data update patterns (WebSocket, SSE, polling trade-offs)
- `keyboard-and-gestures.md` — Keyboard shortcut systems for power users; command palette architecture; discoverable shortcuts (tooltip hints, cheat sheets); touch gesture vocabulary; Fitts's Law for touch targets; cross-device interaction parity

---

## Key Principles

1. **Interaction quality is the sum of small feedback loops.** The quality of a web app is not determined primarily by its feature set or visual design, but by the accumulated correctness of many small feedback loops. Each loop — from trigger through state change to visible response — must close within perceptual thresholds: 100ms for direct manipulation feel, 1s for continuity, 10s as the attention limit. These thresholds derive from human perceptual physiology (Card, Moran, Newell) and do not change with technology.

2. **Motion is communication, not decoration.** Every animation must answer at least one of three questions for the user: Where did this come from? Where did this go? What just changed? Animations that answer none of these questions are decorative; they consume rendering budget without improving comprehension. The View Transitions API and FLIP technique enable meaningful transitions that maintain spatial orientation during state changes.

3. **Respect the expertise gradient.** Novice users need visible affordances, discoverable actions, and explicit feedback. Expert users need keyboard shortcuts, batch operations, and reduced feedback for routine actions. The best apps serve both simultaneously: visible buttons with keyboard shortcut hints, command palettes that teach through use, progressive reduction of scaffolding as expertise increases. Linear's keyboard-first design and Figma's command palette are canonical examples.

4. **Direct manipulation must be reversible.** Shneiderman's direct manipulation paradigm requires that operations be rapid, reversible, and incremental with immediately visible effects. Drag-and-drop, inline editing, and spatial arrangement all follow this principle. The reversibility requirement means undo/redo is not optional — it is a structural prerequisite for direct manipulation to feel safe. Users who cannot undo will not explore.

5. **Accessibility constrains motion, and the constraints improve the design.** The `prefers-reduced-motion` media query is not an edge case — vestibular disorders, epilepsy, and migraine affect a significant population. Designing motion that degrades gracefully under `prefers-reduced-motion: reduce` forces you to ensure that all animated state changes also work as instant transitions, which means your motion is genuinely communicative rather than merely decorative. Every drag-and-drop interaction must have a keyboard alternative.

---

## Cross-References to Research

| Paper | Why it matters for this phase |
|-------|-------------------------------|
| [`docs/compound/research/design/web-apps/interaction-design-and-micro-interactions.md`](docs/compound/research/design/web-apps/interaction-design-and-micro-interactions.md) | Saffer's micro-interaction framework; affordances and signifiers (Gibson/Norman); direct manipulation (Shneiderman); feedback timing thresholds; Fitts's Law for touch; interactive element state taxonomy; delight-vs-utility analysis |
| [`docs/compound/research/design/frontend-design/computational-motion-design.md`](docs/compound/research/design/frontend-design/computational-motion-design.md) | Physics-based easing and spring models; particle systems; shader-driven motion; perception-driven controllers; trade-offs between visual richness, control, and performance |
| [`docs/compound/research/design/web-apps/real-time-and-collaborative-ux.md`](docs/compound/research/design/web-apps/real-time-and-collaborative-ux.md) | Presence awareness patterns; OT vs. CRDT consistency models; cursor sharing and selection highlights; conflict resolution affordances; the local-first software movement; notification design for collaborative contexts |

---

## Key Questions This Section Will Answer

- What is the concrete anatomy of a well-designed micro-interaction? How do you apply Saffer's trigger/rules/feedback/loops framework to common UI moments (button press, toggle switch, form submission, list reorder)?
- When should you use spring physics (physically-motivated, velocity-preserving) vs. duration-based easing (CSS transitions, predictable timing)? What are the perceptual trade-offs?
- How do you implement drag-and-drop that is both visually fluid and fully accessible via keyboard? What is the current library landscape and what trade-offs does each option make?
- How do you design real-time presence (cursors, selections, typing indicators) that communicates collaboration without creating visual noise? What are the UX patterns from Figma, Notion, and Google Docs that have become user expectations?
- How do you build a keyboard shortcut system that is discoverable by novices, efficient for experts, and does not conflict with browser or OS shortcuts? What is the architecture of a command palette?

---

# References: Motion and Interaction

## Primary Sources

Read these for deep theoretical grounding on this phase's topics.

| Topic | Paper | Path |
|-------|-------|------|
| Interaction design and micro-interactions | Interaction Design and Micro-Interactions | `docs/compound/research/design/web-apps/interaction-design-and-micro-interactions.md` |
| Computational motion design | Computational Motion Design | `docs/compound/research/design/frontend-design/computational-motion-design.md` |
| Real-time and collaborative UX | Real-Time and Collaborative UX | `docs/compound/research/design/web-apps/real-time-and-collaborative-ux.md` |

## Supplementary Sources

Consult these for specific questions or adjacent concerns.

| Topic | Paper | Path |
|-------|-------|------|
| Performance perception and loading UX | Performance Perception and Loading UX | `docs/compound/research/design/web-apps/performance-perception-and-loading-ux.md` |
| Cognitive load and attention design | Cognitive Load and Attention Design | `docs/compound/research/design/web-apps/cognitive-load-and-attention-design.md` |
