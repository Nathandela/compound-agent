# The Science of Software Decomposition: A PhD-Level Survey

*March 2026*

## Abstract

Software decomposition -- the act of dividing a system into modules, services, or components with well-defined interfaces -- is one of the oldest unsolved problems in software engineering. Despite more than five decades of research spanning information theory, graph theory, cognitive science, economics, and organizational sociology, the field lacks a unified formal theory of what constitutes a good boundary. This survey synthesizes the principal intellectual traditions that have attacked this problem: Parnas's information hiding (1972), Conway's organizational mirroring law (1968), Yourdon and Constantine's coupling-cohesion framework (1979), the graph-theoretic community detection tradition (Newman and Girvan, 2004), Evans's Domain-Driven Design (2003), Baldwin and Clark's modularity economics (2000), and the cognitive science of system legibility (Miller, 1956; Skelton and Pais, 2019). We examine the information-theoretic foundations of boundary cost, the empirical evidence on what metrics actually predict maintainability, and the nascent formal approaches from category theory. The survey identifies a recurring core insight across traditions -- that boundaries should hide *decisions likely to change*, not implementation steps -- and traces why this insight, though widely accepted, remains operationally underdetermined in practice. We conclude with an assessment of open problems: the absence of a compositional theory of boundary quality, the tension between structural and semantic decomposition, and the challenge that machine-assisted development poses to all human-cognition-based decomposition heuristics.

---

## 1. Introduction

### 1.1 The Problem

Every non-trivial software system must be divided. The question is not *whether* to decompose but *how*. A decomposition decision is a bet: that the chosen boundary will remain stable across the changes that will actually occur, that the resulting modules will be independently comprehensible to the humans who must maintain them, and that the interface cost of crossing a boundary will be worth the isolation it provides.

These bets fail constantly. God classes accumulate. Services become distributed monoliths. Microservices that were drawn around technical tiers -- not business capabilities -- force every user-facing change to touch six repositories. A refactoring that should be local propagates across the system because the boundary was drawn at the wrong seam.

The central question of this survey is: *what makes a boundary good?* This decomposes into four sub-questions:

1. **Epistemic**: What information is necessary and sufficient to define a good boundary?
2. **Structural**: What properties of a dependency graph predict good partitioning?
3. **Cognitive**: What decompositions are legible and maintainable by human teams?
4. **Economic**: What is the cost of wrong boundaries, and when does no decomposition dominate?

The survey does not claim to answer these questions definitively. The honest state of the field is that each question is partially answered by a different tradition, and no synthesis has yet unified them into a single prescriptive framework. What we can do is map the intellectual terrain, identify where traditions agree and where they conflict, and assess which claims have survived empirical test.

### 1.2 Scope and Organization

The survey is organized as follows. Section 2 covers information-theoretic foundations. Section 3 covers graph-theoretic decomposition. Section 4 covers Parnas's information hiding and its evolution. Section 5 covers Domain-Driven Design as a decomposition strategy. Section 6 covers the cognitive science of decomposition. Section 7 covers the economics of modularity. Section 8 covers microservices decomposition heuristics and their empirical track record. Section 9 covers formal approaches. Section 10 reviews the empirical evidence base. Section 11 presents a synthesis. Section 12 states open problems. Section 13 is the references section.

---

## 2. Information-Theoretic Foundations

### 2.1 Shannon Entropy and Module Interfaces

Claude Shannon's mathematical theory of communication (1948) defines entropy as the expected information content of a message source. For a discrete random variable X with probability distribution p(x):

```
H(X) = - sum_i p(x_i) * log2(p(x_i))   [bits]
```

The connection to software decomposition is not immediately obvious but is deep. Every module interface is a channel: it transmits information about the internal state of one module to consumers outside it. Shannon's channel capacity theorem implies that there is a minimum amount of information that *must* cross any boundary for a given computation to occur. Boundaries that try to hide more information than the computation requires create artificial interfaces that carry high-entropy signals, requiring more bits -- more parameters, more context passing, more coupling -- than the underlying computation demands.

### 2.2 Change Entropy as a Coupling Metric

Hassan and Holt (2003) operationalized this intuition in their "chaos of software development" framework. For a software system consisting of source files f_1, ..., f_n, define the change entropy of a time period as:

```
H = - sum_i p_i * log2(p_i)

where p_i = (changes to f_i) / (total changes in period)
```

High entropy means changes are scattered uniformly across all files -- a sign of poor modularity where no change is truly local. Low entropy (near zero) means nearly all changes concentrate in one file -- a sign of a god class absorbing disproportionate churn. The ideal is intermediate: files that implement the same concern change together on related changes, and unrelated changes remain independent.

Hassan and Holt validated this metric against six large open-source projects (NetBSD, FreeBSD, OpenBSD, KDE, KOffice, Postgres), finding that high change entropy was significantly correlated with defect density in the subsequent period. The metric captures the same intuition as logical coupling: files that change together are coupled regardless of whether there is a static dependency edge between them.

Subsequent work by Hassan (2009) showed that change entropy was a better predictor of code defects than static coupling metrics in industrial systems. A 2025 study in Empirical Software Engineering extended this to information-theoretic detection of unusual change patterns as a proxy for architectural violations.

### 2.3 The Information Cost of a Decomposition

A more formal treatment of boundary information cost follows from the observation that any two-module decomposition of a system requires that some information cross the boundary interface. Define the *interface information* I(M_1; M_2) as the Shannon mutual information between the internal states of M_1 and M_2:

```
I(M_1; M_2) = H(M_1) + H(M_2) - H(M_1, M_2)
```

A decomposition is *information-efficient* if I(M_1; M_2) equals the minimum information theoretically required by the computation the two modules jointly perform. In practice, measuring this directly is intractable, but the concept supports two useful diagnostics:

- **Over-coupling**: When I(M_1; M_2) exceeds the minimum required, the interface is leaking information about internal implementation details. The modules are not truly independent.
- **Under-decomposition**: When the internal entropy H(M_1) is very high (the module does many unrelated things), splitting it into M_1a and M_1b should yield I(M_1a; M_1b) much less than H(M_1).

This framing connects information hiding directly to information theory: Parnas's injunction to hide *design decisions likely to change* is equivalent to minimizing the mutual information between the set of things that might change and the set of things visible across the interface.

---

## 3. Graph-Theoretic Decomposition

### 3.1 The Dependency Graph Model

The most natural representation of a software system's structure is a directed graph G = (V, E) where vertices V are modules (files, classes, packages, services) and edges E represent dependencies (imports, function calls, data flows). Finding a good decomposition is then a graph partitioning problem: find a partition of V into disjoint subsets C_1, ..., C_k such that some quality criterion is optimized.

The classical quality criterion is the coupling-cohesion duality introduced by Yourdon and Constantine (1979), building on Constantine's earlier work from the late 1960s: minimize edges *between* clusters (coupling) and maximize edges *within* clusters (cohesion).

### 3.2 Newman-Girvan Modularity

Newman and Girvan (2004) formalized this intuition as the *modularity* function Q for network community detection:

```
Q = (1/2m) * sum_ij [ A_ij - (k_i * k_j)/(2m) ] * delta(c_i, c_j)

  A_ij         = adjacency matrix entry
  k_i          = degree of node i
  m            = total number of edges
  delta(c_i,cj)= 1 if nodes i and j share a community, else 0
```

Q measures the fraction of edges falling within communities minus the expected fraction under a null model of random edge placement. Q = 0 means the partition is no better than random; Q > 0.3 is conventionally considered a meaningful community structure.

The Girvan-Newman algorithm finds high-Q partitions by iteratively removing edges with highest *betweenness centrality* (the number of shortest paths passing through an edge) and measuring Q after each removal, returning the partition at maximum Q. The algorithm runs in O(m * n^2) time for a graph with m edges and n nodes.

### 3.3 Louvain Algorithm for Large Graphs

The Louvain method (Blondel et al., 2008) scales Newman-Girvan ideas to large systems via two-phase greedy optimization: first, each node is initially its own community and is moved to neighboring communities if doing so increases Q; second, communities are collapsed into single super-nodes and the process repeats, producing a hierarchy of partitions.

Applied to software, the Louvain algorithm can recover known architectural boundaries in well-structured systems (correctly partitioning the Linux kernel function call graph into its major subsystems). In poorly-structured systems with architectural drift, it typically finds a partition that diverges from the intended architecture, exposing the gap between nominal and actual structure.

### 3.4 Limitations of Graph-Based Approaches

Graph-theoretic methods have a fundamental limitation: they capture *structural* coupling but are blind to *semantic* and *conceptual* coupling.

```
Two Dimensions of Coupling

  Structural coupling              Semantic coupling
  (graph-observable)               (requires domain knowledge)
  -----------------------          -----------------------
  Import statements                Same business concept
  Function call edges              Shared ubiquitous language
  Data type references             Common invariants
  Database foreign keys            Co-evolution of behavior

  Measurable automatically         Requires human expertise
  Misses cross-cutting concerns    Resists structural measurement

  [Graph algorithms operate here]  [DDD operates here]
              |                              |
              +----------[GAP]---------------+
                              |
                    No unified theory yet
```

Furthermore, the optimal Q partition of a dependency graph is NP-hard to find exactly. All practical algorithms find local optima, and the modularity landscape has exponentially many near-optimal solutions that may be qualitatively different.

---

## 4. Parnas's Information Hiding

### 4.1 The 1972 Paper and Its Argument

David Parnas's "On the Criteria to Be Used in Decomposing Systems into Modules" (Communications of the ACM, 1972) is the founding document of modern modularity theory. Its contribution was not the idea of modules but the *criterion* by which to draw module boundaries.

Parnas presented two decompositions of the same KWIC (Keyword In Context) index system:

**Decomposition 1 -- Flowchart**: Modules correspond to processing steps: Input, Circular Shift, Alphabetize, Output, Master Control. This mirrors the algorithm's sequential structure.

**Decomposition 2 -- Information Hiding**: Each module hides one design decision:

```
  Module 1: How input data is stored in memory
  Module 2: How circular shifts are represented
  Module 3: How alphabetical ordering is achieved
  Module 4: How output is produced
  Module 5: How master control flow is organized
```

In Decomposition 1, changing the data storage format requires modifying all four processing modules because each directly accesses the data structure. In Decomposition 2, the same change is confined entirely to Module 1.

The key insight, stated precisely by Parnas: *"Every module in the second decomposition is characterized by its knowledge of a design decision which it hides from all others. Its interface or definition was chosen to reveal as little as possible about its inner workings."*

### 4.2 The Module Secret

Parnas extended this in his 1979 paper "Designing Software for Ease of Extension and Contraction" (IEEE Transactions on Software Engineering). Every module has a *secret*: a design decision hidden from all other modules. The criteria for choosing what to hide:

1. Decisions likely to change as the system evolves
2. Decisions that are difficult to make initially and may need revision
3. Implementation details that would create unnecessary coupling if exposed

Parnas and Clements (1986) further elaborated the module interface specification methodology: interfaces should be described as abstract properties specifying what the module guarantees, not how it provides those guarantees. An interface is a contract: enough information to *use* the module, not enough to *re-implement* it.

The Law of Demeter (Holland, 1987; Lieberherr and Holland, 1989) operationalized information hiding at the object level: a method should call only methods on its immediate collaborators, not on the collaborators of collaborators. Each level of indirection leaks information about internal structure. The heuristic "don't talk to strangers" is Parnas's information hiding principle applied to object graphs.

### 4.3 Durability and Limitations

Fifty years of practice have confirmed Parnas's core thesis. The empirical literature consistently finds that high coupling correlates with higher defect density, more difficult change impact analysis, and higher maintenance cost (Chidamber and Kemerer, 1994; Nagappan et al., 2008; Hassan, 2009). The SOLID principles (Martin, 2002) are largely a restatement of Parnas's ideas in object-oriented vocabulary: Single Responsibility maps to "hide one secret per module," Open-Closed is the direct consequence of good information hiding, and Dependency Inversion is the injunction to depend on abstractions rather than implementations.

Three aspects have proven problematic:

**The "likely to change" criterion is underdetermined**. Parnas offers no method for predicting what will change. Architects routinely over-engineer flexibility on stable dimensions and under-engineer it on volatile ones. The criterion is correct in principle but provides little operational guidance.

**Information hiding and performance are in tension**. Parnas acknowledged in the original paper that his Decomposition 2 "will be less efficient in most cases." High-performance systems -- databases, kernels, game engines -- routinely expose internal data structures for cache efficiency, violating interface cleanliness. No principled theory adjudicates this trade-off.

**The theory is a-organizational**. Information hiding treats decomposition as a purely technical problem. Conway's Law (Section 6) establishes that organizational structure is a dominant real-world constraint that Parnas's theory does not address.

---

## 5. Domain-Driven Design as Decomposition Strategy

### 5.1 Core Concepts

Eric Evans's *Domain-Driven Design: Tackling Complexity in the Heart of Software* (2003) introduced a decomposition methodology grounded in business domain semantics. Its three strategic design concepts:

**Ubiquitous Language**: A shared vocabulary that domain experts and developers maintain together, instantiated in code identifiers, module names, and service contracts. The language must be *ubiquitous*: the same terms in conversation, documentation, and code, without translation.

**Bounded Context**: A linguistic and conceptual boundary within which a particular model and its ubiquitous language are consistent. Across contexts, the same term may carry different meanings. Rather than forcing semantic unification, DDD draws boundaries and acknowledges divergence explicitly.

**Subdomain Classification**:

```
  Core domain      -- Differentiating capability; maximum modeling effort
  Supporting domain-- Domain-specific, non-differentiating; build or outsource
  Generic domain   -- Domain-agnostic; purchase off-the-shelf
```

### 5.2 Context Mapping Patterns

Evans's context mapping patterns characterize integration relationships between bounded contexts. The choice of pattern determines how much semantic coupling crosses a boundary:

```
  Cooperation patterns:
    Partnership          -- mutual, synchronized evolution
    Shared Kernel        -- shared subset of domain model

  Customer/Supplier:
    Customer-Supplier    -- upstream/downstream, negotiated interface
    Conformist           -- downstream adopts upstream model as-is
    Anticorruption Layer -- downstream translates, isolating its model

  Published Language:
    Open Host Service    -- upstream provides documented API
    Published Language   -- formal integration protocol

  Isolated:
    Separate Ways        -- no integration; independent evolution
```

The Anti-Corruption Layer (ACL) is Parnas's information hiding applied at service granularity: it translates the upstream model into the downstream bounded context's native semantics, preventing upstream model decisions from leaking into downstream code.

### 5.3 DDD vs. Structural Decomposition

DDD and graph-based decomposition frequently disagree:

**When they agree**: When a business capability is implemented in an architecturally cohesive set of classes with few external dependencies, structural and semantic approaches converge on the same boundary.

**When they disagree**: When a single business concept is scattered across technical layers (all database code in one module, all service logic in another), graph algorithms partition along technical layers while DDD partitions along business capabilities. Evans argued forcefully for vertical slicing aligned with business domains, a position subsequently supported by stream-aligned team research (Skelton and Pais, 2019).

Fowler (2014) clarifies a critical distinction: bounded contexts are not equivalent to microservices. A bounded context is the *linguistic* boundary of a coherent model; one bounded context may be implemented by multiple microservices, or one microservice may span parts of multiple bounded contexts. Vladikk Khononov (2018) argued that the widespread practice of mapping bounded contexts one-to-one to microservices is a category error that produces either overly coarse services or overly fine-grained services. A practical heuristic (Vernon, 2013): a microservice should be no smaller than an aggregate and no larger than a bounded context.

### 5.4 Empirical Evidence for DDD

A 2025 systematic literature review in the Journal of Systems and Software examined 89 studies of DDD-based decomposition and found associations with improved maintainability and architectural clarity, but noted that most studies are observational, DDD adoption is rarely holistic, and the benefit-to-cost ratio is unfavorable for small systems. The most robust indirect support comes from Nagappan, Murphy, and Basili (2008): organizational metrics -- which tend to correlate with domain alignment due to Conway's Law -- were the strongest predictors of defect density in Windows Vista.

---

## 6. The Cognitive Science of Decomposition

### 6.1 Miller's Law and Working Memory

George Miller's 1956 paper "The Magical Number Seven, Plus or Minus Two" established that human working memory has a capacity of approximately 7 +/- 2 *chunks*, where a chunk is the largest meaningful unit that a person recognizes based on their existing knowledge.

Miller distinguished bits of information (raw information content) from chunks (cognitive units): while bits processable per chunk grow with training, the number of simultaneous chunks remains bounded at approximately 7. Subsequent research by Cowan (2001) revised the estimate downward to approximately 4 items as the fundamental capacity of the *focus of attention*.

The implications for software interfaces are direct: a module interface that exposes more than 4-7 independent concepts exceeds working memory budget. A developer cannot hold the full interface plus the context of their task simultaneously. The most usable interfaces expose 3-5 core concepts.

### 6.2 Chunking and the Cognitive Criterion for Module Quality

Miller's chunking concept maps precisely to software abstraction: a well-named abstraction compresses a complex implementation into a single cognitive chunk. This is why naming matters disproportionately: a poorly named abstraction fails to form a stable chunk, forcing the reader to mentally decompose it into sub-chunks on each encounter.

A module is *cognitively well-formed* if a developer can hold its interface and primary behavior as a single chunk. A module that leaks multiple independent secrets, or whose interface requires knowledge of implementation details, forces the developer to hold multiple chunks simultaneously, consuming working memory budget prematurely and increasing error probability.

This supplies a cognitive restatement of Parnas's criterion: hiding one secret per module is not just a structural choice; it is what makes each module a single, stable cognitive chunk.

### 6.3 Conway's Law Formalized

Melvin Conway (1968) stated: *"[O]rganizations which design systems (in the broad sense used here) are constrained to produce designs which are copies of the communication structures of those organizations."*

Conway's argument is functional: for two software components to have compatible interfaces, their authors must communicate to ensure compatibility. Therefore, the dependency graph of software components is isomorphic to the communication graph of the organization that built them.

The empirical validation by Nagappan, Murphy, and Basili (2008) is the most rigorous available. Analyzing Windows Vista, they found:

- Number of organizations contributing to a binary was the single strongest predictor of defect density -- stronger than code complexity, churn, coverage, or pre-release defect counts
- Diffuse ownership predicted higher defect density than concentrated ownership
- After the study, Microsoft reorganized Windows subteams around features, and measured quality improvement followed

This result is striking: *organizational structure is a stronger predictor of software quality than the code itself.* The implication is that decomposition decisions are, at their core, organizational decisions as much as technical ones.

### 6.4 Team Topologies and Cognitive Load as a Design Constraint

Skelton and Pais (2019) elevated Conway's Law from an observation to a design principle. Their claim: effective software architecture requires designing *team structures* first. The architectural boundaries a team can maintain are constrained by its cognitive load capacity.

Four team types correspond to different decomposition strategies:

```
  Stream-aligned team:    Owns full vertical slice for one business capability
                          (maps to DDD bounded context)

  Platform team:          Provides internal services to reduce cognitive load
                          on stream-aligned teams
                          (maps to DDD generic subdomain)

  Enabling team:          Temporary expert team that builds capability in
                          stream-aligned teams, then disbands

  Complicated-subsystem:  Owns technically complex component that would
                          overload a stream-aligned team
                          (maps to DDD supporting subdomain, high complexity)
```

The architectural insight: cognitive load limits team size, and team size limits what a team can effectively own. A module that is technically correct but cognitively overwhelming for its team will produce fuzzy boundaries, degraded interface quality, and increased defects. This means decomposition must match *responsibility scope* to *cognitive capacity* -- a constraint that Parnas's structural theory does not address.

The Inverse Conway Maneuver (Fowler, 2015): to change software architecture, deliberately restructure the team organization first. The code will follow. Empirical support comes from the Nagappan et al. result that architectural quality tracks organizational structure more closely than code metrics.

---

## 7. The Economics of Modularity

### 7.1 Baldwin and Clark's Real Options Theory

Carliss Baldwin and Kim Clark's *Design Rules, Volume 1: The Power of Modularity* (MIT Press, 2000) provides the most rigorous economic analysis of software decomposition. Their central claim: modular design creates *option value* -- it preserves the ability to make different decisions in different modules without incurring the cost of redesigning the whole system.

A modular design consists of *hidden modules* (whose internal design choices do not affect other modules) and *visible modules* (which embody the design rules that hidden-module designers must obey). The option value of a hidden module arises because it can be independently experimented with, improved, or replaced.

The financial analogy is to real options theory: a well-decomposed system is a portfolio of call options. Each hidden module is a call option on future improvement -- the right, but not the obligation, to redesign it when better approaches become available, paying only the local cost of that redesign rather than a system-wide cost. The option value is highest for modules with:

- High uncertainty about the optimal design (high volatility)
- Low redesign cost (low exercise price)
- High expected improvement value

This framework explains why premature decomposition is dangerous: drawing boundaries before you understand what is likely to change assigns option value to the wrong dimensions of variation.

### 7.2 The Cost of Wrong Boundaries

Every module boundary has a cost: design time, interface specification, versioning, testing, runtime overhead. Wrong boundaries add a further cost: changes that should be local cross module boundaries, requiring inter-team coordination. Baldwin and Clark call this *coordination overhead from wrong decomposition*.

Industry data confirms that this cost is large in practice. A 2025 CNCF survey found that 42% of organizations that adopted microservices were consolidating back to larger deployable units, citing debugging complexity, coordination overhead, and network latency. Documented cases show 3x cloud cost increases and 2-3x latency penalties attributable to wrong-boundary microservice architectures.

One January 2026 case study reported that rewriting a microservice-based system as a modular monolith reduced response times from 1.2 seconds to 89ms, AWS costs from $18k/month to $2.4k/month (87% reduction), and deployment time by 86% -- all attributable to eliminating unnecessary network boundaries.

### 7.3 Monolith First

Fowler's "Monolith First" principle (2015) applies real options timing theory to architecture: *"Almost all the successful microservice stories have started with a monolith that got too big and was broken up. Almost all the cases where a system was built as microservices from scratch ended up in serious trouble."*

The argument: a monolith-first approach delays the decomposition decision until you have sufficient information to make it correctly. The cost of decomposing a well-understood monolith is one-time; the cost of wrong service boundaries is recurring. Delay the exercise of the decomposition option until you have better information about where volatility actually lies.

Practical implementation: establish clean internal module boundaries in the monolith to discover the stable seams, then extract services at those seams when and only when independent deployment, independent scaling, or independent team ownership justifies the operational overhead.

### 7.4 When Are Boundaries Economically Justified?

A boundary provides positive expected value when:

1. The probability that changes on one side will affect the other is low (isolation delivers real value)
2. The independent deployment or team ownership benefit exceeds the interface overhead cost
3. The module's internal design is volatile (high option value from independent redesign)
4. Team size supports the coordination overhead of distributed systems

Empirical evidence: microservices benefits emerge only above approximately 25-50 engineers. Below this threshold, coordination overhead from distributed systems exceeds isolation benefit. The modular monolith -- a single deployable unit with enforced internal module boundaries -- provides approximately 90% of microservices' organizational benefits at approximately 10% of the operational cost (CNCF, 2025).

---

## 8. Microservices Decomposition Heuristics

### 8.1 The Principal Heuristics

The microservices decomposition literature (Fowler and Lewis, 2014; Newman, 2015; Richardson, 2018) converged on several heuristics for boundary placement:

**Decompose by business capability** (Richardson, 2018): Services align to business capabilities derived from DDD subdomain classification. One service per capability; capabilities map to what the business *does* rather than how the system is technically organized.

**Decompose by subdomain (DDD)**: Each service corresponds to a DDD subdomain; core subdomains get custom services, generic subdomains use off-the-shelf components.

**Single responsibility at service level**: Each service owns one coherent concept and one data store. Cross-service data access is prohibited; services communicate only through published interfaces.

**Database per service**: Enforces boundary integrity at the data layer. If two services share a database, they share an implementation detail -- a violation of information hiding at service granularity.

### 8.2 Diagnostic Patterns

Two anti-patterns indicate wrong service boundaries:

**Distributed monolith**: Services that must be deployed together because they share a database, call each other synchronously on every user request, or cannot function independently. This is a wrong-boundary decomposition masquerading as microservices.

**Saga proliferation**: If you find yourself frequently implementing Sagas (distributed transactions implemented as sequences of local transactions with compensating actions), the service boundaries are likely cutting across natural transactional units of work, which is a domain cohesion violation.

### 8.3 Empirical Track Record

The empirical evidence on microservices heuristics is cautionary:

- Consistent performance penalty: microservices show 2-3x higher response latency than equivalent monolithic implementations under identical loads (MDPI study, 2019)
- 42% consolidation rate: CNCF 2025 survey found nearly half of microservices adopters rolling back to larger deployable units
- Team size threshold: consistent across multiple studies that microservices produce net productivity losses for teams below 15-25 engineers
- No RCT evidence: there are no randomized controlled trials of microservices decomposition heuristics; all evidence is observational, making causal inference difficult

The key open empirical question: are the quality benefits typically attributed to microservices caused by the decomposition itself, by the improved team autonomy microservices enable, or by the interface discipline that migration forces? Observational studies cannot disentangle these.

---

## 9. Formal Approaches

### 9.1 Category Theory and Software Composition

Bartosz Milewski's *Category Theory for Programmers* (2018, from blog series 2014-2018) provides the most accessible treatment of categorical composition for software practitioners. Category theory is the mathematics of composition: its objects are types, its morphisms are functions, and its laws (associativity, identity) are exactly what makes function composition predictable.

The categorical perspective on module boundaries: a boundary is well-formed if the interface can be characterized as a *functor* -- a structure-preserving map between the internal category of the module and the external category visible to consumers. A functor exposes what the module *does* without revealing *how* it does it: it maps objects (types) to objects and morphisms (functions) to morphisms, preserving the composition structure.

Algebraic data types formalize the compositional structure of data across boundaries: product types (structs, tuples) correspond to categorical products, sum types (enums, discriminated unions) correspond to categorical coproducts. Together they constitute the *algebraic* structure of a module's interface, in the sense that the interface's behavior under composition is fully determined by its categorical type.

The practical limitation is that category theory is most naturally applicable to functional programming where composition is explicit and side effects are controlled via monads. Applying it to imperative or object-oriented systems requires significant encoding effort and loses much mathematical precision.

### 9.2 Interface Theories

De Alfaro and Henzinger's interface theory (2005) provides a formal foundation for specifying and composing module interfaces as state machines. An interface automaton specifies the valid sequences of inputs and outputs a module accepts. Two interface automata are *compatible* if their composed automaton has no deadlock states -- a formal definition of interface correctness.

This framework has been applied to hardware design and concurrent systems. Application to large general-purpose software systems remains research-level; the specification effort required is tractable only when formal verification provides exceptional value (safety-critical systems, cryptographic protocols).

### 9.3 The ML Module System as a Formal Design

The ML family of languages (Standard ML, OCaml) implements a formal module system that is arguably the most rigorous practical instantiation of modular decomposition theory. ML *signatures* are interface specifications; *structures* are implementations; *functors* are parameterized modules that take structures as inputs and produce structures as outputs -- category theory applied directly to language design.

This system enforces: (a) abstraction (signatures hide implementation details), (b) parametericity (functors abstract over implementations), and (c) sealing (concrete implementations are hidden behind abstract signatures). These are exactly Parnas's criteria, made mechanically enforceable by a type checker.

---

## 10. Empirical Evidence

### 10.1 What Metrics Predict Defects?

**Chidamber and Kemerer (1994)**: The CK metrics suite -- WMC, DIT, NOC, CBO (coupling between objects), RFC (response for a class), LCOM (lack of cohesion in methods) -- provided the first systematic empirical foundation for measuring OO design quality. Subsequent meta-analyses identified CBO and RFC as the strongest predictors of fault-proneness.

**Nagappan, Murphy, and Basili (2008)**: Organizational metrics outperform code metrics. Number of distinct organizational units contributing to a binary was the single strongest predictor of defect density in Windows Vista, with higher precision and recall than code complexity, churn, coverage, or pre-release defect counts combined.

**Hassan (2009)**: Change entropy outperforms static coupling metrics as a defect predictor. The scatter of changes across the codebase (how non-local changes are) is a better signal of poor modularity than point-in-time dependency counts.

**Tertiary study (2023, ScienceDirect)**: A comprehensive review of systematic literature reviews confirmed that coupling metrics (CBO, Ca, Ce), cohesion metrics (LCOM), and LOC have consistent evidence for predicting fault-proneness. No single metric dominates across all contexts; relationships are system-dependent.

### 10.2 The Martin Instability-Abstractness Plane

Robert Martin's package metrics (2002) formalize a design rule for component stability:

```
  I = Ce / (Ca + Ce)    [Instability: 0=stable, 1=unstable]
  A = Na / Nc           [Abstractness: 0=concrete, 1=abstract]
  D = |A + I - 1|       [Distance from "main sequence"]
```

Where Ce = efferent coupling (outgoing), Ca = afferent coupling (incoming), Na = abstract classes, Nc = total classes. The Stable Abstractions Principle: stable components (I near 0) should be abstract (A near 1) so they can be depended upon without forcing change propagation. Unstable components (I near 1) should be concrete (A near 0) since they change frequently and should not be depended upon by stable components.

High D values identify architectural violations: components that are either too stable to be concrete (rigid, resistant to necessary change) or too abstract to be unstable (useless abstractions with no dependents).

### 10.3 Change Coupling as the Practical Empirical Proxy

Practical empirical coupling measurement most often uses *change coupling* (logical coupling, co-evolution): two files are change-coupled if they tend to change together in the same commit.

```
change_coupling(A, B) = |commits_touching_both| / |commits_touching_A_or_B|
```

This is the Jaccard similarity of change sets, computable from version control history without static analysis. High change coupling with no structural dependency is an architectural smell: hidden coupling through shared mutable state, implicit conventions, or duplicated business rules.

Adam Tornhill's empirical studies across large open-source codebases (*Your Code as a Crime Scene*, 2015; *Software Design X-Rays*, 2018) consistently found that hotspots (files with high churn and high complexity) were responsible for disproportionate defect introduction, and that change-coupling-bounded boundaries were more fragile than complexity-bounded boundaries.

---

## 11. Synthesis: Toward an Integrated Theory

### 11.1 The Core Insight Across Traditions

Every tradition surveyed converges on a single core insight, expressed in different vocabularies:

| Tradition | Core Claim |
|-----------|-----------|
| Parnas (1972) | Hide one design decision likely to change per module |
| Yourdon-Constantine (1979) | Maximize cohesion within; minimize coupling between |
| Evans (2003) | Align boundaries with stable business concepts and shared language |
| Baldwin-Clark (2000) | Create real options on volatile design choices |
| Skelton-Pais (2019) | Match module responsibility to team cognitive load capacity |
| Conway (1968) | System structure mirrors and should mirror communication structure |
| Information theory | Minimize mutual information across interfaces beyond required minimum |

The unified statement: *A good boundary is one that hides a volatile decision, aligns with the domain semantics that the maintaining team understands, and does not require more inter-boundary communication than the computation demands.*

### 11.2 Why No Unified Formal Theory Exists

**The criteria are not jointly optimizable**. Information-theoretic optimality (minimize interface mutual information) and cognitive optimality (maximize legibility) are in tension. A maximally compressed interface minimizes information leakage but may be opaque to human readers. A maximally legible interface exposes more concepts than strictly necessary.

**The "likely to change" criterion is irreducibly uncertain**. Parnas's primary criterion requires predicting future change, which depends on business dynamics, technology evolution, and organizational change -- none of which are predictable from code structure alone. The real options framework acknowledges this by treating future change as a random variable but provides no method for estimating the distribution.

**The theory is a-temporal**. All existing frameworks treat decomposition as static optimization: find the best partition at time T. Real systems require *dynamic* boundaries that evolve as the domain changes, teams grow, and technology shifts. No framework adequately addresses the cost of *changing* a boundary that was correct when drawn but is now wrong.

**The organizational and technical dimensions are not unified**. Graph-theoretic methods ignore organizational structure entirely. DDD addresses domain semantics but not team structure. Conway's Law and Team Topologies address organizational structure but provide limited structural guidance. The interaction among structural, semantic, and organizational dimensions is not formally understood.

### 11.3 A Practical Multi-Criteria Framework

In the absence of a formal unified theory, the following multi-criteria assessment captures the current state of practice:

```
Boundary Quality Assessment
============================

Structural criteria (necessary but not sufficient):
  [ ] Low change coupling to other modules
  [ ] High internal cohesion (related changes remain local)
  [ ] Clean dependency direction (acyclic, direction of stability)
  [ ] Passes Martin's instability/abstractness test

Semantic criteria (necessary for long-term stability):
  [ ] Corresponds to a stable business concept
  [ ] Has a coherent ubiquitous language within
  [ ] Hides one or few independent design decisions

Organizational criteria (often the dominant constraint):
  [ ] Owned by a single team within cognitive load budget
  [ ] Communication frequency matches boundary crossing frequency
  [ ] Aligns with Conway's Law or has explicit Inverse Conway justification

Economic criteria (governs timing and granularity):
  [ ] Deployment / scaling / ownership benefit exceeds interface overhead
  [ ] Domain understanding is sufficient to draw stable lines
  [ ] Team size justifies the operational overhead of the boundary type
```

No criterion is independently sufficient. Boundaries that satisfy structural but not semantic criteria tend to become rigid when requirements evolve. Boundaries that satisfy semantic but not organizational criteria violate Conway's Law and produce defects through coordination failures. Boundaries that satisfy neither structural nor organizational criteria are wrong on all dimensions.

---

## 12. Open Problems

### 12.1 No Accepted Definition of Boundary Quality

Despite five decades of research, there is no accepted formal definition of boundary quality. The field has many metrics -- coupling, cohesion, modularity Q, change entropy, instability, distance from main sequence -- but no agreement on their relative weights or their applicability conditions. The result is that practitioners optimize for whichever metric they can measure, often structural coupling, which is easily computed but imperfectly correlated with what actually matters.

Progress requires longitudinal empirical studies tracking boundary decisions and their multi-year consequences, which are rare because they require instrumented teams across organizational cycles that are difficult to sustain.

### 12.2 The Semantic Gap

The most fundamental open problem is the gap between structural and semantic decomposition. Graph algorithms find structurally optimal partitions but are blind to domain semantics. DDD provides semantic criteria but no structural algorithm. Bridging this gap -- producing a method that uses both structural signals (dependency graphs, change coupling) and semantic signals (vocabulary, domain model, identifier embeddings) to recommend boundaries -- is an active research area.

Recent work on semantic coupling (Bavota et al., 2017) and code embedding techniques (transformer-based code models) now allow measuring semantic distance between code units at scale. Whether semantic distance combined with structural coupling produces more robust decomposition recommendations than either alone remains an open empirical question.

### 12.3 Dynamic Boundary Management

All existing decomposition frameworks produce static partitions. But good decomposition is a dynamic property: as the domain changes and understanding deepens, boundaries should evolve. The cost of *changing* a boundary is underexplored. The strangler fig pattern addresses incremental extraction from a monolith but there is no general theory of boundary migration -- how to manage the full cycle of drawing, maintaining, and redrawing module boundaries as a system ages across organizational and domain evolution.

### 12.4 AI-Assisted Development and Boundary Stability

An entirely unstudied open problem: how does AI-assisted development affect module boundary stability? Human-written code exhibits the coupling and change patterns that have been studied for decades. AI-generated code may produce structurally different patterns -- potentially higher intra-module cohesion (AI writes complete implementations from context) but potentially also less attention to global dependency structure (AI is context-window-bounded).

More fundamentally, the cognitive science arguments for decomposition -- Miller's Law, Skelton-Pais's cognitive load theory -- are grounded in human cognitive limits. AI assistants have different context windows and different working memory analogs. The decompositions optimal for human comprehension may not be optimal for AI-assisted development. This is a completely open problem as of 2026, with no existing research base.

### 12.5 Multi-Dimensional Coupling Integration

Existing metrics capture single dimensions of coupling: structural (static dependencies), behavioral (change coupling), semantic (identifier similarity). No metric integrates all three simultaneously, and no theory specifies how to weight them. A comprehensive coupling model integrating structural, behavioral, and semantic dimensions and calibrated against long-term maintainability outcomes does not yet exist.

---

## 13. References

Baldwin, C. Y., & Clark, K. B. (2000). *Design Rules, Vol. 1: The Power of Modularity*. MIT Press.

Bavota, G., De Lucia, A., Di Penta, M., Oliveto, R., & Palomba, F. (2013). An empirical study on the developers' perception of software coupling. *ICSE 2013, Proceedings of the 35th International Conference on Software Engineering*.

Bavota, G., Oliveto, R., De Lucia, A., Poshyvanyk, D., & Tortora, G. (2017). An empirical study on the interplay between semantic coupling and co-change of software classes. *Empirical Software Engineering*, 22(3).

Blondel, V. D., Guillaume, J. L., Lambiotte, R., & Lefebvre, E. (2008). Fast unfolding of communities in large networks. *Journal of Statistical Mechanics: Theory and Experiment*, 2008(10), P10008.

Chidamber, S. R., & Kemerer, C. F. (1994). A metrics suite for object oriented design. *IEEE Transactions on Software Engineering*, 20(6), 476-493.

CNCF. (2025). Cloud Native Survey 2025. Cloud Native Computing Foundation.

Conway, M. E. (1968). How do committees invent? *Datamation*, 14(4), 28-31.

Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87-114.

de Alfaro, L., & Henzinger, T. A. (2005). Interface-based design. In *Engineering Theories of Software Intensive Systems*. NATO Science Series.

Evans, E. (2003). *Domain-Driven Design: Tackling Complexity in the Heart of Software*. Addison-Wesley.

Fowler, M. (2014). BoundedContext. martinfowler.com.

Fowler, M. (2015). MonolithFirst. martinfowler.com.

Fowler, M., & Lewis, J. (2014). Microservices. martinfowler.com.

Hassan, A. E., & Holt, R. C. (2003). The chaos of software development. *Proceedings of the International Workshop on Principles of Software Evolution (IWPSE 2003)*.

Hassan, A. E. (2009). Predicting faults using the complexity of code changes. *Proceedings of ICSE 2009, 31st International Conference on Software Engineering*, 78-88.

Holland, I. (1987). Specificity: A general principle of object-oriented design. Technical Report, Northeastern University.

Khononov, V. (2018). Bounded Contexts are NOT Microservices. vladikk.com.

Lieberherr, K., & Holland, I. (1989). Assuring good style for object-oriented programs. *IEEE Software*, 6(5), 38-48.

Martin, R. C. (2002). *Agile Software Development: Principles, Patterns, and Practices*. Prentice Hall.

Milewski, B. (2018). *Category Theory for Programmers*. (Compiled from blog series 2014-2018.)

Miller, G. A. (1956). The magical number seven, plus or minus two: Some limits on our capacity for processing information. *Psychological Review*, 63(2), 81-97.

Mitchell, B. S., & Mancoridis, S. (2006). On the automatic modularization of software systems using the bunch tool. *IEEE Transactions on Software Engineering*, 32(3), 193-208.

Nagappan, N., Murphy, B., & Basili, V. (2008). The influence of organizational structure on software quality: An empirical case study. *Proceedings of ICSE 2008*, 521-530.

Newman, M. E. J., & Girvan, M. (2004). Finding and evaluating community structure in networks. *Physical Review E*, 69, 026113.

Newman, S. (2015). *Building Microservices: Designing Fine-Grained Systems*. O'Reilly Media. Second edition, 2021.

Parnas, D. L. (1972). On the criteria to be used in decomposing systems into modules. *Communications of the ACM*, 15(12), 1053-1058.

Parnas, D. L. (1979). Designing software for ease of extension and contraction. *IEEE Transactions on Software Engineering*, 5(2), 128-138.

Parnas, D. L., & Clements, P. C. (1986). A rational design process: How and why to fake it. *IEEE Transactions on Software Engineering*, 12(2), 251-257.

Richardson, C. (2018). *Microservices Patterns: With Examples in Java*. Manning Publications.

Shannon, C. E. (1948). A mathematical theory of communication. *Bell System Technical Journal*, 27(3), 379-423.

Skelton, M., & Pais, M. (2019). *Team Topologies: Organizing Business and Technology Teams for Fast Flow*. IT Revolution Press.

Tornhill, A. (2015). *Your Code as a Crime Scene*. Pragmatic Bookshelf.

Tornhill, A. (2018). *Software Design X-Rays*. Pragmatic Bookshelf.

Vernon, V. (2013). *Implementing Domain-Driven Design*. Addison-Wesley.

Yourdon, E., & Constantine, L. L. (1979). *Structured Design: Fundamentals of a Discipline of Computer Program and Systems Design*. Prentice Hall.
