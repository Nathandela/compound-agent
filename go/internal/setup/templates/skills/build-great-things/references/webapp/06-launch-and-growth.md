# Phase 6: Launch & Growth

**Scope:** Onboarding flows, progressive disclosure, analytics instrumentation, retention mechanics, and feature adoption funnels. This phase answers the question: *once the app is built, how do you get users to their first moment of value, keep them coming back, and systematically learn what to build next?*

---

## Planned Sections (V2)

- `onboarding.md` — The paradox of the active user (Carroll & Rosson): users skip tutorials yet abandon without guidance; first-run experience patterns (checklists, product tours, empty states as onboarding, contextual tooltips); activation metrics and time-to-first-value; segmented onboarding by user role/intent
- `progressive-disclosure.md` — Nielsen's two-tier disclosure principle; Tidwell's pattern language for staged complexity; feature flags as progressive disclosure infrastructure; the "two levels, not three" heuristic; affordances for discoverability of hidden features
- `analytics-instrumentation.md` — Event taxonomy design; North Star metric selection and growth accounting; the instrumentation layer as a product decision (what you measure shapes what you build); avoiding vanity metrics; cohort analysis and retention curves
- `retention-mechanics.md` — Amplitude's benchmark data (98% of users inactive by week two); habit formation through variable reward and investment loops; re-engagement triggers (email, push, in-app); the retention-vs-manipulation boundary; Net Revenue Retention as the SaaS north star
- `feature-adoption.md` — The feature adoption funnel (awareness > trial > adoption > habit); experiment design for feature launches (A/B testing, holdout groups); the peeking problem and statistical validity; when to sunset features; PLG mechanics (freemium, reverse trial, viral loops)

---

## Key Principles

1. **Onboarding is not a tutorial — it is the path to first value.** Carroll and Rosson's paradox of the active user (1987) remains the foundational behavioral constraint: users skip documentation, tutorials, and setup wizards in favor of immediate task engagement, even when reading would save them time. Successful onboarding operates *within* the stream of task behavior, not before it. Empty states that guide action, contextual tooltips at the moment of need, and checklists that create momentum outperform front-loaded product tours.

2. **Progressive disclosure is how complex apps stay simple.** Nielsen's principle: display only the most important options initially; reveal specialized options upon user request. The mechanism resolves the competition between power (comprehensive features) and simplicity (manageable choices). The empirical guidance is clear: two levels of disclosure work; three or more levels create navigational confusion. Feature flags serve as the engineering infrastructure for progressive disclosure at the feature level, enabling staged rollout by cohort, plan tier, or usage milestone.

3. **Measure the job, not the feature.** Analytics instrumentation should trace the user's progress through their job-to-be-done, not merely count clicks on features. A North Star metric should capture the rate at which users complete the core job; supporting metrics should decompose that into the sub-jobs and friction points along the way. The event taxonomy is a product decision that shapes organizational attention — what you instrument is what you optimize.

4. **Retention is the only growth metric that compounds.** Amplitude's 2025 Product Benchmark Report: for half of all products, more than 98% of new users are inactive by week two. Acquisition without retention is a leaking bucket. The retention engineering literature identifies four intervention surfaces — product (habit loops, variable reward), behavioral (nudges, defaults), communication (lifecycle emails, push), and lifecycle (reactivation, resurrection). The ethical boundary between retention mechanics and dark patterns is a genuine design decision, not a compliance afterthought.

5. **Every feature launch is an experiment.** Product-led growth requires treating each feature release as a hypothesis with a measurable outcome. A/B testing provides the causal identification framework, but only if the experiment is properly powered, the peeking problem is addressed (sequential testing, always-valid p-values), and the distinction between short-run novelty effects and durable behavioral change is respected. Holdout groups are essential for measuring long-run feature impact. The best organizations run hundreds to thousands of concurrent experiments.

---

## Cross-References to Research

| Paper | Why it matters for this phase |
|-------|-------------------------------|
| [`docs/compound/research/design/web-apps/onboarding-and-progressive-feature-disclosure.md`](docs/compound/research/design/web-apps/onboarding-and-progressive-feature-disclosure.md) | Carroll & Rosson's paradox of the active user; 16-pattern taxonomy of onboarding approaches; activation frameworks (Palihapitiya's aha moment, Ellis's activation metric); empty states; checklists; gamification; dark pattern gradient; case studies from Slack, Notion, Figma, Duolingo |
| [`docs/compound/research/b2c_product/market-growth/retention-engineering-lifecycle-optimization.md`](docs/compound/research/b2c_product/market-growth/retention-engineering-lifecycle-optimization.md) | Retention as dominant growth paradigm; D1/D7/D30 benchmarks; aha moment identification; four-surface intervention taxonomy; churn prediction; resurrection mechanics; Net Revenue Retention economics |
| [`docs/compound/research/b2c_product/market-growth/product-led-growth.md`](docs/compound/research/b2c_product/market-growth/product-led-growth.md) | PLG six-motion taxonomy (freemium, free trial, reverse trial, open-source-led, usage-based, product-led sales hybrid); self-service education preference; PQL conversion; viral coefficient mechanics |
| [`docs/compound/research/b2c_product/market-growth/experimentation-growth-analytics.md`](docs/compound/research/b2c_product/market-growth/experimentation-growth-analytics.md) | Frequentist and Bayesian A/B testing; multi-armed bandits; the peeking problem; sample ratio mismatch; North Star metrics; growth accounting; experiment velocity benchmarks |
| [`docs/compound/research/development/web-apps/analytics-instrumentation-design.md`](docs/compound/research/development/web-apps/analytics-instrumentation-design.md) | Event taxonomy design; collection architecture (client/server/edge); product analytics platforms; RUM and Core Web Vitals; error tracking; session replay; privacy-preserving analytics; data pipeline architecture |
| [`docs/compound/research/design/web-apps/content-strategy-ux-writing.md`](docs/compound/research/design/web-apps/content-strategy-ux-writing.md) | UX writing for onboarding copy, error messages, empty states, notification text, CTAs; voice and tone systems; behavioral science in microcopy; content testing and measurement |

---

## Key Questions This Section Will Answer

- How do you design onboarding that accommodates Carroll and Rosson's paradox — users who skip tutorials but abandon without guidance? What is the concrete pattern for embedding guidance within the task stream rather than front-loading it?
- What is the right activation metric for your app? How do you identify the "aha moment" empirically (correlation analysis between early actions and long-term retention) rather than assuming you know what it is?
- How do you design a progressive disclosure architecture that scales from a simple first experience to a power-user interface? What are the concrete UI patterns (expand/collapse, drill-down, settings tiers, feature flags by plan level)?
- What does a well-designed event taxonomy look like? How many events is too few (you cannot see what is happening) vs. too many (noise drowns signal)?
- How do you distinguish genuine retention improvement from dark patterns? Where is the ethical boundary between a habit loop that serves the user's job and one that manufactures engagement for its own sake?

---

# References: Launch and Growth

## Primary Sources

Read these for deep theoretical grounding on this phase's topics.

| Topic | Paper | Path |
|-------|-------|------|
| Onboarding and progressive feature disclosure | Onboarding and Progressive Feature Disclosure | `docs/compound/research/design/web-apps/onboarding-and-progressive-feature-disclosure.md` |
| Retention engineering | Retention Engineering and Lifecycle Optimization | `docs/compound/research/b2c_product/market-growth/retention-engineering-lifecycle-optimization.md` |
| Product-led growth | Product-Led Growth | `docs/compound/research/b2c_product/market-growth/product-led-growth.md` |
| Analytics and instrumentation design | Analytics and Instrumentation Design for Web Applications | `docs/compound/research/development/web-apps/analytics-instrumentation-design.md` |

## Supplementary Sources

Consult these for specific questions or adjacent concerns.

| Topic | Paper | Path |
|-------|-------|------|
| Experimentation and growth analytics | Experimentation and Growth Analytics | `docs/compound/research/b2c_product/market-growth/experimentation-growth-analytics.md` |
| Community-led growth | Community-Led Growth | `docs/compound/research/b2c_product/market-growth/community-led-growth.md` |
| Growth loops and compound growth | Growth Loops and Compound Growth | `docs/compound/research/b2c_product/market-growth/growth-loops-compound-growth.md` |
| Content strategy and UX writing | Content Strategy and UX Writing for Web Applications | `docs/compound/research/design/web-apps/content-strategy-ux-writing.md` |
