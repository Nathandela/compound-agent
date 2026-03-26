---
title: "Financial Data Visualization for Investment Vehicle Factsheets"
date: 2026-03-19
summary: "Synthesizes academic research across nine domains relevant to factsheet visualization including performance charts, risk visualization, and evidence-based chart selection grounded in perceptual psychology."
keywords: [design, financial-reports, data-visualization, factsheets, perceptual-psychology]
---

# Financial Data Visualization for Investment Vehicle Factsheets

**A Comprehensive Academic Survey**

*Prepared for investment professionals designing factsheet presentation systems for Swiss real estate funds and regulated investment vehicles.*

---

## Abstract

Investment factsheets occupy a unique and demanding intersection of regulatory obligation, investor communication, and design constraint. Unlike general-purpose dashboards or analytical tools, factsheets must convey complex financial information — performance, risk, allocation, portfolio composition — within tightly bounded two-dimensional space, often destined for both high-resolution print and screen display. This survey synthesizes academic research and practitioner knowledge across nine domains relevant to factsheet visualization: performance chart design, bar and column charts, distribution and allocation charts, sparklines, risk visualization, typography-data integration, print versus screen considerations, regulatory requirements, and evidence-based chart selection grounded in perceptual psychology. We examine the foundational empirical work of Cleveland and McGill (1984), its crowdsourced replication by Heer and Bostock (2010), and their downstream implications for chart type selection in space-constrained environments. The survey is written for practitioners building factsheet generation systems for regulated vehicles — particularly Swiss CISA funds and UCITS products — where design choices carry both communicative and compliance consequences. We identify open research problems including automated layout optimization, adaptive regulatory templating, and the emerging role of large language models in chart narration. The survey concludes with practitioner resources and a curated reference list.

---

## 1. Introduction

The investment factsheet is a document type with no exact analogue in other communication domains. It is simultaneously a legal disclosure, a marketing instrument, a performance report, and a compressed data dense summary — all constrained to a format rarely exceeding four pages, and in the Swiss fund context, often just one or two. The Swiss Federal Act on Collective Investment Schemes (CISA) and its implementing ordinance (CISO) impose specific disclosure requirements; UCITS management companies must produce Key Investor Information Documents (KIIDs); the European PRIIPs Regulation imposes further standardization on packaged retail investment products. Within these constraints, designers and developers must communicate decades of performance history, risk metrics, portfolio composition across dozens of positions, and forward-looking scenario analyses — in a way accessible to both sophisticated institutional investors and retail clients.

Visualization is the primary mechanism through which this compression is achieved. A well-designed performance chart communicates the growth trajectory of a fund over a decade in the space of a thumbnail. A color-coded allocation donut conveys portfolio composition at a glance. A sparkline embeds a mini time series inside a table cell. These are not decorative elements; they are the functional infrastructure of investor communication.

Yet the academic literature on financial data visualization remains fragmented. Foundational work in perceptual psychology (Cleveland & McGill, 1984; Ware, 2004) provides general principles for graphical accuracy. Specific studies on financial chart design are rarer, and work addressing the particular constraints of factsheets — fixed layout, print/screen duality, regulatory overlay — is sparser still. This survey attempts a synthesis across these literatures, organized around the specific visualization problems practitioners face.

The scope of this survey is deliberately applied. We do not aim to contribute novel experimental findings. Instead, we compile, interpret, and prioritize existing knowledge for the factsheet design context. Where academic evidence is strong, we report it with appropriate confidence. Where evidence is weak or absent, we flag the gap and note practitioner consensus where it exists.

Section 2 establishes perceptual and information-theoretic foundations. Section 3 develops a taxonomy of visualization approaches relevant to factsheets. Section 4 provides extended analysis of nine key approaches. Section 5 synthesizes these analyses into comparative guidance. Section 6 identifies open research problems. Section 7 concludes. References and practitioner resources follow.

---

## 2. Foundations

### 2.1 Perceptual Accuracy and the Cleveland-McGill Hierarchy

The most influential empirical framework for chart type selection originates with Cleveland and McGill (1984), who proposed and tested a hierarchy of elementary perceptual tasks — the operations humans perform when reading quantitative graphs. Their hierarchy, from most to least accurate, runs approximately: position along a common scale, position along non-aligned scales, length, direction and angle, area, volume, curvature, and finally color saturation or hue.

The practical implication is stark: charts that encode data in position (bar charts, line charts, dot plots) are more accurately readable than those encoding data in angle (pie charts) or area (bubble charts, treemaps). Cleveland and McGill's original experiments used small subject pools and relatively simple stimuli, but the directional findings have been robust to subsequent replication.

Heer and Bostock (2010) conducted a large-scale crowdsourced replication using Amazon Mechanical Turk, confirming and extending the original hierarchy. Their work added gradient charts and other modern chart types to the tested set, and found that the original ordinal ranking held well even with a heterogeneous online population. Importantly for factsheet design, they confirmed that pie chart angle judgments are substantially less accurate than bar chart length judgments for the same underlying data — a finding with direct implications for the ubiquitous allocation pie chart.

Ware's (2004) textbook on information visualization provides the neuroscientific grounding for these findings. Pre-attentive features — color, orientation, size, motion — are processed in parallel by the visual system before focal attention is engaged. Effective data visualization exploits pre-attentive processing to enable rapid pattern detection. For factsheets, where reader attention is limited and the document may be scanned rather than read, pre-attentive encoding of key messages (fund outperforms benchmark in green; negative return periods in red) is particularly valuable.

### 2.2 Information Density and the Tufte Principles

Edward Tufte's contributions to visualization theory (1983, 1990, 2001) provide a complementary framework centered on information density and the elimination of chartjunk. His core metric, the data-ink ratio, defines the fraction of a chart's ink that encodes actual data versus decorative or redundant elements. In the factsheet context, where space is at an absolute premium, Tufte's preference for high data-ink ratios aligns well with practical necessity.

Tufte's concept of small multiples — the same chart design repeated across conditions or time periods to facilitate comparison — is particularly relevant for factsheet risk visualization, where showing multiple metrics across the same time window enables rapid comparison without forcing the reader to decode a complex multi-series chart.

His introduction of the sparkline (Tufte, 2006) — a word-sized, stripped-down time series chart — has become a standard factsheet element, particularly in performance tables where each row represents a holding or peer fund.

### 2.3 Gestalt Principles and Layout

The Gestalt principles of perceptual organization — proximity, similarity, closure, continuity, common fate — are well-established in general design education but have received less systematic empirical attention in the financial visualization context specifically. Proximity groups related information; similarity signals membership in a category; closure allows readers to perceive implied boundaries in white space. In factsheet layout, these principles govern how chart grids, label placement, and whitespace guide the reader's eye.

Bertin's semiology of graphics (1967; English translation 1983) provides a formal grammar for visual variables: position, size, shape, value (brightness), color, orientation, and texture. Bertin argued that each visual variable has specific perceptual properties making it suitable for specific data types: position for ordered and quantitative data; color hue for nominal categories; size for ordered magnitudes. This grammar, though predating modern screen-based visualization, remains foundational for systematic chart design decisions in factsheets.

### 2.4 Cognitive Load and Working Memory

Sweller's cognitive load theory (1988, 1994) provides a framework for understanding why overly complex factsheet visualizations fail. Working memory is limited: humans can hold approximately four chunks of information simultaneously (Cowan, 2001). Visualizations that require integrating many simultaneously present elements impose high intrinsic cognitive load on the reader. In factsheet design, this argues for modular chart layouts where each visualization addresses one primary question, and for clear hierarchical labeling that scaffolds comprehension.

Mayer's multimedia learning theory (2001) — originally developed for educational contexts — extends these ideas to the interaction between text and graphics. His principle of spatial contiguity (related text and graphics placed near each other) and the signaling principle (visual cues directing attention) have direct factsheet design implications, suggesting that chart titles, callouts, and annotations placed at the point of insight outperform separate legend boxes.

---

## 3. Taxonomy of Visualization Approaches

Factsheet visualizations can be classified along three independent dimensions:

**Encoding dimension**: What perceptual variable encodes the data? Position (line charts, bar charts, scatter plots), length (bar charts), angle (pie charts), area (treemaps, bubble charts), color (heatmaps, choropleth maps), or combinations thereof.

**Temporal dimension**: Is the chart static (snapshot of a single moment) or dynamic (showing change over time)? Line charts and area charts are inherently temporal. Bar charts can represent either a snapshot (allocation at a date) or comparison across dates (MTD/YTD/5Y returns). Sparklines compress temporal change into minimal space.

**Analytical function**: What question does the chart answer? Performance questions (how has the fund returned?), composition questions (what does the portfolio hold?), risk questions (how volatile is the fund?), comparison questions (how does the fund compare to peers or benchmarks?), or distributional questions (what is the statistical profile of returns?).

Within the factsheet domain, the most common chart types map to analytical functions as follows:

| Analytical Function | Primary Chart Types | Common Alternatives |
|---|---|---|
| Historical performance | Line chart (NAV/indexed) | Area chart |
| Period return comparison | Bar chart (grouped) | Bullet chart |
| Portfolio allocation | Donut/pie chart | Treemap, waffle chart |
| Geographic distribution | Choropleth map | Bar chart, treemap |
| Risk profile | SRI indicator, volatility bands | Risk/return scatter |
| Inline time series | Sparkline | Icon arrays |
| KPI summary | Big number display | KPI tile with sparkline |
| Drawdown | Area chart (negative) | Line chart with shading |

This taxonomy guides the analysis in Section 4.

---

## 4. Analysis of Key Approaches

### 4.1 Performance Chart Design

The performance chart is the centerpiece of most fund factsheets. It communicates the fund's return history over a meaningful horizon — typically inception to date, or the maximum available history — often alongside a benchmark or peer index. Design decisions at this level have large communicative consequences.

**Scale selection: logarithmic versus linear**

The choice between linear and logarithmic y-axis scales is among the most consequential and least discussed in practitioner literature. A linear scale correctly represents absolute change: a move from 100 to 150 and from 150 to 200 appear as equal vertical distances, correctly representing equal 50-unit gains. However, for compound returns over time, the economically meaningful quantity is percentage change, not absolute change. A 50% gain from a base of 100 (to 150) is vastly more significant than a 50-unit gain from a base of 1000.

A logarithmic scale corrects this by mapping equal multiplicative factors to equal vertical distances. The same 50% return gain appears with the same height regardless of the absolute price level. For long-horizon performance charts covering decade-long periods with substantial compound growth, log scale is the academically preferred representation (Spence & Lewandowsky, 1991). However, log scale is less intuitive for general audiences — the nonlinear axis labeling creates interpretive friction.

A practical resolution: use log scale for long-horizon charts (10+ years) targeting sophisticated investors, linear scale for shorter-horizon charts or retail factsheets. Always label the scale clearly. Never suppress the y-axis origin on a linear chart without explicit justification.

**Indexed return conventions and base normalization**

The convention of indexing a fund's performance to a base value of 100 at a defined start date enables direct visual comparison with benchmarks and peers that may have different absolute price levels. The formula is straightforward: indexed value at time t = (price at t / price at base date) * 100. This representation answers the question: if an investor had placed 100 units of currency in this fund on the base date, what would their holding be worth today?

Base date selection matters. Inception-to-date charts should use the fund's inception date. Calendar-year charts use January 1. Period charts (5Y, 3Y, 1Y) use the appropriate anniversary date. Mixing conventions within a factsheet creates interpretive confusion.

When overlaying benchmark performance on a fund performance chart, both series must be indexed to the same base date at the same value (typically 100). The visual gap between the two series at any point represents relative cumulative performance — the fund's alpha since the base date. This visual alpha gap is among the most communicatively potent elements of the factsheet, and design decisions about line weights, colors, and fill between the lines (if used) significantly affect its legibility.

**Area charts versus line charts**

Area charts fill the region between the performance line and the x-axis (or between two lines). When used for a single series, the filled area adds visual weight but no additional information relative to a line chart — it is purely aesthetic. When used to represent a range (e.g., confidence bands around a forecast, or the spread between fund and benchmark), area fill between two lines effectively communicates the evolving differential.

The risk of area charts is misleading area comparisons: readers may incorrectly compare areas rather than line heights, importing pie-chart-style area perception errors into what should be a position-based judgment. For factsheets with multiple overlapping series, line charts with distinct colors and line weights generally outperform area charts in readability.

**Benchmark overlay design**

Benchmark lines should be visually subordinate to the fund's own series, typically achieved through a lighter weight line, a lower-saturation color, or a dashed line style. A common convention: fund in a solid primary color (often the brand color), benchmark in a medium-weight neutral gray. This ensures the fund's trajectory is the visual foreground while the benchmark remains a legible reference.

Labels placed at the end of each series (terminal labels) outperform boxed legends in factsheet performance charts, as shown by studies on label placement and tracking efficiency (Haroz, Kosara & Franconeri, 2016). For two-series charts (fund + benchmark), end labels eliminate the cognitive step of matching line to legend entry.

### 4.2 Bar and Column Charts in Factsheets

Bar and column charts are the primary visualization for period return comparison — the now-standard presentation of MTD, QTD, YTD, 1Y, 3Y (annualized), 5Y (annualized), and since-inception returns that appears in nearly every factsheet.

**Orientation: vertical columns versus horizontal bars**

The factsheet convention is overwhelmingly vertical columns, with time periods or return windows on the x-axis. This orientation is natural for "how much did the fund return in each period?" — it maps the periods as discrete comparison categories and return magnitude as height. Horizontal bar charts excel when category labels are long (they naturally accommodate longer text), or when the number of categories is large enough that vertical columns become narrow. For the six-to-eight standard return windows of a fund factsheet, vertical columns are appropriate and conventional.

**Positive/negative color encoding**

The canonical encoding for return bars is positive returns in green, negative returns in red — a convention so entrenched across factsheet systems that deviation creates cognitive friction. This green-positive/red-negative convention aligns with western financial semiotics and exploits color's pre-attentive processing to enable immediate identification of negative-return periods without reading labels.

The accessibility concern is real: red-green color blindness affects approximately 8% of men and 0.5% of women of northern European ancestry. For accessible factsheet design, a supplementary pattern encoding (positive bars with no fill, negative bars with a diagonal hatch, for example) combined with color preserves the convention while enabling red-green colorblind readers to distinguish bar sign. Alternatively, blue-orange or blue-red encoding has been validated as colorblind-accessible while preserving semantic intuition.

**Reference line at zero**

For return bar charts, the zero-return line is not a mere axis element but a semantically meaningful boundary. Bars extending above zero represent positive returns; bars extending below represent losses. The zero line must be explicitly present and visually prominent — typically a slightly heavier weight than grid lines. Charts that omit the zero line, or that truncate the y-axis above zero, are not merely aesthetically suboptimal: they are potentially misleading under ESMA guidelines on fair presentation of performance data.

**Grouped versus stacked bars for category comparison**

Grouped bars (bars from different series placed side by side within each category) excel at fund-versus-benchmark comparison within each return period: the visual task is a pairwise height comparison, which the visual system performs accurately. Stacked bars (segments of the same bar representing different components) excel at showing part-to-whole relationships where the total is meaningful. In factsheet contexts, grouped bars dominate for period return comparison; stacked bars appear more commonly in contribution-to-return analyses where sectoral or asset class contributions sum to total return.

### 4.3 Distribution and Allocation Charts

Portfolio composition visualization is among the most contested domains in factsheet design, pitting the widespread use of pie and donut charts against academic evidence favoring more accurate alternatives.

**Pie versus donut charts: the academic evidence**

Cleveland and McGill's (1984) hierarchy places angle judgment — the primary perceptual task in pie chart reading — below length judgment (bar charts) in accuracy. The specific mechanism is that human angle perception is subject to systematic biases: angles near 90 and 180 degrees are overestimated, while obtuse angles in other orientations are underestimated. Spence (2005) confirmed that pie chart segment estimation is significantly less accurate than equivalent bar chart reading, particularly for segments under 5% or over 50% of total area.

Despite this evidence, pie and donut charts remain the dominant factsheet convention for allocation display, for several reasons. First, the part-to-whole relationship is immediately readable: the entire chart represents 100% of the portfolio, and segments represent fractions thereof. Second, for portfolios with a small number of large allocations (3-6 categories, each representing 10%+ of the portfolio), angular judgment errors are less severe and the convention's familiarity outweighs accuracy concerns. Third, the donut variant — which replaces the solid pie with an annular ring — has the practical advantage of creating a center void where a total value or key metric can be displayed, improving information density.

The academic recommendation is context-dependent: donut charts are appropriate for allocation displays with 3-7 categories where the primary message is relative magnitude among large segments. For detailed allocations with many small segments (geographic distribution across 20+ countries, sectoral allocation across 12 sectors), alternatives are superior.

**Treemaps for portfolio composition**

Treemaps (Johnson & Shneiderman, 1991) encode hierarchical data through nested rectangles proportional in area to data values. For portfolio visualization, a treemap with rectangle areas proportional to portfolio weight enables simultaneous display of many more holdings than a pie chart — a 30-holding treemap remains readable where a 30-segment pie chart is illegible.

The perceptual limitation is area judgment accuracy: area estimation is lower in the Cleveland-McGill hierarchy than length or position. Treemaps trade categorical precision (exact percentage readout) for breadth (showing many holdings simultaneously). For factsheet contexts where the primary communication goal is conveying the dominant positions and overall structure of a portfolio rather than enabling precise weight comparison, this trade-off is often favorable.

**Geographic maps for real estate allocation**

Swiss real estate funds and real asset vehicles with geographic concentration require geographic allocation visualization. A choropleth map — regions shaded in proportion to portfolio weight or another metric — is the natural choice for geographic data, exploiting readers' spatial knowledge of geography to make allocation patterns instantly interpretable.

For Switzerland-focused factsheets, a cantonal map with canton-level shading conveys regional concentration effectively. Design parameters include: color scheme selection (sequential single-hue for ordered data like weight percentage, diverging for signed data like over/underweight versus a benchmark), legend design, and projection choice.

The perceptual limitation of choropleth maps is the area-size confound: large geographic regions (Uri, Graubünden) appear visually dominant even when they contain small population and investment weight, while small but economically dense regions (Geneva, Zurich) are visually small. This confound is well-documented in cartographic literature (Dent, 1999). Mitigation strategies include cartogram representations (where geography is distorted to equalize area per unit of investment weight) or supplementary bar charts showing the same data without spatial encoding.

**Waffle charts as alternative**

Waffle charts — grids of 100 cells where filled cells represent percentage — offer an alternative to pie charts that avoids angle judgment entirely. Each cell represents 1%, and allocation is read by counting or estimating groups of cells. Waffle charts are more accessible to readers who struggle with circular representations, and provide a consistent unit of comparison across multiple panels.

The limitation is scalability: waffle charts for allocations with many segments become visually congested. They work best for simple two- or three-category compositions (e.g., equity/bond/cash, domestic/international).

### 4.4 Sparklines

Tufte introduced the sparkline concept in his 2006 book "Beautiful Evidence" as "a small, high resolution graphic usually embedded in a full resolution of data." The canonical sparkline is a miniaturized line chart, typically word-sized (roughly the height of a capital letter and several characters wide), stripped of all axes, labels, and peripheral elements. It conveys the shape and direction of a time series — trend, volatility, recent change — in minimal space.

**Application in financial tables**

In factsheet tables, sparklines typically appear in a column adjacent to numeric performance or return figures. A table row might show: fund name | sparkline of 1Y NAV history | 1M return | 3M return | 12M return | volatility. The sparkline adds the qualitative time-series shape that the scalar return figures cannot convey — a 10% annual return achieved via smooth upward trend is very different from one achieved via volatile oscillation with recovery.

Sparklines are particularly valuable in peer comparison tables where multiple funds are shown in parallel rows. The parallel sparklines enable rapid visual comparison of trajectory shape across peers, a comparison that would require much larger charts if each fund had its own full-size performance chart.

**Design parameters**

The most contested sparkline design parameter is y-axis scaling. Tufte's original recommendation was to scale each sparkline independently, fitting the data to the available height — the "auto-scale" convention. This maximizes within-sparkline readability: the full height range conveys shape clearly even for low-volatility series.

The alternative — anchoring y-axis at zero — ensures that sparklines within a table column are visually comparable: a series that fills half the sparkline height has genuinely larger absolute variation than one that fills a quarter. However, for smoothly trending series with low volatility, zero-anchored sparklines may appear nearly flat, conveying no shape information.

The resolution for factsheet practice depends on context. For peer comparison tables where cross-row comparability is important, a shared y-axis range (the same min/max applied to all sparklines in the column) balances within-sparkline readability against cross-sparkline comparability. For single-fund tables showing different metrics, independent scaling is often preferable.

The visual parameters of sparklines — line weight, color, width-to-height aspect ratio — significantly affect perceived volatility. Tufte recommended high-resolution rendering (the sparkline line itself should be as thin as the rendering allows) and consistent aspect ratio. Banking to 45 degrees — the principle from Cleveland (1993) that line chart slopes near 45 degrees best support trend slope judgments — suggests sparkline aspect ratios should be calibrated to the expected return volatility of the displayed asset class.

### 4.5 Risk Visualization

Risk is inherently abstract — it represents the distribution of possible future outcomes, not a single realized value. This abstraction creates fundamental visualization challenges: how do you display uncertainty effectively to investors who may not be trained in probability?

**Volatility bands**

Volatility bands around a performance line — typically mean ± 1 standard deviation, or a fixed-width channel based on rolling volatility — communicate the range of variation that the fund has exhibited. Fan charts, which show expanding probability cones around a current position (wider into the future, narrower near the present), are used in central bank communications (Bank of England fan charts are the canonical example) but have seen limited adoption in factsheet contexts due to their implication that future uncertainty is being predicted.

For historical risk display, a shaded band between the performance line and a ± one-standard-deviation envelope gives a visual representation of return distribution over time. Wider bands indicate higher volatility periods; narrower bands indicate lower volatility. The perceptual limitation is that band width is an area encoding — subject to the area perception inaccuracies described earlier. However, for the qualitative purpose of communicating "this period was more volatile than that one," the area encoding is usually sufficient.

**Drawdown charts**

The maximum drawdown — the peak-to-trough decline during a specific period — is a critical risk metric for investment funds. Its visualization as a drawdown chart plots the running drawdown (current value minus previous peak, expressed as a percentage) over time. This creates a chart that sits at or below zero, with deeper troughs indicating larger drawdowns.

Drawdown charts are highly effective for communicating downside risk events to investors. The 2008-2009 financial crisis drawdown, the 2020 COVID-19 drawdown, and the 2022 rate-rise drawdown are legible as distinct troughs in a properly constructed drawdown chart for any fund with appropriate history. The chart answers: "How bad did it get, when, and for how long?"

The design recommendation is to fill the drawdown area with a moderate-saturation red or orange, creating a visual metaphor for "underwater" periods. Maximum drawdown annotations (labeling the deepest trough with its percentage value and date) significantly improve communicative value.

**Risk/return scatter plots**

For peer comparison contexts, a scatter plot encoding annualized return on the y-axis and annualized volatility on the x-axis — the classic risk/return space — enables visual comparison of a fund against its peers and benchmark simultaneously. The "northwest" quadrant (high return, low risk) is the desirable region; funds in the "southeast" quadrant (low return, high risk) are clearly suboptimal.

Scatter plot design for factsheet use requires careful attention to data point labeling (which points are labeled, and how) and axis range selection (which should encompass the full peer universe). Color encoding of data points by category (active vs. passive, domestic vs. international) adds an additional dimension without perceptual cost, since color hue is a pre-attentive feature.

**Correlation matrices**

Correlation matrices — heatmaps encoding pairwise correlation coefficients between assets or factors — are standard in risk reporting but unusual in factsheets due to space constraints. When they appear, design choices include color scale direction (red for high positive correlation, blue for negative, with white or pale neutral at zero, following the diverging scale convention), labeling of the correlation coefficient within each cell (for matrices up to approximately 6×6), and ordering of rows/columns to cluster correlated assets visually.

Ward clustering of the correlation matrix — ordering rows and columns so that highly correlated assets are adjacent — substantially improves readability compared to arbitrary ordering (Wilkinson & Friendly, 2009).

**Value-at-Risk visualization**

Value-at-Risk (VaR) is a quantile of the return distribution: the 1% VaR is the loss exceeded only 1% of the time. Visualizing VaR most naturally as a point on the return distribution density — a vertical line at the VaR percentile, with the tail region beyond it shaded — communicates both the VaR level and its relationship to the full distribution. However, return distribution density plots require sufficiently long return histories to be meaningful, and their statistical nuance may exceed the capacity of retail factsheet audiences.

For retail factsheets, the PRIIPs-mandated performance scenarios (favorable, moderate, unfavorable, stress) provide a regulatory-compliant risk communication format that substitutes prescribed scenarios for full distributional display.

### 4.6 Typography-Data Integration

The largest numbers in a factsheet — the current NAV, the YTD return, the fund size in AUM — deserve visual prominence proportional to their communicative importance. Typography-data integration refers to the design discipline of making key numeric values function as primary visual elements rather than tabular entries.

**Big number displays**

A "big number" or "hero metric" display presents a key value in large type — typically 24-48pt in a factsheet context — with a brief label in smaller type. The visual hierarchy communicates immediately: this is the number that matters. Supporting context (comparisons, units, date) is presented in subordinate type size.

The design challenge is selecting which metrics merit this treatment. Common factsheet hero metrics: current NAV per share, total AUM, YTD return, the number of properties (for real estate funds). The selection should reflect the investor's primary question about the fund, which varies by fund type and investor audience.

**KPI tiles with embedded micro-charts**

KPI tiles combine a big number display with an embedded sparkline or directional indicator, creating a dense information unit that conveys: the current value, the historical trend, and the recent change direction. The tile format — a bounded rectangular region with the metric, the sparkline, and the change indicator — is widespread in management dashboard design and has migrated to financial factsheets.

Design parameters for KPI tiles in factsheet contexts: tile borders should be minimal (a light background fill is preferable to border lines, which add visual clutter); the metric label should be subordinate to the value; the sparkline should use the same color as other performance elements in the factsheet for consistency; directional arrows (up/down) should use the established green/red color convention.

**Progress bars as data elements**

Progress bars — horizontal bars where fill proportion represents a fraction of a maximum — function as length-encoded data elements in factsheet tables. Common uses: showing how a fund's current yield or NAV compares to its historical range (a progress bar spanning the historical min/max, with a marker at current value); showing occupancy rates for real estate funds (a bar filled to the current occupancy percentage); showing portfolio diversification metrics relative to a regulatory maximum.

Progress bars leverage position-along-scale perception (the most accurate perceptual task in the Cleveland-McGill hierarchy) and occupy minimal vertical space, making them efficient factsheet elements.

**Up/down arrows with semantic color**

Directional indicators — triangular arrows pointing up or down — combined with green/red color encoding, provide the fastest possible communication of positive/negative change for readers scanning a performance table. The combination of shape (arrow direction) and color (green/red) provides redundant encoding: readers who cannot distinguish the colors can read the arrow, and vice versa. This redundancy improves accessibility without requiring separate accessible variants.

### 4.7 Print versus Screen Considerations

Factsheets are routinely produced for both print distribution (PDF sent to institutional investors, printed quarterly reports) and screen display (web-based factsheet portals, digital distribution to wealth management platforms). These two output modes have substantially different technical requirements that affect visualization design.

**Resolution requirements**

Print production at professional quality requires 300 dots per inch (DPI) at the final print size. A chart that appears at 10cm × 6cm on the printed page must be rasterized at (10/2.54 × 300) × (6/2.54 × 300) = 1181 × 709 pixels at minimum. Text elements at print resolution are rendered at substantially higher pixel counts than screen equivalents, enabling the very fine sparkline lines and small-font annotations that characterize high-quality print factsheets.

Screen display operates at 96-144 DPI for standard displays, with 192-288 DPI on HiDPI/Retina displays (a 2× or 3× physical pixel density at the same logical resolution). For screen-targeted factsheets, the 96-DPI baseline constrains fine detail: sparkline lines thinner than 1-2 CSS pixels become invisible on standard screens, whereas the same 0.5pt line renders clearly at 300 DPI print.

The practical resolution for factsheet systems producing both print and screen outputs: generate charts as vector graphics (SVG for screen, PDF or EPS for print) at all times. Vector formats are resolution-independent: the same file renders at 96 DPI for a browser and at 300 DPI for a printer without quality loss.

**Color gamut limitations**

Print and screen color spaces differ fundamentally. Screen displays use RGB color, with a color gamut that encompasses much of the sRGB color space. Print production uses CMYK (cyan, magenta, yellow, key/black) ink, which cannot reproduce all sRGB colors. Highly saturated screen colors — particularly bright blues, greens, and reds — may reproduce as dull or muddy in CMYK print if not color-managed.

For factsheet color design, the safe approach is to define the primary brand and data colors in CMYK first, derive the RGB equivalents from the CMYK specification, and test screen rendering against the intended print output. Colors near the boundaries of the CMYK gamut — vivid blue-greens, saturated purples — are particularly prone to gamut compression on press.

A secondary print consideration is paper stock: uncoated (matte) paper absorbs ink differently than coated (glossy) stock, reducing apparent saturation and sharpness. Factsheets printed on uncoated stock may require slightly higher-saturation colors in the specification to achieve the intended appearance.

**Vector versus raster chart formats**

Vector formats (SVG, PDF, EPS) encode charts as mathematical descriptions of shapes, lines, and curves. They scale without quality loss and enable full text searchability of chart labels. Raster formats (PNG, JPEG, TIFF) encode charts as pixel grids that lose quality when scaled beyond their native resolution.

For factsheet systems, vector chart generation should be the default. Python's Matplotlib library supports SVG and PDF output natively; Plotly generates interactive SVG-based charts. The principal exception is geographic maps, where raster tile backgrounds (satellite imagery, styled map tiles) require raster handling even if vector overlays are applied.

**Interactive versus static design patterns**

Interactive factsheets — web-based documents with hoverable tooltips, zoomable time series, and filterable allocation displays — extend the information density of static factsheets by making data accessible on demand rather than requiring all information to be simultaneously visible. Hoverable chart elements can display precise values without on-chart labels that would otherwise clutter the visualization.

However, interactive features are inappropriate for PDF factsheets, printed documents, and any regulatory submission requiring exact archivable presentation. The design implication: develop charts to be fully informative as static visualizations (assuming no interaction), then progressively enhance with interactive features for web delivery. This "static-first" approach ensures print compatibility while enabling screen enhancements.

### 4.8 Regulatory Chart Requirements

Regulated investment vehicles operating in Switzerland and Europe face specific visualization requirements, some of which are prescribed in detail by regulation, others of which are implied by regulatory principles of fair presentation.

**UCITS/KIID Synthetic Risk Indicator (SRI)**

The UCITS Key Investor Information Document (KIID) required a Summary Risk Indicator displayed as a horizontal scale from 1 (lower risk) to 7 (higher risk), with the fund's risk class highlighted. This single-row visualization — essentially a categorical scale with a position marker — is unusual in financial visualization because its format is prescribed by EU regulation (UCITS implementing regulations, CESR/10-673) rather than chosen by the designer.

**PRIIPs Performance Scenarios**

The PRIIPs Regulation (EU 1286/2014) and its Regulatory Technical Standards introduced a mandated performance scenarios display: four scenarios (stress, unfavorable, moderate, favorable) each showing the projected outcome at 1, half the recommended holding period, and the recommended holding period. The display format is a table (not a chart), but its content — projected monetary values under each scenario — constitutes regulated data visualization requiring actuarially sound methodology.

The PRIIPs scenario calculation methodology has been extensively criticized (ESMA, 2021) for producing optimistic projections in the pre-pandemic low-volatility environment and for creating comparability problems across product types. The regulatory response has been methodology revisions rather than visualization changes, but practitioners should be aware that the mandated display format reflects the regulatory intention to enable cross-product comparison rather than optimal single-product communication.

**Swiss CISA Required Disclosures**

The Swiss Federal Act on Collective Investment Schemes (CISA) and the Collective Investment Schemes Ordinance (CISO) require specific performance-related disclosures for collective investment schemes. The Swiss Financial Market Supervisory Authority (FINMA) publishes implementing guidelines on required content, which includes historical performance presentation.

Swiss fund factsheets must include performance data adjusted for fees and charges (TER-adjusted net performance), performance over standardized periods, and, for funds with less than 5 years of history, a disclosure that the track record is short. Performance figures must not include projected or simulated data unless clearly labeled as such — a prohibition that constrains chart design for newer funds with limited historical data.

For Swiss real estate funds (Immobilienfonds under CISA Article 58+), specific additional disclosures apply: the fund's real estate portfolio metrics (number of properties, geographic distribution, vacancy rate) must be disclosed, creating the requirement for geographic allocation and property portfolio visualizations described elsewhere in this survey.

**Standardized presentation formats**

Beyond legally mandated formats, industry bodies provide standardized presentation conventions. The Swiss Funds & Asset Management Association (SFAMA) publishes model KIIDs and factsheet templates. The European Fund and Asset Management Association (EFAMA) provides similar guidance at the European level. These voluntary standards create de facto conventions that deviate from at their reputational risk — a factsheet that looks substantially different from the industry norm creates interpretive friction for experienced fund selectors who have internalized the standard format.

The practical implication for factsheet system design: build regulatory and convention-mandated elements as non-configurable templates, while allowing client-specific design customization within those constraints.

### 4.9 Evidence-Based Chart Selection

The empirical foundation for chart selection in factsheets rests primarily on Cleveland and McGill (1984) and Heer and Bostock (2010), augmented by subsequent work on specific chart types.

**The perceptual accuracy hierarchy in practice**

Cleveland and McGill's hierarchy, ordered from most to least accurate perceptual task:

1. Position along a common scale
2. Position along non-aligned scales
3. Length
4. Direction / Angle
5. Area
6. Volume
7. Curvature
8. Shading / Color saturation

For factsheet designers, this hierarchy provides direct selection guidance. When choosing between chart types to display the same data, prefer the type that uses higher-ranked perceptual tasks. Return comparisons encoded as bar chart heights (length) are more accurately read than the same data in a pie chart (angle). Portfolio allocations in a treemap (area) are less accurately read than in a bar chart (length).

However, accuracy is not the only selection criterion. Clarity of part-to-whole relationship (pie charts), space efficiency (sparklines), regulatory compliance (SRI indicator), and audience familiarity all enter the selection decision. The hierarchy provides a principled basis for trade-off analysis rather than a deterministic rule.

**Heer and Bostock's crowdsourced validation**

Heer and Bostock (2010) used Amazon Mechanical Turk to administer a revised version of Cleveland and McGill's graphical perception experiments to a large, diverse online sample. Their findings confirmed the original hierarchy for the tested elementary tasks, while also revealing that:

- Bubble charts (area encoding) are significantly less accurately read than bar charts or line charts
- Stacked bar charts introduce systematic errors when comparing inner segments (the inner segments' baselines vary, confounding length judgment)
- Color encoding for quantitative data (as in heatmaps) produces larger errors than position or length encoding

The stacked bar chart finding is particularly relevant for factsheet design: contribution-to-return charts that stack positive and negative contributions are subject to these baseline-variation errors when readers attempt to compare segment lengths across bars.

**Implications for constrained factsheet spaces**

The factsheet context adds a fourth constraint to the accuracy-clarity-familiarity triad: space efficiency. A factsheet with 4-6 sections and two pages maximum cannot afford the space a full dashboard would devote to each metric. This constraint argues for:

- Sparklines over full-size charts for contextual time series in tables
- Small-multiple grids over individual charts for multi-asset or multi-period comparisons
- KPI tiles over prose paragraphs for key metrics
- Combined chart types (bar chart with trend line overlay) over separate visualizations

The optimal chart for a given factsheet element is therefore the highest-accuracy chart type that fits the available space and satisfies regulatory requirements, adjusted for audience familiarity and the specific analytical question.

---

## 5. Comparative Synthesis

Across the nine visualization domains surveyed, several cross-cutting themes emerge that provide general guidance for factsheet design systems.

**The primacy of the perceptual task.** Chart type selection should start with the primary perceptual task the reader must perform to extract the key message. For comparison across discrete categories (return periods, geographic regions), position-encoded charts (bars, dots) outperform angle-encoded charts (pie). For part-to-whole composition with few segments, the familiarity and compactness of donut charts may justify the modest accuracy trade-off. For trend over time, line charts are dominant. Applying this framework consistently produces more defensible design decisions than relying on convention alone.

**Redundant encoding improves accessibility.** Encoding the same data variable in two perceptual channels (e.g., bar height and bar color, or arrow direction and arrow color) improves accessibility for readers with color vision deficiencies and speeds comprehension for all readers by providing two parallel paths to the same message. Factsheet systems should implement redundant encoding as a baseline, not an optional accessibility feature.

**Static-first design enables print compatibility.** Factsheet visualizations must be designed to function fully without interaction, as print and PDF distribution remain primary channels in institutional markets. Interactive features for web delivery should be additive enhancements to a static-competent baseline. This argues for generating charts as vector graphics from a single codebase, with interactive layer added for web rendering only.

**Regulatory constraints are binding, not advisory.** The KIID SRI indicator format, the PRIIPs scenario table, and CISA disclosure requirements are not design choices — they are legal obligations. Factsheet systems must implement these elements exactly as specified, with any design customization occurring within their prescribed formats. Automated regulatory compliance checking (validating that mandated elements are present, correctly computed, and correctly formatted) should be built into factsheet generation pipelines.

**Consistency beats local optimization.** Within a single factsheet, consistent use of color (the same color always represents the same entity), consistent scale conventions (the same time horizon conventions throughout), and consistent labeling format reduces the cognitive overhead of re-learning encoding with each new chart. Factsheet design systems should enforce global design tokens rather than allowing per-chart design decisions.

---

## 6. Open Problems and Research Frontiers

Despite the maturity of the underlying visualization literature, several important problems in factsheet visualization remain insufficiently solved.

**Automated layout optimization.** Factsheet content is dynamic: a fund with 10 years of history requires a different performance chart scale than one with 3 years; a 50-property real estate fund needs different allocation visualization than a 10-property fund. Current factsheet generation systems (typically templated PDF generation via Python/LaTeX/HTML-to-PDF pipelines) handle layout through manual template design for representative cases. Research on constraint-based layout optimization — systems that automatically adapt chart sizes, aspect ratios, and spatial arrangement based on the specific data being displayed — would substantially improve factsheet quality across diverse fund types.

**Adaptive regulatory templating.** Regulatory requirements for factsheets differ across jurisdictions (FINMA, FCA, BaFin, AMF, ESMA), evolve with regulatory change, and vary by fund type (UCITS, AIF, CISA fund, ELTIFs, etc.). Current systems require manual template updates when regulations change. A regulatory-knowledge-base approach — where regulatory requirements are formalized as constraints that drive template generation rather than embedded in fixed templates — would enable more robust compliance and faster adaptation to regulatory change.

**Uncertainty visualization for non-technical audiences.** The PRIIPs performance scenario methodology attempts to communicate distributional uncertainty through point estimates in prescribed scenarios, a compromise that sacrifices statistical accuracy for regulatory comparability. More generally, communicating investment uncertainty (the range of possible outcomes) to retail investors remains an unsolved design problem. Experimental work on fan charts, density plots, and icon arrays (Gigerenzer, 2011) suggests that frequency-based representations of uncertainty outperform probability-based ones for general audiences, but adoption in regulated factsheets is limited by the prescriptive nature of disclosure requirements.

**Cross-medium color management.** The RGB-to-CMYK conversion problem for financial visualization colors is well-understood in principle but poorly solved in practice for factsheet systems. Print-accurate color requires ICC profile management at the chart generation level — typically requiring specialized color management infrastructure that most Python-based factsheet systems lack. Open-source tooling for print-accurate color management in data visualization pipelines is an unmet need.

**Large language model integration for chart narration.** Emerging factsheet systems are beginning to integrate large language models to generate automated chart narratives — prose summaries describing the key messages of each chart, making factsheets accessible to investors who prefer text to graphics. This raises design research questions: what information from a chart should be narrated, in what order, at what level of detail? How should automated narratives handle ambiguous chart signals (e.g., a performance chart that shows outperformance over one horizon but underperformance over another)? The interaction between generated text and chart design is an open research frontier.

**Responsive design for factsheets.** Web-delivered factsheets viewed on mobile devices face layout constraints more severe than print: screen widths of 375-428 pixels at the standard mobile scale cannot accommodate two-column factsheet layouts. Responsive factsheet design — where the layout adapts to screen width while preserving informational completeness — is an active area of product development but has received little academic attention. The challenge is particularly acute for regulatory elements whose mandated format (designed for A4/letter print) may not adapt gracefully to portrait mobile screens.

---

## 7. Conclusion

Factsheet visualization sits at the convergence of rigorous empirical perceptual science, entrenched financial convention, binding regulatory requirements, and severe space constraints. No single principle governs all design decisions; instead, practitioners must navigate a hierarchy of constraints: regulatory compliance first, perceptual accuracy within compliance, space efficiency within accuracy, and aesthetic consistency throughout.

The foundations established by Cleveland and McGill (1984), replicated and extended by Heer and Bostock (2010), provide a principled basis for chart type selection that should replace uncritical convention following. Pie charts, while conventional, are less accurate than bar charts for the same data — a trade-off that is sometimes acceptable (part-to-whole composition with few large segments) and sometimes not (precise comparison of many small segments). Sparklines, properly designed, achieve extraordinary information density in minimal space. Drawdown charts communicate risk history more effectively than scalar risk statistics alone.

The print-and-screen duality of modern factsheet distribution argues for vector-first chart generation, static-first interaction design, and CMYK-aware color specification. Regulatory elements must be treated as non-negotiable constraints that drive template architecture, not style decisions that can be customized client by client.

For practitioners building factsheet generation systems — particularly for Swiss real estate funds and other regulated vehicles — the most impactful investments are: a robust vector chart generation pipeline (enabling quality at both print and screen resolutions), a design token system enforcing visual consistency across all factsheet elements, a regulatory compliance layer that validates required disclosures are present and correctly formatted, and a testing regime that validates chart output against both perceptual best practices and regulatory requirements.

The open problems identified in Section 6 — automated layout optimization, adaptive regulatory templating, uncertainty visualization, color management, LLM narration, and responsive design — represent the frontier where applied research and system design must advance together.

---

## References

Bertin, J. (1983). *Semiology of Graphics: Diagrams, Networks, Maps* (W. J. Berg, Trans.). University of Wisconsin Press. (Original work published 1967)

Cleveland, W. S. (1993). *Visualizing Data*. Hobart Press.

Cleveland, W. S., & McGill, R. (1984). Graphical perception: Theory, experimentation, and application to the development of graphical methods. *Journal of the American Statistical Association*, 79(387), 531–554. https://doi.org/10.2307/2288400

Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87–114.

Dent, B. D. (1999). *Cartography: Thematic Map Design* (5th ed.). McGraw-Hill.

European Securities and Markets Authority (ESMA). (2021). *ESMA Opinion on the PRIIPs KID: Review of the PRIIPs Delegated Regulation*. ESMA/2021/1543.

FINMA. (2013). *Collective Investment Schemes Ordinance (CISO-FINMA)*. Swiss Financial Market Supervisory Authority.

Gigerenzer, G. (2011). What are natural frequencies? *British Medical Journal*, 343, d6386.

Haroz, S., Kosara, R., & Franconeri, S. L. (2016). The connected scatterplot for presenting paired time series. *IEEE Transactions on Visualization and Computer Graphics*, 22(9), 2174–2186.

Heer, J., & Bostock, M. (2010). Crowdsourcing graphical perception: Using Mechanical Turk to assess visualization design. *CHI '10: Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 203–212. https://doi.org/10.1145/1753326.1753357

Johnson, B., & Shneiderman, B. (1991). Tree-maps: A space-filling approach to the visualization of hierarchical information structures. *Proceedings of the 2nd Conference on Visualization*, 284–291.

Mayer, R. E. (2001). *Multimedia Learning*. Cambridge University Press.

Spence, I. (2005). No humble pie: The origins and usage of a statistical chart. *Journal of Educational and Behavioral Statistics*, 30(4), 353–368.

Spence, I., & Lewandowsky, S. (1991). Displaying proportions and percentages. *Applied Cognitive Psychology*, 5(1), 61–77.

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285.

Sweller, J. (1994). Cognitive load theory, learning difficulty, and instructional design. *Learning and Instruction*, 4(4), 295–312.

Tufte, E. R. (1983). *The Visual Display of Quantitative Information*. Graphics Press.

Tufte, E. R. (1990). *Envisioning Information*. Graphics Press.

Tufte, E. R. (2001). *The Visual Display of Quantitative Information* (2nd ed.). Graphics Press.

Tufte, E. R. (2006). *Beautiful Evidence*. Graphics Press.

Ware, C. (2004). *Information Visualization: Perception for Design* (2nd ed.). Morgan Kaufmann.

Wilkinson, L., & Friendly, M. (2009). The history of the cluster heat map. *The American Statistician*, 63(2), 179–184.

Swiss Federal Council. (2006). *Federal Act on Collective Investment Schemes (CISA), SR 951.31*. Swiss Confederation.

European Parliament. (2014). *Regulation (EU) No 1286/2014 on key information documents for packaged retail and insurance-based investment products (PRIIPs)*.

European Commission. (2010). *UCITS IV Directive (2009/65/EC) implementing regulations*. Official Journal of the European Union.

CESR. (2010). *CESR's guidelines on the methodology for the calculation of the synthetic risk and reward indicator in the Key Investor Information Document* (CESR/10-673). Committee of European Securities Regulators.

---

## Practitioner Resources

### Libraries and Tools

**Python chart generation**
- **Matplotlib** (https://matplotlib.org): The foundational Python visualization library. Supports vector output (SVG, PDF). Best for print-quality static charts with fine-grained layout control.
- **Plotly** (https://plotly.com/python): Interactive chart library generating SVG-based interactive outputs. Best for web-delivered factsheets with hover tooltips.
- **Altair** (https://altair-viz.github.io): Declarative visualization library based on Vega-Lite. Excellent for consistent design-token-driven chart generation.
- **Seaborn** (https://seaborn.pydata.org): Statistical visualization layer on Matplotlib. Useful for correlation matrices and distribution plots.

**PDF generation**
- **WeasyPrint** (https://weasyprint.org): HTML/CSS to PDF conversion. Enables CSS-based layout for factsheet composition with embedded SVG charts.
- **ReportLab** (https://www.reportlab.com): Python-native PDF generation. Lower-level than WeasyPrint but highly controllable for exact positioning.
- **Typst** (https://typst.app): Modern document preparation system with Python integration; increasingly used for financial document generation.

**Geographic visualization**
- **GeoPandas** (https://geopandas.org): Spatial data manipulation for choropleth map generation.
- **Folium** (https://python-visualization.github.io/folium): Interactive Leaflet.js maps via Python. For web-delivered geographic allocation displays.

### Design References

- Schwabish, J. (2021). *Better Data Visualizations*. Columbia University Press. A practitioner-focused guide applying perceptual science to chart design.
- Knaflic, C. N. (2015). *Storytelling with Data*. Wiley. Applied chart design for business communication contexts.
- Cairo, A. (2016). *The Truthful Art*. New Riders. Covers both design and the ethics of accurate data representation — relevant for regulatory compliance contexts.

### Regulatory Resources

- **FINMA factsheet guidance**: https://www.finma.ch/en/regulation/
- **ESMA KIID guidelines**: https://www.esma.europa.eu/regulation/investor-protection/key-information-documents-packaged-retail-and-insurance-based-investment-0
- **SFAMA model documents**: https://www.sfama.ch/en/self-regulation/model-documents
- **PRIIPs RTS (Level 2)**: Commission Delegated Regulation (EU) 2017/653, as amended by Commission Delegated Regulation (EU) 2021/2268

### Color Management

- **Adobe Color** (https://color.adobe.com): For CMYK-safe color palette development.
- **Colorbrewer** (https://colorbrewer2.org): Research-backed color schemes for cartography, validated for print, screen, and colorblind safety. Essential for geographic allocation maps and heatmaps.
- **Viz Palette** (https://projects.susielu.com/viz-palette): Interactive tool for evaluating visualization color palettes under simulated color vision deficiencies.
