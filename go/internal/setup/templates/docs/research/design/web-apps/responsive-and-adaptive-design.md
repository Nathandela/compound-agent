---
title: "Responsive and Adaptive Design for Web Applications"
date: 2026-03-25
summary: "Surveys the full landscape of responsive and adaptive web design from Ethan Marcotte's 2010 three-pillar formulation through container queries, intrinsic design, fluid sizing functions, preference-based media queries, server-side adaptation via User-Agent Client Hints, and emerging foldable-device APIs."
keywords: [web-apps, responsive-design, container-queries, intrinsic-design, progressive-enhancement]
---

# Responsive and Adaptive Design for Web Applications

*2026-03-25*

## Abstract

This survey documents the landscape of responsive and adaptive design for web applications from Ethan Marcotte's seminal 2010 A List Apart article through the contemporary ecosystem of CSS container queries, intrinsic layout, fluid sizing functions, preference-based media features, and emerging foldable-device APIs. It traces the evolution from a three-ingredient recipe -- fluid grids, flexible images, media queries -- through the proliferation of CSS Grid and Flexbox as layout primitives, the introduction of `clamp()` and viewport-relative units for fluid spacing and sizing, the arrival of component-level containment via `@container`, and the broadening of media queries to cover user preferences such as `prefers-color-scheme` and `prefers-reduced-motion`. It further examines server-side adaptation mechanisms (User-Agent Client Hints, the `Save-Data` header), CSS logical properties for internationalization, touch target sizing standards across Apple HIG, Material Design, and WCAG, responsive treatment of complex content such as data tables and charts, and industrial-scale case studies from Airbnb, Spotify, and GitHub.

The analysis characterizes trade-offs, evidence quality, and open problems without prescribing specific choices. Responsive typography as a standalone discipline is treated by a companion paper and referenced rather than reproduced here.

## 1. Introduction

The central question this survey addresses is how web designers and engineers negotiate the structural and stylistic adaptation of interfaces across an ever-expanding range of devices, capabilities, and user preferences -- and what the evidence tells us about the mechanisms, trade-offs, and boundaries of each approach family. This question has accrued renewed urgency as the device landscape has fragmented beyond simple mobile-versus-desktop binaries into a continuum that includes budget Android handsets on 2G networks, foldable dual-screen devices, large-format TVs, voice-driven interfaces, and XR headsets.

Three working definitions structure the analysis. **Responsive design** denotes an approach where a single HTML document and stylesheet produces layouts that adapt to available viewport dimensions, primarily through proportional units and CSS media queries, as defined by Marcotte in 2010. **Adaptive design** denotes an approach where distinct layouts or content variants are served based on detected device or network conditions, whether at the server or client level. **Intrinsic design** denotes Jen Simmons's 2018 framing of CSS Grid and Flexbox as tools that allow content itself to inform layout, reducing dependence on externally imposed breakpoints. These three concepts are not mutually exclusive; contemporary production sites typically combine elements of all three.

## 2. Foundations

### 2.1 The Origins of Responsive Web Design

The term "responsive web design" was introduced by Ethan Marcotte in a talk at An Event Apart Seattle on April 6, 2010, and formalized in a May 2010 article in A List Apart. Marcotte's article defined the approach through three technical ingredients: fluid grids (layout columns specified as percentages rather than fixed pixel widths), flexible images (images scaling proportionally via `max-width: 100%`), and CSS media queries (different style rules based on device characteristics such as viewport width).

The historical context was a proliferation of mobile-specific "m-dot" websites, where teams maintained entirely separate codebases for mobile and desktop users. Marcotte's insight was to resist creating device-specific sites and instead embrace the inherent flexibility of the medium. His argument drew on John Allsopp's "A Dao of Web Design" (A List Apart, 2000), which argued that "the control which designers know in the print medium, and often desire in the web medium, is simply a function of the limitation of the printed page."

### 2.2 CSS Media Queries: Viewport-Based and Preference-Based

CSS Media Queries Level 3 and Level 4 are the foundational mechanism for conditional styling. Width-based features -- `min-width`, `max-width`, and the newer range syntax (`width >= 768px`) -- are the bread-and-butter of breakpoint-driven responsive layouts.

Media Queries Level 5 extended the vocabulary substantially to include user preference features. `prefers-color-scheme` (values: `light`, `dark`) detects the OS dark mode preference. `prefers-reduced-motion` (values: `no-preference`, `reduce`) detects the OS setting to minimize animation -- browser support reached approximately 97% of global browser share by 2024. The medical significance of `prefers-reduced-motion` is well-documented: vestibular spectrum disorders, epilepsy, and migraine can be triggered by rapid motion on screen, making this an accessibility requirement rather than a preference.

Additional Level 5 features include `prefers-contrast`, `forced-colors`, `prefers-reduced-data`, and `inverted-colors`. GitHub's Primer design system documents explicit support for all of these as first-class responsive dimensions alongside viewport size, treating user preference as an axis of adaptation coequal with device geometry.

### 2.3 The Emergence of CSS Layout Primitives

CSS Flexbox (broad support circa 2015) and CSS Grid Layout (baseline support across Chrome 57, Firefox 52, Safari 10.1 in 2017) fundamentally changed the responsive design toolkit. Prior to these, responsive layouts were engineered through floats, inline-block hacks, and table display modes.

Flexbox is a one-dimensional layout model (content-outward). Grid is a two-dimensional layout model (layout-inward). The established practice by 2024-2025 is to combine both: Grid for outer page structure, Flexbox for inner component alignment.

CSS Subgrid achieved baseline browser support by 2024 (Chrome 117+, Firefox 71+, Safari 16+, Edge 117+) with approximately 97% global coverage. Subgrid solves the long-standing problem of aligning internal elements across rows of cards without JavaScript measurement.

## 3. Taxonomy of Approaches

| Approach Family | Primary Mechanism | Appropriate Scope |
|---|---|---|
| Fluid grids | Proportional units (%, fr, auto) | Macro layout |
| Viewport media queries | @media width breakpoints | Global layout |
| Container queries | @container size/style | Component layout |
| Intrinsic design | Content-driven Grid/Flexbox | Layout primitives |
| Fluid sizing (clamp) | clamp(), min(), max(), vw/dvh | Spacing & sizing |
| Progressive enhancement | Baseline-first layering | Strategy / architecture |
| Mobile-first / desktop-first | min-width / max-width ordering | Stylesheet strategy |
| Responsive images | srcset, sizes, picture | Media assets |
| Touch target sizing | CSS sizing + accessibility standards | Interactive components |
| Responsive complex content | Tables, charts, data visualization | Content components |
| Network-aware / server-side | Save-Data, UA-CH | HTTP layer |
| CSS logical properties | inline/block axis | Internationalization |
| Preference-based media features | prefers-* | Accessibility / UX |
| Foldable / dual-screen | viewport-segments, env() | Emerging form factors |

## 4. Analysis

### 4.1 Fluid Grids

**Theory & mechanism.** A fluid grid expresses column widths in proportional units relative to the containing element. Marcotte's 2010 formulation derived percentage widths from `(target pixels / context pixels) * 100%`. In contemporary practice, the `fr` unit in CSS Grid allocates fractions of remaining free space. A pattern such as `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))` produces a grid that reflows without a single media query.

**Literature evidence.** The `fr` unit and `auto-fit`/`auto-fill` keywords are documented in the CSS Grid specification and widely validated in production. MDN Web Docs provides the authoritative technical reference.

**Implementations & benchmarks.** Fluid grids are universally supported with negligible performance overhead. The `minmax()` function provides lower and upper bounds that prevent extreme column widths.

**Strengths & limitations.** Fluid grids eliminate many width-oriented breakpoints and degrade gracefully. Their limitation is that they do not adapt typography, spacing, or component complexity, requiring complementary mechanisms.

### 4.2 Viewport-Based Media Queries and Breakpoint Strategy

**Theory & mechanism.** Media query breakpoints produce discrete layout changes at specific viewport width thresholds. The historical convention of anchoring to device pixel widths (320px iPhone, 768px iPad) has been widely critiqued as brittle.

**Literature evidence.** The contemporary consensus favors content-first breakpoints: set where the layout begins to look strained, not where any device specification dictates. Ahmad Shadeed's analysis documents this shift. Global mobile traffic share of approximately 59-62% (2024-2025) reinforces the importance of small-viewport design.

**Implementations & benchmarks.** Media queries remain irreplaceable for global, viewport-level concerns: page-level navigation changes, print stylesheets, device orientation, and user preference features.

**Strengths & limitations.** Media queries are viewport-centric: a card in a sidebar and a card in full-width main content appear at the same breakpoint. Container queries address this asymmetry.

### 4.3 Container Queries

**Theory & mechanism.** CSS Container Queries (CSS Containment Module Level 3) enable styles based on the dimensions or style properties of an ancestor container rather than the viewport. The author declares `container-type: inline-size` and writes `@container` rules. A component becomes self-describing with respect to its available space.

**Literature evidence.** Container size queries achieved cross-browser baseline support in early 2023: Chrome 105, Safari 16, Firefox 110. Browser support reached ~93% globally by late 2024. The 2025 State of CSS survey found 41% of respondents had used container size queries; only 7% reported using style queries. Scroll-state queries became available in Chromium-based browsers in early 2025 but lacked Firefox and Safari support.

**Implementations & benchmarks.** Container query units (`cqw`, `cqh`, `cqi`, `cqb`) allow fluid sizing tied to the container. Named containers allow targeting specific ancestors when multiple containment contexts nest.

**Strengths & limitations.** A container cannot query itself (requiring wrapper elements). The CSS containment can cause children to collapse to zero-height without explicit sizing. Design tooling (Figma, Sketch) lacks native container query support. Adoption is slow partly due to the conceptual shift required.

### 4.4 Intrinsic Design

**Theory & mechanism.** Jen Simmons introduced "intrinsic web design" in her 2018 An Event Apart talk. The claim: CSS Grid, Flexbox, and sizing keywords (`min-content`, `max-content`, `fit-content()`, `minmax()`, `auto`) allow content to inform layout rather than imposing external grids.

**Literature evidence.** The canonical technique is `auto-fit`/`auto-fill` with `minmax()`, producing breakpoint-free column reflow. Other techniques include `fit-content()` tracks, wrapping flex containers, and multi-column layouts. Simmons documented patterns at labs.jensimmons.com.

**Implementations & benchmarks.** Intrinsic design reduces breakpoint proliferation. The approach is universally supported in browsers.

**Strengths & limitations.** Intrinsic sizing keywords are not always intuitive. Design-to-code workflows are challenged because design tools represent designs at fixed widths, obscuring fluid behavior.

### 4.5 Fluid Spacing and Sizing: clamp(), min(), max()

**Theory & mechanism.** `clamp(MIN, PREFERRED, MAX)` returns the PREFERRED value when between bounds, otherwise clamps. With viewport-relative units in PREFERRED, properties scale linearly.

The general formula: for minimum value y1 at viewport x1 and maximum y2 at viewport x2:
- v = 100 * (y2 - y1) / (x2 - x1) (the vw coefficient)
- r = (x1 * y2 - x2 * y1) / (x1 - x2) (the rem offset)
- Result: `clamp(y1, v*1vw + r*1rem, y2)`

New dynamic viewport units `dvh`/`dvw` account for mobile browser chrome collapse, baselined in all major browsers 2023.

**Literature evidence.** Smashing Magazine and CSS-Tricks provide thorough mathematical derivations. Using `vw` units without `rem` bounds violates WCAG 1.4.4 (viewport units don't scale with browser zoom).

**Strengths & limitations.** Universally supported, negligible performance. Accessibility requires combining viewport units with rem bounds.

### 4.6 Progressive Enhancement vs. Graceful Degradation

**Theory & mechanism.** Progressive enhancement starts from a minimal baseline and layers capabilities for supporting browsers. Graceful degradation starts full-featured and falls back. The CSS `@supports` at-rule enables feature queries for progressive enhancement.

**Literature evidence.** The W3C wiki characterizes the philosophical difference: graceful degradation "starts from complexity and tries to fix for the lesser experience," while progressive enhancement "starts from a very basic, working example." `@supports` achieves 99%+ browser support.

**Strengths & limitations.** Progressive enhancement produces smaller initial payloads and better mobile performance. It can feel counterintuitive in design workflows.

### 4.7 Mobile-First vs. Desktop-First

**Theory & mechanism.** Mobile-first uses `min-width` queries (default = narrowest). Desktop-first uses `max-width` (default = widest). Luke Wroblewski's "Mobile First" (2011) codified the strategy.

**Literature evidence.** Ahmad Shadeed's analysis advocates a "basics-first" hybrid: base styles independent of viewport, then contextual min-width or max-width queries per component. Modern CSS features (`auto-fit/minmax`, `flex-wrap`, `clamp()`) reduce the number of queries either approach requires.

**Strengths & limitations.** Mobile-first aligns with progressive enhancement and produces smaller initial bundles for mobile. Neither approach is universally superior.

### 4.8 Responsive Images

**Theory & mechanism.** Images represent ~64% of average webpage weight. The `srcset` attribute provides resolution/width candidates; `sizes` informs the browser of expected rendered width; `<picture>` enables art direction (fundamentally different images per viewport) and format switching (AVIF > WebP > JPEG).

**Literature evidence.** The 2024 Web Almanac reports WebP at 7% of LCP images on mobile, AVIF at 0.3%. Only 15% of mobile pages use `fetchpriority=high` on LCP images. 66% of mobile pages contain at least one image without explicit dimensions (CLS risk).

**Strengths & limitations.** Precise author control with browser-delegated final selection. Authoring complexity requires tooling support (image CDNs, build-time generation). Incorrectly specified `sizes` cause suboptimal candidate selection.

### 4.9 Touch Target Sizing

**Theory & mechanism.** Touch target size determines tap accuracy probability. Three standards diverge:

| Standard | Minimum | Scope |
|---|---|---|
| Apple HIG | 44 x 44 pt | iOS/iPadOS |
| Material Design | 48 x 48 dp | Android |
| WCAG 2.5.5 (AAA) | 44 x 44 CSS px | Web |
| WCAG 2.5.8 (AA) | 24 x 24 CSS px + 24px spacing | Web |

**Literature evidence.** GitHub Primer requires 24px minimum (WCAG 2.5.8 AA) and recommends 44px on mobile (WCAG 2.5.5 AAA).

**Strengths & limitations.** Cross-platform systems must reconcile specifications developed independently. Unit differences (points, dp, CSS px) add translation complexity.

### 4.10 Responsive Data Tables and Charts

**Theory & mechanism.** Tables have relational structure that arbitrary reflow destroys. Charts require sufficient dimension for legibility. Four responsive table strategies exist:

1. **Horizontal scroll container** (`overflow-x: auto`): preserves structure, scroll affordance may be invisible
2. **Stacked rows (card transformation)**: mobile-friendly but loses columnar comparison
3. **Column hiding**: reduces load but discards data
4. **Container query-driven transformation**: adapts based on available space, not viewport

**Literature evidence.** A 2024 Lexo.ch article documents using `@container` queries for tables. For charts, SVG is resolution-independent; Canvas/WebGL handles large datasets (58 FPS at 50,000+ data points with ECharts).

**Strengths & limitations.** No single table strategy is universal. Container queries represent the most architecturally sound direction.

### 4.11 Network-Aware Design and Server-Side Adaptation

**Theory & mechanism.** The `Save-Data` header signals user preference for reduced data. Network client hints (`Downlink`, `ECT`, `RTT`) expose speed estimates. User-Agent Client Hints (UA-CH) replace the monolithic User-Agent string with structured, opt-in data.

**Literature evidence.** The 2024 Web Almanac documents a persistent performance gap: 43% mobile vs. 54% desktop Core Web Vitals pass rates, with a 23-point INP gap reflecting hardware differences. Only 48% of mobile LCP images are <=100KB.

**Strengths & limitations.** Server-side differentiation enables invisible adaptation. The limitation is engineering complexity: caching strategy adjustments, Vary headers, multiple asset variants.

### 4.12 CSS Logical Properties for Internationalization

**Theory & mechanism.** Physical CSS (`margin-left`) produces incorrect layouts in RTL scripts or vertical writing modes. CSS Logical Properties map physical directions to logical ones: `inline-start/end` (text direction), `block-start/end` (perpendicular). Properties: `left/right` -> `inline-start/inline-end`; `top/bottom` -> `block-start/block-end`; `width` -> `inline-size`; `height` -> `block-size`.

**Literature evidence.** Achieved broad browser support by 2022-2023. Components built with logical properties are by construction orientation-agnostic.

**Strengths & limitations.** Significantly reduces RTL/vertical-mode maintenance. Migration friction from existing physical property usage.

### 4.13 Preference-Based Media Features

**Theory & mechanism.** Level 5 preference features (`prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`) respond to active user declarations of need, not passive device characteristics. This is accessibility infrastructure as much as responsive design.

**Literature evidence.** `prefers-reduced-motion` support reached 97% globally by 2024. W3C WCAG technique C39 documents using it for Success Criterion 2.3.3 (AAA). The inversion pattern `@media (prefers-reduced-motion: no-preference)` adds animations only for non-opted-out users.

**Strengths & limitations.** Gives users direct agency. Discoverability is limited -- users must know OS settings influence web experiences.

### 4.14 Foldable and Dual-Screen Devices

**Theory & mechanism.** The CSS Viewport Segments specification introduces `horizontal-viewport-segments` and `vertical-viewport-segments` media features, plus six CSS environment variables for segment geometry.

**Literature evidence.** Available in Microsoft Edge by default from version 97. Chrome requires experimental flags. No CSS media query polyfill exists. This is a pre-baseline specification.

**Strengths & limitations.** Fills a genuine gap -- hinge geometry cannot be inferred from viewport width. Adoption is limited by small device population and limited browser support.

## 5. Comparative Synthesis

| Approach | Browser Coverage | Complexity | Performance Impact | A11y Alignment |
|---|---|---|---|---|
| Fluid grids (%, fr) | Universal | Low | Negligible | High |
| Viewport media queries | Universal | Low | Negligible | High |
| Container queries (size) | ~93% | Medium | Low | Medium |
| Intrinsic design | Universal | Medium | Negligible | High |
| clamp() / fluid sizing | Universal | Low-Medium | Negligible | Medium (zoom risk) |
| Progressive enhancement | N/A | Medium | Low (smaller baselines) | High |
| Responsive images | Universal | Medium | High positive | High |
| Touch target sizing | Universal | Low | Negligible | High |
| Network-aware / UA-CH | Partial (Chromium) | High | High positive | Medium |
| CSS logical properties | Universal | Low | Negligible | High |
| Preference media features | ~97% | Low | Negligible | Critical |
| Foldable/dual-screen | Limited | High | Low | Low |

Key observations:
1. Universal, low-complexity approaches (fluid grids, media queries, intrinsic layout, logical properties, preference features) form the stable foundation
2. Highest positive performance impact (responsive images, network-aware adaptation) carries highest implementation complexity
3. Container queries occupy a middle position: baselined but adoption lagging
4. The emerging synthesis: Grid + media queries at page level, container queries at component level, `clamp()` for fluid sizing, `@supports` for progressive enhancement

## 6. Open Problems & Gaps

**Container query adoption gap.** Only 41% of developers have tried size queries despite 2+ years of browser support. Design tooling lacks native container query support.

**Accessible fluid sizing.** The boundary between acceptable `clamp()` expressions and WCAG-violating ones is not mechanically specified. A formal model mapping parameter choices to zoom behavior would help.

**Intrinsic design tooling.** Design tools work with fixed canvases, obscuring intrinsic layout behavior. Native fluid/intrinsic representation in design tools remains nascent.

**Performance on the long tail of devices.** The 43% mobile CWV pass rate masks worse performance on low-cost Android devices dominating emerging markets.

**Foldable device patterns.** Design patterns for hinge-aware layouts are not established. Open questions: when to span vs. avoid the hinge, how to distinguish two-pane from wide-single-pane, progressive enhancement without CSS polyfill support.

**Media query / container query interaction.** No formalized decision model exists for choosing between viewport and container queries. Their simultaneous firing at different thresholds can produce unexpected composite behaviors.

## 7. Conclusion

The responsive design toolkit has expanded from Marcotte's 2010 three-ingredient recipe to 14+ distinct approach families operating at different levels of the design hierarchy. The foundational apparatus -- fluid grids, viewport media queries, flexible images -- remains universally applicable. On top: CSS Grid and Flexbox as layout primitives, `clamp()` for fluid sizing, container queries for component-level adaptation, preference features extending responsiveness to user need, and responsive image specifications enabling significant performance improvements.

The field's broadened definition of "responsive" -- encompassing viewport geometry, user preferences, writing direction, network conditions, and form-factor specifics -- reflects a mature understanding that devices are not the only variable users bring to an interface.

Industrial case studies from Airbnb (server-driven UI with form-factor layout switching), Spotify (Encore design system with multi-layer abstraction), and GitHub (Primer with preference-responsive foundations) illustrate that at scale, responsive design is less a CSS question than a systems design problem: how to build component libraries, server infrastructure, and design-to-code pipelines that produce correct, accessible, and performant interfaces across an arbitrarily diverse landscape.

## References

1. Marcotte, E. (2010). Responsive Web Design. A List Apart. https://alistapart.com/article/responsive-web-design/
2. Allsopp, J. (2000). A Dao of Web Design. A List Apart. https://alistapart.com/article/dao/
3. Simmons, J. (2018). Designing Intrinsic Layouts. An Event Apart. https://aneventapart.com/news/post/designing-intrinsic-layouts-aea-video
4. Marcotte, E. (2020). Responsive Design at 10. https://ethanmarcotte.com/wrote/responsive-design-at-10/
5. MDN Web Docs. Container size and style queries. https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries
6. MDN Web Docs. Using responsive images in HTML. https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images
7. MDN Web Docs. prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
8. MDN Web Docs. vertical-viewport-segments. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/vertical-viewport-segments
9. MDN Web Docs. HTTP Client Hints. https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Client_hints
10. web.dev. prefers-reduced-motion: Sometimes less movement is more. https://web.dev/articles/prefers-reduced-motion
11. web.dev. Internationalization. https://web.dev/learn/design/internationalization
12. web.dev. Baseline in Action: Fluid Type. https://web.dev/articles/baseline-in-action-fluid-type
13. Smashing Magazine. (2022). Modern Fluid Typography Using CSS Clamp. https://www.smashingmagazine.com/2022/01/modern-fluid-typography-css-clamp/
14. Smashing Magazine. (2022). Building Web Layouts For Dual-Screen And Foldable Devices. https://www.smashingmagazine.com/2022/03/building-web-layouts-dual-screen-foldable-devices/
15. Shadeed, A. (2021). The State of Mobile First and Desktop First. https://ishadeed.com/article/the-state-of-mobile-first-and-desktop-first/
16. A List Apart. (2020). Mobile-First CSS: Is It Time for a Rethink? https://alistapart.com/article/mobile-first-css-is-it-time-for-a-rethink/
17. HTTP Archive. (2024). Performance -- 2024 Web Almanac. https://almanac.httparchive.org/en/2024/performance
18. Chrome Developers. (2023). User-Agent Client Hints. https://developer.chrome.com/docs/privacy-security/user-agent-client-hints
19. W3C. Graceful degradation versus progressive enhancement. https://www.w3.org/wiki/Graceful_degradation_versus_progressive_enhancement
20. W3C WAI. Understanding Success Criterion 2.5.5: Target Size. https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
21. W3C WAI. C39: Using prefers-reduced-motion. https://www.w3.org/WAI/WCAG21/Techniques/css/C39
22. Roselli, A. (2019). Target Size and 2.5.5. https://adrianroselli.com/2019/06/target-size-and-2-5-5.html
23. GitHub Primer. Responsive Foundations. https://primer.github.io/design/foundations/responsive/
24. Airbnb Engineering. A Deep Dive into Airbnb's Server-Driven UI System. https://medium.com/airbnb-engineering/a-deep-dive-into-airbnbs-server-driven-ui-system-842244c5f5
25. Spotify Engineering. (2023). Multiple Layers of Abstraction in Design Systems. https://engineering.atspotify.com/2023/05/multiple-layers-of-abstraction-in-design-systems
26. Spotify Design. (2022). Reimagining Design Systems at Spotify. https://spotify.design/article/reimagining-design-systems-at-spotify
27. Caisy. (2025). CSS Container Queries in 2025. https://caisy.io/blog/css-container-queries-2025
28. LogRocket. Container queries in 2026. https://blog.logrocket.com/container-queries-2026/
29. Frontend Masters. (2024). We've Got Container Queries Now, But Are We Actually Using Them? https://frontendmasters.com/blog/weve-got-container-queries-now-but-are-we-actually-using-them/
30. Lexo.ch. (2024). Alternative Approach to Responsive Tables Using Container Queries. https://www.lexo.ch/blog/2024/11/alternative-approach-to-responsive-tables-using-container-queries/
31. BrowserStack. Responsive Design Breakpoints. https://www.browserstack.com/guide/responsive-design-breakpoints
32. BrowserStack. What Are CSS Subgrids? https://www.browserstack.com/guide/what-are-css-subgrids
33. TetraLogical. (2022). Foundations: Target Sizes. https://tetralogical.com/blog/2022/12/20/foundations-target-size/
34. CSS-Tricks. CSS Logical Properties and Values. https://css-tricks.com/css-logical-properties-and-values/
35. Piccalilli. (2024). What Progressive Enhancement Actually Is. https://piccalil.li/blog/its-about-time-i-tried-to-explain-what-progressive-enhancement-actually-is/

## Practitioner Resources

### Key References
- Marcotte's original article (2010): https://alistapart.com/article/responsive-web-design/
- Jen Simmons's layout experiments: https://labs.jensimmons.com/
- MDN Container Queries: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries
- web.dev Learn Design: https://web.dev/learn/design/
- HTTP Archive Web Almanac (annual): https://almanac.httparchive.org/

### Tools
- Utopia (fluid type/space calculator): https://utopia.fyi/
- Polypane (responsive testing browser): https://polypane.app/
- ScreenFly (viewport testing): https://screenfly.org/
- Responsively App: https://responsively.app/

### Design System References
- GitHub Primer Responsive Foundations: https://primer.github.io/design/foundations/responsive/
- Shadeed's article on mobile/desktop-first: https://ishadeed.com/article/the-state-of-mobile-first-and-desktop-first/
- Smashing Magazine foldable devices guide: https://www.smashingmagazine.com/2022/03/building-web-layouts-dual-screen-foldable-devices/
