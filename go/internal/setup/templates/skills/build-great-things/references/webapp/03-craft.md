# Phase 3: Craft

**Scope:** Typography in data-dense contexts, color systems for modes and themes, form design, data visualization, and visual hierarchy in complex UIs. This phase answers the question: *once the structure is sound, how do you make every surface communicate clearly, look intentional, and reward close attention?*

---

## Planned Sections (V2)

- `typography.md` — Fluid type scales with clamp(); variable fonts for weight/width axis optimization; line length, leading, and contrast for screen reading; typographic hierarchy in data-dense interfaces; font loading strategies that eliminate layout shift
- `color-systems.md` — OKLCH as the perceptually uniform foundation; semantic color token architecture (primitive > semantic > component tiers); dark mode as a first-class design surface, not an inversion filter; APCA contrast for WCAG 3.0 readiness; color scales for data encoding; CVD-safe palette design
- `form-design.md` — Inline validation timing (Wroblewski's research); multi-step wizard flows; error prevention vs. error recovery; autosave and undo/redo patterns; state machine modeling for complex form state; accessibility requirements under WCAG 2.2
- `data-visualization.md` — Chart type selection grammar; KPI dashboard grid patterns (the 3x2 convergence of working memory and page geometry); sparklines and small multiples; responsive chart adaptation; color palettes for categorical, sequential, and diverging data
- `visual-hierarchy.md` — Gestalt grouping applied to interface surfaces; pre-attentive attributes for scannable layouts; the data-ink ratio in app UI; whitespace as structural element; managing visual density without creating cognitive overload

---

## Key Principles

1. **Typography is the primary interface material.** In a web app, users spend more time reading text than looking at any other element. Typographic decisions — scale, weight, line height, measure, contrast — have more impact on usability than any decorative choice. The empirical reading ergonomics research provides specific constraints: 45-75 characters per line for body text, line height of 1.4-1.6 for screen reading, and a minimum of 16px base size for comfortable reading at arm's length.

2. **Color is a system, not a palette.** A color palette is a list of swatches; a color system is a token architecture with semantic meaning at every layer. The three-tier model (primitive values > semantic aliases > component-specific overrides) enables dark mode, high-contrast mode, and brand theming without redesigning components. OKLCH provides perceptual uniformity that sRGB/HSL cannot — equal steps in lightness *look* equal, which matters enormously for generating consistent scales.

3. **Forms are the most failure-prone surface in web UI.** The empirical record is unambiguous: average form abandonment is 34%, and 67% of users who encounter any complication abandon permanently. Baymard Institute's checkout research shows the average checkout has approximately 15 form elements — twice the optimal number. Every field you remove is a conversion improvement. Every validation message that fires at the wrong time (on blur vs. on submit vs. real-time) is a friction source with measurable impact.

4. **Data visualization follows a grammar, not a gallery.** Chart type selection is not aesthetic preference; it is a mapping between data structure (categorical, continuous, hierarchical, temporal) and visual encoding channels (position, length, angle, area, color). The KPI dashboard pattern — hero number + label in a small grid — converges on a 3x2 structure for cognitive reasons: Miller/Cowan's working memory limits (4 plus or minus 1 chunks) constrain how many metrics a user can hold simultaneously.

5. **Visual hierarchy is the allocation of attention.** Every element on screen competes for the user's limited attentional bandwidth. Gestalt principles (proximity, similarity, continuity, closure, figure-ground) and pre-attentive attributes (color, size, orientation, motion) provide the toolkit for directing attention without requiring the user to read everything. The goal is that a user glancing at any screen for 2 seconds can identify the primary action and the most important information.

6. **Three channels, not one (Wathan & Schoger).** Visual hierarchy operates through three independent channels: size, weight, and color. Most developers reach only for font size to create hierarchy. Refactoring UI's key insight is that varying weight (bold vs. regular vs. light) and color (dark vs. muted vs. light gray) creates hierarchy without changing size — and that **de-emphasis is as important as emphasis**. Making secondary content smaller, lighter, and more muted increases the primary content's relative salience without making it louder. Treisman's preattentive processing research confirms this: the visual system processes all three channels in parallel in under 200ms.

7. **Constrained scales, not arbitrary values.** Spacing, type size, shadow, and border-radius should each come from a predefined geometric scale. The Weber-Fechner law explains why: perceived intensity scales logarithmically with physical magnitude, so equal arithmetic increments (4px, 8px, 12px) do not produce perceptually equal steps. A geometric scale (4, 8, 16, 24, 32, 48, 64) produces uniform-feeling increments. This is the foundational insight behind Tailwind's spacing system and Refactoring UI's design philosophy — constraints produce consistency.

8. **Borders are a last resort.** When you need to separate content sections, list items, or card groups, reach for these alternatives before adding a border: (1) more spacing between groups, (2) different background colors, (3) subtle box shadows. Borders add visual clutter and compete with content for attention. Gestalt proximity — maintaining more space between groups than within them — is the most powerful separation mechanism and requires no visual element at all.

---

## Cross-References to Research

| Paper | Why it matters for this phase |
|-------|-------------------------------|
| [`docs/compound/research/design/web-apps/web-typography-and-reading-ergonomics.md`](docs/compound/research/design/web-apps/web-typography-and-reading-ergonomics.md) | Web-safe to variable font evolution; empirical reading ergonomics (line length, leading, contrast); fluid type with clamp(); font loading strategies; CLS prevention |
| [`docs/compound/research/design/web-apps/color-theory-for-digital-interfaces.md`](docs/compound/research/design/web-apps/color-theory-for-digital-interfaces.md) | OKLCH/OKLAB perceptual color spaces; APCA contrast algorithm; dark mode elevation systems; semantic color token architecture; CVD-safe design; Radix/Tailwind v4 color scale analysis |
| [`docs/compound/research/design/web-apps/state-forms-and-complex-flow-ux.md`](docs/compound/research/design/web-apps/state-forms-and-complex-flow-ux.md) | Wroblewski's form design research; inline validation timing; multi-step wizards; autosave/undo/redo; XState v5 for UI state; Baymard checkout UX evidence; React form library landscape |
| [`docs/compound/research/design/financial-reports/kpi-dashboard-design.md`](docs/compound/research/design/financial-reports/kpi-dashboard-design.md) | KPI tile grid as design pattern; 3x2 grid convergence with working memory limits; Tufte's data-ink ratio; sparklines; typographic conventions for metric display |
| [`docs/compound/research/design/web-apps/refactoring-ui-design-principles.md`](docs/compound/research/design/web-apps/refactoring-ui-design-principles.md) | Three-channel visual hierarchy (size, weight, color), Weber-Fechner law for spacing scales, Gestalt proximity, preattentive processing, border alternatives, shadow elevation systems, constraint-based design philosophy |

---

## Key Questions This Section Will Answer

- How do you construct a fluid type scale that maintains readable hierarchy from 320px to 2560px viewports without manual breakpoint adjustments?
- What is the concrete token architecture for a color system that supports light mode, dark mode, and high-contrast mode from a single set of semantic tokens? How does OKLCH change the way you generate and reason about color scales?
- When should inline validation fire — on focus-out, on submit, or in real-time? What does Wroblewski's and Baymard's research actually conclude, and how do you implement the optimal timing with state machines?
- How do you design a KPI dashboard that respects working memory constraints while accommodating 8-12 metrics that stakeholders insist are all "critical"?
- How do you achieve high information density (the kind users of tools like Linear, Figma, and Bloomberg Terminal expect) without triggering cognitive overload? What is the practical application of Tufte's data-ink ratio to app interfaces?

---

# References: Craft

## Primary Sources

Read these for deep theoretical grounding on this phase's topics.

| Topic | Paper | Path |
|-------|-------|------|
| Typography and reading ergonomics | Web Typography and Reading Ergonomics | `docs/compound/research/design/web-apps/web-typography-and-reading-ergonomics.md` |
| Color theory for digital interfaces | Color Theory for Digital Interfaces | `docs/compound/research/design/web-apps/color-theory-for-digital-interfaces.md` |
| State, forms, and complex flow UX | State, Forms, and Complex Flow UX | `docs/compound/research/design/web-apps/state-forms-and-complex-flow-ux.md` |
| Visual design principles (Refactoring UI) | Refactoring UI: Systematic Visual Design Principles | `docs/compound/research/design/web-apps/refactoring-ui-design-principles.md` |

## Supplementary Sources

Consult these for specific questions or adjacent concerns.

| Topic | Paper | Path |
|-------|-------|------|
| KPI dashboard design | KPI Dashboard Design | `docs/compound/research/design/financial-reports/kpi-dashboard-design.md` |
| Financial data visualization | Financial Data Visualisation for Investment Vehicle Factsheets | `docs/compound/research/design/financial-reports/financial-data-visualisation-for-investment-vehicle-factsheets.md` |
| Information density and layered reading | Information Density and Layered Reading in Financial Documents | `docs/compound/research/design/financial-reports/information-density-and-layered-reading-in-financial-documents.md` |
| Design of financial tables | The Design of Financial Tables | `docs/compound/research/design/financial-reports/the-design-of-financial-tables.md` |
| Content strategy and UX writing | Content Strategy and UX Writing for Web Applications | `docs/compound/research/design/web-apps/content-strategy-ux-writing.md` |
