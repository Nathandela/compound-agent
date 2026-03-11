# Architecture Under Uncertainty: Making Irreversible Structural Decisions with Incomplete Information

*PhD-Level Survey in Software Architecture and Decision Theory*
*Prepared: March 2026*

---

## Abstract

Software architecture decisions are irreversible at the moment of maximum ignorance. This creates a fundamental epistemic problem: the architect must commit to structural choices whose long-term consequences cannot be known, under time pressure, knowing that requirements will change. This survey synthesizes four decades of research spanning real options theory, path dependence economics, evolutionary architecture, decision theory, technical debt analysis, uncertainty quantification, and empirical software engineering into a framework for navigating this problem. The central finding is that the dominant variable governing architectural longevity is not the quality of individual design choices but the reversibility structure of the decision space: architectures that preserve optionality consistently outperform architectures that foreclose options early, because requirements evolve faster than predictions. The survey documents: (1) the mathematical case for treating modularity as an option portfolio, drawing on Baldwin and Clark's (2000) design rules; (2) how Arthur's (1989, 1994) path dependence theory predicts which early decisions generate irreversible lock-in; (3) the evolutionary architecture paradigm and its fitness function methodology (Ford, Parsons, and Kua, 2017); (4) the decision process frameworks available to architects, including Simon's satisficing, Snowden's Cynefin, and Boyd's OODA loop; (5) the financial mechanics of technical debt as deferred architecture; (6) Bayesian and simulation approaches to uncertainty quantification in architectural risk; (7) industry evidence on which decisions cause the most rework; (8) the agile architecture tension and the last responsible moment principle; (9) case studies from Amazon, Netflix, and Twitter; and (10) open problems where the gap between theory and practice remains wide. The survey concludes that architecture under uncertainty is tractable, but only when practitioners shift from optimizing individual decisions to optimizing the decision-making process itself, and from building correct architectures to building architectures that can be corrected.

---

## 1. Introduction

### 1.1 The Core Problem

Every software architect faces the same paradox: the decisions that matter most must be made first, when the least is known. The choice of database, the boundaries between services, the event model, the concurrency paradigm—these are load-bearing structural decisions that constrain all subsequent work. They are also decisions made on the basis of requirements that will change, on technology assessments that will age, and on organizational assumptions that will prove wrong. The structural permanence of early decisions combined with the epistemic impermanence of early information is the defining problem of software architecture.

This survey examines how multiple research traditions address this problem. The goal is not to produce a formula for perfect architectural decision-making—no such formula exists—but to synthesize the best available theoretical and empirical tools into a coherent framework for making better decisions under uncertainty, recognizing when deferral is wisdom and when it is procrastination, and building systems that can adapt when predictions inevitably fail.

### 1.2 Why This Problem is Hard

Three structural features make architecture under uncertainty genuinely difficult rather than merely complicated.

First, architectural decisions are path-dependent. A choice of PostgreSQL over MongoDB does not merely affect the data layer; it shapes what query patterns are natural to express, what performance optimizations are available, what expertise the team develops, what migration cost attaches to any future change, and what mental models developers carry for years. Early decisions generate structural scaffolding that later decisions build upon, creating dependencies that accumulate into irreversibility.

Second, the cost of architectural errors compounds over time in a manner analogous to financial debt. A wrong database choice discovered in month two costs a weekend to correct; the same error discovered in month twenty-four, after the schema has been referenced by a hundred services and the team has built institutional knowledge around its quirks, can cost months of migration work. Cunningham (1992) captured this precisely with the technical debt metaphor: the error does not hurt until interest accumulates.

Third, requirements are not merely unknown at the time of architectural decision—they are unknowable in the Knightian sense. Future requirements depend on market evolution, user behavior, organizational change, and competitor action, none of which can be predicted from first principles at the moment of initial architecture. Knight (1921) distinguished risk (unknown distribution over known outcomes) from uncertainty (unknown outcomes with unknown distributions). Standard risk management tools, which presuppose known probability distributions, do not apply without modification to architectural uncertainty.

### 1.3 Scope and Organization

This survey covers ten major themes: real options theory applied to software (Section 2); irreversibility and path dependence (Section 3); evolutionary architecture and fitness functions (Section 4); architecture decision theory (Section 5); technical debt as deferred decisions (Section 6); uncertainty quantification (Section 7); empirical evidence on architectural decisions (Section 8); agile architecture and the last responsible moment (Section 9); case studies (Section 10); and open problems (Section 12), preceded by a synthesis in Section 11. The survey targets readers with graduate-level familiarity with software engineering.

---

## 2. Real Options Theory Applied to Software Architecture

### 2.1 Foundations

Real options theory originates in financial economics, specifically in Black and Scholes's (1973) option pricing model and Dixit and Pindyck's (1994) extension to capital investment under uncertainty. A financial option is the right, but not the obligation, to execute a transaction at a future time. Its value has two components: intrinsic value (payoff if exercised immediately) and time value (worth from the ability to wait). Time value is always positive when outcomes are uncertain, because waiting allows information to arrive that improves the decision.

Dixit and Pindyck's foundational insight is that irreversible investment decisions are options being exercised, and that exercising an option destroys its time value. A firm that commits capital to a project gives up the option of waiting for better information. This creates a real-options investment rule that differs from classical net-present-value analysis: even a positive-NPV investment may rationally be deferred if the option value of waiting exceeds the current NPV. The key parameter driving this decision is volatility: the higher the uncertainty about future payoffs, the higher the value of keeping options open.

### 2.2 Baldwin and Clark's Design Rules

The definitive application of real options theory to design systems is Baldwin and Clark's "Design Rules, Volume 1: The Power of Modularity" (2000). Their central argument is that modular architectures are option portfolios: hidden modules (those implementing behind stable interfaces) contain real options to improve, replace, or extend without affecting other modules.

Baldwin and Clark identify six elementary design moves available in any modular system: splitting (creating new modules from an existing one), substituting (replacing one module design with another), augmenting (adding new modules), excluding (removing modules), inverting (making a previously hidden design rule visible), and porting (adapting modules to new system contexts). Each of these moves constitutes a real option. The aggregate option value of a modular architecture is the sum of values across all possible applications of these six moves.

Their empirical analysis of the computer industry demonstrates that the option value embedded in the IBM System/360's modular architecture substantially exceeded the direct cost savings from standardized interfaces. The System/360's design rules—stable interfaces between hardware components, between hardware and operating systems, and between operating systems and applications—created successive option portfolios that generated extraordinary innovation value over decades. Critically, the companies that created this value through subsequent modular substitution (Intel, Microsoft, and hundreds of others) had not yet been founded when the System/360 decisions were made. The option value was embedded in the architecture and exercised by actors who could not have been predicted.

The mathematical implication for architectural practice is significant: option value increases with volatility. In an environment of high technological change and uncertain requirements, the value of keeping options open is higher than in stable environments. This means that the more uncertain the architectural environment, the greater the investment in modularity that is justified on purely financial grounds.

### 2.3 Distinguishing Option Value from Procrastination

A critical practical challenge is distinguishing genuine option value from rationalized procrastination. The distinction turns on two questions: does the information that would arrive during deferral actually change the decision, and is the cost of deferral less than the option value preserved?

Not all decisions have significant option value. When outcomes are known and stable, when the decision is easily reversible at modest cost, when deferral is itself costly, or when the information that would arrive is low-quality, deferral has little or no option value and constitutes procrastination.

The practical test is to ask: what would have to be true about the future for this decision to be made differently? If the answer is "very little could change it," the option value is low. If the answer is "many foreseeable changes could significantly affect it," the option value is high and deferral is legitimate.

```
                HIGH VOLATILITY
                      |
        HIGH OPTION   |   HIGH OPTION
        VALUE         |   VALUE
        (defer if     |   (invest in
        cheap)        |   modularity)
                      |
LOW REVERSIBILITY-----+-----HIGH REVERSIBILITY
                      |
        LOW OPTION    |   LOW OPTION
        VALUE         |   VALUE
        (decide now)  |   (decide now,
                      |   easy to change)
                      |
                LOW VOLATILITY

Fig. 1: Option value as a function of reversibility and volatility.
High volatility and low reversibility maximally justify deferral or
modularity investment. Low volatility and high reversibility
minimize option value.
```

### 2.4 Practical Option Value Approximation

Full Black-Scholes computation of architectural option values is rarely practical, requiring parameter estimates (volatility, discount rates) that do not map cleanly to software decisions. More tractable approximations include sensitivity analysis (identify which assumptions, if wrong, force major redesign; probability-weight those redesign costs), scenario planning (assess architecture performance across two to three plausible future states), and reversibility cost estimation (estimate the cost of changing the decision under various future scenarios, with high cost signaling high option value of the deferred or modular version).

---

## 3. Irreversibility and Path Dependence

### 3.1 Arthur's Theory of Increasing Returns

W. Brian Arthur's work on increasing returns and path dependence (1989, 1994), developed at the Santa Fe Institute, provides the theoretical foundation for understanding why early architectural decisions tend toward lock-in. Arthur's core model considers two competing technologies with increasing returns to adoption: as more users adopt technology A, network effects, learning economies, and infrastructure investment make A more attractive to subsequent adopters, even if technology B is intrinsically superior.

Arthur proved that in the presence of increasing returns, the system locks into one technology, and which technology wins is determined not by intrinsic quality but by early historical accidents—initial adopters, chance events, early infrastructure investments. Classic empirical examples include QWERTY keyboard layout persistence (David, 1985), VHS over Betamax, and Windows over alternative operating systems.

For software architecture, Arthur's theory predicts three things. First, any architectural decision that creates increasing returns (network effects within the codebase, learning economies among developers, infrastructure investment) will tend toward lock-in. Second, lock-in is not a design failure but an emergent property to be managed. Third, the predictors of lock-in are identifiable in advance: high switching cost, positive network externalities, and significant learning investment.

### 3.2 Identifying High-Irreversibility Decisions Before Committing

Not all architectural decisions are equally path-dependent. Several categories have characteristically high irreversibility:

**Data representation decisions** are among the most irreversible. Database technology choice (relational, document, columnar, graph) creates schema conventions, query patterns, migration procedures, and operational tooling that accumulate rapidly. More importantly, data outlives code: systems are rewritten, but the data they generated often cannot be discarded. A schema decision from 2010 may constrain a 2030 system because the data still exists.

**Public API contracts** acquire irreversibility once consumers depend on them. Internal APIs can be changed with team coordination; public APIs create external lock-in compounded by legal obligations, partner contracts, and ecosystem tooling. The irreversibility of API commitments is why API design is treated as particularly high-stakes (Tyree and Akerman, 2005).

**Language and runtime choices** create irreversibility through developer skill accumulation, tooling investment, and library ecosystem choices. A codebase in language X cannot typically be partially translated to language Y; migration usually requires complete rewrite.

**Concurrency and synchronization models** are foundational and expensive to change. A system built on shared-memory threading cannot be incrementally migrated to an actor model; the migration requires fundamental rethinking of state management throughout.

**Service boundary decisions** in distributed systems become irreversible once services are deployed and consumer contracts are established. A service split that was premature creates distributed transaction complexity more expensive to resolve than the original monolith.

A useful analytical heuristic is to classify decisions by reversibility spectrum and calibrate analytical effort proportionally:

```
EASILY REVERSIBLE          MODERATELY REVERSIBLE       LARGELY IRREVERSIBLE
        |                          |                            |
   Library choice              Framework choice           Language choice
   Logging format              ORM selection              Database paradigm
   Configuration               API internal design        API public contract
   Cache strategy              Service granularity        Data schema
        |                          |                            |
   Decide late with          Decide with explicit        Invest heavily in
   minimal analysis          reversibility review        up-front analysis
```

### 3.3 Conway's Law as a Path Dependence Mechanism

Melvin Conway's observation that "any organization that designs a system will produce a design whose structure is a copy of the organization's communication structure" (Conway, 1968) represents the most important path dependence mechanism in software architecture. Conway's Law creates lock-in through organizational mechanism rather than technical mechanism: the organizational structure that produced the architecture persists, and as long as it persists, it regenerates the same architectural patterns.

This has a crucial implication: architectural redesign without organizational redesign fails, because the same organizational communication structure reproduces the same technical structure. The "Inverse Conway Maneuver," coined by LeRoy and Simons (2010) and formalized in Skelton and Pais's Team Topologies (2019), deliberately designs team topology to produce the desired architecture rather than allowing organizational structure to determine architecture by default.

---

## 4. Evolutionary Architecture and Fitness Functions

### 4.1 The Evolutionary Architecture Paradigm

Ford, Parsons, and Kua's "Building Evolutionary Architectures" (2017, second edition with Sadalage, 2022) represents the most comprehensive attempt to operationalize architecture designed to change. Their core insight is that the traditional goal of "building the right system" is systematically undermined by the epistemic conditions of architecture: requirements change faster than architectures can be redesigned through traditional mechanisms.

Evolutionary architecture rests on three principles: fitness functions (objective, automated mechanisms that evaluate how well the architecture satisfies its key characteristics), incremental change (deployment pipelines and modularity that support continuous, low-risk architectural evolution), and appropriate coupling (explicit management of module dependencies to enable independent evolution).

### 4.2 Fitness Functions in Detail

A fitness function, borrowed from evolutionary computing, is any mechanism providing an objective integrity assessment of some architectural characteristic. Fitness functions differ from ordinary tests in scope and target: tests verify behavior; fitness functions verify architectural properties. Examples include:

- **Dependency cycle detection**: An automated check that fails if any module has circular dependencies, enforcing architectural invariants continuously.
- **Response time percentiles**: A check that fails if the 99th percentile response time exceeds a threshold, catching performance regressions before production.
- **Coupling metrics**: A check based on Martin's (2002) instability and abstractness metrics that fails when coupling exceeds established thresholds.
- **Security surface monitoring**: A check tracking public endpoint count that alerts when the attack surface grows unexpectedly.
- **Test coverage by architectural zone**: A check enforcing minimum coverage levels in business logic modules while allowing lower coverage in infrastructure code.

The key property of fitness functions is automation: they run continuously, transforming architectural properties from documentation claims to executable constraints. When a fitness function fails, architectural drift is detected immediately rather than in an annual review.

### 4.3 Metrics Predicting Long-Term Architectural Health

Several metrics have accrued empirical support as predictors of architectural health:

**Martin's instability and abstractness** (2002) defines a "zone of pain" (high stability, high concreteness—hard to change with many dependents) and "zone of uselessness" (high instability, high abstractness—unstable with nothing depending on them). The main sequence between these zones predicts healthy module design.

**Change frequency and defect co-occurrence**: Nagappan and Ball (2005) at Microsoft demonstrated that modules with high change frequency and high defect co-occurrence strongly predict future defects. Components that frequently change together but are not co-located represent a missed abstraction.

**DORA metrics** (Forsgren, Humble, and Kim, 2018): Deployment frequency and lead time for change are the strongest predictors of both organizational performance and system stability. These function as fitness functions at organizational scale: teams that can deploy frequently and with short lead times have architectures that support change; those that cannot have architectures that resist it.

### 4.4 Incremental Change vs. Big-Bang Redesign

Evolutionary architecture strongly favors incremental change over big-bang redesign, and empirical evidence supports this preference. Big-bang redesigns follow a well-documented failure pattern: they take longer than estimated, delay feature work, often reproduce the original problems (because the organizational structure that generated the first architecture is unchanged), and frequently succeed technically while failing organizationally (Fowler, 2004).

The Strangler Fig pattern (Fowler, 2004) enables architectural evolution without big-bang risk: gradually route traffic through a new implementation while the original system provides a production safety net. The conditions under which big-bang redesign is rational are narrow: when the existing architecture contains fundamental structural assumptions that cannot be evolved incrementally (typically data model assumptions affecting every component simultaneously), or when incremental migration costs exceed replacement costs.

---

## 5. Architecture Decision Theory

### 5.1 Architecture Decision Records

Architecture Decision Records (ADRs), formalized by Nygard (2011) and developed extensively by Tyree and Akerman (2005), are the primary mechanism for making architectural decision-making auditable. An ADR captures the context of a decision (what forces were in play), the decision itself, and the consequences (expected outcomes and accepted tradeoffs).

The Tyree and Akerman template extends the basic format with fields for assumptions, constraints, positions considered, and the argument for the chosen position over alternatives. This richer format forces architects to make assumptions explicit—which is the critical function. Assumptions that are implicit cannot be validated, challenged, or updated when evidence changes. Jansen and Bosch (2005) found that architectural knowledge is the most commonly undocumented knowledge in software organizations, and undocumented architectural decisions are a primary source of architectural decay: future developers make changes without understanding the constraints that motivated past decisions.

### 5.2 Simon's Satisficing and Bounded Rationality

Herbert Simon's foundational work on bounded rationality (1955, 1957) established that human decision-making does not optimize; it satisfices. Rational actors with limited information, limited computational capacity, and time pressure do not maximize expected utility—they search for alternatives that meet an acceptability threshold and stop when they find one.

Applied to architectural decision-making, satisficing has both descriptive and normative implications. Descriptively, architects satisfice: they apply heuristics, use pattern libraries, consult colleagues, and select an architecture that appears adequate. Research by Shahin et al. (2016) confirms this: architectural decisions are "mostly based on personal characteristics such as intuition and experience" with "factors including time, money and organizational practices making it difficult for decision-makers to conduct extensive analysis."

Normatively, satisficing is not always suboptimal. When search costs are high and the cost of an adequate solution is low relative to the cost of the optimal solution, satisficing converges to a near-optimal strategy. The practical question is how to set the aspiration threshold appropriately: too low, and satisficing stops at an inadequate solution; too high, it degenerates into exhaustive search.

### 5.3 The Cynefin Framework

Dave Snowden's Cynefin framework (Snowden and Boone, 2007) provides the most actionable categorization of decision contexts for software architecture. Cynefin defines five domains:

**Clear** (formerly Simple): Cause-effect relationships are known and stable. Best practice exists and should be applied. Architectural example: choosing a password hashing algorithm—bcrypt vs. Argon2 have well-understood tradeoffs and clear best practice.

**Complicated**: Cause-effect relationships exist but require expert analysis to identify. Multiple valid approaches may exist for different contexts. Architectural example: designing a caching strategy for a known read-write ratio—requires analysis but has deterministic tradeoffs amenable to formal evaluation.

**Complex**: Cause-effect relationships exist but can only be understood retrospectively. No right answer exists before attempting; only emergent practice discovered through safe-to-fail experiments. Architectural example: determining optimal service granularity for a new business domain—no analysis can determine this in advance; it must be discovered through experimentation.

**Chaotic**: No discernible cause-effect relationships. Immediate action to stabilize, then transition to another domain. Architectural example: post-incident architectural response to catastrophic failure.

**Disorder**: Not knowing which domain applies—the danger zone where incorrect decision-making strategies are applied.

```
            COMPLEX                      COMPLICATED
         (Probe-Sense-Respond)        (Sense-Analyze-Respond)
         Emergent practice            Good practice
         Safe-to-fail experiments     Expert analysis
         Example: service             Example: caching
         boundary design              strategy design
                 \                          /
                  \_________  ____________/
                            \/
                         DISORDER
                         (Determine
                          domain first)
                  ________  ____________
                 /          \
                /            \
           CHAOTIC             CLEAR
       (Act-Sense-Respond)  (Sense-Categorize-Respond)
       Novel practice        Best practice
       Stabilize first       Apply known solution
       Example: incident     Example: password
       response              hashing choice

Fig. 2: Cynefin framework applied to software architecture decisions.
```

The dominant practical error in architectural decision-making is treating **complex** problems as **complicated**: subjecting them to elaborate analysis that produces an illusion of certainty from assumptions that are not valid for complex problems. The correct approach to complex architectural decisions is to design safe-to-fail experiments—small, reversible deployments that generate real information about system behavior under actual conditions.

### 5.4 The OODA Loop for Architectural Adaptation

John Boyd's Observe-Orient-Decide-Act (OODA) loop (Boyd, 1976), developed from analysis of air combat decision cycles, provides a model for rapid architectural adaptation. The OODA loop's key insight is that advantage in uncertain environments goes to the entity that cycles through the loop fastest. Applied to architecture:

- **Observe**: Monitor fitness functions, deployment metrics, and operational signals continuously.
- **Orient**: Interpret signals through architectural principles and system intent.
- **Decide**: Select the minimal change that improves architectural fitness.
- **Act**: Deploy the change through small incremental modifications.

The loop runs continuously rather than as a one-time design exercise. This reframes architecture from a static artifact produced at project initiation to a dynamic property maintained through continuous observation and adaptation. The architectural runway concept in SAFe institutionalizes a version of this: the runway is not a complete design but the minimum viable structure needed to allow current development to proceed, maintained through continuous addition.

---

## 6. Technical Debt as Deferred Decisions

### 6.1 Cunningham's Original Metaphor

Ward Cunningham introduced the technical debt metaphor at OOPSLA 1992 in an experience report on the WyCash portfolio management system. The context was a financial application in Smalltalk where the team had made expedient early decisions about representing financial objects that they knew were conceptually imprecise. Cunningham's formulation: "Shipping first time code is like going into debt. A little debt speeds development so long as it is paid back promptly with a rewrite. The danger occurs when the debt is not repaid. Every minute spent on not-quite-right code counts as interest on that debt."

The metaphor is specifically about code that does not accurately represent the team's understanding of the domain—not just any shortcut, but the failure to consolidate accumulated understanding into the code. This original framing is important: it distinguishes productive technical debt (taking a shortcut when understanding will be refined) from accidental technical debt (writing code that does not reflect current understanding).

### 6.2 Fowler's Technical Debt Quadrant

Fowler (2009) refined Cunningham's metaphor with the Technical Debt Quadrant, classifying debt along two dimensions: deliberate vs. inadvertent, and reckless vs. prudent.

```
                    DELIBERATE
                        |
    RECKLESS/       "We don't have     PRUDENT/
    DELIBERATE:     time for design"   DELIBERATE:
    "quick and dirty"                  "we must ship now
    conscious choice                   and deal with
    of bad practice                    consequences"
                        |
    RECKLESS ___________+___________ PRUDENT
                        |
    RECKLESS/       Code written     PRUDENT/
    INADVERTENT:    without design   INADVERTENT:
    "What's         knowledge;       "Now we know how
    layering?"      ignorant of      we should have
                    debt taken       done this"
                        |
                    INADVERTENT

Fig. 3: Fowler's Technical Debt Quadrant.
Only Prudent/Deliberate debt is financially rational.
```

Only **Prudent/Deliberate** debt is a genuinely rational financial decision: the team makes a conscious choice to ship now with known shortcuts and an explicit plan to repay. **Reckless/Deliberate** debt is a management failure. **Reckless/Inadvertent** debt is a skill problem. **Prudent/Inadvertent** debt—where the team learns during development that earlier decisions were suboptimal—is inevitable and healthy in any learning team.

### 6.3 Kruchten's Technical Debt Landscape

Kruchten, Nord, and Ozkaya (2012) extended the metaphor into a multi-dimensional management tool. Their landscape distinguishes visible debt (absent features and present defects, visible to users) from invisible debt (code quality issues, architectural violations, and missing tests visible only to developers). They argue that the most dangerous technical debt is invisible, because it accumulates without appearing in user-facing metrics until it causes catastrophic failure or a productivity cliff.

Their categorization of invisible debt includes architectural technical debt (ATD): violations of the intended architecture that accumulate when developers circumvent architectural constraints under time pressure. ATD is particularly expensive because it corrupts the structural assumptions that the rest of the codebase depends on.

### 6.4 The Economics of Deliberate Architectural Debt

Technical debt is rational when the interest rate (cost per unit time of carrying the debt) is less than the cost of capital (opportunity cost of the refactoring investment now). This analysis produces clear guidelines:

- **Rational to take debt**: When time-to-market advantage is large, when the system may be thrown away before interest accumulates significantly, when the shortcut is genuinely low-interest (isolated and easily reversible), or when the team has insufficient information to make a good long-term decision.

- **Irrational to take debt**: When the system will be long-lived, when the shortcut has high coupling affecting many modules, when the team already understands the right approach, or when accumulated debt already creates a productivity cliff.

The financial metaphor breaks down in one important respect: technical debt has no fixed interest rate. Interest rates vary with the frequency of changes in the affected areas, the complexity of those changes, and the team's familiarity with the code. A piece of technical debt in a rarely-changed module carries negligible interest; the same debt in a frequently-modified module carries compounding interest.

---

## 7. Uncertainty Quantification in Architecture

### 7.1 The Epistemic Status of Architectural Assumptions

Every architectural decision rests on assumptions: about usage patterns, team size, performance requirements, integration needs, and organizational stability. Architectural choices are optimal only for specific regions of the distribution over these assumptions. When the actual value falls outside the optimized region, redesign becomes necessary.

Uncertainty quantification (UQ) is the practice of making implicit probability distributions explicit and propagating them through the analysis. In engineering, Monte Carlo simulation is the standard UQ tool: sample from input distributions, evaluate the system model at each sample, and analyze the output distribution. The same approach applies to architectural risk analysis (Kazman, Klein, and Clements, 2000).

### 7.2 ATAM: Architecture Tradeoff Analysis Method

ATAM, developed at the Software Engineering Institute by Kazman, Klein, and Barbacci (1998, 2000), is the most established formal method for architectural risk analysis. ATAM evaluates a proposed architecture against quality attribute goals by collecting quality attribute scenarios from stakeholders, identifying architectural approaches addressing each scenario, and analyzing each approach for sensitivity points (parameters critically affecting a quality attribute) and tradeoff points (parameters affecting multiple quality attributes in opposing directions).

ATAM's sensitivity point analysis is the closest practical equivalent to UQ in mainstream architectural practice. A sensitivity point has the form: "If assumption X changes by factor Y, quality attribute Z degrades catastrophically." This is precisely the information needed to prioritize architectural hedge investments. A concrete sensitivity analysis table:

```
Assumption                  | If Wrong By   | Consequence              | Mitigation
----------------------------|---------------|--------------------------|-------------------
Request rate: 1000 req/s    | 10x underest. | Cache exhaustion, DB OOM | Cache sharding
Data size: 100GB/year       | 100x underest.| Storage costs 100x plan  | Object storage
Team size: 5 developers     | 3x growth     | Coordination overhead    | Service split
Third-party SLA: 99.9%      | 99.0% actual  | Cascading timeouts       | Circuit breaker
```

### 7.3 Bayesian Approaches and the Value of Information

Bayesian reasoning informs the "value of information" calculation that underlies the decision to investigate before committing. Before committing to a database choice, it may be worth spending a week building prototypes and measuring performance characteristics—not because this eliminates uncertainty, but because the information has positive expected value if the probability it changes the decision, times the cost of making the wrong decision, exceeds the cost of the investigation.

The expected value of perfect information formula (Howard, 1966):

```
EVPI = E[V* | full information] - E[V* | current information]

If EVPI > cost of investigation:
    investigate before deciding
Otherwise:
    decide with current information
```

Research by Grunske and Joyce (2008) proposed discrete-time Markov chains with Bayesian estimators for continuous verification of architectural requirements at runtime, quantifying the probability that a requirement is satisfied rather than treating satisfaction as binary—a more honest representation of architectural health under uncertainty.

### 7.4 Monte Carlo Simulation for Architectural Risk

The SEI uncertainty quantification research (Feiler et al., 2006) demonstrates Monte Carlo simulation applied to architectural risk:

1. Represent each key assumption as a probability distribution.
2. Sample from all distributions simultaneously (thousands of iterations).
3. Compute architectural quality attribute scores for each sample.
4. Analyze the distribution of outcomes.

The output is not a single architectural evaluation but a distribution: "There is a 70% probability that response time will meet the SLA, a 20% probability it will miss by less than 2x, and a 10% probability it will miss by more than 10x." This identifies which assumption creates heavy-tail risk—the scenario that, while unlikely, would be catastrophic.

---

## 8. Empirical Evidence on Architectural Decisions

### 8.1 The Boehm Cost of Change Curve: Cautions

Barry Boehm's (1981) cost of change curve, derived from empirical data at TRW and IBM, showed defect repair cost increasing exponentially across development phases—up to 100x more expensive in maintenance than in requirements analysis. This curve became the dominant justification for heavy upfront architectural analysis.

However, the curve has been significantly challenged. Bossavit (2013) analyzed the underlying data and found it was limited in scope, unrepresentative, and the 100x figure was an outlier. Modern development tools have substantially flattened the curve: continuous integration, test automation, and mature refactoring tooling reduce late-stage change costs considerably. Cohn (2014) argues the curve is outdated for modern agile teams, where the cost increase is closer to 1.5-2x between requirements and production rather than 100x.

The practical implication is not that early decisions are unimportant—they are—but that the economic case for exhaustive upfront analysis is weaker than classic textbooks suggest. Decision-making rigor should be proportional to actual reversibility costs in the specific technology and organizational context, not based on the assumption that a 100x multiplier applies universally.

### 8.2 Lehman's Laws of Software Evolution

Manny Lehman and Les Belady's empirical studies (1974, 1985) produced laws about how real-world software systems evolve, derived from studying large IBM systems. The two most empirically robust laws (Godfrey and Tu, 2000) are:

**The Law of Continuing Change**: An E-type program (one that evolves in response to a changing environment) must be continually adapted, or it becomes progressively less satisfactory.

**The Law of Increasing Complexity**: As an E-type program evolves, its complexity increases unless specific work is done to maintain or reduce it.

These laws have direct architectural implications. The Law of Continuing Change implies architecture is a continuous maintenance activity, not a one-time decision. The Law of Increasing Complexity implies architectural entropy is the default trajectory: without deliberate maintenance (refactoring, module reorganization, dependency pruning), complexity compounds over time. Both laws have been confirmed in open-source systems studies (Godfrey and Tu, 2000; Mens et al., 2005), though other Lehman laws have mixed empirical support.

### 8.3 Architectural Longevity and Rework Patterns

Industry evidence on architectural longevity reveals several patterns:

**Architecture-level decisions cause the most expensive rework.** SEI research (Bass, Clements, and Kazman, 2012) consistently finds that architectural decisions—particularly those affecting data persistence, service boundaries, and concurrency models—account for disproportionate rework costs. This is consistent with irreversibility analysis: high-irreversibility decisions, when wrong, require high-cost correction.

**Enterprise systems require major architectural overhaul every 6-10 years.** Analysis of software longevity shows that custom enterprise systems last an average of 6-8 years before requiring major redesign, with very large programs lasting up to 12-14 years. The Google rule of thumb—design for 10x current needs, with the understanding that beyond an order-of-magnitude increase it is often better to redesign—reflects this empirical reality.

**The dominant cause of premature redesign is organizational-structural mismatch, not technology obsolescence.** The evidence supports Conway's Law empirically: the most common trigger for architectural redesign is organizational restructuring, not technology change. Teams inherit architectures that reflect organizational structures that no longer exist, and the mismatch between current team topology and the topology embedded in the architecture creates accumulating friction that eventually forces redesign.

**Architectural technical debt (ATD) carries the highest interest rates.** Izurieta et al.'s (2017) study found that ATD violations—violations of the intended architecture in core service boundaries—had rework costs 3-5x higher than ATD violations in peripheral modules, confirming that load-bearing structural decisions are more expensive to get wrong than peripheral ones.

### 8.4 Conway's Law: Empirical Validation

Nagappan, Murphy, and Basili (2008) at Microsoft provided quantitative evidence for Conway's Law, demonstrating that organizational metrics predict software defects more accurately than code metrics alone. Their finding—that organizational distance between teams is a stronger predictor of inter-module integration defects than technical coupling metrics—provides empirical support for the claim that organizational structure is an architectural decision, not just an organizational management issue.

---

## 9. Agile Architecture and the Last Responsible Moment

### 9.1 The YAGNI Principle

"You Aren't Gonna Need It" (YAGNI), from Extreme Programming (Beck, 1999), states that functionality should not be built until needed. Applied to architecture, YAGNI argues against flexibility mechanisms, extension points, and generalization layers that anticipate unmaterialized future requirements.

YAGNI is a corrective against premature generalization—a failure mode that is architecturally expensive. A generalization layer designed for three hypothetical use cases, of which only one materializes, adds the complexity of three use cases while providing the value of one. Fowler (2005) distinguishes three YAGNI violation types: speculative generality (abstractions for hypothetical use cases), preparatory refactoring (refactoring before knowing the change is needed), and infrastructural over-investment (deployment and scaling infrastructure beyond current needs).

YAGNI is not a universal architectural principle. It applies to reversible, fungible functionality where future options are not foreclosed by current decisions. It does not apply to load-bearing structural decisions (database choice, API design), decisions with long lead times (security architecture, compliance infrastructure), or decisions where future change cost is very high (data schema, public APIs). The critical skill is distinguishing when YAGNI applies from when it is premature parsimony that forecloses options.

### 9.2 The Last Responsible Moment

The Last Responsible Moment (LRM) principle, from Lean software development (Poppendieck and Poppendieck, 2003), defines optimal decision timing as "the moment at which failing to make a decision eliminates an important alternative." The LRM is not the last possible moment (which would be reckless delay) but the last moment at which the full option space remains open.

The LRM operationalizes the real options insight: information arriving before the LRM has positive value (it may change the decision), while information arriving after is useless (it cannot change a decision already made). Waiting until the LRM maximizes the information used without delaying to the point of harm.

Identifying the LRM requires asking: What decision alternatives will be foreclosed if we wait longer? What information will arrive? Does the expected value of arriving information exceed the cost of waiting? The LRM is decision-specific, not fixed in time: the LRM for database schema design may be much later than the LRM for service interface design, because schema changes are more expensive to impose after the fact.

### 9.3 SAFe's Architectural Runway

The Scaled Agile Framework operationalizes intentional architecture through the architectural runway: the existing technical infrastructure needed to support near-term features without requiring last-minute architectural work. The runway concept reconciles intentional and emergent architecture: intentional architecture provides deliberate, planned structure (the runway), while emergent design fills in implementation details (discovered through development).

SAFe explicitly addresses the YAGNI tension: the runway is "just enough" architecture to support the next program increment. Too much runway over-engineers the solution; too little creates last-minute architectural scrambles. The key insight is that some decisions must be intentional—they cannot emerge, because they require coordination across multiple teams or would take too long to discover—while most implementation decisions can safely emerge.

### 9.4 When Emergent Architecture Fails

Emergent architecture has a documented failure mode: when architectural decisions cannot be undone incrementally, emergence produces locally optimal decisions that collectively yield a globally suboptimal architecture. The distributed monolith—teams independently evolving services that satisfy local requirements but share databases, make synchronous cross-service calls, and deploy together due to tight coupling—is the canonical example. It has the complexity of microservices and the fragility of a monolith.

Emergent architecture fails specifically when: load-bearing decisions require coordination across multiple team boundaries; performance characteristics depend on the global structure of service interactions; security requirements span multiple services; or compliance requirements impose cross-cutting constraints. These cases require intentional architecture: decisions made centrally and imposed as constraints on local team decisions.

---

## 10. Case Studies

### 10.1 Amazon: The Service-Oriented Mandate

Amazon's architectural evolution from a monolith to a service-oriented architecture, driven by the Bezos API Mandate of 2002, is the most-cited case study in architectural transformation under uncertainty. The mandate required that all teams expose functionality through service interfaces, with no other form of inter-process communication permitted. Its five key directives established: service interfaces as the only communication mechanism; no direct linking, direct database reads, shared-memory models, or back-doors; any communication must occur via service interface calls over the network; and all service interfaces must be designed to be externalizable from the ground up.

The architectural insight was the coupling between organizational structure and technical structure: if teams communicate through explicit service interfaces, the organizational boundary and the technical boundary are aligned. This alignment prevents the drift that creates distributed monoliths.

The option value mechanism is explicit in retrospect: Bezos could not predict which Amazon services would become valuable to external customers, but he could guarantee that services designed for externalizable APIs were candidates for external exposure, while services with tight internal coupling could never be externalized. Amazon Web Services—a business that generates more revenue than Amazon's retail operations—emerged from this optionality. The option value of the architectural decision substantially exceeded any upfront estimate, vindicating the real options rationale.

### 10.2 Netflix: Chaos Engineering as Fitness Functions

Netflix's migration from monolith to cloud-native microservices (2008-2016) illustrates how architectural decisions can be driven by forced failure rather than planned strategy, and how an organization can institutionalize uncertainty management as an architectural practice.

The trigger was a 2008 database corruption causing a three-day outage—a single point of failure that was unacceptable for a streaming service. The migration to AWS and microservices was reactive, made under duress, which compressed the information-gathering phase that real options theory would recommend.

Netflix's most significant architectural contribution was not service decomposition but Chaos Engineering. Tools including Chaos Monkey (randomly terminating production instances), Chaos Kong (simulating regional outages), and the broader Simian Army constitute executable fitness functions for architectural resilience. Chaos Engineering institutionalizes the Cynefin complex domain insight: the architecture's behavior under failure cannot be derived analytically; it must be discovered through experimentation. By making failure a routine experience, Netflix accelerated the learning cycle and discovered architectural assumptions before they caused uncontrolled failures.

Netflix's chaos engineering practices provide a practical model for fitness functions operating at the operational level (through continuous failure injection) rather than solely at the code level (through static analysis). The Netflix architecture also illustrates the limits of rational design: the "Death Star" service dependency diagram—hundreds of services with complex interdependencies—emerged from a combination of deliberate decomposition decisions and accumulated organizational decisions, not from a coherent architectural plan. The complexity was managed through chaos engineering rather than prevented through design.

### 10.3 Twitter: The Cost of Premature Decomposition

Twitter's architectural history provides the instructive counterexample. Twitter's migration from its Ruby on Rails monolith (2006-2010) was driven by scaling necessity—the "Fail Whale" became a cultural artifact symbolizing Twitter's inability to handle its growth. Unlike Amazon's service decomposition, Twitter's migration lacked domain-driven boundary analysis.

The result was a distributed monolith: services nominally independent but practically coupled through shared databases, synchronous inter-service calls for fundamental operations, and deployment coordination requirements. The service dependency graph grew into the same "Death Star" topology that Netflix produced—emerging independently and simultaneously, suggesting this topology is the natural failure mode of service decomposition without domain analysis.

Structural factors contributing to Twitter's difficulties included premature decomposition (service boundaries drawn before the domain was well-understood, cutting across natural cohesion); shared mutable state (services sharing databases, making independent deployment impossible); synchronous communication as default (creating cascading failures where one slow service blocked many callers); and organizational mismatch (decomposition organized around technical concerns rather than business domain concepts).

The Twitter case illustrates Conway's Law as a bidirectional constraint: organizational boundaries imposed on architectural decisions without domain analysis produce architectures that reflect organizational politics rather than domain logic, requiring subsequent expensive realignment.

---

## 11. Synthesis: A Framework for Architecture Under Uncertainty

### 11.1 The Central Reframe

The central finding across all research traditions surveyed is that architectural success under uncertainty is determined less by the quality of individual decisions and more by the quality of the decision-making process and the reversibility structure of the decisions made. Amazon's service mandate did not guarantee AWS; it created an option that was later exercised. Netflix's chaos engineering does not guarantee resilience; it discovers and addresses resilience gaps continuously. The goal is not to make correct predictions but to build systems that can be corrected as predictions fail.

This reframe has concrete implications:

1. **Invest in reversibility proportionally to irreversibility risk.** Not all decisions need reversibility investment. High-irreversibility decisions justify significant modular investment. Low-irreversibility decisions require minimal upfront analysis.

2. **Make assumptions explicit, not just decisions.** ADRs that record only the decision miss the most valuable information: the assumptions under which the decision is optimal. When assumptions are explicit, they can be monitored, and architectural changes can be triggered when assumptions are violated.

3. **Apply Cynefin correctly.** Many architectural problems are complex (requiring experimentation) rather than complicated (requiring analysis). Applying analysis to complex problems produces an illusion of certainty from invalid assumptions.

4. **Treat technical debt as a financial instrument with explicit terms.** Deliberate/prudent debt is rational when time value of faster delivery exceeds expected interest cost. The critical discipline is making the debt explicit and tracking its accumulation.

5. **Fitness functions are the primary architectural governance mechanism.** Architectural properties enforced through automated mechanisms are more reliable than manual reviews. Fitness functions that run on every commit make architectural drift immediately visible.

### 11.2 A Decision Framework

```
              ARCHITECTURAL DECISION
                       |
               Is this decision
                 irreversible?
               /              \
             YES               NO
              |                |
      Categorize via        Apply YAGNI:
      Cynefin               decide with minimal
              |             analysis, document
      Is it COMPLEX?        assumptions
        /        \
      YES          NO
       |            |
  Probe:         Analyze:
  safe-to-fail   ATAM sensitivity
  experiments,   points, option
  defer commit   value calc
       |            |
  Learn from    Select arch at
  experiments   satisficing
       |        threshold
        \       /
        Decide
          |
     Document ADR
     with assumptions
     explicit
          |
     Define fitness
     functions for
     key assumptions
          |
     Monitor continuously;
     update when assumptions
     are violated

Fig. 4: Decision framework for architecture under uncertainty.
```

---

## 12. Open Problems

### 12.1 The Theory-Practice Gap

The most significant open problem is the persistent gap between available formal tools and actual practice. Shahin et al. (2016) found that architectural decisions are "mostly based on personal characteristics such as intuition and experience." ATAM, real options analysis, and Bayesian risk quantification exist but are rarely applied outside high-stakes government and defense contexts.

Two explanations compete. The first is that formal tools are too costly relative to their value: ATAM evaluations take three to four days with trained evaluators; this cost may exceed the expected value of improved decisions for most systems. The second, supported by Klein's (1998) naturalistic decision-making research, is that expert intuition may genuinely outperform formal analysis under the specific conditions of architectural decision-making—high time pressure, incomplete information, and rich contextual cues where pattern recognition is more reliable than formal models.

Empirical research does not yet resolve which explanation dominates, or under what conditions each is more accurate. A rigorous comparison of architectural outcomes for teams using formal methods versus experienced intuition across a representative sample of projects does not exist.

### 12.2 Quantifying Architectural Option Value

While the theoretical framework for option value in software architecture is well-developed (Baldwin and Clark, 2000), practical methods for quantifying option value in specific architectural decisions remain underdeveloped. Financial options pricing requires parameter estimates not available for software decisions with tractable accuracy. Practical option value approximation tools that are rigorous enough to be useful and simple enough to be used have not been validated empirically against actual architectural outcomes.

### 12.3 Fitness Function Standardization

The fitness function concept is widely cited, but no standardized taxonomy or library of fitness functions exists across common architectural patterns. Teams must invent fitness functions from scratch for each project. A standardized, empirically validated library for common patterns (event-driven systems, CQRS, hexagonal architecture) would substantially lower the barrier to adoption.

### 12.4 Quantifying Conway's Law

Conway's Law is empirically supported in qualitative terms, but quantitative models predicting specific architectural properties from specific team topologies have not been developed. Nagappan, Murphy, and Basili (2008) showed that organizational metrics outperform code metrics as predictors of software failure, but a general model connecting organizational structures to architectural patterns does not exist. Without this, the "Inverse Conway Maneuver" remains directional guidance rather than precise engineering.

### 12.5 Irreversibility Metrics

There is no established metric for architectural irreversibility. Practitioners identify high-irreversibility decisions through heuristics and experience, but no formal measure captures "how expensive would it be to change this decision in three years given typical system evolution?" Development of irreversibility metrics—perhaps derived from change frequency analysis of similar decisions in similar systems—would enable more principled allocation of analytical effort.

### 12.6 AI-Assisted Architecture

The impact of large language models on architectural decision-making—both as decision support tools and as new architectural primitives requiring new decision frameworks—is an emerging and rapidly evolving area that this survey has not addressed. LLMs introduce new dimensions of uncertainty into architecture: they are probabilistic systems whose behavior is not fully predictable, creating novel challenges for fitness function design, API contract management, and non-functional requirement specification.

---

## 13. References

Arthur, W. B. (1989). Competing technologies, increasing returns, and lock-in by historical events. *The Economic Journal*, 99(394), 116-131.

Arthur, W. B. (1994). *Increasing Returns and Path Dependence in the Economy*. University of Michigan Press.

Baldwin, C. Y., and Clark, K. B. (2000). *Design Rules, Volume 1: The Power of Modularity*. MIT Press.

Bass, L., Clements, P., and Kazman, R. (2012). *Software Architecture in Practice* (3rd ed.). Addison-Wesley.

Beck, K. (1999). *Extreme Programming Explained: Embrace Change*. Addison-Wesley.

Black, F., and Scholes, M. (1973). The pricing of options and corporate liabilities. *Journal of Political Economy*, 81(3), 637-654.

Boehm, B. W. (1981). *Software Engineering Economics*. Prentice Hall.

Bossavit, L. (2013). *The Leprechauns of Software Engineering*. Leanpub.

Boyd, J. R. (1976). Destruction and creation. Unpublished paper. United States Army Command and General Staff College.

Conway, M. E. (1968). How do committees invent? *Datamation*, 14(4), 28-31.

Cunningham, W. (1992). The WyCash portfolio management system. Experience report, OOPSLA 1992.

David, P. A. (1985). Clio and the economics of QWERTY. *The American Economic Review*, 75(2), 332-337.

Dixit, A. K., and Pindyck, R. S. (1994). *Investment Under Uncertainty*. Princeton University Press.

Feiler, P. H., Goodenough, J., Gurfinkel, A., Layman, C., Linger, R., Longstaff, T., and Mead, N. (2006). Ultra-large-scale systems: The software challenge of the future. Software Engineering Institute, Carnegie Mellon University.

Ford, N., Parsons, R., and Kua, P. (2017). *Building Evolutionary Architectures: Support Constant Change*. O'Reilly Media. (Second edition with Sadalage, 2022.)

Forsgren, N., Humble, J., and Kim, G. (2018). *Accelerate: The Science of Lean Software and DevOps*. IT Revolution Press.

Fowler, M. (2004). Strangler Fig Application. martinfowler.com/bliki/StranglerFigApplication.html.

Fowler, M. (2005). YAGNI. martinfowler.com/bliki/Yagni.html.

Fowler, M. (2009). Technical Debt Quadrant. martinfowler.com/bliki/TechnicalDebtQuadrant.html.

Fowler, M. (2014). Sacrificial Architecture. martinfowler.com/bliki/SacrificialArchitecture.html.

Godfrey, M. W., and Tu, Q. (2000). Evolution in open source software: A case study. *Proceedings of the 2000 International Conference on Software Maintenance*, 131-142.

Grunske, L., and Joyce, D. (2008). Quantitative risk-based security prediction for component-based systems with explicitly modeled attack profiles. *Journal of Systems and Software*, 81(8), 1327-1345.

Howard, R. A. (1966). Information value theory. *IEEE Transactions on Systems Science and Cybernetics*, 2(1), 22-26.

Izurieta, C., Chatzigeorgiou, A., Mantle, G., Bieman, J., and Spinola, R. (2017). Organizing the technical debt landscape. In *Proceedings of the IEEE International Conference on Software Quality, Reliability and Security Companion*, 68-75.

Jansen, A., and Bosch, J. (2005). Software architecture as a set of architectural design decisions. *Proceedings of the Fifth IEEE/IFIP Working Conference on Software Architecture*, 109-120.

Kazman, R., Klein, M., and Barbacci, M. (1998). The architecture tradeoff analysis method. *Proceedings of the Fourth IEEE International Conference on Engineering of Complex Computer Systems*.

Kazman, R., Klein, M., and Clements, P. (2000). ATAM: Method for architecture evaluation. Technical Report CMU/SEI-2000-TR-004. Software Engineering Institute.

Klein, G. (1998). *Sources of Power: How People Make Decisions*. MIT Press.

Knight, F. H. (1921). *Risk, Uncertainty and Profit*. Hart, Schaffner and Marx.

Kruchten, P. (1995). The 4+1 view model of architecture. *IEEE Software*, 12(6), 42-50.

Kruchten, P., Nord, R. L., and Ozkaya, I. (2012). Technical debt: From metaphor to theory and practice. *IEEE Software*, 29(6), 18-21.

Lehman, M. M., and Belady, L. A. (1985). *Program Evolution: Processes of Software Change*. Academic Press.

LeRoy, J., and Simons, M. (2010). Visualizing the effects of your architecture. *Cutter IT Journal*, 23(12).

Martin, R. C. (2002). *Agile Software Development, Principles, Patterns, and Practices*. Prentice Hall.

Mens, T., Wermelinger, M., Ducasse, S., Demeyer, S., Hirschfeld, R., and Jazayeri, M. (2005). Challenges in software evolution. *Proceedings of the 8th International Workshop on Principles of Software Evolution*, 13-22.

Nagappan, N., and Ball, T. (2005). Use of relative code churn measures to predict system defect density. *Proceedings of the 27th International Conference on Software Engineering*, 284-292.

Nagappan, N., Murphy, B., and Basili, V. (2008). The influence of organizational structure on software quality. *Proceedings of the 30th International Conference on Software Engineering*, 521-530.

Nygard, M. (2011). Documenting architecture decisions. cognitect.com/blog/2011/11/15/documenting-architecture-decisions.

Parnas, D. L. (1972). On the criteria to be used in decomposing systems into modules. *Communications of the ACM*, 15(12), 1053-1058.

Poppendieck, M., and Poppendieck, T. (2003). *Lean Software Development: An Agile Toolkit*. Addison-Wesley.

Shahin, M., Liang, P., Babar, M. A., and Zhu, L. (2016). A systematic review of software architecture visualization techniques. *Journal of Systems and Software*, 119, 344-371.

Simon, H. A. (1955). A behavioral model of rational choice. *Quarterly Journal of Economics*, 69(1), 99-118.

Simon, H. A. (1957). *Models of Man: Social and Rational*. Wiley.

Skelton, M., and Pais, M. (2019). *Team Topologies: Organizing Business and Technology Teams for Fast Flow*. IT Revolution Press.

Snowden, D. J., and Boone, M. E. (2007). A leader's framework for decision making. *Harvard Business Review*, 85(11), 68-76.

Tyree, J., and Akerman, A. (2005). Architecture decisions: Demystifying architecture. *IEEE Software*, 22(2), 19-27.

---

*End of survey document.*
