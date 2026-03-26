---
title: "The KPI Dashboard as Design Problem: Grid, Hierarchy, and Metric Architecture for Financial Factsheets"
date: 2026-03-19
summary: "Examines the KPI tile grid pattern in investment factsheets, drawing on cognitive psychology, information design theory, and industry practice to show the canonical 3x2 grid represents a near-optimal convergence of working memory limits and page geometry."
keywords: [design, financial-reports, kpi-dashboard, grid-design, cognitive-science]
---

# The KPI Dashboard as Design Problem: Grid, Hierarchy, and Metric Architecture for Financial Factsheets

*March 2026*

---

## Abstract

The KPI tile grid — a rectangular array of "hero number + label" tiles — is the dominant information design pattern in investment factsheets. This survey examines its foundations in cognitive science, its practical grid architectures, its typographic conventions, its color systems, and its application in Swiss real estate fund factsheets. Drawing on cognitive psychology (Miller's Law, pre-attentive processing, Gestalt grouping), information design theory (Tufte's data-ink ratio, sparklines), and industry practice (Morningstar, Bloomberg, Swiss RE fund factsheets), we synthesize a body of knowledge that spans cognitive science, graphic design, and financial communication. The central finding is that the canonical 3×2 KPI grid is not arbitrary: it represents a near-optimal convergence of working memory limits, A4 page geometry, and visual hierarchy requirements.

---

## 1. Introduction

Every investment factsheet contains a moment of reckoning: a compact panel of numbers that tells the reader, at a glance, what the fund is worth, what it costs, how it has performed, and how risky it is. This panel — variously called the "key figures," "fund snapshot," or "KPI tile grid" — is the most information-dense element on the page. It is also, paradoxically, the most carefully designed for rapid consumption.

The KPI tile grid typically takes the form of a 3×2 or 2×3 array of rectangular cells, each containing a large primary value (the "hero number") and a small subordinate label. In Swiss real estate fund factsheets, the grid commonly includes metrics such as net asset value per share (NAV/share), market capitalization, premium or discount to NAV, total expense ratio (TER), distribution yield, and annualized volatility. This six-metric configuration is found across EdR REIM's ERRES factsheets, UBS Direct Residential, Swiss Life REF, and dozens of other vehicles traded on SIX Swiss Exchange.

The dominance of this pattern raises questions that span cognitive science, graphic design, and financial communication. Why six metrics and not eight or ten? Why a 3-column layout and not 2 or 4? Why does the hero number use a large bold font while the label uses a small gray font? These are not purely aesthetic questions. They have answers rooted in the psychology of visual perception, the ergonomics of A4 print, and decades of accumulated industry practice.

---

## 2. Foundations

### 2.1 Miller's Law and Working Memory Limits

The theoretical basis for constraining KPI grids to approximately six items traces directly to George A. Miller's 1956 paper "The Magical Number Seven, Plus or Minus Two." Miller demonstrated that the capacity of short-term (working) memory is approximately 7±2 items — typically 5 to 9 discrete chunks of information.

The critical concept is the *chunk*, not the item. A phone number is seven digits, but trained financial analysts chunk "2'450.00" as a single NAV figure, not six separate characters. This chunking efficiency allows experts to process more information within the same working memory capacity.

For dashboard and factsheet design, Miller's Law has two practical implications. First, the number of independent KPI tiles should not substantially exceed 7, and preferably stays at or below 6 to leave cognitive headroom. Second, the internal structure of each tile (hero number + label + optionally a secondary period) should be so familiar that it functions as a single chunk.

Later research has refined Miller's original claim. Nelson Cowan's 2001 work proposed that the true capacity of the focus of attention is approximately 4 items, not 7. This "magical number four" applies when chunking aids are absent and rehearsal is prevented. For factsheet readers who are financial professionals and have seen hundreds of similar tiles, the chunking advantage is substantial.

### 2.2 Pre-Attentive Processing: What Numbers "Pop"

Pre-attentive processing refers to the automatic, parallel visual analysis that occurs before conscious attention is directed to any element — typically within 200–500 milliseconds of viewing. In the context of KPI tile grids, the most relevant pre-attentive attributes are:

**Size.** A large number (e.g., 48pt bold) is immediately distinguished from surrounding smaller text. The hero number in a KPI tile exploits size as a pre-attentive signal: the eye is drawn to the large value before consciously reading the label.

**Weight (luminance contrast).** Bold text creates a luminance contrast difference relative to surrounding text. Optimal pre-attentive pop-out for financial figures typically benefits from contrast ratios closer to 7:1.

**Color.** Brand color applied to the hero number (e.g., navy #0040C1, or a mid-blue) against a neutral background creates a hue-based pre-attentive signal. The label, rendered in neutral gray (#6B7280 or similar), recedes relative to the colored hero number.

**Spatial position.** Tiles in the top-left corner of the grid receive the most visual attention in left-to-right reading cultures, exploiting the primacy of the top-left in Western scan patterns.

### 2.3 Gestalt Principles Applied to Tile Grids

Gestalt psychology describes how the visual system groups elements into coherent perceptual units. Four Gestalt principles are directly operative in KPI tile grids:

**Proximity.** Elements close to each other are perceived as belonging to the same group. The tight inter-tile gap (typically 8–16px) within a KPI grid signals that all tiles are members of the same semantic category.

**Similarity.** Elements with identical or similar visual properties are perceived as a group. In a KPI grid, all tiles share the same background color, dimensions, font sizes, and internal padding. This visual uniformity signals that all six metrics are comparable and should be read as a set.

**Figure-ground.** In the hero number pattern, the large bold value functions as figure and the pale tile background or label functions as ground. This figure-ground separation is what makes the value instantly readable even at a distance.

**Closure.** Rounded rectangle tiles with a card-style border or shadow create a strong closure cue that defines each tile as a discrete unit. Even a borderless tile with only background color and padding benefits from closure through the color boundary.

### 2.4 Chunking Theory and Mental Models

Beyond working memory capacity, chunking theory explains how repeated exposure to a visual pattern creates an increasingly efficient mental representation. An investor who reads Swiss RE fund factsheets regularly develops a mental model of the standard 6-tile KPI grid. The moment the grid appears, the investor's mental model activates: they know that tile 1 will be NAV/share, tile 2 market cap, tile 3 premium/discount.

This chunking effect creates a strong incentive for industry standardization. A factsheet that places volatility in tile 1 and NAV in tile 4 imposes an unnecessary cognitive cost on expert readers whose mental model predicts the canonical order.

### 2.5 The Hero Number Pattern: Origins and Rationale

The "hero number" pattern — one large, prominently displayed primary value accompanied by a small subordinate label — has antecedents in dashboard design dating at least to the 1990s. The pattern was formalized in analytics design systems such as Google Material Design's "Data Card" component, Salesforce's "Metric" component, and Palantir's Workshop "Metric Card."

The cognitive rationale for the hero number is the separation of two cognitive tasks: recognition (what is this metric?) and evaluation (what is its value?). By making the value large and prominent and the label small and subordinate, the design allows expert readers to skip the label entirely when scanning a familiar tile arrangement.

---

## 3. Taxonomy of Approaches

### 3.1 Grid Architecture Taxonomy

KPI tile grids in financial factsheets can be classified along two dimensions: number of columns and number of rows.

**2×2 (4 tiles).** Used when the document imposes strict space constraints or when the designer wishes to maintain very large tile sizes. Leaves headroom in working memory but sacrifices metric coverage.

**3×2 (6 tiles, 3 columns, 2 rows).** The dominant pattern in Swiss RE fund factsheets and many European UCITS fund factsheets. The 3-column structure maps cleanly to A4 width (210mm) with standard margins: three tiles of approximately 58mm each with 4mm gutters.

**2×3 (6 tiles, 2 columns, 3 rows).** Produces wider tiles with more vertical space, suitable when metric labels are long or when secondary information is displayed within each tile. Less common in print factsheets; more common in digital dashboards.

**4×2 (8 tiles).** Approaches the upper limit of Miller's Law. Requires smaller tile sizes on A4, which reduces the visual impact of the hero number.

**1×N (N tiles, single row).** A "hero band" layout used at the top of dashboards and slides. Typically 3–5 tiles spanning the full page width. High visual impact for 3–4 metrics; impractical beyond 5.

### 3.2 Tile Style Taxonomy

**Card with shadow.** A white or light-colored tile with a drop shadow. The shadow creates a material depth cue. Common in digital dashboards; requires careful handling at 300 DPI for print.

**Flat colored background.** No shadow; tile distinguished from surrounding background purely by fill color. The "BoxBG" pattern (light blue background, e.g., #EBF0FB or #E8EEFB) is characteristic of Quanthome's and several Swiss RE fund factsheet designs.

**Outlined (bordered).** A thin border (1–1.5pt) around each tile on a white background. Common in financial documents using traditional tabular aesthetics. Well-suited to documents with a formal, institutional tone.

**Borderless.** Tiles distinguished only by spacing and typography, with no background color, shadow, or border. Effective only when tiles are widely spaced and the hero number is very large.

**Light-on-dark (inverted).** White or light-colored hero number on a dark background (navy, deep blue, or brand primary). High contrast and strong visual impact. Should be used sparingly — at most one or two tiles in a grid of six.

### 3.3 Metric Category Taxonomy

KPI metrics in factsheets can be grouped into four semantic categories:

**Market metrics.** Describe the fund's position in the secondary market: NAV per share, market price, market capitalization, trading volume. Market metrics are typically the most time-sensitive and change daily.

**Performance metrics.** Describe investment return: total return (1Y, 3Y, 5Y), distribution yield, premium or discount to NAV, benchmark return.

**Risk metrics.** Describe return variability: annualized volatility, Sharpe ratio, maximum drawdown, beta to SWIIT index.

**Structural metrics.** Describe fund investment characteristics: TER, number of properties, average lease expiry (WAULT), loan-to-value ratio.

In the canonical 6-tile Swiss RE fund KPI grid, the distribution is approximately: 2–3 market metrics, 1–2 performance metrics, 1 risk metric, and 1 structural metric.

---

## 4. Analysis

### 4.1 Cognitive Science of the Metric Grid

The convergence on a 6-tile 3×2 grid in Swiss RE fund factsheets reflects a convergence of cognitive and ergonomic constraints that independently point to the same solution.

From a working memory perspective, 6 tiles optimally occupies expert working memory (within Miller's 7±2 range, with one unit of spare capacity) while staying above Cowan's 4-item focus of attention threshold.

From a visual attention perspective, eye-tracking research on dashboard interfaces shows that in left-to-right reading cultures, users exhibit a consistent F-pattern or Z-pattern scan, with the top-left tile receiving the most initial fixation. For this reason, NAV per share — the most fundamental "anchor" metric — is conventionally placed in the top-left position.

Decision fatigue research confirms that when users are presented with more than approximately 7–9 KPIs simultaneously, they exhibit slower response times, lower confidence in assessments, and a tendency to fixate on the first few metrics while ignoring later ones.

Chunking theory provides the strongest argument for metric ordering standardization. Swiss RE fund investors process ERRES, SWIIT, UBS Direct, and Swiss Life REF factsheets repeatedly. When all factsheets place NAV/share in tile 1, market cap in tile 2, and premium/discount in tile 3, the investor's mental model is reinforced with each factsheet.

### 4.2 Grid Architecture and Spacing

The A4 page (210mm × 297mm) imposes specific geometric constraints on KPI grid architecture. With standard margins of 15mm on all sides, the usable page width is 180mm. A 3-column grid with 8mm gutters between tiles allocates (180 - 2×8) / 3 = 54.67mm per tile column. At standard factsheet font sizes (hero number 24–36pt, label 8–10pt), this width is sufficient to display most metric values without overflow.

**Whitespace and gutter sizing.** Research on spacing in dashboard design converges on 4–8mm as the optimal inter-tile gap for creating grouping cues while maintaining visual separation. The gap within a row should match the gap between rows to maintain isotropic grouping.

**Equal-height vs. variable-height tiles.** Equal-height tiles are strongly preferred for KPI grids because they exploit the Gestalt similarity principle: visually identical tile shapes signal comparable, peer-level metrics.

**Inner tile padding.** 3–4mm of padding on all four sides of the hero number and label creates breathing room and prevents the large hero number from crowding the tile border.

### 4.3 Hero Number Typography

**Size ratio.** The optimal size relationship between the hero number and its label is approximately 3:1 to 4:1. If the label is set at 9pt, the hero number should be set at 27–36pt.

**Font weight.** Bold or semibold weight for hero numbers. Bold (700 weight) creates maximum luminance contrast against a light background. Semibold (600 weight) is preferred when tiles are closely spaced.

**Typeface.** Humanist sans-serif fonts (Inter, Source Sans Pro, Euclid Circular B, Helvetica Neue) are strongly preferred for dashboard hero numbers. They provide excellent legibility at both large and small sizes and are available with tabular figure variants.

**Tabular figures.** Financial numbers must use tabular (fixed-width) figures, not proportional figures. Tabular lining figures ensure that digits of the same numeric value occupy identical horizontal space, enabling vertical alignment. In LaTeX, the `Numbers={Lining,Tabular}` fontspec feature enables tabular figures in LuaLaTeX pipelines.

**Unit display.** Three conventions exist:
1. *Inline units:* "2'450.00 CHF" — units follow the number in the same font but at smaller size.
2. *Subordinate unit:* "%" displayed below the hero number at label size.
3. *Header unit:* Unit specified in the tile label ("Market Cap (CHF Mio)"), hero number is pure numeric ("1'234"). Preferred by institutional factsheet designers.

**Decimal precision conventions:**
- NAV per share: 2 decimal places (e.g., "2'450.30") — precision matters for trading decisions
- Market cap: 0 or 1 decimal place in millions (e.g., "1'234 Mio")
- Premium/discount: 2 decimal places as percentage (e.g., "+12.45%") — sign is as important as magnitude
- TER: 2 decimal places (e.g., "0.68%")
- Distribution yield: 2 decimal places (e.g., "3.24%")
- Volatility (annualized): 1 or 2 decimal places (e.g., "4.8%")

Swiss number formatting uses apostrophe as the thousands separator (2'450.30 CHF), a distinctive convention that should be preserved in Swiss RE fund factsheets targeting Swiss institutional audiences.

**Color.** The canonical two-color scheme: brand primary color (e.g., Quanthome navy #0040C1) for the hero number; neutral gray (#6B7280, #9CA3AF) for the label.

### 4.4 Metric Selection and Hierarchy

**Information hierarchy: the hero grid vs. the table below.** The tile grid answers the question "is this fund worth a closer look?" The table answers "what exactly are the fund's characteristics?" This functional division implies a clear selection criterion: tile-worthy metrics are those that determine the initial buy/hold/sell decision.

For Swiss RE funds, the six canonical tile metrics (NAV, market cap, premium/discount, TER, yield, volatility) pass the initial-decision test because they jointly encode the fund's current market status, its value relative to NAV, its cost, its income generation, and its price stability.

**The primacy effect and tile ordering.** The first tile should contain the metric most important for the initial decision. For Swiss RE fund factsheets targeting institutional investors, NAV per share anchors the fund's intrinsic value and is the natural first tile. The second tile, market cap, provides scale. The third tile, premium/discount, is the most watched single number in the Swiss RE fund market.

**Grouping semantics.** The six tiles should be ordered to create coherent row-level groupings:
- Row 1: Market status (NAV/share, Market Cap, Premium/Discount)
- Row 2: Financial characteristics (TER, Distribution Yield, Annualized Volatility)

**The problem of too many metrics.** Once the tile count exceeds 7, cognitive load increases disproportionately. Metrics beyond the canonical six should be placed in the detailed table, not the tile grid.

### 4.5 Tile Color Systems

**Monochromatic vs. semantic coloring.** Two competing philosophies exist.

The monochromatic approach (all tiles share the same background color) exploits Gestalt similarity to reinforce the peer-level comparability of all six metrics. It prevents semantic confusion: no tile background color encodes "good" or "bad." This approach is dominant in Swiss RE fund factsheets.

The semantic coloring approach (green for positive, red for negative, gray for neutral) is common in digital analytics dashboards. It is not appropriate for static print factsheets because: the comparison baseline is not always defined for all six metrics; green/red coloring requires careful color management for accessibility; and in a factsheet, a red tile for a negative premium/discount is not necessarily "bad."

**The BoxBG pattern.** The pale blue tile background is visually distinct from white (providing the closure cue needed for borderless tiles) without imposing the weight of a strong brand color. At luminance values of approximately 92–95% lightness (L* in CIELAB), light blue backgrounds provide sufficient contrast against dark hero numbers (contrast ratio > 7:1) while remaining visually lightweight.

**Accessibility.** WCAG 2.1 Level AA requires a contrast ratio of at least 3:1 for large text (18pt+ regular or 14pt+ bold). Hero numbers at 24–32pt bold easily meet this threshold. Labels at 8–10pt require contrast ratios of 4.5:1, which constrains gray label colors to no lighter than approximately #767676 on a white background.

### 4.6 Secondary Information and Trend Indicators

**The date stamp.** Every KPI tile grid should carry a clear "as of" date. The canonical placement is either below the tile grid as a centered caption or in a small secondary line within each tile.

**Delta indicators.** A change indicator ("▲ 2.3% YTD" or "▼ 1.1% vs. prior quarter") provides temporal context. Delta indicators are best reserved for the 1–2 most volatile metrics in the grid.

**Benchmark comparison.** Inline benchmark comparison ("vs. SWIIT: +0.8%") adds a reference dimension to performance metrics. Like delta indicators, benchmark comparisons should be used selectively.

**Sparklines.** Edward Tufte's sparkline — a "small, high-resolution, word-sized graphic" — is the most information-dense secondary element that can be embedded in a KPI tile. A 40×20px sparkline of the metric's 12-month time series, placed below the hero number, adds a temporal trend dimension without requiring the reader to navigate to a separate chart. Sparklines are particularly effective for premium/discount and NAV per share.

**Trend arrows.** A simpler alternative to sparklines is a directional arrow (▲ or ▼) indicating the change direction since the prior period. For print factsheets with tight production timelines, trend arrows are a practical compromise between information richness and production cost.

### 4.7 Industry Convention Analysis

**Bloomberg Terminal.** Bloomberg's KPI display style uses monospaced fonts, dense information packing, and a predominantly dark background with amber/green/white text. Hero numbers are large but use fixed-width (tabular) monospaced fonts that align in vertical columns. The Bloomberg aesthetic prioritizes information density over visual design, reflecting its audience of professional traders.

**Morningstar.** Morningstar's design system (MDS) uses "Morningstar Intrinsic" font, a custom sans-serif with excellent numeric legibility. The Morningstar fund card presents key metrics in a clean, editorial layout using a bordered card style with white background and dark text. The font hierarchy is: fund name (bold, 14pt), category (regular, 12pt), metric value (bold, 18pt), metric label (regular, 10pt).

**Swiss RE fund industry.** An analysis of publicly available Swiss RE fund factsheets reveals strong convergence on:
- 6-tile KPI grid in a 3-column layout
- Pale blue or white tile background
- Brand primary color for hero numbers
- Gray label text at approximately 9pt
- "As of" date below the grid
- Metric order: NAV/share, market cap, premium/discount, TER, yield, volatility

EdR REIM's ERRES factsheets use a clean two-row, three-column tile layout with the fund's dark blue as the hero number color and light gray as the tile background. UBS Direct Residential uses a similar layout with UBS red. Swiss Life REF uses navy hero numbers on white tile backgrounds. The convergence is strong enough to constitute an implicit industry standard.

---

## 5. Comparative Synthesis

The analysis across cognitive science, grid architecture, typography, metric selection, color, and industry practice converges on a set of design principles:

**The Cognitive Optimum Rule.** Six tiles in a 3×2 grid is the near-optimal solution for investment factsheets on A4 format targeting institutional investors. This configuration satisfies Miller's Law (6 < 7±2), A4 page geometry (3-column grids cleanly tile an 180mm usable width), and the chunking advantage.

**The Pre-Attentive Hierarchy Rule.** Hero number (large, bold, brand color) → label (small, gray) → tile background (pale blue, white) → page background (white). Disrupting this hierarchy destroys the pre-attentive signal and forces conscious serial reading of every tile.

**The Metric Ordering Convention.** For Swiss RE funds: Row 1 = market status (NAV/share, market cap, premium/discount); Row 2 = financial characteristics (TER, yield, volatility). This ordering maximizes the benefit of the chunking and mental model effects.

**The Typography Triad.** Humanist sans-serif typeface + bold weight hero numbers at 24–32pt + tabular lining figures. Departures from any of these three properties impose cognitive costs.

**The Minimal Secondary Information Rule.** Add secondary information only to the 1–2 metrics for which temporal or comparative context is most decision-relevant. Do not add secondary information to all six tiles.

**The Monochromatic Background Rule.** Use a single consistent tile background color for all tiles in the KPI grid. Do not use green/red semantic tile backgrounds in static print factsheets. Reserve inverted (light-on-dark) tiles for single-metric hero displays in marketing presentations.

---

## 6. Open Problems and Gaps

**The print-digital convergence problem.** Financial factsheets are increasingly distributed as both static PDFs and interactive digital documents. The static print design conventions examined in this survey are optimized for print; interactive digital contexts enable hover effects, tooltip detail expansion, and animated sparklines. There is no established design standard for hybrid print-digital factsheets that degrade gracefully from interactive to static.

**Empirical validation gap.** The design principles reviewed in this survey rest on a combination of cognitive science theory and practitioner consensus. There is a notable absence of empirical studies directly testing KPI tile grid variants against each other with financial investor audiences.

**Localization and cultural variation.** The cognitive and visual principles reviewed here are based predominantly on Western, left-to-right reading cultures. Arabic- and Hebrew-language financial documents require right-to-left grid reading, which inverts the primacy effect. The universality of the 3×2 KPI grid has not been tested across cultural contexts.

**Accessibility for visual impairments.** The hero number pattern as conventionally designed (pale blue tiles, 9pt gray labels, brand color hero numbers) creates multiple accessibility challenges. The field lacks established accessibility standards specifically for financial KPI tile grids.

**Machine-generated factsheet quality.** Programmatic PDF generation pipelines (LaTeX, WeasyPrint, Playwright/Chrome headless) impose different constraints on KPI tile design than manual InDesign-based production. Best practices for programmatic PDF generation of KPI tile grids are not well documented.

---

## 7. Conclusion

The KPI tile grid is among the most carefully evolved information design patterns in financial communication. Its canonical 3×2 form for investment factsheets reflects a convergence of working memory limits (Miller's Law, Cowan's 4-item focus), A4 page geometry, pre-attentive visual processing principles, and decades of accumulated industry practice. The hero number pattern — large bold value + small gray label + consistent tile background — is a compact implementation of figure-ground separation, pre-attentive size and color signaling, and expert chunking.

For Swiss real estate fund factsheets specifically, the canonical six metrics (NAV/share, market cap, premium/discount, TER, distribution yield, annualized volatility) represent an information-economical selection that answers the initial buy/hold/sell question for institutional investors with minimal cognitive load.

The most important practical design principles: conform to the canonical 6-tile, 3-column layout; use tabular lining figures in a humanist sans-serif at bold weight; apply brand color to hero numbers and neutral gray to labels; use monochromatic pale blue or white tile backgrounds; place the most decision-critical metric in the top-left tile; and resist the temptation to exceed six tiles or to add secondary information to more than two tiles.

---

## References

Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87–114.

Healey, C. G., & Enns, J. T. (2012). Attention and visual memory in visualization and computer graphics. *IEEE Transactions on Visualization and Computer Graphics*, 18(7), 1170–1188.

Miller, G. A. (1956). The magical number seven, plus or minus two. *Psychological Review*, 63(2), 81–97. https://psycnet.apa.org/record/1957-02914-001

Tufte, E. R. (2001). *The Visual Display of Quantitative Information* (2nd ed.). Graphics Press.

Tufte, E. R. (2006). *Beautiful Evidence*. Graphics Press. https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/

SwissCanto (2024). Swiss real estate funds — overpriced or undervalued? https://www.swisscanto.com/ch/en/institutionelle/blog/asset-management/2024/swiss-real-estate-premium-discount.html

Morningstar Design System (2025). Card component documentation. https://designsystem.morningstar.com/components/card/

Laws of UX (2024). Miller's Law. https://lawsofux.com/millers-law/

IxDF / Interaction Design Foundation (2024). Preattentive visual properties. https://ixdf.org/literature/article/preattentive-visual-properties-and-how-to-use-them-in-information-visualization

Playfair Data (2023). Applying Gestalt principles to dashboard design. https://playfairdata.com/applying-gestalt-principles-to-dashboard-design/

Nielsen Norman Group (2023). How chunking helps content processing. https://www.nngroup.com/articles/chunking/

Acuity Knowledge Partners (2024). Essential components of a fund factsheet. https://www.acuitykp.com/essential-components-of-a-fund-factsheet/

---

## Practitioner Resources

**Cognitive science**
- Laws of UX: https://lawsofux.com (Miller's Law, Chunking, Proximity, Serial Position Effect)
- IxDF (Interaction Design Foundation): https://ixdf.org

**Typography**
- RWT typography tips on OpenType figures: https://rwt.io/typography-tips/facts-about-figures-numeric-styles-opentype-features

**Dashboard design**
- Playfair Data blog (Gestalt, whitespace, dashboard elements): https://playfairdata.com
- Morningstar Design System: https://designsystem.morningstar.com

**Financial factsheet design**
- Acuity Knowledge Partners factsheet guide: https://www.acuitykp.com/essential-components-of-a-fund-factsheet/
- Anevis Solutions: 5 statistics investors want on a fund factsheet: https://www.anevis-solutions.com/2019/5-statistics-investors-want-see-fund-fact-sheet/

**Swiss RE fund references**
- SwissCanto premium/discount analysis: https://www.swisscanto.com/ch/en/institutionelle/blog/asset-management/2024/swiss-real-estate-premium-discount.html
- SIX Real Estate Indices: https://www.six-group.com/en/market-data/indices/switzerland/real-estate/further-indices.html

---

*Survey compiled March 2026. Part of the SAMOA institutional report design system research corpus.*
