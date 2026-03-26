---
title: Jobs-to-be-Done Theory for B2C Product Innovation
date: 2026-03-18
summary: Surveys the three principal JTBD schools—Christensen's Jobs Theory, Ulwick's Outcome-Driven Innovation, and Moesta's Switch Interview—alongside the Forces of Progress model and the debate with user-persona frameworks. Identifies where the frameworks converge, where they conflict, and what remains empirically unresolved.
keywords: [b2c_product, jobs-to-be-done, product-innovation, customer-discovery, demand-side]
---

# Jobs-to-be-Done Theory for B2C Product Innovation

*2026-03-18*

---

## Abstract

Jobs-to-be-Done (JTBD) theory reframes the fundamental question of product innovation from "what should we build?" to "what job is the customer hiring this product to do?" Originating in the collaborative work of Clayton Christensen, Tony Ulwick, and Bob Moesta beginning in the early 1990s, JTBD has matured into a family of related but distinct frameworks unified by a demand-side view of consumer behavior: customers do not purchase products for their attributes but to make progress in some dimension of their lives. The theory disaggregates that progress into functional, social, and emotional layers, each of which must be understood and served for a product to command loyalty.

This paper surveys the three principal schools of JTBD practice — Christensen's narrative Jobs Theory, Ulwick's Outcome-Driven Innovation (ODI), and Moesta's Switch Interview and Demand-Side Sales approach — alongside related constructs including the Forces of Progress model, the concept of competing against non-consumption, and the persistent debate between JTBD and user-persona frameworks. Drawing on the primary literature (Christensen et al. 2016; Ulwick 2005, 2016; Moesta and Engle 2020), published case studies (McDonald's, Basecamp, Intercom, Cordis, Microsoft), and recent practitioner research, the paper identifies where the frameworks converge, where they conflict, and what remains empirically unresolved.

The survey concludes that no single JTBD variant is universally superior. Christensen's narrative approach offers the richest mechanism for early-stage product strategy and market definition; Ulwick's ODI provides the most rigorous quantitative path to opportunity sizing; and Moesta's timeline-based switch interview delivers the most actionable signal for messaging and sales enablement. Open problems include the lack of validated measurement instruments, the absence of longitudinal outcome data, contested boundaries between JTBD and adjacent frameworks (behavioral economics, user research), and the underexplored application of JTBD in algorithmic and AI-mediated product contexts.

---

## 1. Introduction

### 1.1 Problem Statement

Innovation failure rates in consumer product markets remain stubbornly high. Clayton Christensen repeatedly cited studies suggesting that 80–95 percent of new product launches fail to meet their commercial objectives (Christensen et al. 2016). The dominant explanations — insufficient market research, poor execution, competitive pressure — tend to treat these failures as execution problems. JTBD theory proposes a deeper diagnosis: most product teams are asking the wrong research question. By building profiles of *who* the customer is (demographics, psychographics, firmographic segments) rather than understanding *why* the customer acts, companies optimize for the wrong variables and systematically misread the competitive landscape.

The Jobs-to-be-Done perspective holds that causality in consumer behavior runs from circumstance and struggle to the "hire" decision, not from demographic identity to product preference. A 34-year-old suburban parent and a 22-year-old graduate student may both hire the same product for the same job, while two demographically identical consumers may hire entirely different products because their circumstances and desired progress differ. This has direct and far-reaching implications for product definition, segmentation, pricing, and competitive strategy.

### 1.2 Scope

This survey covers:

- The foundational theoretical commitments shared across JTBD schools
- The three principal practitioner frameworks (Christensen, Ulwick, Moesta)
- Derived constructs: Forces of Progress, competing against non-consumption, functional/social/emotional job layers
- The JTBD-vs.-personas debate
- Published B2C and B2B-SaaS case evidence
- Open research problems and gaps

This paper does not attempt a systematic literature review of all empirical studies citing JTBD; no such body of peer-reviewed work yet exists at scale. It draws instead on the primary practitioner literature, published case studies from Strategyn and The Re-Wired Group, and widely cited secondary analyses. The paper focuses primarily on business-to-consumer (B2C) and consumer-facing SaaS contexts, though many principles transfer to B2B.

### 1.3 Key Definitions

**Job-to-be-Done**: The progress a person seeks to make under specific circumstances; the underlying goal that motivates a purchase or behavior change, encompassing functional, emotional, and social dimensions (Christensen et al. 2016).

**Hire / Fire**: Metaphorical language for the decision to adopt a product (hire) or discontinue it (fire). The language foregrounds agency — products compete to be selected for a role.

**Struggling Moment**: The specific situational trigger at which the inadequacy of a current solution becomes salient enough to motivate search behavior (Moesta).

**Desired Outcome**: In Ulwick's formulation, a precisely worded, measurable statement of what a customer wants to achieve while executing a job step; distinct from a "need" or "want" in being actionable for engineering and market research.

**Switch**: The observable event of a customer moving from one solution (including doing nothing) to another; the empirical anchor for Moesta's interview methodology.

---

## 2. Foundations

### 2.1 Theoretical Lineage

JTBD's intellectual roots are plural. The earliest articulation traceable in the practitioner literature is Tony Ulwick's 1991 development at Strategyn of a process for linking customer needs to product outcomes, later formalized as Outcome-Driven Innovation and introduced to the Harvard Business Review in 2002. Clayton Christensen engaged with Ulwick's ideas during this period, and the two collaborated closely before diverging into distinct schools. Bob Moesta, who worked directly with Christensen at Harvard and co-developed much of what became the narrative/interview branch of JTBD, later founded The Re-Wired Group and extended the framework into sales and marketing through his Demand-Side Sales methodology.

The three figures thus share a common origin but have developed frameworks with meaningfully different epistemological commitments: Christensen's school is primarily interpretive and narrative; Ulwick's is quantitative and operationalist; Moesta's is phenomenological, rooted in reconstructing the customer's decision timeline through retrospective interviews.

### 2.2 Relationship to Disruption Theory

For Christensen, JTBD is not a standalone innovation technique but the demand-side complement to his disruption theory. Disruption theory describes how entrants enter markets from positions of apparent inferiority (low-end footholds, new-market creation) and eventually displace incumbents. JTBD explains *why* this happens in demand terms: incumbents optimize their products for the jobs identified by their most profitable existing customers, systematically ignoring the jobs of non-consumers and overserved consumers. Disruptors, by contrast, define their market by the job, not the product category, and find that the addressable market is often far larger than incumbents assume.

The milkshake research (detailed in Section 4.1) is canonical here: McDonald's defined its competitive set as other milkshakes; JTBD analysis revealed the actual competitive set for the morning job to be bananas, granola bars, bagels, and boredom itself. The market defined by the job was seven times larger than the market defined by the product category.

### 2.3 Relationship to Behavioral Economics

JTBD shares conceptual territory with behavioral economics but operates differently. Both traditions reject the homo economicus model of rational preference maximization and both foreground context-dependence. However, behavioral economics typically catalogs cognitive biases and deviations from rationality, while JTBD treats consumer behavior as purposive and contextually rational — customers are trying to make genuine progress; their choices are coherent when the underlying job is understood.

Moesta's Forces of Progress model (Section 4.6) has the most explicit behavioral economics adjacency, describing the same push-pull architecture found in motivation theory and drawing on constructs like loss aversion (anxiety blocking adoption) and status quo bias (habit). The key JTBD contribution is insisting that these forces must be understood *in relation to a specific job in a specific circumstance* rather than as general psychological tendencies.

### 2.4 Relationship to Lean and Agile Product Development

JTBD entered mainstream product management partly through its compatibility with Lean Startup thinking. Both frameworks are skeptical of feature-driven roadmaps built from inside-out assumptions; both prize close contact with customer struggles. The difference is methodological: Lean Startup advocates rapid build-measure-learn cycles, which can inadvertently optimize for local optima if the underlying job is not well understood. JTBD practitioners argue that good job discovery done upfront reduces the number of iterations required, because teams are testing solutions to the right problem rather than discovering the problem experimentally.

---

## 3. Taxonomy of JTBD Approaches

The following table classifies the principal JTBD schools across key dimensions before detailed treatment in Section 4.

| Dimension | Christensen (Jobs Theory) | Ulwick (ODI) | Moesta (Switch/Demand-Side) |
|---|---|---|---|
| **Epistemology** | Interpretive / narrative | Positivist / operationalist | Phenomenological / timeline-based |
| **Primary data type** | Qualitative interview | Qual discovery + quant survey | Qualitative retrospective interview |
| **Unit of analysis** | The job in context | Desired outcome statements | The switch event |
| **Output** | Job story / job map | Opportunity landscape (importance vs. satisfaction matrix) | Forces diagram / demand-side timeline |
| **Best use case** | Product strategy, market definition | Opportunity sizing, feature prioritization | Messaging, sales, onboarding |
| **Typical team** | Product strategy, UX research | Product + market research + data science | Sales, marketing, growth |
| **Key book** | *Competing Against Luck* (2016) | *Jobs to Be Done: Theory to Practice* (2016) | *Demand-Side Sales 101* (2020) |
| **Quantitative rigor** | Low | High | Low-Medium |
| **Scalability** | High (conceptual) | Medium-High (requires survey infrastructure) | Medium (interview-intensive) |
| **Risk** | Ambiguity in job definition | Resource-intensive upfront | Interviewer skill-dependence |

**Additional frameworks and constructs within the JTBD ecosystem:**

| Construct | Origin | Primary Application |
|---|---|---|
| Forces of Progress | Moesta / Klement | Understanding adoption barriers and switching behavior |
| Functional / Social / Emotional layers | Christensen et al. | Comprehensive job specification |
| Competing against non-consumption | Christensen | Market sizing, disruptive strategy |
| Job Map (8-step) | Ulwick | Systematic need identification |
| JTBD vs. Personas | NN/g, Gothelf | Research methodology selection |
| Switch interview script | Moesta / Klement | Qualitative demand-side research |

---

## 4. Analysis

### 4.1 Christensen's JTBD Narrative Framework

#### Theory and Mechanism

Clayton Christensen, with colleagues Taddy Hall, Karen Dillon, and David Duncan, articulated the fullest version of his JTBD theory in *Competing Against Luck* (2016). The book's central claim is that progress, not products, is what customers seek: "The fundamental unit of analysis is the job — what a person is trying to achieve in a given circumstance" (Christensen et al. 2016, p. 31).

The Christensen school defines a job along three axes. First, there is the **functional** dimension: the practical, often mechanical task being accomplished (cutting commute time, staying organized, completing a purchase). Second, there is the **emotional** dimension: how the customer wants to feel during and after accomplishing the job (confident, relaxed, admired, safe). Third, there is the **social** dimension: how the customer wants to be perceived by others as a result of the choice (professional, responsible, thoughtful). All three dimensions are always present, though their relative salience varies by context. Failing to serve any one dimension creates an opening for competitors.

The hiring metaphor is deliberate: customers "hire" a product to do a job, and they "fire" it when a better candidate for that job appears — or when their circumstances change such that the job no longer exists. This framing has a productive implication for competitive analysis. The question is not "who else makes a product like ours?" but "what else might customers hire to do this job?" This typically reveals a much wider and more heterogeneous competitive set than category-based analysis.

#### The Milkshake Case Study

The McDonald's milkshake research, conducted by Christensen and Moesta and first published in the early 2000s, remains the most widely cited JTBD case study. McDonald's had access to extensive demographic and preference data on milkshake purchasers; nonetheless, product reformulations based on that data failed to move sales.

Christensen's team spent 18 hours at a McDonald's location observing every milkshake purchase: time of day, whether the purchase was the only item, the customer's destination, and behavioral cues. The observation data revealed a sharp pattern: roughly half of all milkshakes were sold between 6:30 and 8:30 a.m. to lone commuters who took their shake to the car and left. Follow-up interviews revealed the job: making a long, boring commute more interesting while consuming something hand-held, filling, and slow to finish that would keep hunger at bay until lunch.

The actual competitive set for this morning job was not Burger King's milkshake but bananas (too quick to eat), granola bars (too messy), bagels (require two hands and cream cheese), and the radio. McDonald's thick milkshake — the very attribute that had been seen as a feature in need of optimization — was precisely what made it the best available candidate for the job: it lasted the full commute.

A second, separate job emerged in the afternoon: parents buying a treat for children. This job had entirely different requirements (thinner, novelty flavors, a sense of earned reward) and a different competitive set (toy store visits, ice cream trucks). The same product served two incompatible jobs with conflicting specifications. Recognizing this, McDonald's could have developed two distinct milkshake products — one optimized for the commuter job, one for the treat job — rather than searching for a single compromise.

The business implication was striking: viewing the market through the job lens rather than the product category lens expanded the estimated addressable market by a factor of seven.

#### Literature Evidence

The milkshake case appears in Christensen's *Competing Against Luck* (2016), in his HBR articles, and in numerous secondary treatments including Fullstory's product development guide (2023) and The Re-Wired Group's published case studies. The Christensen Institute maintains an ongoing research program applying Jobs Theory to healthcare, education, and economic development.

#### Implementations and Benchmarks

Christensen's framework has been applied across industries:

- **Airbnb**: Travelers were found to hire accommodations not merely for shelter but for authentic local experience and a sense of belonging — a social and emotional job that incumbent hotel chains systematically underserved.
- **Netflix**: The job is not "watching movies" but "relaxation and entertainment during discretionary time" — which reframes competitors to include gaming, social media, and sleep.
- **Cordis Corporation** (medical devices): Redefining the company's job from "making better angioplasty balloons" to "helping cardiologists achieve optimal procedural success rates" led to 19 consecutive successful product launches and a market share increase from 1% to over 20% (Productschool 2024).

#### Strengths and Limitations

**Strengths:**
- Conceptually accessible; the hiring metaphor resonates quickly with non-technical stakeholders
- Forces a fundamental reexamination of competitive set definition
- Applies across B2C, B2B, and emerging market contexts
- Compatible with design thinking and agile product methods
- Integrates naturally into messaging, positioning, and pricing strategy

**Limitations:**
- The framework is primarily qualitative; it provides no formal mechanism for prioritizing among multiple identified jobs
- "Job" can be defined at varying levels of abstraction (e.g., "get me through my commute" vs. "eliminate boredom while driving"), and there is no agreed-upon protocol for selecting the right level
- The theory does not resolve how to handle jobs that are only partially conscious or that customers cannot articulate in interviews
- Christensen's team acknowledged the difficulty of distinguishing genuine jobs from post-hoc rationalizations in interview data
- No large-scale quantitative validation of success rates using the narrative approach has been published

---

### 4.2 Ulwick's Outcome-Driven Innovation (ODI)

#### Theory and Mechanism

Tony Ulwick's Outcome-Driven Innovation, developed at Strategyn beginning in 1991 and introduced to the Harvard Business Review in 2002, makes a stronger empirical claim than Christensen's narrative approach. If JTBD is the theory, Ulwick argues, ODI is the practice — a structured, repeatable process for translating jobs into quantifiable innovation opportunities.

The ODI framework rests on a critical ontological distinction. Ulwick separates the **job-to-be-done** (a stable, persistent goal customers have) from **desired outcomes** (the specific performance criteria customers use to evaluate how well a product is executing a step in the job). Outcomes are not the same as needs or wants; they are precisely worded metric statements of the form: "Minimize the time it takes to [verb] [object] [context]." This formulation makes outcomes directly actionable for engineering teams and quantitatively measurable through survey research.

Ulwick further distinguishes among **core functional jobs**, **related jobs** (adjacent tasks performed alongside the core job), **emotional jobs**, **consumption chain jobs** (purchasing, installing, maintaining, disposing), and **financial desired outcomes**. A complete ODI study captures all relevant need types across these categories, typically yielding 50–150 distinct desired outcome statements per job.

The ODI process has six primary phases:

1. **Market definition**: Define the market as a group of people trying to get a job done, not a product category.
2. **Need discovery**: Use qualitative research (customer interviews and focus groups) to discover all desired outcomes, organized by the eight steps of the **Job Map** (define, locate, prepare, confirm, execute, monitor, modify, conclude).
3. **Importance and satisfaction quantification**: Survey a statistically valid sample (typically 180–350+ respondents) on each outcome's importance and current-solution satisfaction.
4. **Opportunity scoring**: Apply the Opportunity Algorithm: `Opportunity Score = Importance + max(Importance − Satisfaction, 0)`. This formulation gives twice the weight to importance as to satisfaction, amplifying the signal for outcomes that matter most yet remain unserved.
5. **Segment discovery**: Cluster respondents by their pattern of unmet outcomes, revealing opportunity segments invisible to demographic segmentation.
6. **Solution development**: Generate product or service concepts targeting the highest-scoring opportunity segments; validate against the outcome map.

The Opportunity Algorithm produces a ranked matrix — the **Opportunity Landscape** — where the x-axis represents satisfaction (currently served) and the y-axis represents importance (how much customers care). Outcomes in the upper-left quadrant (high importance, low satisfaction) are underserved and represent innovation opportunities. Outcomes in the lower-right quadrant are over-served and represent opportunities for simplification or cost reduction.

#### Literature Evidence

Ulwick's approach is documented primarily in two books: *What Customers Want* (2005, McGraw-Hill) and *Jobs to Be Done: Theory to Practice* (2016, IDEA BITE PRESS). The 2002 HBR article "Turn Customer Input into Innovation" introduced the Opportunity Algorithm to a management audience. Strategyn's website claims an 86% innovation success rate across hundreds of Fortune 1000 engagements, compared to an industry average of approximately 17%. This claim has not been independently verified in peer-reviewed literature, though the directional argument is consistent with what a rigorous needs-first process would be expected to deliver.

Wikipedia's article on Outcome-Driven Innovation provides a useful secondary synthesis. Academic engagement with ODI specifically (as distinct from JTBD generally) remains thin; the framework is primarily documented in the practitioner literature.

#### Implementations and Benchmarks

- **Bosch Power Tools**: ODI identified specific underserved outcomes in the cordless drill category that led to new product features increasing market share.
- **Microsoft Software Assurance**: Reframing the offering around IT managers' true jobs (optimizing budgets, managing risk, reducing operational disruption) rather than software update delivery drove 100% year-over-year revenue growth.
- **Medical device sector broadly**: Ulwick has published that ODI-guided projects in regulated industries achieve substantially higher market success than comparably resourced projects using traditional voice-of-customer or feature-prioritization methods.
- **AIG**: Used ODI to identify underserved outcomes in the insurance purchasing journey, enabling a product redesign that improved both customer acquisition and retention.

#### Strengths and Limitations

**Strengths:**
- The Opportunity Algorithm provides a transparent, reproducible mechanism for prioritizing innovation investments
- Desired outcome statements are engineering-actionable and reduce ambiguity in requirements translation
- Quantitative segmentation by outcome priority reveals opportunity segments that demographic and psychographic approaches miss
- The Job Map provides systematic coverage; teams are less likely to miss important job steps
- High claimed success rate (86%) versus industry average (~17%), though independently unverified
- Directly comparable outcome scores allow portfolio-level prioritization across product lines

**Limitations:**
- Resource-intensive upfront: requires qualitative discovery, survey design, statistically valid sampling, and statistical analysis before any solution development begins — often 3–6 months and significant budget
- The Opportunity Algorithm is proprietary and its calibration is not derived from first principles; the doubling of importance weight is a design choice, not an empirical constant
- The process assumes customers can articulate desired outcomes when queried — a contestable assumption for latent needs and genuinely novel job categories
- ODI is optimized for improving known jobs; it is less well-suited for identifying entirely new job categories that customers have not yet recognized
- The framework's depth makes it most accessible to large organizations with research infrastructure; resource constraints limit applicability in early-stage startups
- Ulwick and Christensen's public disagreements about the proper definition of a "job" (Ulwick emphasizes functional jobs; Christensen insists emotional and social jobs are equally important) have created practitioner confusion

---

### 4.3 Moesta's Switch Interview and Demand-Side Sales

#### Theory and Mechanism

Bob Moesta co-developed what became JTBD theory in collaboration with Christensen and others, but his distinctive contribution lies in the interview methodology and the demand-side reframing of sales and marketing. Where Christensen provides the strategic vocabulary and Ulwick provides the quantitative apparatus, Moesta provides the phenomenological interview technique for excavating the decision architecture of individual purchase events.

Moesta's core insight is that every product adoption event — what he calls a **switch** — is caused by a specific configuration of forces at a specific moment in time. A switch is not a rational evaluation of features; it is a lived experience that begins with a **struggling moment** (the point at which the current solution becomes intolerable or clearly inadequate) and ends with the first use of the new solution. The interviewer's task is to reconstruct this timeline with enough specificity to identify the causal forces that drove the switch.

The **Switch Interview** follows a structured but conversational protocol. The interviewer asks the customer to describe:

1. **The first thought** — when and how the idea of changing first occurred
2. **Passive looking** — the period of vague dissatisfaction before active search began
3. **Active looking** — when the customer began evaluating alternatives
4. **Deciding** — the moment and context of the final decision
5. **Onboarding** — the first experience with the new solution
6. **Ongoing use** — whether the new solution is actually doing the job

Throughout this timeline, the interviewer probes for the **Four Forces** (see Section 4.6): what pushed the customer away from the old solution, what pulled them toward the new one, what anxieties nearly prevented the switch, and what habits and allegiances kept pulling them back. The interview technique resembles documentary filmmaking — the interviewer aims to reconstruct a scene with enough sensory and contextual detail that the forces become visible.

A critical methodological discipline is the requirement to interview people about decisions they have *already made*, not hypothetical future decisions. Retrospective interview data is more reliable because the stakes were real, the struggle was experienced, and the resolution is known. Prospective or hypothetical questions ("would you buy a product that did X?") are unreliable because they invoke imagined futures rather than actual behavior.

Moesta's book *Demand-Side Sales 101* (2020, Lioncrest) extends the switch framework into sales and marketing. The book's central argument is that traditional supply-side selling — presenting features, benefits, and comparisons — optimizes for the seller's agenda rather than the buyer's decision process. Demand-side selling instead diagnoses where the customer is in their switching timeline and provides the specific information or reassurance needed at that stage. Customers cannot buy what they cannot imagine themselves using; sales conversations must help customers construct a plausible mental model of their improved future state.

#### Literature Evidence

The primary sources are Moesta's *Demand-Side Sales 101* (2020), his extensive podcast and lecture archive (Business of Software conference talks, the Intercom podcast), and The Re-Wired Group's published case studies for Basecamp and Intercom. Alan Klement's *When Coffee and Kale Compete* (2018) is a complementary practitioner text that extends the switch interview into product strategy, though Klement and Moesta have publicly disagreed on certain definitional questions.

#### Implementations and Benchmarks

**Basecamp (37signals)**: The Re-Wired Group conducted 15 JTBD switch interviews with Basecamp customers. The central finding was that customers almost never described their job as "project management," despite Basecamp's market positioning. Five distinct jobs emerged from the interview data, all more emotionally and organizationally specific than the project management category. Key outcomes: messaging shifted from feature-based to outcome-based language; feature development became more focused (reduced feature creep); onboarding was redesigned around struggling moments; the company became an active advocate of the JTBD methodology (Moesta, Bob; The Re-Wired Group 2017).

**Intercom**: After three years of positioning as an all-in-one customer communication platform, Intercom's growth plateaued. The Re-Wired Group conducted switch interviews revealing four distinct jobs that different customer segments were hiring Intercom to accomplish. These four jobs had incompatible requirements that the bundled product could not simultaneously serve well. Outcomes: the product was restructured into four distinct offerings; messaging adopted demand-side language; website traffic quadrupled; the company achieved 500% growth in 18 months; revenue tripled (The Re-Wired Group, Intercom Case Study 2018).

#### Strengths and Limitations

**Strengths:**
- The retrospective, behavior-anchored interview design produces more reliable data than prospective preference research
- The six-stage switching timeline provides a natural structure for both research and product/marketing response
- The Forces framework integrates motivational forces that purely functional need analyses miss
- Highly actionable for messaging, sales scripting, and onboarding design
- Accessible to small teams; 10–20 interviews conducted rigorously can yield transformative insight
- Strong track record in B2B SaaS (Basecamp, Intercom) where purchasing decisions are complex

**Limitations:**
- The interview technique requires significant practitioner skill; novice interviewers often elicit rationalizations rather than causal accounts
- Sampling is challenging: interviews must target recent switchers, not general users, which requires careful respondent recruitment
- The framework is qualitative and does not provide a mechanism for statistically validating findings or sizing opportunities across the full addressable market
- The switch event may not exist for all product categories (e.g., habituation goods where no clear "first hire" moment occurred)
- Published case studies come primarily from The Re-Wired Group's own client portfolio, creating selection bias risk in the evidence base

---

### 4.4 JTBD vs. Personas

#### Theory and Mechanism

User personas — composite representations of target users built from demographic, behavioral, and attitudinal data — became a dominant UX and product design tool following Alan Cooper's *The Inmates Are Running the Asylum* (1999) and subsequent popularization in the design community. They are now ubiquitous in product organizations and are often the default tool for representing user understanding.

JTBD and personas are frequently positioned as competing frameworks, particularly by JTBD advocates who argue that personas encode the wrong unit of analysis. The critique has three parts. First, personas built on demographics and psychographics do not predict behavior: two people with identical demographic profiles may hire entirely different products for the same job, and two people with wildly different profiles may hire the same product for the same reason. Second, personas tend to anchor teams on existing user segments, making it harder to see non-consumers or cross-category threats. Third, persona-based product decisions optimize for features that appeal to the persona's profile rather than progress that serves the job.

The Nielsen Norman Group's analysis (Whitenton 2018) provides a balanced synthesis. NNG observes that personas and JTBD answer different questions: personas answer "who is our user?" while JTBD answers "why does this user act?" Neither question subsumes the other. Personas excel at maintaining team empathy with real human users, capturing the attitudinal and contextual variation across user populations, and anchoring design decisions in specific people's lives. JTBD excels at revealing unmet needs that demographic analysis misses, preventing feature creep by keeping focus on desired progress, and exposing unexpected competitive threats.

#### The Complementarity Argument

The most widely accepted practitioner position is that personas and JTBD are complementary tools applied at different phases of product development and addressing different research questions. Specifically:

- JTBD is better suited for **early-stage strategy**: defining what job the product should serve, identifying the competitive set, and setting the product vision.
- Personas are better suited for **execution-stage design**: deciding how the product should be built given specific users' cognitive models, contexts, and constraints.
- Integrating JTBD jobs into persona documentation creates richer artifacts: the persona describes who the user is, and the embedded job description explains why they act.

Jeff Gothelf, in his Medium essay "Reconciling Jobs to Be Done & Personas" (2018), argues that personas without associated jobs are likely to drift toward stereotyping, while JTBD without associated user context can produce solutions that technically accomplish the job but fail in actual use because human factors were ignored.

#### Implementations and Benchmarks

There is no controlled study comparing product outcomes between organizations using personas alone versus JTBD alone versus both combined. The evidence base is primarily case-study and practitioner-opinion. The NNG analysis is based on synthesis of their own UX research experience and does not report outcome data. Springboard and CareerFoundry tutorials that compare the frameworks similarly rely on logic and example rather than comparative empirical data.

#### Strengths and Limitations

**JTBD strengths over personas:**
- Reveals motivation, not just identity
- Expands perceived competitive set
- Applies across demographic segments that may share the same job
- Reduces anchoring on existing user typologies that can blind teams to non-consumers

**Persona strengths over JTBD:**
- Builds team empathy with real human specificity
- Captures variation in how different users experience the same job
- Supports accessibility, inclusion, and edge-case design
- More accessible to designers without specialized research training

**Limitations of the comparison:**
- The debate is often conducted at a methodological level rather than an outcome level; there are no RCTs or large observational studies comparing business outcomes across approaches
- Both frameworks depend heavily on the quality of the underlying research; a poorly executed persona study and a poorly executed JTBD study will both produce misleading outputs
- Organizations that have adopted one approach may have invested in infrastructure that makes switching costly, even if the alternative would be superior in their context

---

### 4.5 Competing Against Non-Consumption

#### Theory and Mechanism

One of the most strategically consequential implications of JTBD theory is its reframing of the competitive landscape to include non-consumption — situations in which potential customers have a job to be done but are not currently using any product or service to accomplish it. Non-consumption arises when existing solutions are too expensive, too complex, too inaccessible, or too socially stigmatized for a population that nonetheless needs the job done.

Christensen's disruption theory describes two types of non-consumption-addressing innovation:

1. **Low-end disruption**: An entrant targets over-served customers — those for whom existing solutions are more than adequate — with a simpler, cheaper offering. The incumbent's rational response (cede low-margin segments to focus on higher-margin ones) accelerates the disruptor's ascent.

2. **New-market disruption**: An entrant enables an entirely new population — previously excluded by cost or complexity — to do a job they could not previously do at all. This is the purest form of competing against non-consumption: the competitive set is "doing without" or "doing it poorly," not an incumbent product.

The Christensen Institute has documented non-consumption as a particularly potent innovation opportunity in emerging markets. Mobile telephony in sub-Saharan Africa is the archetypal example: mobile connections rose from 17 million in 2000 to 620 million in 2010, displacing non-consumption in communications, banking, and healthcare rather than competing against incumbent telecommunications providers (IDA/Christensen Institute 2014).

In consumer software, the concept maps onto markets where the job was previously served by manual processes, spreadsheets, or informal workarounds. The job of "coordinating a distributed team" had been "done" via email and stand-up meetings before tools like Basecamp and Slack created purpose-built solutions. Their actual competitors were not project management incumbents; they were email clients, hallway conversations, and the accumulated cost of coordination failure — all forms of non-consumption relative to the job of effective asynchronous coordination.

#### Tomasz Tunguz's SaaS Analysis

Tomasz Tunguz, a venture capitalist at Redpoint, has argued that the most defensible SaaS businesses are those that compete against non-consumption rather than against incumbents. Companies that displace non-consumption face lower sales resistance (there is no entrenched incumbent to displace), larger total addressable markets (the population of non-consumers often vastly exceeds the population of existing product users), and lower churn risk (customers who previously did without are less likely to comparison-shop aggressively).

#### Implications for Product Strategy

The non-consumption lens has three practical implications for B2C product teams:

First, **market sizing should be job-based, not category-based**. Category-based TAM calculations systematically undercount the opportunity because they count only current consumers of category products. Job-based TAM counts everyone who has the job, including non-consumers — a much larger number.

Second, **onboarding design should anticipate the transition from non-consumption**. Customers switching from "doing nothing" face a different adoption challenge than customers switching from a competitor product. They may lack the vocabulary, workflows, or expectations that make the new product legible.

Third, **pricing strategy must be calibrated to the value of the job, not the features of the product**. Non-consumers who previously had no solution have a potential willingness to pay proportional to the full cost (in time, money, and frustration) of their previous workaround — which is often far higher than feature-comparison pricing would suggest.

#### Strengths and Limitations

**Strengths:**
- Dramatically expands perceived market opportunity
- Reduces the intensity of competitive dynamics by targeting underserved populations
- Consistent with both JTBD theory (job-based market definition) and disruption theory (non-consumption as an entry point)
- Generates genuinely novel product concepts by asking "who isn't using anything?" rather than "how do we beat the market leader?"

**Limitations:**
- Identifying non-consumers requires proactive research into people who have not yet adopted any product — a population that does not appear in existing customer databases or NPS surveys
- Non-consumers may have been excluded for structural reasons (regulatory constraints, distribution limitations, price sensitivity) that the innovator cannot easily address
- The concept is easy to invoke rhetorically but difficult to operationalize without disciplined job-based market research

---

### 4.6 Forces of Progress Model

#### Theory and Mechanism

The Forces of Progress model, developed primarily by Bob Moesta with significant contributions from Alan Klement, is a four-factor framework for explaining why a customer switches from one solution (including non-consumption) to another at a specific moment in time. The model holds that switching behavior is the result of two pairs of opposing forces:

**Promoting forces (toward change):**
- **Push**: The accumulated dissatisfaction with the current situation; the pain, friction, anxiety, or inadequacy of the existing solution that motivates a customer to seek something better. Push forces are situational and contextual — the same product feature may generate push in one circumstance and not in another.
- **Pull**: The attraction of a specific new solution; the mental image of a better future state that the new product promises to deliver. Pull is forward-looking and aspirational. It is not generic optimism about improvement; it is a specific, imagined scenario in which the new product has solved the problem.

**Blocking forces (against change):**
- **Anxiety**: Concerns about the risks or uncertainties of adopting the new solution. These may include implementation anxiety ("what if it's harder to set up than they claim?"), disruption anxiety ("will this break my existing workflows?"), social anxiety ("what will my team think if I change the tool again?"), or financial anxiety ("what if I pay for this and it doesn't work?"). Anxiety is a potent blocking force even when the promoting forces are strong.
- **Habit / Inertia**: The allegiance to existing behaviors, tools, and workflows. Habit operates as a blocking force not because the existing solution is satisfactory but because the cognitive and behavioral cost of changing feels real and immediate while the benefits feel hypothetical and distant.

A switch occurs when the combined strength of push + pull exceeds the combined strength of anxiety + habit. The model predicts that customers in a state of high push but low pull will search without committing; customers with high pull but low push will remain curious but inactive; and customers with strong promoting forces but stronger blocking forces will experience the classic "I know I should change but I can't bring myself to do it" state that Moesta calls "passive looking."

The Forces model has direct product and marketing implications. Onboarding design should address anxiety by reducing uncertainty and providing early success moments. Pricing pages should use language that amplifies pull by making the "better future state" vivid and specific. Retention messaging should amplify the push forces the customer originally felt — reminding them of the struggling moment that caused them to switch in the first place. Competitor messaging should create constructive friction by naming and validating the push forces that potential customers are feeling, rather than leading with feature comparisons.

#### The Wheel of Progress

Customer Centric Solutions LLC (John Gusiff) has extended Moesta's four-force diagram into a more comprehensive "Wheel of Progress" model that situates the four forces within the full decision-making context, including the customer's Job-to-be-Done, their timeline, and their consumption chain. The model is particularly useful for enterprise sales contexts where multiple stakeholders experience different force configurations simultaneously.

#### Implementations and Benchmarks

The Forces model has been widely adopted in product marketing and growth contexts. The Intercom case study explicitly describes how switch interview data was used to map the four forces across different customer segments, informing both product restructuring and messaging strategy. Basecamp's redesigned onboarding (post-JTBD study) was structured to address the anxiety forces identified in switch interviews — specifically, the fear of introducing yet another project management tool to a skeptical team.

The model is taught as a core component of Moesta's Switch Interview workshops through Business of Software and The Re-Wired Group.

#### Strengths and Limitations

**Strengths:**
- Provides a complete causal account of switching behavior, integrating both motivational forces and resistance forces
- Directly actionable for product marketing, onboarding design, and retention strategy
- Applicable at the individual interview level (to understand a specific switch) and at the aggregate level (to identify the most common blocking forces across a segment)
- Integrates naturally with behavioral economics constructs (loss aversion, status quo bias) without reducing to them

**Limitations:**
- The four-force classification is a useful simplification but may not capture all relevant variables; interactions between forces are complex and context-dependent
- Measuring force intensity quantitatively (beyond qualitative interview assessment) requires additional research infrastructure not yet standardized
- The model is most useful when applied to products with a clear switch event; for habitual or subscription products where no discrete adoption moment exists, the model requires adaptation
- Published quantitative validation of the model's predictive power is limited

---

### 4.7 Functional, Social, and Emotional Job Layers

#### Theory and Mechanism

All three major JTBD schools acknowledge that jobs have multiple dimensions, but Christensen's framework makes the multi-layered nature of jobs the most central analytical commitment. The argument is that products that serve only the functional dimension of a job are commodifiable — any competitor that matches the functional performance will win on price. Products that serve all three dimensions create durable competitive advantage because the emotional and social dimensions are harder to specify, harder to copy, and more personally meaningful to customers.

**Functional jobs** are the practical, mechanical tasks a product helps a customer accomplish: getting from A to B, organizing information, communicating with a colleague, completing a financial transaction. Functional job performance is the easiest to measure and benchmark, and it is the dimension most commonly captured by traditional product specifications and customer satisfaction surveys.

**Emotional jobs** concern how the customer wants to feel during and after the experience of using a product. These may be internal states (calm, confident, accomplished, stimulated) or reductions of negative states (less anxious, less overwhelmed, less isolated). Emotional jobs are frequently the primary driver of brand loyalty and willingness to pay premiums. The JTBD framework's contribution is insisting that emotional jobs be treated with the same analytical rigor as functional jobs — they should be named, specified, and designed for — rather than relegated to "brand experience" as an afterthought.

**Social jobs** concern how the customer wants to be perceived by others as a result of their choice. Social jobs operate in contexts where the product choice signals identity, competence, taste, or values. The choice of a laptop brand in a startup environment, the choice of a project management tool in a design team, the choice of a car in a social context where consumption is visible — all of these involve social job dimensions that are underserved by purely functional analysis.

A canonical non-digital example: people hire expensive coffee shop drinks not only for the beverage (functional) but for the experience of relaxation and warmth (emotional) and the signal of taste and lifestyle membership (social). A competitor that undercuts on price while serving only the functional job will fail to retain customers for whom the emotional and social jobs are primary.

#### The Milkshake Revisited

The multi-layer framework clarifies the milkshake analysis further. The morning commuter milkshake job is primarily functional (sustenance) and emotional (alleviate boredom, provide comfort during a stressful commute). The afternoon treat job is primarily emotional (giving a child a special experience) and social (performing the role of a rewarding, fun parent). The features that optimize the milkshake for the emotional and social jobs of the afternoon context — novelty, thinness, surprise — are precisely opposed to the features that serve the functional and emotional jobs of the morning context.

#### Implications for Product Development

The three-layer framework has several practical implications:

1. **User research must deliberately elicit all three layers.** Interview protocols that focus only on task completion (functional) will miss the emotional and social jobs that often drive purchase and retention decisions.

2. **Design artifacts should encode all three dimensions.** Job statements that capture only functional progress ("I need to get to the destination faster") will generate product solutions that optimize for speed at the expense of comfort or status.

3. **Marketing must address the full job spectrum.** Messaging that speaks only to features (functional) leaves emotional and social jobs unaddressed, creating an opening for competitors who speak to the whole customer.

4. **Pricing and positioning strategy should reflect all three layers.** Products whose emotional and social job performance is high can command premium prices even when functional performance is comparable to lower-priced alternatives.

#### Implementations and Benchmarks

The three-layer framework is applied in Ulwick's ODI through the distinction between core functional jobs and emotional jobs (treated as separate need categories with separate outcome statements). Moesta's switch interviews systematically probe all three dimensions through the timeline reconstruction process, because struggling moments and switching decisions are almost always triggered by a convergence of functional failure and emotional dissatisfaction, with social factors often present as amplifiers.

Specific product examples documented in the practitioner literature:

- **Slack**: Core functional job is message-based team communication; emotional job is "feel connected to my team and aware of what's happening without being trapped in meetings"; social job is "signal membership in a modern, collaborative organization." Competitors who address only the functional dimension (email chains, SMS groups) consistently underperform on adoption and retention in the target segment.
- **Apple iPhone**: The device consolidates communication, information access, and entertainment (functional), but its sustained premium pricing is explained primarily by its emotional job (feel capable, modern, creative) and social job (signal taste and membership in a particular community).

#### Strengths and Limitations

**Strengths:**
- Prevents teams from optimizing only for measurable functional metrics at the expense of the emotional and social drivers of loyalty
- Provides a comprehensive specification language for jobs that integrates well with brand strategy and marketing
- Explains premium pricing and brand loyalty phenomena that purely functional analyses cannot account for

**Limitations:**
- Emotional and social jobs are harder to elicit reliably through interviews and surveys; customers may not consciously acknowledge them or may misreport them due to social desirability bias
- The boundaries between the three layers are fuzzy; many jobs involve all three dimensions in complex interaction, making clean classification difficult
- In B2C contexts with high social/emotional job salience, JTBD analysis may inadvertently shade into ethnographic or sociological research, requiring skills and methods beyond standard product research capabilities

---

## 5. Comparative Synthesis

The following table provides a cross-cutting comparison of the major JTBD approaches on dimensions relevant to B2C product innovation practice. No recommendations are made; the table is intended to support practitioner decision-making based on context.

### Trade-off Matrix

| Dimension | Christensen (Jobs Theory) | Ulwick (ODI) | Moesta (Switch/Demand-Side) |
|---|---|---|---|
| **Time to first insight** | Fast (days to weeks) | Slow (months) | Medium (weeks) |
| **Cost** | Low-Medium | High | Medium |
| **Team skills required** | Strategic thinking, qualitative interview | Research design, statistics, quant analysis | Interview technique, timeline reconstruction |
| **Output precision** | Low (conceptual) | High (quantified opportunity scores) | Medium (qualitative forces diagram) |
| **Actionability for engineering** | Medium | High (outcome statements) | Medium |
| **Actionability for marketing** | High (job language = copy language) | Medium | Very High (demand-side language) |
| **Actionability for sales** | Medium | Low | Very High |
| **Works without existing customers** | Yes | Partial (requires potential customers for surveys) | Partial (requires recent switchers) |
| **Handles latent / unarticulated needs** | Partially | Poorly (outcomes must be articulated) | Partially |
| **Competitive landscape clarity** | Very High | High | High |
| **Integration with personas** | Easy | Moderate | Easy |
| **Startup applicability** | High | Low-Medium | High |
| **Enterprise applicability** | High | Very High | High |
| **Evidence base (case studies)** | Broad and varied | Concentrated (Strategyn clients) | Concentrated (Re-Wired clients) |
| **Independent academic validation** | Limited | Very Limited | Very Limited |

### Key Convergences

All three schools agree on the following propositions:

1. Customers act to make progress, not to acquire features.
2. The competitive set for any product is defined by the job, not the product category.
3. Demographic segmentation is a poor predictor of purchase behavior compared to circumstance-and-job segmentation.
4. Understanding the customer's struggling moment or trigger context is essential to product and marketing strategy.
5. Emotional and social dimensions of jobs matter and cannot be reduced to functional utility.

### Key Divergences

The schools diverge most sharply on:

1. **What constitutes a "job"**: Christensen insists on including emotional and social dimensions as part of the job; Ulwick treats them as separate need categories alongside the core functional job; Moesta focuses primarily on the progress the customer seeks in the switching decision context.

2. **The role of quantification**: Ulwick requires quantitative validation of qualitative findings; Christensen and Moesta treat qualitative insight as sufficient for strategic decisions.

3. **The temporal anchor**: Christensen focuses on the job as an enduring, context-stable goal; Moesta focuses on the specific switch event as the analytical unit; Ulwick focuses on the outcome statements that are always valid regardless of specific switching moments.

4. **The level of abstraction**: Christensen works at a relatively high level of abstraction (the job); Ulwick disaggregates jobs into dozens or hundreds of specific outcome statements; Moesta works at the level of the individual consumer's lived experience.

---

## 6. Open Problems and Gaps

Despite its practitioner maturity, JTBD theory faces several unresolved empirical and theoretical problems.

### 6.1 Measurement and Operationalization

No standardized, validated instrument exists for measuring JTBD constructs. Ulwick's Opportunity Algorithm is the closest approximation, but it remains proprietary and its calibration has not been independently tested against innovation outcomes in controlled settings. The forces model lacks a quantitative measurement protocol. Without such instruments, JTBD research cannot be aggregated, compared, or subjected to meta-analysis.

### 6.2 Definitional Fragmentation

The three major schools use the term "job-to-be-done" to mean subtly but importantly different things. Christensen defines a job as "the progress a person seeks in a given circumstance"; Ulwick defines it as "the fundamental goal the customer is trying to achieve in a given situation," operationalized as a set of outcome statements; Moesta's usage is closest to Christensen's but is anchored in specific switch events rather than general goals. This terminological ambiguity creates confusion when practitioners attempt to apply the framework or when researchers attempt to study it. A shared ontological vocabulary has not emerged despite two decades of practitioner activity.

### 6.3 Longitudinal Outcome Data

Published JTBD case studies almost universally describe a single intervention and a positive short-term outcome. There is minimal longitudinal data on whether JTBD-informed products sustain their advantage over time, whether the identified jobs remain stable as markets evolve, or whether the claimed success rates (particularly Ulwick's 86%) hold across independent replications. The absence of longitudinal data makes it difficult to evaluate JTBD against the alternative hypothesis that positive outcomes are attributable to the quality of the research process generically (any rigorous customer research would have helped) rather than to the JTBD framework specifically.

### 6.4 Application to Platform and Network Products

JTBD theory was developed primarily with single-sided consumer products in mind. Its application to platform businesses (marketplaces, social networks, operating systems) where multiple sides have different and interdependent jobs is underexplored. In a two-sided market, whose job defines the product? How are the jobs of different sides prioritized when they conflict? The practitioner literature offers partial answers (typically: focus on the side whose participation is harder to attract), but no systematic treatment.

### 6.5 JTBD and Algorithmic/AI-Mediated Products

Modern consumer products increasingly use algorithmic recommendation, personalization, and AI-generated content in ways that make the "job" concept more complex. If an AI model creates content that the consumer did not know they wanted, is there a job being served? If a recommendation algorithm surfaces content that changes the consumer's preferences over time, what is the stable job to which the product is being hired? JTBD theory assumes a relatively stable causal structure (circumstance → job → hire decision) that may not hold in adaptive systems where the product actively shapes the consumer's job.

### 6.6 Cross-Cultural Applicability

The JTBD framework was developed primarily in North American consumer and enterprise contexts. The social job dimension, in particular, varies substantially across cultural contexts. Products hired for their social signaling value in one cultural context may be hired for purely functional reasons in another, or vice versa. Cross-cultural JTBD research is sparse, and the assumption that "jobs are universal" (a claim sometimes made by JTBD practitioners) has not been systematically tested.

### 6.7 The Articulation Boundary

All JTBD methodologies rely to varying degrees on customers' ability to articulate their jobs, struggles, or desired outcomes, either in interviews or surveys. The framework has limited applicability to needs that customers cannot or will not articulate — including needs that are socially stigmatized, emotionally defended, or genuinely pre-conscious. The practitioner literature acknowledges this limitation but has not developed systematic methods for transcending it.

---

## 7. Conclusion

Jobs-to-be-Done theory represents one of the most practically consequential frameworks for consumer product innovation developed in the past three decades. Its core insight — that customers hire products to make progress in their lives, and that understanding the job (rather than the product, the demographic, or the feature) is the fundamental unit of strategic analysis — has proven generative across product categories, company sizes, and cultural contexts. The theory's demand-side reorientation of competitive analysis, its insistence that emotional and social job dimensions are as important as functional ones, and its identification of non-consumption as the most important and most overlooked category of competition have materially altered how the best product organizations think about strategy.

The three principal schools offer complementary capabilities. Christensen's narrative framework provides the conceptual architecture: it is the best tool for reframing the strategic question, for defining the competitive landscape around the job rather than the category, and for communicating customer understanding to non-research stakeholders. Ulwick's ODI provides the quantitative spine: when organizations need to prioritize among multiple potential jobs or to size innovation opportunities with financial rigor, the Opportunity Algorithm and needs-first survey methodology deliver precision that qualitative approaches alone cannot. Moesta's switch interview provides the phenomenological depth: when organizations need to understand the specific triggers, anxieties, and progress metaphors that drive adoption decisions, the timeline-based retrospective interview produces insight with direct implications for messaging, onboarding, and sales.

The framework's open problems are real. The absence of standardized instruments limits the ability to aggregate findings and conduct comparative studies. The definitional fragmentation across schools creates practitioner confusion. The lack of longitudinal outcome data makes it difficult to evaluate JTBD against alternative hypotheses. And the framework's applicability to AI-mediated, platform, and cross-cultural contexts remains underexplored.

These limitations notwithstanding, JTBD has earned its position as a foundational framework for B2C product innovation. The core question it demands — what job is this customer hiring this product to do, and how well is the current competitive landscape serving that job? — is one that every product team should be able to answer with evidence, not intuition.

---

## References

1. Christensen, C. M., Hall, T., Dillon, K., & Duncan, D. S. (2016). *Competing Against Luck: The Story of Innovation and Customer Choice*. HarperBusiness. https://www.harpercollins.com/products/competing-against-luck-clayton-m-christensenmaxwell-hall

2. Ulwick, A. W. (2005). *What Customers Want: Using Outcome-Driven Innovation to Create Breakthrough Products and Services*. McGraw-Hill.

3. Ulwick, A. W. (2016). *Jobs to Be Done: Theory to Practice*. IDEA BITE PRESS. https://strategyn.com/jobs-to-be-done/

4. Ulwick, A. W. (2002). "Turn Customer Input into Innovation." *Harvard Business Review*, January 2002. https://hbr.org/2002/01/turn-customer-input-into-innovation

5. Moesta, B., & Engle, G. (2020). *Demand-Side Sales 101: Stop Selling and Help Your Customers Make Progress*. Lioncrest Publishing. https://www.amazon.com/Demand-Side-Sales-101-Customers-Progress/dp/1544509987

6. Klement, A. (2018). *When Coffee and Kale Compete: Become Great at Making Products People Will Buy*. JTBD Press. https://www.whencoffeeandkalecompete.com/

7. Cooper, A. (1999). *The Inmates Are Running the Asylum: Why High Tech Products Drive Us Crazy and How to Restore Sanity*. Sams Publishing.

8. Christensen Institute. (2014). "Jobs-to-be-Done Theory." https://www.christenseninstitute.org/theory/jobs-to-be-done/

9. Christensen Institute / Ojomo, E. "Nonconsumption is your fiercest competition — and it's winning." https://www.christenseninstitute.org/blog/non-consumption-is-your-fiercest-competition-and-its-winning/

10. The Re-Wired Group. (2017). "Milkshakes in the Morning — The JTBD Story." https://therewiredgroup.com/case-studies/milkshakes/

11. The Re-Wired Group. (2017). "Basecamp Case Study | JTBD & Uncovering Consumer Insights." https://therewiredgroup.com/case-studies/basecamp/

12. The Re-Wired Group. (2018). "Intercom Case Study | Applying JTBD to Help Customers' Progress." https://therewiredgroup.com/case-studies/intercom/

13. Whitenton, K. (2018). "Personas vs. Jobs-to-Be-Done." Nielsen Norman Group. https://www.nngroup.com/articles/personas-jobs-be-done/

14. Gothelf, J. (2018). "Reconciling Jobs to Be Done & Personas." Medium. https://medium.com/@jboogie/reconciling-jobs-to-be-done-personas-8aa96b94315b

15. Strategyn. "Outcome-Driven Innovation Process: A Complete Guide." https://strategyn.com/outcome-driven-innovation-process/

16. Wikipedia. "Outcome-Driven Innovation." https://en.wikipedia.org/wiki/Outcome-Driven_Innovation

17. Ulwick, A. W. "Outcome-Driven Innovation." Strategyn / AnthonyUlwick.com. https://anthonyulwick.com/outcome-driven-innovation/

18. GoPractice. "Jobs to Be Done: The Theory and the Frameworks (Christensen, Moesta & Ulwick)." https://gopractice.io/product/jobs-to-be-done-the-theory-and-the-frameworks/

19. Tunguz, T. "Disruptive Innovation in SaaS by Competing with Non-Consumption." Tomasz Tunguz / Redpoint Ventures. https://tomtunguz.com/nonconsumption/

20. Moesta, B. "Bob Moesta on Unpacking Customer Motivations with Jobs-to-be-Done." Intercom Blog. https://www.intercom.com/blog/podcasts/bob-moesta-on-unpacking-customer-motivations-with-jobs-to-be-done/

21. Business of Software. "Bob Moesta: Understanding Your Customer Jobs-to-be-Done." https://businessofsoftware.org/talks/understanding-your-customer-jtbd/

22. Productschool. "Jobs to Be Done Framework: A Guide for Product Teams." https://productschool.com/blog/product-fundamentals/jtbd-framework

23. Airfocus. "How to Apply Jobs to Be Done Framework Using Outcome-Driven Innovation (Insights from Tony Ulwick)." https://airfocus.com/blog/jobs-to-be-done-outcome-driven-innovation-ulwick/

24. Built In. "What Is the Jobs to Be Done Framework (JTBD)?" https://builtin.com/articles/jobs-to-be-done-framework

25. GreatQuestion. "Jobs-to-be-Done (JTBD) Framework: 2025 Guide." https://greatquestion.co/blog/jobs-to-be-done

26. UserInterviews. "Jobs to Be Done (JTBD) in UX Research." UX Research Field Guide. https://www.userinterviews.com/ux-research-field-guide-chapter/jobs-to-be-done-jtbd-framework

27. Fullstory. "Clay Christensen's Jobs to Be Done Framework." https://www.fullstory.com/blog/clayton-christensen-jobs-to-be-done-framework-product-development/

28. CXL. "Customer Interviews: How to Use the Jobs-to-Be-Done Framework." https://cxl.com/blog/customer-interviews/

29. AIM Institute. "Customer Interview Guide with The JTBD Pyramid." https://theaiminstitute.com/blog/from-struggle-to-strategy-interviewing-customers-with-the-jtbd-pyramid/

30. Digital Leadership. "Jobs-to-be-Done: Examples, Theory, Framework, Templates & Statements." https://digitalleadership.com/blog/jobs-to-be-done/

---

## Practitioner Resources

### Primary Books
- **Christensen, Hall, Dillon, Duncan** — *Competing Against Luck* (2016): The definitive account of Christensen's JTBD theory. Best for product strategists and general managers.
- **Ulwick** — *Jobs to Be Done: Theory to Practice* (2016): The full ODI methodology. Best for product managers and innovation program leads at large organizations.
- **Ulwick** — *What Customers Want* (2005): The original ODI book, with the HBR-era case studies. More accessible than the 2016 book as an introduction to quantitative JTBD.
- **Moesta & Engle** — *Demand-Side Sales 101* (2020): The switch interview and demand-side framing applied to sales and marketing. Best for growth, marketing, and sales teams.
- **Klement** — *When Coffee and Kale Compete* (2018): A practitioner-accessible treatment of JTBD job analysis. Good companion to Christensen for product design teams.

### Key Articles
- Ulwick (2002) "Turn Customer Input into Innovation," HBR: https://hbr.org/2002/01/turn-customer-input-into-innovation
- Whitenton (2018) "Personas vs. Jobs-to-Be-Done," NNG: https://www.nngroup.com/articles/personas-jobs-be-done/
- Klement (various) "The Forces of Progress" and related essays: https://jtbd.info

### Case Study Archives
- The Re-Wired Group case studies (Basecamp, Intercom, Milkshake): https://therewiredgroup.com/learn/complete-guide-jobs-to-be-done/
- Strategyn published case studies: https://strategyn.com/case-studies/
- Christensen Institute applied research: https://www.christenseninstitute.org/theory/jobs-to-be-done/

### Interview and Research Tools
- Switch interview script template (Klement): https://jtbd.info/a-script-to-kickstart-your-jobs-to-be-done-interviews-2768164761d7
- JTBD interview preparation guide (BrianRhea.com): https://brianrhea.com/jobs-to-be-done-interview-guide/
- CXL guide on conducting JTBD customer interviews: https://cxl.com/blog/customer-interviews/

### Courses and Workshops
- Bob Moesta's JTBD Switch Interview Workshop (Business of Software): https://businessofsoftware.org/tickets/masterclass/jtbd-workshop/
- Strategyn ODI practitioner training: https://strategyn.com/
- Customer JTBD Interviewing Skills (Maven / John Gusiff): https://maven.com/customer-centric-solutions-llc/customer-jtbd-interviewing-skills
