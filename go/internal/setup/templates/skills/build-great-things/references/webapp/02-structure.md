# Phase 2: Structure

**Scope:** Layout systems, navigation patterns, routing architecture, component architecture, and responsive strategy for complex UIs. This phase answers the question: *how do you organize pixels, components, and routes so that the app remains coherent across screen sizes, content densities, and feature growth?*

---

## Planned Sections (V2)

- `layout-systems.md` — CSS Grid and Flexbox as complementary layout primitives; the Muller-Brockmann grid tradition translated to digital; modular grid construction for data-dense apps; subgrid for cross-component alignment
- `navigation-patterns.md` — Sidebar, top-bar, command palette, bottom nav, breadcrumbs, tabs, mega menus — empirical evidence for each; hybrid navigation for complex apps; progressive navigation that scales with feature growth
- `routing-and-url-design.md` — URL as UI state; nested routing for complex apps; deep-link contracts; browser history management in SPAs; the wayfinding contract (URL-as-location, back-button-as-undo)
- `component-architecture.md` — Component composition patterns (compound components, render props, slots); headless primitives vs. styled components; the dependency inversion principle applied to UI; domain-driven component boundaries
- `responsive-strategy.md` — Container queries for component-level adaptation; intrinsic design (Jen Simmons); fluid sizing with clamp(); mobile-first vs. desktop-first stylesheet strategy; responsive treatment of complex content (data tables, charts, multi-column layouts)

---

## Key Principles

1. **Grid is not a CSS property — it is a design philosophy.** Muller-Brockmann's insight was that the grid is a commitment to rational visual order, not merely a layout convenience. In digital contexts, CSS Grid provides the mechanism, but the design decision is the modular structure: how many columns, what gutter rhythm, what relationship between the grid and the content's natural information density. A 12-column grid is not always right; a data-dense dashboard may need 16 or 24 columns, while a reading-focused app may need 6.

2. **Navigation must support three access paradigms simultaneously.** The research identifies three fundamental navigation modes: hierarchical browsing (sidebar/menu), direct search (search box), and linear recall (command palette/keyboard shortcuts). Expert users gravitate toward the third; novices toward the first; task-specific users toward the second. A complex app that only supports one mode will frustrate two-thirds of its user base.

3. **The URL is a first-class UI element.** In SPAs, the browser's native wayfinding contract — URL-as-location, back-button-as-undo — is broken by default and must be deliberately re-engineered. Every meaningful app state should have a shareable, bookmarkable URL. Routing architecture is not plumbing; it is the skeleton of the user's spatial model.

4. **Components should compose like sentences, not accumulate like Lego.** Good component architecture follows the dependency inversion principle: high-level components depend on abstractions (prop interfaces, slots, render callbacks), not on concrete child implementations. This makes the system extensible without fragile coupling. Headless primitives (Radix UI, React Aria) provide behavior; your design system provides appearance; your app provides domain semantics.

5. **Responsive design is component-level, not page-level.** Container queries (supported baseline 2023+) enable components to adapt based on their own available space rather than the viewport. This shifts responsive strategy from "design three layouts for three breakpoints" to "design components that intrinsically adapt." Jen Simmons's intrinsic design framing — letting content inform layout through Grid and Flexbox — reduces breakpoint count and improves resilience to unexpected container sizes.

6. **Deep components, not shallow ones (Ousterhout).** A component should have a simple interface (few props, clear contract) that hides substantial internal complexity. Ousterhout's "deep module" principle applies directly: a `<DataTable>` with 5 props that internally handles sorting, pagination, column resizing, and keyboard navigation is a deep component. One that requires the consumer to wire up each behavior through 30 props and callbacks is shallow — it exports complexity upward instead of containing it. Headless primitives (Radix, React Aria) embody this: they hide accessibility and interaction complexity behind simple composition APIs.

7. **Different layer, different abstraction (Ousterhout).** Each layer of your component architecture should represent a genuinely different level of abstraction. Design tokens (primitive → semantic → component) should each add conceptual value. A wrapper component that merely forwards props to a child without adding abstraction is the UI equivalent of a pass-through method — it creates indirection without reducing complexity. If a component's interface is no simpler than the thing it wraps, it should not exist.

---

## Cross-References to Research

| Paper | Why it matters for this phase |
|-------|-------------------------------|
| [`docs/compound/research/design/grid/mueller-brockmann-grid-systems.md`](docs/compound/research/design/grid/mueller-brockmann-grid-systems.md) | Intellectual history of grid systems from medieval manuscript construction through the Swiss Style; Muller-Brockmann's modular grid theory; Gerstner's parametric "programme"; the ethical argument for rational visual order |
| [`docs/compound/research/design/web-apps/responsive-and-adaptive-design.md`](docs/compound/research/design/web-apps/responsive-and-adaptive-design.md) | Marcotte's three-pillar formulation, container queries, intrinsic design, fluid sizing with clamp(), preference-based media queries, touch target standards, responsive data tables |
| [`docs/compound/research/design/web-apps/design-systems-and-component-architecture.md`](docs/compound/research/design/web-apps/design-systems-and-component-architecture.md) | Component API patterns (headless primitives, compound components, slot-based composition), CSS architecture approaches, Atomic Design as organizational metaphor |
| [`docs/compound/research/development/software-design/philosophy-of-software-design.md`](docs/compound/research/development/software-design/philosophy-of-software-design.md) | Deep modules vs. shallow modules, different-layer-different-abstraction, information hiding — the intellectual foundation for component architecture decisions |
| [`docs/compound/research/design/web-apps/refactoring-ui-design-principles.md`](docs/compound/research/design/web-apps/refactoring-ui-design-principles.md) | Constraint-based layout systems, geometric spacing scales, border alternatives, the developer-designer bridge — systematic visual structure decisions |

---

## Key Questions This Section Will Answer

- How do you translate Muller-Brockmann's print grid theory into CSS Grid for a data-dense web app? What column counts and gutter rhythms work for different content densities?
- What does the empirical evidence say about sidebar vs. top-bar vs. hybrid navigation for apps with 50+ distinct views? When should you add a command palette?
- How do you design a routing architecture where every meaningful state is URL-addressable, shareable, and supports browser back/forward without breaking the user's spatial model?
- When should you use headless primitives (Radix, React Aria) vs. a pre-styled component library (shadcn/ui, Chakra) vs. fully custom components? What are the actual trade-offs in maintenance cost, accessibility coverage, and design flexibility?
- How do you handle responsive adaptation for genuinely complex content — multi-column data tables, nested tree views, dense dashboards — where "stack it vertically on mobile" is not a viable strategy?

---

# References: Structure

## Primary Sources

Read these for deep theoretical grounding on this phase's topics.

| Topic | Paper | Path |
|-------|-------|------|
| Grid systems (Muller-Brockmann) | Mueller-Brockmann Grid Systems | `docs/compound/research/design/grid/mueller-brockmann-grid-systems.md` |
| Responsive and adaptive design | Responsive and Adaptive Design | `docs/compound/research/design/web-apps/responsive-and-adaptive-design.md` |
| Design systems and component architecture | Design Systems and Component Architecture | `docs/compound/research/design/web-apps/design-systems-and-component-architecture.md` |
| Software design philosophy | A Philosophy of Software Design: Principles, Evidence, and Competing Perspectives | `docs/compound/research/development/software-design/philosophy-of-software-design.md` |

## Supplementary Sources

Consult these for specific questions or adjacent concerns.

| Topic | Paper | Path |
|-------|-------|------|
| Advanced CSS and WebGL craft | Advanced CSS and WebGL Visual Craft | `docs/compound/research/design/frontend-design/advanced-css-and-wbgl-visual-craft.md` |
| Information architecture and navigation | Information Architecture and Navigation | `docs/compound/research/design/web-apps/information-architecture-and-navigation.md` |
| Visual design principles (Refactoring UI) | Refactoring UI: Systematic Visual Design Principles | `docs/compound/research/design/web-apps/refactoring-ui-design-principles.md` |
