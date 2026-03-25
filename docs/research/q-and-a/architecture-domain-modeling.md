# Software Architecture Evaluation & Domain-Driven Design for AI Architects

*2026-03-25*

---

## Abstract

This survey synthesizes six interrelated bodies of knowledge that collectively equip an AI architect agent to build deep domain understanding and make well-informed structural decisions before system decomposition begins. The six areas are: domain modeling via Domain-Driven Design (DDD); Architecture Decision Records (ADRs) as a lightweight rationale-capture mechanism; systematic prior art survey methodology adapted from software engineering research practice; constraint discovery for unearthing non-obvious regulatory, performance, and organizational barriers; formal architecture evaluation methods (ATAM, SAAM, CBAM, and their lightweight successors); and architecture patterns specific to AI-native agent systems. Each area is analyzed for theoretical foundations, empirical evidence, implementations, and known limitations.

The central finding is that effective architectural reasoning before decomposition is not a single skill but a sequence of disciplined epistemic activities: first achieving a shared domain vocabulary, then capturing tradeoffs in lightweight ADRs, then surveying prior solutions systematically, then cataloging constraints that will govern the design space, then formally evaluating candidate architectures against those constraints, and finally selecting from a known palette of patterns adapted to the AI-native context. No single method dominates across all contexts; the evidence consistently favors compositions of lightweight approaches over heavyweight single-method evaluation. For AI-native systems specifically, the traditional patterns (orchestrator-worker, blackboard, pipeline, event-driven) are all applicable but carry new tradeoffs introduced by non-deterministic LLM reasoning cores, emergent agent behavior, and novel failure modes such as prompt injection and context window saturation.

---

## 1. Introduction

### 1.1 The Problem

An AI architect agent begins each task at the moment of maximum ignorance. It must develop a domain model — a working understanding of concepts, invariants, and relationships in the problem space — while simultaneously surveying prior solutions, discovering constraints, and preparing to make irreversible structural commitments. The consequences of premature decomposition are well-documented: microservices drawn around technical tiers rather than business capabilities force every user-facing change to touch multiple repositories; domain terms that mean different things to different stakeholders become quietly encoded into service boundaries; performance and regulatory constraints discovered after implementation require expensive rework.

This survey addresses the question: what bodies of knowledge should an AI architect internalize to perform these pre-decomposition activities with PhD-level rigor? The six subtopics are not independent; they form a logical sequence. Domain modeling establishes what the system is about. ADRs capture why specific structural choices are made. Prior art surveys determine what has already been tried. Constraint discovery bounds the solution space. Architecture evaluation methods test candidate designs against the constraint-and-quality-attribute space. Architecture patterns for AI-native systems populate the candidate design space with proven structures.

### 1.2 Scope and Audience

This survey targets researchers and practitioners designing AI agent systems that perform architectural reasoning — systems in which the architect is itself a language model or agent pipeline. The survey is also relevant to human architects who wish to understand what depth of background knowledge a well-designed architect agent should possess. The survey does not cover implementation-level patterns (database selection, container orchestration, CI/CD) except where they arise as examples within evaluation frameworks.

### 1.3 Organization

Section 2 establishes foundational concepts across all six areas. Section 3 presents a taxonomy of approaches within each area. Section 4 provides detailed analysis of each approach family. Section 5 offers comparative synthesis tables. Section 6 identifies open problems. Section 7 concludes.

---

## 2. Foundations

### 2.1 Domain Modeling and DDD

Eric Evans's "Domain-Driven Design: Tackling Complexity in the Heart of Software" (2003) is the canonical reference for treating the domain model — a rigorous conceptual representation of the business problem — as the primary organizing principle of software systems. Evans's central argument is that the primary failure mode in complex software is not technical but epistemic: developers and domain experts speak different languages, and the resulting translation losses encode misunderstandings directly into code.

DDD introduces a vocabulary organized into tactical and strategic levels. At the tactical level, Entities are domain objects with identity that persists through state changes; Value Objects are immutable domain objects defined entirely by their attributes; Aggregates are clusters of Entities and Value Objects treated as a single unit of consistency, with a designated Aggregate Root as the sole external access point; and Domain Events record facts that happened in the domain. At the strategic level, the Bounded Context defines a linguistic boundary within which all terms and models maintain consistent meaning. The Ubiquitous Language is the shared vocabulary developed jointly between domain experts and developers that permeates code, documentation, and conversations within a Bounded Context. Context Maps describe the integration relationships between Bounded Contexts.

Vaughn Vernon's "Implementing Domain-Driven Design" (2013, "the Red Book") operationalizes Evans's patterns with concrete rules for Aggregate design: model true invariants in consistency boundaries; design small Aggregates; reference other Aggregates by identity only; and use eventual consistency between Aggregates. The invariant-as-boundary principle is the most architecturally significant: a correctly designed Aggregate is one that can be modified in any way required by the business while maintaining all of its invariants in a single transaction. This principle directly constrains system decomposition — Aggregate boundaries become natural microservice or module candidates.

Martin Fowler's canonical overview [martinfowler.com/bliki/DomainDrivenDesign](https://martinfowler.com/bliki/DomainDrivenDesign.html) positions DDD's innovation less in any specific notation than in the insistence that a rich domain model displace purely data-centric or CRUD-oriented approaches.

### 2.2 Architecture Decision Records

Michael Nygard's 2011 blog post "Documenting Architecture Decisions" [cognitect.com/blog/2011/11/15/documenting-architecture-decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) introduced the lightweight ADR format. The problem Nygard addressed is institutional: architectural decisions are made but their rationale is not captured, leaving future maintainers unable to distinguish intentional design from historical accident. Large documentation systems are never maintained. His solution was a short text file per decision, stored version-controlled alongside code.

Nygard's format has five sections: **Title** (short noun phrase, e.g., "ADR 9: Use PostgreSQL for primary storage"); **Status** (Proposed, Accepted, Deprecated, or Superseded); **Context** (value-neutral description of forces at play — technological, political, social); **Decision** (active voice statement of what was decided); **Consequences** (all effects, positive, negative, and neutral). The format is deliberately minimal: "Large documents are never kept up to date. Small, modular documents have at least a chance at being updated." New team members are the primary beneficiaries — they can understand what was decided, and why, without blindly accepting or recklessly reversing decisions.

The broader ADR ecosystem, aggregated at [adr.github.io](https://adr.github.io/), includes several format variants and tooling. The MADR (Markdown Architectural Decision Records) format, currently at version 4.0.0 (released 2024-09-17), extends Nygard's format with structured options analysis. MADR includes: YAML front matter for metadata (status, date, decision-makers, consulted parties); Context and Problem Statement; Decision Drivers; Considered Options; Decision Outcome with justification; Consequences; Confirmation (optional, describing how the decision will be validated); and Pros and Cons of Options in "Good/Bad/Neutral" format. This structured options enumeration makes MADR particularly suited to decisions where multiple viable alternatives exist.

Other format variants include Y-Statements (from Zdun et al.'s "Sustainable Architectural Decisions"), which use a fill-in-the-blank sentence structure; and Alexandrian patterns, which connect decisions to established design patterns. The joelparkerhenderson/architecture-decision-record GitHub repository [github.com/joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record) catalogs examples across formats.

### 2.3 Prior Art Survey Methodology

Systematic Literature Review (SLR) methodology, as formalized for software engineering by Kitchenham, Dybå, and Jørgensen (2004-2007), provides a disciplined template for surveying existing solutions. The core principle is that a literature survey should be as auditable and reproducible as an experiment: search strategies, inclusion/exclusion criteria, quality assessments, and data extraction protocols should be defined before search execution and reported transparently.

The SLR process has two main phases. The **Planning Phase** defines PICOC criteria (Population, Intervention, Comparison, Outcome, Context), formulates specific research questions, selects digital library sources (Scopus, Web of Science, IEEE Xplore, ACM Digital Library), establishes inclusion/exclusion criteria, creates quality assessment checklists, and designs data extraction forms. The **Conducting Phase** builds search strings using PICOC keywords with Boolean operators (OR for synonyms, AND between elements), gathers studies from selected databases, screens for duplicates, applies selection criteria, performs quality assessment with predefined checklists (scored using Likert-type scales), extracts data systematically, and analyzes findings.

Kitchenham's guidelines [researchgate.net/publication/302924724](https://www.researchgate.net/publication/302924724_Guidelines_for_performing_Systematic_Literature_Reviews_in_Software_Engineering) and their refinements (Biolchini et al., Kitchenham and Charters) remain the standard reference. A practical guide for computer science SLRs is available at [pmc.ncbi.nlm.nih.gov/articles/PMC9672331](https://pmc.ncbi.nlm.nih.gov/articles/PMC9672331/).

For engineering practice — distinct from academic research — prior art survey methodology is adapted to include not only academic papers but also: RFC documents (IETF standards track and informational), open-source repositories (GitHub code search, dependency graphs), technical blog posts from practitioners (often ahead of academic publication), conference presentations, and vendor documentation. The engineering adaptation relaxes rigor requirements in exchange for broader coverage and faster execution.

### 2.4 Constraint Discovery

Constraints are the non-negotiable boundaries within which architectural solutions must exist. The BTABoK (Business Technology Architecture Body of Knowledge) from IASA [iasa-global.github.io/btabok/requirements_discovery_and_constraints_analysis.html](https://iasa-global.github.io/btabok/requirements_discovery_and_constraints_analysis.html) distinguishes two primary constraint domains. **Business constraints** include financial resources, time-to-market pressures, organizational structure, external regulatory and legal parameters, and cultural maturity. **Technology constraints** include conflicting quality attributes (the tension between high availability and strong consistency being the canonical example), enterprise standards and frameworks, available technical resources, and solution lifespan considerations.

A key finding from requirements engineering research is that relevant non-functional requirements (NFRs) — a primary class of architectural constraints — are frequently unknown even to stakeholders themselves. A 2024 review [mdpi.com/2073-431X/13/12/308](https://www.mdpi.com/2073-431X/13/12/308) identifies that constraints such as confidentiality, scalability, usability, maintainability, portability, and reliability may not surface without explicit elicitation. Functional requirements drive application architecture; non-functional requirements drive technical architecture. An architect who fails to discover NFRs before decomposition will encode functional structure and discover operational constraints through rework.

### 2.5 Architecture Evaluation Methods

The Software Engineering Institute (SEI) at Carnegie Mellon produced the principal formal architecture evaluation methods. The Software Architecture Analysis Method (SAAM), developed by Kazman, Bass, Abowd, and Webb (1994), was the first scenario-based evaluation method, originally focused on modifiability. The Architecture Tradeoff Analysis Method (ATAM), developed by Kazman, Klein, and Clements [sei.cmu.edu/documents/629/2000_005_001_13706.pdf](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf), generalized SAAM to multiple quality attributes and added explicit tradeoff analysis. The Cost Benefit Analysis Method (CBAM), described by Kazman et al. in "Integrating ATAM with CBAM" [researchgate.net/publication/267307431](https://www.researchgate.net/publication/267307431_Integrating_the_Architecture_Tradeoff_Analysis_Method_ATAM_with_the_Cost_Benefit_Analysis_Method_CBAM), adds economic modeling to convert architectural tradeoffs into financial decisions.

ATAM's nine-step process is the most widely documented in the literature. A comprehensive 2022 review of lightweight architecture evaluation methods [pmc.ncbi.nlm.nih.gov/articles/PMC8838159](https://pmc.ncbi.nlm.nih.gov/articles/PMC8838159/) identifies that full ATAM requires up to six weeks and extensive documentation, making it impractical for resource-constrained or agile organizations, and surveys five lightweight alternatives: Lightweight ATAM (under 6 hours), ARID (Active Reviews for Intermediate Designs), PBAR (Pattern-Based Architecture Reviews), TARA (Tiny Architectural Review Approach), and DCAR (Decision-Centric Architecture Reviews).

### 2.6 Architecture Patterns for AI-Native Systems

The emergence of LLM-based agent systems has created a new class of architectural challenges distinct from those of classical distributed systems. Non-deterministic reasoning cores, context window limitations, prompt injection attack vectors, emergent multi-agent behavior, and token-cost economics all shape the design space. The foundational patterns are extensions of classical patterns (orchestrator-worker from master-slave, blackboard from shared-memory multiprocessing, pipeline from pipes-and-filters, event-driven from message queues), but each carries new tradeoffs in the AI-native context.

The Azure Architecture Center's AI agent design patterns guide [learn.microsoft.com/azure/architecture/ai-ml/guide/ai-agent-design-patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) (updated February 2026) and the arXiv survey "AI Agent Systems: Architectures, Applications, and Evaluation" [arxiv.org/html/2601.01743v1](https://arxiv.org/html/2601.01743v1) provide the most comprehensive 2025-2026 treatments. The survey formalizes agents as `A = (π_θ, M, T, V, E)` where `π_θ` is the transformer-based policy core, `M` is the memory subsystem, `T` is the tool set, `V` is the verifier/critic set, and `E` is the observable environment.

---

## 3. Taxonomy of Approaches

This section organizes each subtopic into an approach taxonomy that structures the detailed analysis in Section 4.

**Table 1. Domain Modeling Approach Taxonomy**

| ID | Approach | Primary Focus | Key Artifacts |
|----|----------|---------------|---------------|
| DM1 | Ubiquitous language collaborative modeling | Shared vocabulary and concepts | Glossaries, event storming boards, narratives |
| DM2 | Strategic subdomain decomposition | Bounded Context boundaries | Subdomain maps, context maps, capability maps |
| DM3 | DSL-based domain modeling | Formal metamodel and generation | CML models, DSLs, transformation rules |
| DM4 | Architecture- and code-informed modeling | Deriving contexts from existing code | Entity access graphs, clustering outputs |

**Table 2. ADR Format Taxonomy**

| ID | Format | Sections | Tooling | Primary Strength |
|----|--------|----------|---------|------------------|
| ADR1 | Nygard (2011) | Title, Status, Context, Decision, Consequences | adr-tools (Nat Pryce), adr (dotnet) | Minimal overhead, universal adoption |
| ADR2 | MADR 4.0.0 (2024) | Full template + YAML front matter, options analysis | markdownlint, VS Code extension | Structured alternatives comparison |
| ADR3 | Y-Statements | Fill-in-the-blank sentence | None standard | Forced brevity, one-liner format |
| ADR4 | Alexandrian | Context, Problem, Forces, Solution, Resulting Context | None standard | Pattern language integration |

**Table 3. Architecture Evaluation Method Taxonomy**

| ID | Method | Phase | Duration | Quality Attributes | Empirical Validation |
|----|--------|-------|----------|--------------------|----------------------|
| AE1 | SAAM | Pre-implementation | 2-3 days | Primarily modifiability | Original SEI case studies |
| AE2 | ATAM | Pre-implementation | 3-6 weeks | Multiple (utility tree) | 6+ validated applications |
| AE3 | CBAM | Post-ATAM | Additional 1-2 days | Economic ROI | Limited case studies |
| AE4 | Lightweight ATAM | Pre-implementation | Under 6 hours | Multiple | 0 published validations |
| AE5 | ARID | Mid-implementation | 1-2 days | Interface design quality | Limited |
| AE6 | DCAR | Any | Variable | Decision-centric | Emerging |

**Table 4. AI-Native Architecture Pattern Taxonomy**

| ID | Pattern | Coordination | Determinism | Primary Use Case |
|----|---------|--------------|-------------|-----------------|
| AP1 | Sequential / Pipeline | Linear handoff | High | Step-by-step refinement workflows |
| AP2 | Concurrent / Fan-out | Parallel, aggregated | Medium | Independent specializations, ensemble reasoning |
| AP3 | Orchestrator-Worker | Centralized control | Medium-High | Complex task decomposition with oversight |
| AP4 | Blackboard | Shared state, self-volunteering | Low | Ill-defined problems, emergent solutions |
| AP5 | Group Chat / Roundtable | Multi-party conversation | Low | Collaborative deliberation, maker-checker |
| AP6 | Handoff / Routing | Dynamic delegation | Variable | Context-dependent specialization |
| AP7 | Plan-then-Execute | Separated planning/execution | High | Security-sensitive, resilient, auditable |
| AP8 | Event-Sourced | Immutable event log | High | Reproducible, fault-tolerant, auditable |

---

## 4. Analysis

### 4.1 Domain Modeling

#### 4.1.1 Ubiquitous Language Collaborative Modeling (DM1)

**Theory and mechanism.** Ubiquitous language modeling treats domain model construction as an ongoing conversation in which domain experts and developers jointly curate shared terminology. The linguistic choices propagate into code (class names, method names, module boundaries) and specifications, collapsing the translation distance between problem and solution. Techniques such as Event Storming (Brandolini, 2013) externalize this conversation onto a shared modeling surface, surfacing domain events, commands, aggregates, and bounded contexts collaboratively. The core mechanism is not notation but discipline: every communication channel — meetings, tickets, code — uses the same vocabulary.

The connection to AI-assisted development is direct. As Daniel Schleicher argues [danielschleicher.com/...](https://www.danielschleicher.com/software/engineering,/ai,/spec-driven/development/2026/01/04/removing-ambiguity-with-spec-driven-development.html), when a ubiquitous language is established in a `domain-terms.md` file as a living glossary, AI coding agents can operate from the same semantic foundation as human developers. The AI agent "implementing the checkout flow knows exactly what data structure to create, what lifecycle states are valid, and which operations belong to this concept versus others." Ambiguity in domain terms is one of the most common causes of poor LLM output; ubiquitous language serves as the domain-level equivalent of a prompt engineering constraint.

**Literature evidence.** Evans's original text provides qualitative case narratives associating ubiquitous language introduction with clearer requirements discussions and more stable domain models over time, though these remain anecdotal. Fowler's retrospective commentary reinforces the central role of ubiquitous language in DDD without quantitative evidence. A 2025 systematic literature review (archived at [sciencedirect.com/science/article/pii/S0164121225002055](https://www.sciencedirect.com/science/article/pii/S0164121225002055)) synthesizing 36 peer-reviewed DDD studies found that communication improvements and increased shared understanding are frequently reported benefits, but studies rarely isolate ubiquitous language from other DDD elements when assessing effectiveness. A 2023 SLR [arxiv.org/pdf/2310.01905.pdf](https://arxiv.org/pdf/2310.01905.pdf) confirms that DDD has "effectively improved software systems" but calls for more empirical evaluations and notes challenges in onboarding and expertise requirements.

**Implementations.** In practice, ubiquitous language is instantiated through workshops, glossaries, naming conventions in code, and rejection of generic technical labels. The Context Mapper DSL [context-mapper.org](https://context-mapper.org) provides an optional formal notation. Event Storming workshops are the most widely adopted elicitation technique.

**Strengths and limitations.** The approach has low tooling overhead, is adaptable across domains, and directly attacks communication failures that underlie many software project failures. It depends heavily on sustained collaboration and stable key personnel; when experts or lead developers leave, tacit understanding embedded in the language erodes. Large organizations may experience dialect drift across teams, quietly weakening the shared understanding guarantee.

#### 4.1.2 Strategic Subdomain Decomposition (DM2)

**Theory and mechanism.** Strategic subdomain decomposition partitions the domain into subdomains classified as Core (source of competitive differentiation, warranting the highest modeling investment), Supporting (domain-specific but not differentiating, often custom-built), and Generic (common across organizations, often handled by off-the-shelf solutions). Bounded Contexts are then defined as explicit linguistic and conceptual boundaries, each with its own consistent ubiquitous language. Context Maps document relationships between Bounded Contexts using integration patterns: Shared Kernel (two contexts sharing a subset of the domain model), Customer-Supplier (upstream-downstream dependency with explicit negotiation), Conformist (downstream conforms completely to upstream), Anti-Corruption Layer (translation layer protecting the downstream model), Published Language (a formal shared schema), and Separate Ways (no integration).

This classification directly guides architectural investment. The Core Domain receives rich modeling and custom development. Generic subdomains use commodity components. Supporting subdomains may warrant custom development but with lighter modeling.

**Literature evidence.** Educational sources ([vaadin.com/blog/ddd-part-1-strategic-domain-driven-design](https://vaadin.com/blog/ddd-part-1-strategic-domain-driven-design), [geeksforgeeks.org/system-design/domain-driven-design-ddd](https://www.geeksforgeeks.org/system-design/domain-driven-design-ddd/)) and the SAP curated DDD resources [github.com/SAP/curated-resources-for-domain-driven-design](https://github.com/SAP/curated-resources-for-domain-driven-design/blob/main/blog/0002-core-concepts.md) converge on Bounded Context as the central strategic DDD pattern. SLRs document strategic DDD as a primary motivator for microservice adoption, with organizations viewing bounded contexts as tools for managing architectural complexity. Quantitative effect sizes are largely absent.

**Implementations.** The Context Mapper DSL (CML) provides a structured notation for bounded contexts, context maps, and their relationships. Tools can generate diagrams and integration contracts from CML models. SAP and other large organizations have published case reports of applying strategic decomposition to monolith-to-microservice migrations.

**Strengths and limitations.** Well suited to large systems and organizations where semantic sprawl is a major risk. Provides a bridge between business strategy and technical design. Determining correct bounded context boundaries is non-trivial; misaligned boundaries can entrench suboptimal structures. Integration overhead between many contexts can exceed the benefits of isolation.

#### 4.1.3 DSL-Based Domain Modeling (DM3)

**Theory and mechanism.** Domain-Specific Languages (DSLs) and Domain-Specific Modeling Languages (DSMLs) treat the domain model as a first-class formal language from which other artifacts — documentation, test cases, code skeletons, integration contracts — can be generated or checked. The mechanism is that formalizing domain knowledge in a language enables consistency checks, impact analysis, and generative propagation of changes, keeping specifications and implementations synchronized.

**Literature evidence.** Research on DSLs predates DDD. Kosar et al. argue for domain-specific transformation languages over generic ones. Empirical DSL studies [arxiv.org/pdf/1409.2309.pdf](https://arxiv.org/pdf/1409.2309.pdf) report that well-designed DSLs reduce modification effort and improve communication with domain experts, but benefits depend heavily on language quality and tool support. The Drasil system provides a generative example for well-understood domains.

**Implementations.** Context Mapper (CML) is the principal DDD-oriented DSL, generating diagrams, context maps, service contracts, and PlantUML output from strategic DDD models. It supports refactoring operations across context maps.

**Strengths and limitations.** High formality enables automation and consistency enforcement. Designing a high-quality DSL is expensive; poorly designed languages are harder to use than general-purpose notations. Effective primarily in stable domains; volatile domains incur high language evolution costs.

#### 4.1.4 Architecture- and Code-Informed Domain Modeling (DM4)

**Theory and mechanism.** This approach begins from an existing codebase and uses code-level analysis — entity access patterns, dependency graphs, database schemas, runtime traces — to propose candidate bounded contexts, which are then refined by domain experts. It treats existing code as a rich but noisy source of domain knowledge. Recent work [arxiv.org/html/2407.02512v1](https://arxiv.org/html/2407.02512v1) introduces a modeling tool that integrates automated clustering of entity accesses with DDD modeling constructs.

**Literature evidence.** Systematic literature reviews on DDD adoption report that many industrial DDD stories occur in brownfield contexts where existing systems are incrementally refactored, suggesting architecture-informed modeling is a common pathway. Empirical studies on software architecture explanations [arxiv.org/html/2503.08628v1](https://arxiv.org/html/2503.08628v1) emphasize connecting architectural views with problem domain concerns.

**Strengths and limitations.** Attractive for large monoliths, where domain knowledge already resides in code. Surfaces hidden couplings and implicit domain partitions. Inherits idiosyncrasies and historical accidents of the codebase; automated clustering can reflect technical rather than domain boundaries, requiring significant human judgment to interpret. The empirical evidence base consists mainly of feasibility demonstrations.

---

### 4.2 Architecture Decision Records

#### 4.2.1 Nygard Format (ADR1)

The original format's five-section structure (Title, Status, Context, Decision, Consequences) is intentionally minimal. Status transitions — Proposed to Accepted, then potentially Deprecated or Superseded with a reference to the replacement — provide a lifecycle trail. The constraint that Consequences lists positive, negative, and neutral effects forces acknowledgment of tradeoffs rather than advocacy. The format's primary limitation is its weak structure for options analysis: when multiple viable alternatives exist, the "Decision" section must carry the comparison burden, which it is not designed for.

Nygard's key insight — that ADRs should be stored version-controlled alongside code — means that the evolution of architectural decisions is tracked in the same system as the code they govern. Git blame and history on ADR files reveal the timeline of architectural evolution.

#### 4.2.2 MADR Format (ADR2)

MADR 4.0.0, released September 2024, adds structured options analysis that Nygard's format lacks. The "Considered Options" and "Pros and Cons of the Options" sections formalize the comparison discipline, using "Good/Bad/Neutral" labels for each consideration. The YAML front matter supports metadata (decision-makers, consulted parties, informed parties) that enables organizational process integration. The "Confirmation" section — optional but recommended — describes how the decision will be validated in implementation, creating a lightweight verification link.

The limitation of MADR is its weight relative to Nygard's format: more sections mean more work, and the discipline of maintaining structured option analysis can erode under time pressure. No tooling currently supports MADR 3.0.0 or later; the recommended tooling is only markdownlint for formatting consistency.

#### 4.2.3 ADR Process Considerations

Beyond format, the process of ADR creation matters. The arc42 documentation system [docs.arc42.org](https://docs.arc42.org/examples/decision-use-adrs/) demonstrates using an ADR to document the decision to adopt ADRs itself, illustrating the self-referential power of the format. The OpenPractice Library [openpracticelibrary.com/practice/architectural-decision-records-adr](https://openpracticelibrary.com/practice/architectural-decision-records-adr/) documents ADR creation as a collaborative workshop activity rather than a solitary writing task.

Industry adoption has grown: the Azure Well-Architected Framework features ADRs as of October 2024, and the Simpler.Grants.gov public wiki documents their process for adopting MADR as infrastructure ADRs, indicating government adoption.

---

### 4.3 Prior Art Survey Methodology

#### 4.3.1 Systematic Literature Review (SLR) Adapted for Engineering

The Kitchenham SLR process, as adapted for engineering practice, yields a seven-step methodology:

1. **Define research questions**: Precise, answerable questions such as "What distributed consensus algorithms have been empirically benchmarked for write-heavy workloads under network partitions?"
2. **Identify source corpora**: Academic databases (Scopus, IEEE Xplore, ACM DL) plus practitioner sources (IETF RFCs, GitHub repositories, major conference blog posts, vendor documentation)
3. **Construct search strings**: PICOC-based Boolean queries with synonyms (OR) and element conjunction (AND); e.g., `("event sourcing" OR "event store") AND ("consistency" OR "ordering") AND ("distributed" OR "microservice")`
4. **Apply inclusion/exclusion criteria**: Title/abstract screening, then full-text review; criteria defined before search execution
5. **Quality assess**: Score studies on empirical rigor, implementation evidence, and applicability
6. **Extract data**: Structured extraction across consistent dimensions (approach name, mechanism, evidence type, implementations, measured outcomes, known limitations)
7. **Synthesize**: Cross-study comparison tables, identification of consensus findings, identification of contradictions and gaps

The engineering adaptation adds two important corpora absent from academic SLRs: (a) IETF RFCs and W3C standards, which often describe deployed protocols with field experience, and (b) GitHub repositories with high adoption (stars, forks, downstream dependents) that provide empirical evidence of real-world use without formal publication.

**Known SLR limitations in SE.** A systematic review of SE SLRs [sciencedirect.com/science/article/abs/pii/S0950584913001560](https://www.sciencedirect.com/science/article/abs/pii/S0950584913001560) documents several recurring problems: publication bias toward positive results, inconsistent terminology across studies, heterogeneous outcome measures that resist aggregation, and difficulty distinguishing system effects from context effects. These limitations affect SLR conclusions and should be reported explicitly alongside findings.

#### 4.3.2 Fast Prior Art Survey for Engineering Decisions

For time-sensitive architectural decisions, a compressed survey process is practical:

1. **Define the decision**: State the specific question with acceptance criteria (e.g., "What message queue systems support exactly-once delivery with persistent consumer groups?")
2. **Fast search**: 2-4 targeted web searches combining the technical requirement with "comparison" or "benchmark" or "production experience"
3. **Primary source validation**: Fetch the documentation or paper for the top 3-5 candidates directly; avoid relying solely on secondary summaries
4. **Practitioner triangulation**: Check Hacker News, Lobsters, or relevant community forums for practitioner experience that may contradict official documentation
5. **Document with provenance**: Record what was searched, what was found, and when — this becomes the "Context" section of the ADR

The key disciplinary constraint: resist the selection of familiar tools. Prior art survey is only useful if it can surface unfamiliar but superior options. This requires explicitly searching for "alternatives to [familiar tool]" and reading the first two pages of results.

---

### 4.4 Constraint Discovery

#### 4.4.1 Constraint Taxonomy

Architectural constraints partition into five categories, each requiring different elicitation strategies:

**Regulatory and compliance constraints** are externally mandated boundaries — GDPR data residency requirements, HIPAA audit trail mandates, SOC 2 access control requirements, PCI-DSS cryptography standards. These are typically documented in legal or compliance team materials and require explicit architectural representation (often as cross-cutting concerns). They are non-negotiable and typically the highest-priority constraints because violations carry legal liability.

**Performance constraints** specify non-negotiable operating envelope requirements — maximum acceptable latency at a specified percentile under a specified load, minimum throughput, maximum resource utilization. These constrain technology choices (database selection, caching architecture, synchronous vs. asynchronous communication) before implementation begins. Discovering performance constraints post-implementation typically requires expensive architectural rework.

**Organizational and Conway's Law constraints** arise from the organization's team structure, communication patterns, and decision-making authority. Conway's Law (1968) observes that systems tend to mirror the communication structures of the organizations that produce them; this is not merely an observation but an architectural force. Melvin Conway's original paper remains the primary reference. Team Topologies (Skelton and Pais, 2019) provides the most operationally useful treatment: four fundamental team types (stream-aligned, enabling, complicated-subsystem, platform) and three interaction modes (collaboration, X-as-a-service, facilitating) determine which service boundaries will be maintainable in practice, independent of technical considerations.

**Operational constraints** include deployment environment restrictions (on-premises vs. cloud, specific cloud provider mandates, air-gapped network requirements), operational maturity (what monitoring, alerting, and runbook infrastructure already exists), and disaster recovery requirements (RTO, RPO).

**Technical constraints** include existing technology standards (mandated language or framework choices, approved dependency lists), API compatibility requirements (backward compatibility with existing consumers), and database technology mandates from enterprise architecture teams.

#### 4.4.2 Constraint Elicitation Methods

The BTABoK framework recommends **collaborative workshops** that engage all relevant stakeholders — including internal teams, development teams, and external parties — to identify business drivers, technical constraints, and architecturally significant requirements together. The explicit involvement of non-technical stakeholders (legal, operations, compliance) is necessary because regulatory and operational constraints are rarely surfaced by technical stakeholders alone.

**Structured interviewing** complements workshops: individual interviews with stakeholders across functional roles surface constraints that participants may not raise in group settings (political constraints, resource constraints, unstated assumptions). The SMART NFR framework (Specific, Measurable, Achievable, Relevant, Time-bound) applied to non-functional requirements ensures that discovered constraints are operationalizable rather than vague aspirations ("the system should be fast" vs. "the 99th-percentile response time for order submission must be under 500ms at 10,000 concurrent users").

**Constraint cataloging** produces a living document mapping each constraint to its source (regulatory document, performance requirement, team structure), its impact on the architecture (which decisions it forecloses), and its current status (confirmed, assumed, to-be-validated). This catalog becomes an input to the architecture evaluation phase: ATAM utility trees and scenario analysis can be focused on the highest-priority constraints.

---

### 4.5 Architecture Evaluation Methods

#### 4.5.1 SAAM (AE1)

SAAM (Software Architecture Analysis Method), developed at SEI by Kazman, Bass, Abowd, and Webb (1994), was the first scenario-based architecture evaluation method. Its primary quality attribute is modifiability, though it was later extended to portability and extensibility. The SAAM process: decompose the architecture, define mission and quality attributes, develop scenarios, classify scenarios as direct (supported without modification) or indirect (requiring architectural change), evaluate indirect scenarios against the architecture, and produce a prioritized list of architectural weaknesses.

SAAM's central contribution was demonstrating that scenarios — concrete descriptions of anticipated system usage or change — are a more productive evaluation vehicle than abstract quality attribute specifications. A scenario like "add support for a new payment provider" is more useful for modifiability evaluation than the abstract requirement "the system should be modifiable."

**Limitation.** SAAM analyzes one quality attribute (or a small set) sequentially; it does not capture tradeoffs between quality attributes. This gap motivated ATAM.

#### 4.5.2 ATAM (AE2)

ATAM (Architecture Tradeoff Analysis Method), developed by Kazman, Klein, and Clements at SEI [sei.cmu.edu/library/atam-method-for-architecture-evaluation](https://www.sei.cmu.edu/library/atam-method-for-architecture-evaluation/), generalizes SAAM to multiple quality attributes and adds explicit tradeoff analysis. A standard ATAM evaluation takes three to four days and gathers an evaluation team, architects, and stakeholder representatives.

The nine-step ATAM process:

1. **Present ATAM**: Describe the method to all participants
2. **Present business drivers**: Describe system business goals, constraints, and context
3. **Present architecture**: Walk through current architectural documentation
4. **Identify architectural approaches**: Catalog patterns and tactics in the architecture (e.g., "load balancing for availability," "caching for performance")
5. **Generate quality attribute utility tree**: Decompose "utility" (overall system goodness) into quality attributes (performance, availability, security, modifiability, usability), then into attribute refinements (performance → throughput, latency), then into scenarios with priority and risk ratings
6. **Analyze architectural approaches against scenarios**: For each high-priority scenario, trace through the architecture to determine how it satisfies or fails the scenario
7. **Brainstorm and prioritize scenarios** (with broader stakeholder group): Elicit additional scenarios beyond those in the utility tree; use dot voting to prioritize
8. **Analyze architectural approaches against prioritized scenarios**: Run the high-priority stakeholder scenarios through the same analysis
9. **Present results**: Compile findings into risks, non-risks, sensitivity points, and tradeoff points

The four key ATAM outputs are:
- **Sensitivity points**: Architectural decisions whose exact configuration significantly affects the achievement of a quality attribute (e.g., "the replication factor of the message queue affects throughput and durability")
- **Tradeoff points**: Sensitivity points that affect multiple quality attributes in opposing directions (e.g., "synchronous replication increases durability but increases write latency")
- **Risks**: Architectural decisions that may create problems for achieving quality attribute goals
- **Non-risks**: Architectural decisions that appear safe after analysis

The utility tree is the central ATAM artifact for organizing this analysis. Quality attributes are refined into specific, measurable scenarios with (H/M/L) importance ratings and (H/M/L) risk ratings. High importance + high risk scenarios define the evaluation priority queue.

**Limitations.** Full ATAM requires "up to six weeks" and extensive documentation. It presupposes a documented architecture, limiting applicability to pre-implementation phases where a candidate architecture exists. The PMC review [pmc.ncbi.nlm.nih.gov/articles/PMC8838159](https://pmc.ncbi.nlm.nih.gov/articles/PMC8838159/) found that ATAM has limited applicability in agile contexts and that practitioners report informal, experience-based approaches dominating industrial practice despite academic preference for formal methods.

#### 4.5.3 CBAM (AE3)

CBAM extends ATAM by adding economic models. After identifying sensitivity and tradeoff points, CBAM quantifies the expected utility improvement of each architectural decision and its estimated implementation cost. The result is a prioritized investment list: architectural investments sorted by return-on-investment. CBAM is particularly valuable when architectural choices involve significant cost tradeoffs (e.g., "adding a CDN layer adds 40% infrastructure cost but reduces 95th-percentile response time by 60%") that cannot be resolved by quality attribute analysis alone.

**Limitation.** Utility quantification is subjective and context-dependent. The economic models add a layer of analytical complexity that may not be justified for all decisions.

#### 4.5.4 Lightweight Alternatives (AE4-AE6)

The 2022 comprehensive review surveyed 27 architecture evaluation methods and identified five lightweight alternatives that trade rigor for speed.

**Lightweight ATAM (AE4)** reduces the full nine-step ATAM to a single session under six hours by eliminating the brainstorming and utility tree prioritization steps. It retains the scenario-based analysis and the sensitivity/tradeoff point identification but at lower analytical depth. No published empirical validations exist as of the survey date.

**ARID (Active Reviews for Intermediate Designs, AE5)** focuses on intermediate design artifacts — partial architectures, module interfaces — rather than complete architectures. The nine-step process identifies issues in interface designs and partial specifications before implementation. This makes ARID the most applicable method during active development.

**DCAR (Decision-Centric Architecture Reviews, AE6)** analyzes architectural decisions systematically rather than quality attributes. This aligns naturally with the ADR practice: architectural decisions documented as ADRs become the primary input to a DCAR evaluation. The method examines whether decisions are consistent with each other, whether they collectively achieve stated quality goals, and whether any decision conflicts with identified constraints.

---

### 4.6 Architecture Patterns for AI-Native Systems

#### 4.6.1 Sequential / Pipeline (AP1)

Also known as pipeline, prompt chaining, and linear delegation, the sequential pattern chains AI agents in a predefined, linear order. Each agent processes the output from the previous agent, creating a pipeline of specialized transformations. The pattern resembles the classic Pipes-and-Filters cloud design pattern but with AI agents as filters.

**When applicable.** Multi-stage processes with clear linear dependencies, data transformation pipelines, progressive refinement workflows (draft → review → polish), and systems where the availability and performance of every stage is well-understood.

**Avoid when.** Stages are parallelizable; early stages can fail and produce low-quality output that propagates; agents need to collaborate rather than hand off; the workflow requires backtracking; dynamic routing based on intermediate results is needed.

**AI-native considerations.** The key advantage is auditability: input/output contracts at each stage are clear and independently measurable. The key risk is error accumulation: non-deterministic LLM outputs at stage N become inputs to stage N+1, and errors compound without feedback. Iteration caps and fallback behaviors at each stage are architectural requirements.

#### 4.6.2 Concurrent / Fan-Out (AP2)

Also known as parallel, scatter-gather, and map-reduce, the concurrent pattern runs multiple AI agents simultaneously on the same task, each providing independent analysis from a distinct perspective or specialization. An initiator/collector agent aggregates results.

**When applicable.** Tasks that can be parallelized; tasks that benefit from multiple independent perspectives (brainstorming, ensemble reasoning, quorum voting); time-sensitive scenarios where parallel processing reduces latency.

**Avoid when.** Agents need to build on each other's work; resource constraints (model quota) make parallelism inefficient; there is no clear conflict resolution strategy for contradictory results.

**AI-native considerations.** Result aggregation strategies must be chosen with care: voting/majority-rule for classification, weighted merging for scored recommendations, LLM-synthesized summary when results require narrative reconciliation. The aggregation step itself introduces a non-deterministic LLM call that can fail or introduce bias.

#### 4.6.3 Orchestrator-Worker (AP3)

The orchestrator-worker pattern uses a central orchestrator agent that maintains global oversight, decomposes complex tasks into manageable subtasks, distributes them to specialized worker agents, monitors progress, and synthesizes partial results. The orchestrator serves as the system's strategic decision-maker.

**When applicable.** Cross-functional or cross-domain problems; scenarios requiring distinct security boundaries per agent; tasks that benefit from parallel specialization with oversight.

**Avoid when.** A single agent with tools can reliably handle the task; coordination overhead outweighs the specialization benefit.

**AI-native considerations.** The orchestrator's reliability is the primary architectural risk: if the orchestrator LLM call fails or produces an incorrect decomposition, all downstream work is wasted or incorrect. Orchestrators require robust error handling, retry logic, and explicit fallback strategies. The "master-slave multi-agent systems rely on a rigid central controller that requires precise knowledge of each sub-agent's capabilities" limitation [arxiv.org/pdf/2510.01285](https://arxiv.org/pdf/2510.01285) means orchestrator designs require explicit capability registration or discovery mechanisms.

#### 4.6.4 Blackboard (AP4)

The blackboard pattern provides a shared information space (the blackboard) where specialized agents (knowledge sources) post partial solutions and read others' contributions. A control unit determines which agent should act next based on current blackboard content. No predefined workflow exists: agents self-volunteer based on their capability and the current problem state.

The classical blackboard architecture (from AI problem-solving research, Erman et al. 1980, HEARSAY-II speech understanding system) is being revived for LLM multi-agent systems. The arXiv paper "LLM Multi-Agent Blackboard System for Data Discovery" [arxiv.org/pdf/2510.01285](https://arxiv.org/pdf/2510.01285) demonstrates 13-57% relative improvement over orchestrator-worker baselines on data discovery tasks by removing the rigid central controller requirement. The LbMAS paper [arxiv.org/html/2507.01701v1](https://arxiv.org/html/2507.01701v1) reports the highest average performance (81.68%) across six benchmarks with fewer tokens than competing autonomous systems.

**When applicable.** Ill-defined problems where solution paths are unpredictable; problems requiring emergent collaboration (medical diagnosis, scientific discovery, complex multi-domain analysis); large-scale systems where a central controller cannot have complete knowledge of all sub-agent capabilities.

**Avoid when.** Problems have clear, predictable solution structures (use pipeline instead); auditability and reproducibility are primary requirements (blackboard produces emergent, hard-to-trace reasoning chains).

**AI-native considerations.** The blackboard pattern introduces the strongest emergent behavior risks: because agent activation is determined dynamically, the system's behavior can be difficult to predict or reproduce. The LbMAS architecture addresses this with a structured blackboard divided into public (shared) and private (agent-internal) areas, and a formal control unit making activation decisions. The pattern requires explicit termination conditions (consensus detection or maximum rounds) to prevent infinite deliberation loops.

#### 4.6.5 Group Chat / Roundtable (AP5)

Also known as roundtable, collaborative, multi-agent debate, and council, the group chat pattern enables multiple agents to solve problems, make decisions, or validate work by participating in a shared conversation thread. A chat manager coordinates flow, determining which agents respond next.

The maker-checker loop is a specific specialization: one agent (the maker) creates or proposes content; another agent (the checker) evaluates it against defined criteria. If the checker identifies gaps, it pushes the conversation back to the maker with specific feedback. This cycle repeats until the checker approves or an iteration cap is reached. Also known as evaluator-optimizer, generator-verifier, critic loop, and reflection loop.

**When applicable.** Collaborative brainstorming; decision-making that benefits from debate and consensus; quality assurance with structured review; human-in-the-loop scenarios where transparency and auditability are primary requirements.

**Avoid when.** Basic task delegation or linear processing is sufficient; real-time processing requirements make discussion overhead unacceptable; the chat manager has no objective way to determine task completion.

**AI-native considerations.** The accumulating chat thread that all agents and humans emit output into provides transparency and auditability that other patterns lack. The primary risk is infinite loops; limiting group chat to three or fewer agents, setting iteration caps, and defining explicit termination criteria are architectural requirements.

#### 4.6.6 Handoff / Routing (AP6)

The handoff pattern enables dynamic delegation of tasks between specialized agents. Each agent assesses the task and decides whether to handle it directly or transfer to a more appropriate agent. Also known as routing, triage, transfer, dispatch, and delegation.

**When applicable.** The optimal agent for a task is not known upfront or becomes clear only during processing; intelligent delegation ensures tasks reach the most capable agent.

**AI-native considerations.** Unlike concurrent orchestration, full control transfers from one agent to another agent in the handoff pattern — agents do not typically work in parallel. This makes the pattern well-suited to multi-domain customer service and triage workflows. The primary architectural risk is routing loops; explicit termination conditions and fallback human escalation paths are required.

#### 4.6.7 Plan-then-Execute (AP7)

The Plan-then-Execute pattern explicitly separates strategic planning from tactical execution through two distinct agent components. The Planner proposes a plan with explicit constraints and success criteria; the Executor carries out the plan under stricter tool permissions and validation. Architecting Resilient LLM Agents [arxiv.org/pdf/2509.08646](https://arxiv.org/pdf/2509.08646) argues this separation "provides predictability, cost-efficiency, and reasoning quality advantages over reactive alternatives like ReAct."

The primary security motivation is control-flow integrity against indirect prompt injection attacks: if external content can only influence the Executor phase (not the Planner), the attack surface for adversarial inputs in tool outputs is reduced. The Planner produces a plan that the Executor treats as authoritative, preventing environmental content from hijacking the overall strategy.

**Defense-in-depth principles** for P-t-E: Principle of Least Privilege (task-scoped tool access restrictions); sandboxed code execution; Human-in-the-Loop verification at plan approval boundaries. Frameworks: LangGraph (stateful graphs enabling re-planning), CrewAI (declarative tool scoping), AutoGen (built-in Docker sandboxing).

#### 4.6.8 Event-Sourced Agents (AP8)

Immutable event log architectures, adapted from event sourcing in traditional distributed systems, treat agent state as a sequence of immutable events. The OpenHands SDK's architecture demonstrates this pattern: "strict separation between core agent logic and applications is essential for maintainability; event-sourced state enables reproducibility and fault recovery; immutable component design prevents configuration drift." The event system uses a hierarchy with Event (immutable structure with ID, timestamp, source), LLMConvertibleEvent (adds to-LLM-message conversion), and ActionEvent/ObservationEvent action-observation loop pairs.

**When applicable.** Reproducibility is a primary requirement; fault recovery and resumability are needed; compliance and auditability of agent reasoning are required.

**AI-native considerations.** Event sourcing is particularly valuable for long-running agent tasks where partial completion must be resumable. The immutable event log becomes an audit trail for every tool call, LLM response, and state change. The primary cost is storage and replay overhead.

---

## 5. Comparative Synthesis

**Table 5. Domain Modeling Approach Comparison**

| Approach | Formality | Scale | Evidence Quality | Primary Risk | Best Fit |
|----------|-----------|-------|------------------|--------------|----------|
| DM1 Ubiquitous Language | Low (informal) | Small-Large | Anecdotal, SLR qualitative | Language drift, tacit dependence | Greenfield, high domain complexity |
| DM2 Strategic Subdomain | Medium (semi-formal) | Large | Case reports, SLR references | Incorrect boundaries, governance overhead | Multi-team, microservice migration |
| DM3 DSL-Based | High (formal) | Stable domains | Empirical DSL studies | Poor language design, evolution cost | Stable domains with tool investment |
| DM4 Code-Informed | Medium-High | Large brownfields | Feasibility studies | Overfitting technical boundaries | Legacy monolith decomposition |

**Table 6. ADR Format Comparison**

| Format | Setup Cost | Maintenance | Options Analysis | Tooling | Best Fit |
|--------|------------|-------------|------------------|---------|----------|
| ADR1 Nygard | Minimal | Low | Implicit | adr-tools | Simple decisions, high velocity |
| ADR2 MADR 4.0.0 | Moderate | Medium | Explicit structured | markdownlint only | Multi-option decisions, formal review |
| ADR3 Y-Statements | Minimal | Low | None | None | Brief capturing of clear decisions |
| ADR4 Alexandrian | Moderate | Medium | Pattern-linked | None | Pattern-heavy architectures |

**Table 7. Architecture Evaluation Method Comparison**

| Method | Duration | Quality Attributes | Rigor | Agile-Compatible | Empirical Support | Best Phase |
|--------|----------|--------------------|-------|------------------|-------------------|------------|
| AE1 SAAM | 2-3 days | Primarily modifiability | High | Low | Original SEI | Pre-implementation |
| AE2 ATAM | 3-6 weeks | Multiple (utility tree) | Very High | Very Low | 6+ validations | Pre-implementation |
| AE3 CBAM | +1-2 days | Economic ROI | High | Low | Limited | Post-ATAM |
| AE4 Lightweight ATAM | <6 hours | Multiple | Medium | Medium | None published | Pre-implementation |
| AE5 ARID | 1-2 days | Interface quality | Medium | High | Limited | Mid-implementation |
| AE6 DCAR | Variable | Decision consistency | Medium | High | Emerging | Any phase |

**Table 8. AI-Native Architecture Pattern Comparison**

| Pattern | Coordination | Determinism | Auditability | LLM Failure Blast Radius | Token Cost | Primary Trade-off |
|---------|--------------|-------------|--------------|--------------------------|------------|-------------------|
| AP1 Pipeline | Linear handoff | High | High | Per-stage, contained | Low-Medium | Error accumulation vs. clarity |
| AP2 Concurrent | Parallel, aggregated | Medium | Medium | Per-branch, aggregated | High | Diversity vs. cost and coherence |
| AP3 Orchestrator-Worker | Central oversight | Medium-High | Medium-High | Orchestrator cascade | Medium-High | Control vs. single-point-of-failure |
| AP4 Blackboard | Shared state | Low | Low | Emergent, hard to trace | Variable | Flexibility vs. unpredictability |
| AP5 Group Chat | Multi-party conversation | Low | Very High | Debate loop risk | High | Transparency vs. overhead |
| AP6 Handoff | Dynamic delegation | Variable | Medium | Routing loop risk | Medium | Specialization vs. complexity |
| AP7 Plan-then-Execute | Separated phases | High | High | Isolated to executor | Medium | Security vs. re-planning cost |
| AP8 Event-Sourced | Immutable log | High | Very High | Minimal (replay) | Storage | Reproducibility vs. storage overhead |

The synthesis tables reveal several cross-cutting patterns. Formality correlates inversely with agile compatibility across all four subtopics: the highest-rigor methods (full ATAM, formal DSLs) are also the least compatible with iterative development practices. Empirical evidence remains weaker than practitioner adoption in all areas, a recurring finding in software engineering research. Auditability and reproducibility are the primary differentiating factors for AI-native patterns, reflecting the regulatory and operational maturity demands of production AI systems.

---

## 6. Open Problems and Gaps

### 6.1 Domain Modeling

**Gap: DDD effectiveness evidence.** After more than two decades of DDD practice, quantitative evidence on the causal contribution of specific DDD practices (ubiquitous language, bounded contexts, aggregate design) to measurable outcomes (defect density, change lead time, maintainability) remains sparse. The 2023 SLR calls explicitly for more empirical evaluations. Practitioner adoption is wide; scientific causal understanding is narrow.

**Gap: DDD for AI domain modeling.** DDD was conceived for systems where the domain is a human business process. When the system itself is an AI agent, the "domain" includes LLM behavior, tool invocation semantics, memory retrieval strategies, and multi-agent coordination protocols — none of which have established DDD modeling conventions. What does a "bounded context" mean for an AI reasoning system? What are the aggregates? How is ubiquitous language maintained for a system where terms may be interpreted differently by the LLM in different contexts?

**Gap: Conway's Law for AI teams.** Conway's Law observes that systems mirror their organization's communication structure. As AI agent teams (multi-agent architectures) become the primary software-producing organization for certain tasks, a new question arises: what communication topology among AI agents produces what system architecture? This is an entirely unexplored research area.

### 6.2 ADRs

**Gap: ADR impact measurement.** The intuitive case for ADRs — that capturing decision rationale reduces institutional knowledge loss and bad reversals — has not been empirically measured. No studies compare the long-term architectural quality or maintainability of codebases with and without systematic ADR practices.

**Gap: ADR tooling for AI agents.** Current ADR tooling (adr-tools, dotnet-adr, markdownlint) targets human authors. An AI architect agent that produces ADRs as part of its workflow needs tools that can parse existing ADRs to understand prior decisions, detect potential conflicts between a proposed decision and existing ADRs, and generate ADR drafts from architecture analysis. This toolchain does not exist.

### 6.3 Prior Art Survey Methodology

**Gap: Automated survey quality.** AI agents can execute search queries and retrieve documents, but the quality of automated prior art surveys depends on the agent's ability to assess source credibility, distinguish experimental from production evidence, and identify when a highly-cited source contains an error later corrected. None of these capabilities have been systematically studied for AI architect agents.

**Gap: Practitioner knowledge sources.** Academic SLR methodology covers peer-reviewed publications well but systematically under-weights practitioner knowledge embedded in blog posts, open-source repository issues, and conference talks. These sources are often ahead of academic publication by 2-3 years on engineering practice. Methodologies for incorporating them rigorously do not exist.

### 6.4 Constraint Discovery

**Gap: Constraint completeness.** No systematic method exists for verifying that a constraint discovery process has found all architecturally significant constraints. Unknown unknown constraints — constraints that no stakeholder knows to surface — remain the primary source of post-implementation rework. This is inherently a problem of unknown unknowns, and the research community has not produced reliable techniques for uncovering them.

**Gap: Constraint evolution.** Regulatory constraints evolve (new legislation, updated standards), performance constraints evolve (changed load profiles, new SLAs), and organizational constraints evolve (team reorganizations, new acquisitions). No established method exists for tracking constraint evolution and propagating changes to affected architectural decisions. This is a maintenance problem that existing constraint cataloging approaches do not address.

### 6.5 Architecture Evaluation Methods

**Gap: Lightweight method validation.** The 2022 comprehensive review found that Lightweight ATAM has zero published empirical validations. DCAR has "emerging" evidence. The gap between academic evaluation method proposals and industrial validation is wide and persistent.

**Gap: AI-native quality attributes.** ATAM's quality attribute tree (performance, availability, security, modifiability, usability) does not include quality attributes specific to AI-native systems: reasoning quality, token efficiency, prompt injection resistance, hallucination rate, context coherence under long conversations, and graceful degradation under model capability limits. These are architecturally significant properties with genuine tradeoffs (e.g., larger context windows improve coherence but increase cost and latency) that current evaluation frameworks do not address.

**Gap: Continuous evaluation.** ATAM and SAAM are point-in-time evaluations of a candidate architecture. In rapidly iterating systems, the architecture changes continuously, and evaluation methods that take weeks are not compatible with iterative development. No established method exists for continuous, lightweight architecture quality monitoring.

### 6.6 AI-Native Architecture Patterns

**Gap: Emergence in agent compositions.** The survey on emergent behavior in composed systems establishes that correct components can produce incorrect compositions. This problem is especially acute for multi-agent LLM systems: each agent may behave correctly in isolation, but their composition may produce emergent behaviors (reasoning loops, conflicting state updates, cascading hallucination amplification) that no individual agent test could have detected. No formal compositional reasoning framework exists for LLM agent systems.

**Gap: Pattern interoperability.** Production AI systems use hybrid patterns (e.g., pipeline with a blackboard step for complex sub-problems; orchestrator with plan-then-execute workers). The tradeoff interactions between patterns in hybrid compositions are not documented. The Azure Architecture Center guide notes that "most production systems use hybrid patterns" and that patterns are composable, but provides no analytical framework for predicting hybrid system behavior.

**Gap: Evaluation benchmarks for architectural patterns.** Benchmarks for multi-agent systems (WebArena, SWE-bench, AgentBench) measure end-to-end task completion but do not isolate the contribution of architectural pattern choice. Whether a blackboard architecture outperforms an orchestrator-worker architecture on a given task class, and under what conditions, remains empirically undetermined for most task domains.

---

## 7. Conclusion

This survey has synthesized six bodies of knowledge relevant to an AI architect agent performing pre-decomposition domain analysis: DDD-based domain modeling, Architecture Decision Records, prior art survey methodology, constraint discovery, architecture evaluation methods, and AI-native architecture patterns.

The landscape across all six areas reveals a common pattern: the most widely adopted approaches tend to be the lightest-weight ones (ubiquitous language workshops over formal DSLs; Nygard ADRs over heavyweight specification; fast practitioner surveys over formal SLRs; Lightweight ATAM or DCAR over full ATAM), because heavyweight methods impose process costs incompatible with modern iterative development. At the same time, the empirical evidence base for lightweight approaches is significantly weaker than for heavyweight ones — practitioners have adopted the light methods based on intuition and experience rather than controlled evaluation.

For AI-native systems, the pattern taxonomy is established and well-documented across the sequential, concurrent, orchestrator-worker, blackboard, group chat, handoff, plan-then-execute, and event-sourced families. The critical open gap is compositional reasoning: predicting the behavior of hybrid multi-agent systems from the properties of their component patterns. The structural analogy to the emergent behavior problem in classical distributed systems is direct — correct components producing incorrect compositions — but without the four decades of research that classical systems have accumulated.

An AI architect agent with deep knowledge of these six areas is equipped to: establish a shared domain vocabulary before writing any specification; capture architectural decisions with their rationale and tradeoffs in a durable, version-controlled form; survey prior solutions with methodological rigor; catalog constraints before they become rework; evaluate candidate architectures against a structured quality attribute framework; and select from a palette of AI-native architectural patterns with awareness of their tradeoffs and failure modes.

---

## References

1. Evans, E. (2003). *Domain-Driven Design: Tackling Complexity in the Heart of Software*. Addison-Wesley. [fabiofumarola.github.io/nosql/readingMaterial/Evans03.pdf](https://fabiofumarola.github.io/nosql/readingMaterial/Evans03.pdf)

2. Vernon, V. (2013). *Implementing Domain-Driven Design*. Addison-Wesley. Summary at [informit.com/articles/article.aspx?p=2020371](https://www.informit.com/articles/article.aspx?p=2020371)

3. Fowler, M. (2014). DomainDrivenDesign. martinfowler.com. [martinfowler.com/bliki/DomainDrivenDesign.html](https://martinfowler.com/bliki/DomainDrivenDesign.html)

4. Nygard, M. (2011). Documenting Architecture Decisions. Cognitect Blog. [cognitect.com/blog/2011/11/15/documenting-architecture-decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

5. ADR GitHub Organization. (2025). Architectural Decision Records. [adr.github.io](https://adr.github.io/)

6. MADR. (2024). Markdown Architectural Decision Records, version 4.0.0. [adr.github.io/madr](https://adr.github.io/madr/)

7. joelparkerhenderson. (2025). Architecture Decision Record Examples. [github.com/joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record)

8. Kazman, R., Klein, M., & Clements, P. (2000). ATAM: Method for Architecture Evaluation. CMU/SEI-2000-TR-004. [sei.cmu.edu/documents/629/2000_005_001_13706.pdf](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf)

9. Kazman, R., et al. Integrating the Architecture Tradeoff Analysis Method (ATAM) with the Cost Benefit Analysis Method (CBAM). [researchgate.net/publication/267307431](https://www.researchgate.net/publication/267307431_Integrating_the_Architecture_Tradeoff_Analysis_Method_ATAM_with_the_Cost_Benefit_Analysis_Method_CBAM)

10. Verdecchia, R., et al. (2022). Lightweight Software Architecture Evaluation for Industry: A Comprehensive Review. *MDPI*. [pmc.ncbi.nlm.nih.gov/articles/PMC8838159](https://pmc.ncbi.nlm.nih.gov/articles/PMC8838159/)

11. Wikipedia. Architecture Tradeoff Analysis Method. [en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method)

12. Kitchenham, B. (2004). Guidelines for performing Systematic Literature Reviews in Software Engineering. EBSE Technical Report. [researchgate.net/publication/302924724](https://www.researchgate.net/publication/302924724_Guidelines_for_performing_Systematic_Literature_Reviews_in_Software_Engineering)

13. Kitchenham, B., et al. Systematic literature reviews in software engineering — A systematic literature review. *Information and Software Technology*. [researchgate.net/publication/222673849](https://www.researchgate.net/publication/222673849_Systematic_literature_reviews_in_software_engineering-A_systematic_literature_review)

14. Quick guide for SLR in computer science. *PMC*. [pmc.ncbi.nlm.nih.gov/articles/PMC9672331](https://pmc.ncbi.nlm.nih.gov/articles/PMC9672331/)

15. IASA Global. Requirements Discovery and Constraints Analysis. BTABoK. [iasa-global.github.io/btabok/requirements_discovery_and_constraints_analysis.html](https://iasa-global.github.io/btabok/requirements_discovery_and_constraints_analysis.html)

16. MDPI Computers. (2024). A Review of Non-Functional Requirements Analysis Throughout the SDLC. [mdpi.com/2073-431X/13/12/308](https://www.mdpi.com/2073-431X/13/12/308)

17. Microsoft Azure Architecture Center. (2026). AI Agent Orchestration Patterns. [learn.microsoft.com/azure/architecture/ai-ml/guide/ai-agent-design-patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

18. Guo, L., et al. (2025). AI Agent Systems: Architectures, Applications, and Evaluation. *arXiv:2601.01743*. [arxiv.org/html/2601.01743v1](https://arxiv.org/html/2601.01743v1)

19. Zhang, Y., et al. (2025). Agentic AI Frameworks: Architectures, Protocols, and Design Challenges. *arXiv:2508.10146*. [arxiv.org/html/2508.10146v1](https://arxiv.org/html/2508.10146v1)

20. Wang, L., et al. (2025). Agentic Artificial Intelligence (AI): Architectures, Taxonomies, and Evaluation of LLM Agents. *arXiv:2601.12560*. [arxiv.org/html/2601.12560v1](https://arxiv.org/html/2601.12560v1)

21. Del Rosario, M., Krawiecka, M., & de Witt, C. (2025). Architecting Resilient LLM Agents. *arXiv:2509.08646*. [arxiv.org/pdf/2509.08646](https://arxiv.org/pdf/2509.08646)

22. Zhao, Y., et al. (2025). LLM-based Multi-Agent Blackboard System for Data Discovery. *arXiv:2510.01285*. [arxiv.org/pdf/2510.01285](https://arxiv.org/pdf/2510.01285)

23. Chen, H., et al. (2025). Exploring Advanced LLM Multi-Agent Systems Based on Blackboard Architecture. *arXiv:2507.01701*. [arxiv.org/html/2507.01701v1](https://arxiv.org/html/2507.01701v1)

24. OpenHands Software Agent SDK. (2025). A Composable and Extensible Foundation for Production Agents. *arXiv:2511.03690*. [arxiv.org/html/2511.03690v1](https://arxiv.org/html/2511.03690v1)

25. Schleicher, D. (2026). Removing Ambiguity with Spec-Driven Development. [danielschleicher.com/...](https://www.danielschleicher.com/software/engineering,/ai,/spec-driven/development/2026/01/04/removing-ambiguity-with-spec-driven-development.html)

26. Vaadin Blog. DDD Part 1: Strategic Domain-Driven Design. [vaadin.com/blog/ddd-part-1-strategic-domain-driven-design](https://vaadin.com/blog/ddd-part-1-strategic-domain-driven-design)

27. SAP. Curated Resources for Domain-Driven Design. [github.com/SAP/curated-resources-for-domain-driven-design](https://github.com/SAP/curated-resources-for-domain-driven-design/blob/main/blog/0002-core-concepts.md)

28. Systematic review of SE systematic review process. *ScienceDirect*. [sciencedirect.com/science/article/abs/pii/S0950584913001560](https://www.sciencedirect.com/science/article/abs/pii/S0950584913001560)

29. DDD SLR. (2023). arXiv:2310.01905. [arxiv.org/pdf/2310.01905.pdf](https://arxiv.org/pdf/2310.01905.pdf)

30. ScienceDirect. (2025). DDD Systematic Literature Review. [sciencedirect.com/science/article/pii/S0164121225002055](https://www.sciencedirect.com/science/article/pii/S0164121225002055)

31. Conway, M. (1968). How do committees invent? *Datamation*.

32. Skelton, M., & Pais, M. (2019). *Team Topologies: Organizing Business and Technology Teams for Fast Flow*. IT Revolution Press.

33. Baldwin, C. Y., & Clark, K. B. (2000). *Design Rules, Volume 1: The Power of Modularity*. MIT Press.

34. Confluence: Hammer, D. Scenario-Based Software Architecture. [sasg.nl/sasg16Dieter_Hammer.pdf](https://www.sasg.nl/sasg16Dieter_Hammer.pdf)

---

## Practitioner Resources

### Domain Modeling

- **Evans (2003)** — Primary reference for DDD patterns; Chapters 1-3 (ubiquitous language) and 14-17 (strategic design) are highest-value for architectural reasoning
- **Vernon (2013)** — Operationalizes Evans; Part II (strategic design) and the Aggregate design chapter are directly applicable
- **Context Mapper** — Tool for DDD-oriented domain modeling with CML DSL; [context-mapper.org](https://context-mapper.org)
- **Event Storming** — Brandolini's collaborative domain discovery technique; [eventstorming.com](https://eventstorming.com)
- **SAP DDD resources** — Curated reference collection; [github.com/SAP/curated-resources-for-domain-driven-design](https://github.com/SAP/curated-resources-for-domain-driven-design)

### Architecture Decision Records

- **Nygard original post** — [cognitect.com/blog/2011/11/15/documenting-architecture-decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- **adr.github.io** — Canonical ADR ecosystem hub with templates and tooling [adr.github.io](https://adr.github.io/)
- **MADR 4.0.0 template** — [adr.github.io/madr](https://adr.github.io/madr/)
- **joelparkerhenderson ADR examples** — [github.com/joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record)
- **arc42** — Comprehensive architecture documentation system that integrates ADRs; [arc42.org](https://arc42.org)

### Architecture Evaluation

- **SEI ATAM collection** — [sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)
- **ATAM technical report** — Original Kazman, Klein, Clements paper; [sei.cmu.edu/documents/629/2000_005_001_13706.pdf](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf)
- **Lightweight evaluation review** — Comprehensive comparison of 27 methods; [pmc.ncbi.nlm.nih.gov/articles/PMC8838159](https://pmc.ncbi.nlm.nih.gov/articles/PMC8838159/)

### Prior Art Survey

- **Kitchenham SLR guidelines** — [researchgate.net/publication/302924724](https://www.researchgate.net/publication/302924724_Guidelines_for_performing_Systematic_Literature_Reviews_in_Software_Engineering)
- **PMC SLR quick guide for CS** — [pmc.ncbi.nlm.nih.gov/articles/PMC9672331](https://pmc.ncbi.nlm.nih.gov/articles/PMC9672331/)

### AI-Native Architecture Patterns

- **Azure AI Agent Orchestration Patterns** (updated Feb 2026) — [learn.microsoft.com/azure/architecture/ai-ml/guide/ai-agent-design-patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- **arXiv 2601.01743** — AI Agent Systems survey with formal agent abstraction and evaluation framework [arxiv.org/html/2601.01743v1](https://arxiv.org/html/2601.01743v1)
- **arXiv 2509.08646** — Resilient LLM agents: Plan-then-Execute and security patterns [arxiv.org/pdf/2509.08646](https://arxiv.org/pdf/2509.08646)
- **arXiv 2510.01285** — Blackboard multi-agent systems for LLMs with empirical comparison [arxiv.org/pdf/2510.01285](https://arxiv.org/pdf/2510.01285)
- **arXiv 2601.12560** — Six-dimensional taxonomy of LLM agent architectures [arxiv.org/html/2601.12560v1](https://arxiv.org/html/2601.12560v1)
- **arXiv 2508.10146** — Agentic AI framework architectures and communication protocols [arxiv.org/html/2508.10146v1](https://arxiv.org/html/2508.10146v1)

### Constraint Discovery

- **BTABoK Requirements Discovery** — [iasa-global.github.io/btabok/requirements_discovery_and_constraints_analysis.html](https://iasa-global.github.io/btabok/requirements_discovery_and_constraints_analysis.html)
- **Team Topologies** — Skelton & Pais (2019); primary reference for organizational constraints and Conway's Law
- **NFR Review (2024)** — [mdpi.com/2073-431X/13/12/308](https://www.mdpi.com/2073-431X/13/12/308)
