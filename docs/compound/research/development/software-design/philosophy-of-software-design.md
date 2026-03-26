---
title: "A Philosophy of Software Design: Principles, Evidence, and Competing Perspectives"
date: 2026-03-26
summary: A systematic survey of the design principles from John Ousterhout's "A Philosophy of Software Design", contextualized within the broader software engineering literature on complexity management, modularity, and interface design.
keywords: [software-design, complexity-management, modularity, information-hiding, deep-modules]
---

# A Philosophy of Software Design: Principles, Evidence, and Competing Perspectives

*2026-03-26*

## Abstract

John Ousterhout's *A Philosophy of Software Design* (first edition 2018, second edition 2021) has emerged as one of the most debated and influential texts in the practitioner software design literature of the past decade. Grounded in Ousterhout's experience teaching Stanford's CS 190 Software Design Studio over more than a decade, the book advances a unified theory of software design centered on a single organizing concept: complexity is the root cause of nearly all difficulty in software development, and the primary goal of design is to minimize or encapsulate that complexity. The book introduces a taxonomy of principles --- deep modules, information hiding, pulling complexity downward, defining errors out of existence, and strategic programming --- that together constitute a coherent design philosophy distinct from, and in several respects opposed to, prevailing orthodoxies such as Robert Martin's *Clean Code*, strict Test-Driven Development, and aggressive application of SOLID principles.

This survey systematizes the thirteen major principles from the second edition, traces each to its intellectual antecedents in the software engineering research literature (Parnas 1972, Brooks 1986, Lehman 1974, Sweller 1988), and evaluates the available evidence base. That evidence is predominantly observational --- drawn from Ousterhout's multi-year classroom experiment in CS 190, code reviews of student projects implementing systems like the Raft consensus protocol, and his own career building Tcl/Tk, the Sprite operating system, the first log-structured file system, and the Homa transport protocol. We examine corroborating and contradicting perspectives from empirical software engineering research, compare Ousterhout's framework with Clean Code, the Unix philosophy, Domain-Driven Design, and YAGNI/Extreme Programming, and identify open problems where the framework is silent or contested.

The goal of this paper is landscape presentation: to map the terrain of ideas, evidence, and competing positions so that practitioners and researchers can make informed judgments. No normative recommendations are offered.

## 1. Introduction

### 1.1 Origin and Context

John Kenneth Ousterhout (b. 1954) holds a PhD in computer science from Carnegie Mellon University (1980) and has spent roughly equal portions of his career in academia and industry. During fourteen years at UC Berkeley (1980--1994), he created the Tcl scripting language and the Tk widget toolkit, led the group that designed the Sprite operating system and the first log-structured file system, and received the Grace Murray Hopper Award (1987) for his work on electronic design automation. After a period at Sun Microsystems and founding two companies (Scriptics/Ajuba Solutions, Electric Cloud), he joined the Stanford faculty in 2008. There he created CS 190: Software Design Studio, a course taught in a studio format consisting primarily of in-class discussions and iterative code reviews (Stanford CS 190 Course Website, web.stanford.edu/~ouster/cs190-winter23/).

CS 190 requires students to implement substantial system software projects --- including, in many iterations, the Raft distributed consensus protocol --- and then undergo multiple rounds of review and revision. Ousterhout personally reviews every student's code. The book crystallizes patterns he observed repeatedly: designs that managed complexity well and those that did not, recurring anti-patterns, and the specific code-level decisions that distinguished strong designs from weak ones. This pedagogy-through-observation approach gives the book an empirical grounding that is unusual for software design texts, although it also limits the evidence base to a particular population (Stanford graduate students) and project type (systems software in Java and C++).

The first edition appeared in 2018, self-published, and quickly became a bestseller in the software engineering practitioner market. The second edition (2021) added two new chapters --- including Chapter 21, "Decide What Matters" --- expanded the treatment of general-purpose modules, and introduced explicit comparisons with Robert Martin's *Clean Code*. A free extract of the new material was made available for first-edition owners (Ousterhout, 2021, web.stanford.edu/~ouster/cgi-bin/book.php).

### 1.2 Scope and Significance

The book addresses a gap in software engineering education. As Ousterhout has argued in multiple venues --- his Talks at Google presentation (2018), the SE Radio interview (Episode 520, July 2022), and his 2025 interview with Gergely Orosz at The Pragmatic Engineer --- most computer science curricula teach algorithms and data structures but give short shrift to the design of systems themselves. CS 190 is explicitly modeled on the pedagogy of English composition: iterative writing, critical reading of one's own and others' work, and revision guided by feedback. The book presents the principles distilled from that process.

The significance of the work lies not only in its principles but in its willingness to take positions that contradict widely held conventions --- particularly regarding method length, the role of comments, the value of TDD, and the desirability of small classes. These contrarian stances precipitated a public debate between Ousterhout and Robert Martin in 2024--2025, documented in a GitHub repository (github.com/johnousterhout/aposd-vs-clean-code), which has become a primary text for understanding the fault lines in contemporary software design philosophy.

### 1.3 Methodology of This Survey

This survey draws on three categories of sources: (1) Ousterhout's own primary texts --- the book's two editions, Stanford CS 190 lecture materials, conference talks, podcast interviews, and the APoSD-vs-Clean-Code debate transcript; (2) reviews and analyses by practitioners and academics --- including The Pragmatic Engineer, the Path-Sensitive blog, Henrik Warne's blog, and the "Not My Philosophy" counter-critique by Andrey Lebedev; (3) foundational and related academic literature on information hiding (Parnas 1972), essential vs. accidental complexity (Brooks 1986), laws of software evolution (Lehman 1974--1996), cognitive load theory (Sweller 1988), code readability empirical studies, and the Java checked exceptions debate.

## 2. Foundations

### 2.1 The Problem of Complexity in Software

The notion that complexity is the central problem in software engineering predates Ousterhout by decades. Three foundational contributions frame the intellectual landscape.

**Brooks (1986): Essential vs. Accidental Complexity.** In "No Silver Bullet --- Essence and Accident in Software Engineering," Frederick Brooks argued that the difficulties of software are divisible into essential difficulties (inherent in the nature of the problem domain --- its complexity, conformity, changeability, and invisibility) and accidental difficulties (artifacts of current tools and methods). Brooks claimed that most accidental complexity had already been removed by the mid-1980s, meaning that no single innovation could yield an order-of-magnitude productivity improvement. Ousterhout's framework implicitly addresses both categories: his principles for information hiding and module design attack essential complexity by making it manageable, while his critiques of classitis and pass-through methods target accidental complexity introduced by misapplied design practices.

**Parnas (1972): Information Hiding and Modular Decomposition.** David Parnas's "On the Criteria To Be Used in Decomposing Systems into Modules" (Communications of the ACM, 15(12):1053--1058) established that modules should be organized around design decisions likely to change, with each module hiding such a decision from all others. Parnas contrasted this with the then-dominant approach of decomposing based on a process flowchart. Ousterhout's deep module concept is a direct descendant of Parnas's information hiding, enriched with a visual metaphor (interface width vs. implementation depth) and a cost-benefit calculus (the interface cost must be outweighed by the hidden complexity).

**Lehman (1974--1996): Laws of Software Evolution.** Meir Lehman's empirical laws, formulated from observations of IBM OS/360 and subsequent systems, include the Law of Increasing Complexity: "As an E-type system evolves, its complexity increases unless explicit work is done to maintain or reduce it." This law provides the thermodynamic backdrop to Ousterhout's insistence on a "zero-tolerance attitude" toward complexity --- the entropic tendency of software means that vigilance must be continuous and systemic, not episodic.

### 2.2 Cognitive Load Theory and Program Comprehension

Ousterhout's concept of cognitive load as a symptom of complexity connects to John Sweller's cognitive load theory (1988), which distinguishes intrinsic load (inherent to the material), extraneous load (imposed by poor instructional design), and germane load (productive effort directed at schema formation). Programming has high intrinsic cognitive load; software design principles can be understood as techniques for minimizing extraneous cognitive load --- the unnecessary burden that poorly structured code imposes on the reader.

Empirical research on program comprehension has established that code readability significantly impacts maintenance time and defect rates. A systematic review by Oliveira et al. (2023) found that minimizing nesting depth, reducing method length beyond certain thresholds, and maintaining naming consistency all correlate with reduced comprehension time. Importantly, this research also found diminishing returns to method shortening: at some point, the proliferation of small methods introduces its own comprehension cost through increased navigation and context-switching --- a finding that corroborates Ousterhout's critique of extreme decomposition.

### 2.3 Complexity Metrics: Cyclomatic vs. Cognitive vs. Ousterhout's Definition

It is important to distinguish Ousterhout's informal, practitioner-oriented definition of complexity from formal metrics used in software engineering research.

**McCabe's cyclomatic complexity** (1976) counts independent paths through a program's control flow graph. It correlates with testing difficulty but poorly captures the comprehension cost of deeply nested or semantically opaque code.

**SonarSource's cognitive complexity** (2017) extends cyclomatic complexity by penalizing nested control structures more heavily than sequential ones, aligning better with human comprehension difficulty. Three sequential `if` statements receive a lower score than three nested ones, despite identical cyclomatic complexity.

**Ousterhout's definition** is qualitative and experiential: "Anything related to the structure of a system that makes it hard to understand and modify the system." He operationalizes this through three symptoms (change amplification, cognitive load, unknown unknowns) and two causes (dependencies and obscurity). This definition deliberately privileges the reader's experience over any computable metric, reflecting the pedagogical origin of the framework --- in CS 190, the arbiter of complexity is the code reviewer, not a static analysis tool. The definition's strength is its alignment with practical development experience; its weakness is that it resists quantification and is therefore difficult to study empirically at scale.

## 3. Taxonomy of Approaches

Ousterhout's principles can be organized into four clusters that correspond to different aspects of the software design process.

### Cluster A: Module Design Principles
- Deep modules vs. shallow modules (Ch. 4)
- Information hiding and leakage (Ch. 5)
- General-purpose vs. special-purpose modules (Ch. 6)
- Different layer, different abstraction (Ch. 7)
- Pull complexity downward (Ch. 8)
- Better together or better apart (Ch. 9)

### Cluster B: Error Handling Philosophy
- Define errors out of existence (Ch. 10)

### Cluster C: Process and Metacognition
- Strategic vs. tactical programming (Ch. 3)
- Design it twice (Ch. 11)
- Decide what matters (Ch. 21, 2nd ed.)

### Cluster D: Naming, Documentation, and Readability
- Comments should describe things not obvious from the code (Ch. 12--13)
- Choosing names (Ch. 14)
- Write the comment first (Ch. 15)
- Consistency (Ch. 17)
- Code should be obvious (Ch. 18)

A fifth, cross-cutting cluster addresses Ousterhout's critiques of contemporary software trends (Ch. 19), including agile development, TDD, design patterns, and getters/setters.

## 4. Analysis

### 4.1 Complexity as the Root Problem

#### Theory and Mechanism

Ousterhout's framework rests on a single foundational claim: complexity is the only thing that limits what we can build in software. All other problems --- bugs, schedule overruns, inability to evolve --- are downstream consequences of complexity. He defines complexity not as an intrinsic property of the problem domain (as Brooks does) but as a property of the system's structure as experienced by its developers. The formula he uses is:

> Overall complexity = Sum over all parts (complexity_of_part x fraction_of_time_developers_spend_on_that_part)

This weighting is significant: complexity isolated in rarely-touched code contributes less to the system's effective complexity than complexity in frequently-modified hot paths. The implication is that encapsulating complexity in stable, deep modules approaches the effect of eliminating it entirely.

He identifies three symptoms:

1. **Change amplification**: a simple conceptual change requires modifications in many places, indicating tight coupling or scattered representation of a design decision.
2. **Cognitive load**: developers must hold many facts in working memory to make changes safely, aligning with Sweller's theory of limited working memory capacity.
3. **Unknown unknowns**: the developer does not know what they do not know --- the worst form of complexity, because it manifests as bugs discovered only in production.

And two root causes: **dependencies** (code modules that cannot be understood or modified independently) and **obscurity** (important information that is not apparent from the code's structure or documentation).

Crucially, Ousterhout insists that complexity is incremental: "no single element causes problems. Instead, thousands of small dependencies accumulate gradually." This yields the zero-tolerance attitude: every design decision, no matter how small, must be evaluated for its impact on complexity, because the damage accumulates imperceptibly until the system becomes unmaintainable.

#### Literature Evidence

Lehman's Second Law of Software Evolution (Increasing Complexity) provides empirical support for the entropic tendency Ousterhout describes. Studies of large-scale systems at IBM, AT&T, and in open-source projects have validated that complexity metrics tend to increase monotonically unless active refactoring is performed (Lehman & Ramil, 1996; Herraiz et al., 2007).

The connection between cognitive load and defect rates has been investigated in multiple empirical studies. Abbes et al. (2011) found that the presence of certain anti-patterns (particularly blob classes and spaghetti code) significantly increased comprehension time and error rates among professional developers. Oliveira et al. (2023) demonstrated that code understandability, measured by task completion time and correctness, correlates with structural metrics including coupling, cohesion, and nesting depth.

#### Strengths and Limitations

The strength of Ousterhout's definition lies in its practical immediacy --- it tells developers what to look for (the three symptoms) and what causes it (the two root causes). Its limitation is the subjectivity of the assessment: "If someone says your code is not obvious, then it isn't" is useful pedagogically but difficult to operationalize in a team with varied skill levels. The weighting formula, while theoretically attractive, is rarely computable in practice because the fraction of developer time spent on each module is not typically tracked.

### 4.2 Strategic vs. Tactical Programming

#### Theory and Mechanism

Ousterhout draws a sharp distinction between two programming mindsets. **Tactical programming** makes getting the next feature or bug fix working the primary goal, accepting shortcuts and kludges in service of speed. **Strategic programming** makes producing a great design the primary goal --- "which also happens to work." The tactical programmer asks "What's the quickest way to make this work?" The strategic programmer asks "What is the best design for the system going forward?"

The **tactical tornado** is Ousterhout's memorable archetype of the tactical mindset at its worst: a developer who produces code at extreme speed, earns management admiration for velocity, but leaves a trail of technical debt that slows everyone else. The organizational challenge is that tactical tornadoes are often rewarded precisely because their velocity is visible while their debt is invisible.

Strategic programming involves a continuous investment of roughly 10--20% of development time in design quality. Ousterhout claims this investment pays for itself in 6--12 months as reduced rework and faster feature velocity offset the initial overhead.

#### Literature Evidence

The strategic vs. tactical distinction maps onto the technical debt metaphor introduced by Ward Cunningham (1992), though Ousterhout's framing is more focused on individual programmer behavior than organizational finance analogies. Empirical studies of technical debt at industry scale (Kruchten, Nord, & Ozkaya, 2012) confirm that tactical coding practices --- quick fixes, copied code, deferred refactoring --- compound over time and eventually dominate maintenance costs.

The 10--20% investment figure lacks rigorous empirical validation. It derives from Ousterhout's observations of CS 190 students and his own career experience, not from controlled experiments. However, the general principle that upfront design investment reduces total lifecycle cost has support in the software engineering literature, including Boehm's spiral model (1986) and the "cost of change curve" research, though the exact shape of that curve remains disputed in agile contexts.

#### Strengths and Limitations

The strategic/tactical distinction is intuitively compelling and provides useful vocabulary for discussing team dynamics. It frames design quality as an investment with returns, not a luxury. The limitation is that it can be read as advocating waterfall-style upfront design, though Ousterhout explicitly rejects this reading: he advocates incremental investment within an iterative development process, not big-design-up-front. The framework also says little about how to measure whether a team is investing enough, or how to balance strategic investment against legitimate time pressure.

### 4.3 Deep Modules vs. Shallow Modules

#### Theory and Mechanism

This is arguably the book's most distinctive and controversial principle. Ousterhout defines a module's **depth** as the ratio of its implementation complexity to its interface complexity. A **deep module** provides powerful functionality through a simple interface --- it hides significant complexity from its users. A **shallow module** has a complex interface relative to its implementation --- it fails to hide much of anything.

The canonical example of a deep module is the Unix file I/O interface: five system calls (`open`, `read`, `write`, `lseek`, `close`) hide enormous implementation complexity involving filesystems, directory trees, permissions, disk scheduling, caching, block allocation, and concurrent access. The canonical example of a shallow module, in Ousterhout's view, is Java's I/O library, where opening a buffered file reader requires chaining `FileInputStream`, `BufferedInputStream`, and `ObjectInputStream` --- three layers of wrapping that expose implementation details (the existence and configuration of buffering) rather than hiding them.

**Classitis** is Ousterhout's term for the anti-pattern that arises when the conventional wisdom that "classes should be small" is applied too aggressively. The resulting proliferation of tiny classes, each doing very little, increases the total number of interfaces a developer must understand, scatters related functionality across multiple locations, and often creates information leakage as design decisions span multiple classes. In CS 190, Ousterhout observed that students who divided their code into many small classes "ended up with much duplicated logic, caused by information leakage."

#### Literature Evidence

The deep module concept extends Parnas's information hiding by adding a dimensional metaphor and a cost model. Parnas argued that modules should hide design decisions; Ousterhout adds that the hiding must be net-positive, meaning the complexity concealed must exceed the complexity introduced by the interface.

Empirical evidence on optimal module size is mixed. A widely cited study by Hatton (1997) found a U-shaped relationship between module size and defect density, suggesting a sweet spot rather than a monotonic relationship --- neither the smallest nor the largest modules had the lowest defect rates. This finding aligns with Ousterhout's position against both monolithic modules and extreme decomposition, but the optimal size varies by context.

Marco Valente and colleagues at the Federal University of Minas Gerais examined the concept of "deep modules" empirically through static analysis of open-source Java projects, finding that modules with simple interfaces and complex implementations tended to be more stable (less frequently modified) than shallow modules, lending some support to Ousterhout's thesis.

#### Strengths and Limitations

The deep module framework provides a powerful heuristic for API design: before exposing functionality through an interface, ask whether you are hiding enough complexity to justify the interface's existence. The visual metaphor is immediately intuitive.

The primary limitation, as James Koppel argues in his Path-Sensitive review (2018), is that the claim "interfaces should be much simpler than implementations" is not universally true. Formal specifications of module behavior (which constitute the true interface) can legitimately be more complex than the implementation --- the POSIX file API's specification exceeds 3,000 words despite five simple function signatures. Koppel argues that the Unix file API is not actually as "deep" as Ousterhout claims, because the informal specification (error conditions, ordering constraints, race conditions) is far more complex than the function signatures suggest.

A second limitation is the tension with testability. Deep modules with rich internal state and complex behavior hidden behind simple interfaces can be difficult to unit test without dependency injection or other testing hooks, which themselves complicate the interface. The clean-code school argues that smaller modules with explicit dependencies are more testable, even if they are individually shallow.

A third limitation, raised by Lebedev (2024), is that deep modules can conflict with Domain-Driven Design, which naturally produces "shallow" modules aligned with domain entities and business language rather than optimizing for interface-to-implementation ratio.

### 4.4 Information Hiding and Leakage

#### Theory and Mechanism

Information hiding, as Ousterhout deploys it, is the primary mechanism for creating deep modules. Each module should encapsulate specific design decisions --- data representations, algorithms, resource management strategies --- and expose only what users need through its interface.

**Information leakage** occurs when the same design decision is reflected in multiple modules, creating coupling. Ousterhout identifies several forms:

- **Interface leakage**: implementation details exposed through function signatures, return types, or exception declarations.
- **Back-door leakage**: assumptions about another module's internals that bypass the interface (e.g., relying on file format details read by another module).
- **Temporal decomposition**: structuring code to mirror the order of runtime operations, which scatters knowledge about a single design decision across methods that correspond to different phases of execution.

Temporal decomposition is Ousterhout's most distinctive contribution to the information-leakage discourse. He observes that when developers decompose based on "first we do X, then we do Y, then we do Z," knowledge about data format or protocol structure gets encoded in X, Y, and Z separately rather than being centralized in a single module. The remedy is to group code by the knowledge it requires, not by the temporal order of operations.

#### Literature Evidence

Parnas's original information hiding paper (1972) demonstrated the principle with a KWIC (Key Word In Context) index system, showing that a knowledge-based decomposition yielded modules that were more independently modifiable than a flowchart-based decomposition. Subsequent empirical work has consistently supported the benefits of information hiding for maintainability and evolvability, though the specific term "temporal decomposition" appears to originate with Ousterhout.

A survey by Valente et al. (2012) found that coupling metrics (a proxy for information leakage) are among the strongest predictors of change-proneness in software modules. High coupling between modules --- which information leakage creates --- increases the probability that a change to one module will require changes to others.

#### Strengths and Limitations

The framework for identifying leakage is practical and actionable. The temporal decomposition anti-pattern, in particular, names a problem that many developers recognize intuitively but lack vocabulary to discuss. The limitation is that some degree of information sharing between modules is unavoidable --- Ousterhout acknowledges that dependencies cannot be eliminated, only managed --- and the framework provides limited guidance on where to draw the line between hiding and necessary exposure.

### 4.5 General-Purpose vs. Special-Purpose Modules

#### Theory and Mechanism

Ousterhout advocates a **"somewhat general-purpose"** approach to module design: interfaces should be general enough to serve multiple use cases (including ones not yet anticipated), but implementations should address only currently known requirements. This sweet spot avoids both over-specialization (which produces narrow, hard-to-reuse interfaces that create change amplification when new use cases arise) and over-generalization (which wastes effort building for speculative requirements --- the concern addressed by YAGNI).

The key insight is that general-purpose interfaces tend to be **simpler** than special-purpose ones, because they abstract over the details of particular use cases. A text editor method that operates on arbitrary character ranges is simpler than one that operates specifically on "the current selection," even though the implementation may be identical, because the general interface has fewer assumptions baked into it.

#### Literature Evidence

This principle is in productive tension with the YAGNI principle from Extreme Programming. YAGNI, attributed to Ron Jeffries, states: "Always implement things when you actually need them, never when you just foresee that you need them." However, Martin Fowler's careful analysis (bliki: Yagni) notes that YAGNI applies to **capabilities** built for presumptive features, not to **effort to make the software easier to modify**. Ousterhout's "somewhat general-purpose" approach targets the interface level --- making the API flexible --- not the implementation level, which remains tied to current needs. This resolves much of the apparent tension: a general interface is a structural investment that reduces future change amplification, not a speculative feature.

The distinction also echoes the Open-Closed Principle (Bertrand Meyer, 1988; Robert Martin, 1996): modules should be open for extension but closed for modification. A somewhat general-purpose interface naturally supports extension without modification, provided the abstraction is well-chosen.

#### Strengths and Limitations

The "somewhat general-purpose" heuristic provides useful guidance for API design decisions. Its weakness is the difficulty of calibrating "somewhat" --- knowing how general to make an interface without over-engineering requires judgment and experience that the principle itself cannot supply. Ousterhout acknowledges this, noting that the right level of generality often becomes apparent only after attempting at least two use cases (connecting to the "design it twice" principle).

### 4.6 Different Layer, Different Abstraction

#### Theory and Mechanism

In a well-designed system, each layer provides a different abstraction from the layers above and below it. When adjacent layers have similar abstractions --- similar method signatures, similar responsibilities --- it indicates a design problem. Ousterhout identifies several red flags:

- **Pass-through methods**: methods that do little except invoke another method with a similar or identical signature. These are symptoms of confused responsibility allocation.
- **Pass-through variables**: variables threaded through a long chain of method signatures even though only a deep method actually uses the value. These pollute intermediate interfaces with irrelevant details.
- **Decorator abuse**: the decorator pattern, while sometimes valuable, often violates "different layer, different abstraction" by adding a thin wrapper that merely tweaks behavior without changing the abstraction level. Ousterhout's canonical example is Java's I/O decorators, where `BufferedInputStream` wrapping `FileInputStream` is an abstraction leak because buffering should be the default behavior, not an optional decorator.

#### Literature Evidence

The principle that layers should represent genuinely different abstractions is implicit in foundational work on layered architectures (Dijkstra, 1968, on the THE multiprogramming system) and is made explicit in the domain of network protocol stacks (the OSI model). Ousterhout's contribution is to apply this principle at the code level --- within a single application --- and to identify pass-through methods as a specific smell indicating violation.

The critique of decorators is more controversial. The Gang of Four (Gamma, Helm, Johnson, Vlissides, 1994) introduced the decorator pattern precisely for composable, optional behavior modification. Ousterhout's objection is not to the pattern per se but to its use when the "decoration" should be the default behavior. This is context-dependent: in some architectures (particularly plugin systems), the decorator's composability is the point.

#### Strengths and Limitations

The "different layer, different abstraction" principle provides a useful diagnostic: if two adjacent layers feel similar, the decomposition may be wrong. Pass-through methods and variables are concrete, detectable smells. The limitation is that the principle can conflict with the practical need for interface adaptation (the Adapter pattern), where adjacent layers necessarily have related signatures because one is translating the other's interface for a different consumer.

### 4.7 Pull Complexity Downward

#### Theory and Mechanism

This principle inverts a common tendency: when complexity must live somewhere, it is better to absorb it into a module's implementation than to export it upward through the interface. Ousterhout's thesis is: "It is more important for a module to have a simple interface than a simple implementation." The rationale is economic --- a module typically has many more users than developers, so simplifying the interface benefits a larger population even at the cost of implementation difficulty.

**Configuration parameters** are Ousterhout's primary example of complexity exported upward. When a module cannot determine the right value for some parameter, it exports the decision to the caller via a configuration option. This shifts the cognitive load from the module developer (who understands the trade-offs) to the user (who often does not). The alternative is to compute a reasonable default automatically --- e.g., rather than exposing a "retry timeout" configuration parameter in a network protocol, the implementation can measure response times and compute a suitable retry interval at runtime.

#### Literature Evidence

The principle aligns with the concept of **convention over configuration**, popularized by Ruby on Rails (Hansson, 2004) and widely adopted in modern framework design. Research on API usability (Myers & Stylos, 2016) has found that APIs with fewer required parameters and sensible defaults are learned faster and used more correctly.

The tension is with flexibility: configuration parameters exist because users have diverse needs. Ousterhout's position is not that configuration is never warranted, but that it should be the exception rather than the default, and that automatic or adaptive solutions should be explored first.

#### Strengths and Limitations

The principle is directly actionable: before adding a configuration parameter, ask whether the module can determine a good value itself. It frames a concrete design decision (expose or absorb?) in terms of the broader complexity calculus. The limitation is that automatic determination is not always possible or desirable --- security-sensitive settings, environment-specific paths, and domain-specific thresholds often legitimately require user configuration. The principle also requires the module developer to have deep knowledge of the usage context, which is not always available in library or framework development.

### 4.8 Define Errors Out of Existence

#### Theory and Mechanism

Ousterhout describes exception handling as "one of the worst sources of complexity in software systems" and advocates a four-level strategy for reducing it:

1. **Define errors out of existence**: Redesign the API so that the "error" condition is simply part of normal behavior. His canonical example is the Tcl `unset` command: if `unset(x)` throws an exception when `x` is not set, callers must handle the exception. If `unset` is defined as "ensure x is not set," then calling `unset` when `x` is already unset is a no-op, not an error. Similarly, a text editor can avoid null-checking for "current selection" by defining an always-present selection of length zero.

2. **Mask exceptions**: Handle exceptions at a low level within the module rather than propagating them upward. Error recovery code is concentrated in one place, and higher-level callers are not burdened.

3. **Aggregate exception handling**: When exceptions cannot be masked, handle multiple error conditions through a single recovery path rather than separate handlers for each.

4. **Crash**: When an error genuinely cannot be handled or recovered from, crash the process. This is preferable to silent corruption or limping onward in an undefined state.

#### Literature Evidence

The "define errors out of existence" approach has clear parallels to the **Null Object pattern** (Woolf, 1997) and to defensive API design practices in the POSIX tradition (e.g., `free(NULL)` being defined as a no-op in C).

The philosophy is in direct tension with two other established positions:

- **Erlang's "let it crash" philosophy** (Armstrong, 2003): Like Ousterhout, Erlang discourages defensive programming at the individual process level. But the rationale is different. Erlang relies on a supervisor hierarchy to restart crashed processes, achieving fault tolerance through process isolation rather than through careful error handling. Ousterhout's "crash" option is reserved for genuinely unrecoverable errors; Erlang's approach makes crashing the **normal** response to unexpected conditions, with recovery handled architecturally. The Erlang model separates "workers" (which do the job and nothing else) from "observers" (which correct errors and nothing else), providing a clean separation of concerns that is impossible in languages without lightweight processes and supervision trees.

- **Java's checked exceptions**: Java's type system forces callers to either catch or declare every checked exception, attempting to make error handling exhaustive. This approach has been widely criticized --- by Bruce Eckel (*Thinking in Java*), Anders Hejlsberg (architect of C#), Rod Johnson (creator of Spring), and many others --- for producing voluminous, often meaningless `catch` blocks or `throws Exception` declarations that defeat the purpose. The core problem, as Hejlsberg noted, is that checked exceptions cause exception hierarchies to balloon out of control as systems grow and subsystems interact. C#, Kotlin, and most modern languages have omitted checked exceptions entirely. Ousterhout's philosophy is closer to the unchecked-exception camp: exceptions should be rare, not exhaustively declared.

Gergely Orosz (The Pragmatic Engineer) disputes Ousterhout's strong stance against exceptions, arguing that in backend distributed systems, exceptions are valuable when paired with monitoring and alerting. He concedes the point for client-side or embedded software but notes that the book's examples are drawn primarily from the latter domain.

#### Strengths and Limitations

"Define errors out of existence" is a powerful API design heuristic that can dramatically simplify client code. The Tcl `unset` and text-editor selection examples are compelling. The limitation is that this approach can, if taken too far, mask genuine problems: if an API silently succeeds when it should have signaled a meaningful failure, the caller cannot take corrective action. Ousterhout acknowledges this: "The important thing is not to hide or fail silently if a module using your code would need to know about that error." The challenge is that distinguishing "genuinely ignorable" from "must-know" errors requires deep understanding of all callers, which is not always available.

### 4.9 Design It Twice

#### Theory and Mechanism

Before committing to a design for any important interface or module, Ousterhout advocates producing at least two radically different alternatives and evaluating their trade-offs. This is a metacognitive practice: it combats the anchoring bias inherent in working with the first design that comes to mind.

Ousterhout's primary example is his own redesign of the Tk toolkit API. The first design worked but had significant usability problems; the second, fundamentally different design proved substantially superior. He argues that the cost of producing a second design is small (often just a sketch or list of alternative signatures), while the benefit --- avoiding commitment to a suboptimal design --- can be enormous.

In CS 190, students are required to write up alternative designs considered and explain the trade-offs. This documentation practice forces explicit comparison and prevents the default of accepting the first workable approach.

#### Literature Evidence

The "design it twice" principle is related to several established practices:

- **Spike solutions** in Extreme Programming: short experiments to explore technical feasibility before committing to an approach. Spikes are more limited --- they typically test feasibility rather than comparing alternatives.
- **Prototyping** (Boehm, 1986): building throwaway implementations to refine requirements. Prototyping focuses on validating requirements; "design it twice" focuses on comparing design alternatives.
- **Set-based concurrent engineering** (Ward et al., 1995; Toyota Production System): exploring multiple design options in parallel before converging. This manufacturing-derived approach has been adapted to software by the Lean Software Development community and is the closest analog to Ousterhout's principle, though operating at a different granularity.
- **Architecture Decision Records** (Nygard, 2011): documenting considered alternatives and the rationale for choices. ADRs institutionalize the documentation aspect of "design it twice" at the architectural level.

#### Strengths and Limitations

The principle is simple, memorable, and addresses a real cognitive bias. Its weakness is that it requires discipline and may feel wasteful in time-pressured environments. Ousterhout argues the time cost is small, but this depends on the scope of the design decision --- producing two radically different architectures for a large system is significantly more expensive than producing two alternative method signatures.

### 4.10 Naming and Comments

#### Theory and Mechanism

Ousterhout devotes three chapters (12--14) to comments and naming, more space than any other single topic. His central thesis is that **comments should describe things that are not obvious from the code** --- specifically, they should provide precision or intuition that the code itself cannot convey.

This places him in direct opposition to the "self-documenting code" school, which argues that well-chosen names and clean structure eliminate the need for comments. Ousterhout's counterargument is that English (or natural language in general) can express qualitative information, rationale, constraints, and high-level intent more effectively than code. Code tells you **what** happens; comments explain **why** and under **what conditions** the design decisions make sense. The two serve fundamentally different purposes and are both necessary.

He distinguishes several types of comments:
- **Interface comments**: document behavior, arguments, return values, side effects, and prerequisites. These constitute the abstraction --- a good interface comment allows the caller to use the module without reading the implementation.
- **Data structure comments**: explain the representation and invariants of fields.
- **Implementation comments**: explain non-obvious algorithms or tricky logic within the implementation.
- **Cross-module comments**: document dependencies that span module boundaries.

A key red flag: if an interface comment must describe implementation details to be useful, the abstraction is probably too shallow.

Ousterhout also advocates **"write the comment first"** --- drafting interface comments before writing the implementation, analogous to TDD but for documentation. This forces the developer to think through the abstraction before coding, often revealing design problems early.

On naming, Ousterhout argues that names are a form of abstraction: "If it's hard to find a simple name for a variable or method that creates a clear image of the underlying object, that's a hint that the underlying object may not have a clean design." Names should be precise (avoid "data," "info," "result") and consistent (the same name should always refer to the same concept).

#### Literature Evidence

The comments debate is one of the oldest in software engineering. Robert Martin's *Clean Code* dedicates a chapter to the position that "comments are always failures" --- failures to express intent through code --- with 15 pages on bad comments versus 4 on good ones. In their 2024--2025 debate, Martin and Ousterhout exchanged positions directly: Martin argued that with a sufficiently expressive language, comments would be unnecessary; Ousterhout responded that no programming language can express rationale, design alternatives considered, or usage conditions.

Empirical research on comments is mixed. Steidl, Hummel, & Juergens (2013) found that the mere presence of comments correlated with reduced defect density, but only when comments were accurate and up-to-date. Wen et al. (2019) found that API documentation quality significantly affected developer productivity and error rates. However, studies also consistently find that outdated or inaccurate comments are worse than no comments --- a concern Ousterhout addresses by integrating comment maintenance into code review processes.

#### Strengths and Limitations

Ousterhout's framework for comments is the most prescriptive and actionable in the practitioner literature. The distinction between interface and implementation comments, and the "write the comment first" practice, provide concrete guidance. The limitation is that comment quality depends on individual discipline and code review culture; the framework cannot prevent low-quality comments, only describe what high-quality comments look like.

### 4.11 Consistency

#### Theory and Mechanism

Consistency reduces cognitive load by providing **cognitive leverage**: once a developer has learned how something is done in one place, they can immediately understand other places that use the same approach. Ousterhout applies this to naming conventions, coding style, interfaces, design patterns, and invariants.

The key behavioral prescription: **"When in Rome, do as the Romans do."** Even if a developer has a "better" approach, introducing an inconsistency is typically worse than maintaining the existing convention, because the cost of inconsistency (forcing future readers to determine whether the difference is meaningful) exceeds the benefit of the local improvement. The exception is when the existing convention is deeply flawed and can be changed globally.

Conventions should be documented and, where possible, enforced automatically through linters, formatters, and CI checks. Ousterhout emphasizes that conventions are only valuable if they are followed universally; a convention followed 90% of the time is almost as costly as no convention, because the remaining 10% forces the reader to investigate whether each case follows the convention or not.

#### Literature Evidence

Research on code consistency supports Ousterhout's claims. A study by Allamanis et al. (2014) on coding conventions in open-source projects found that projects with higher convention adherence had lower defect density. The psychological literature on "cognitive fluency" (Oppenheimer, 2008) demonstrates that information presented in consistent formats is processed faster and with fewer errors.

The practical success of automated formatting tools (gofmt, Prettier, Black) provides additional evidence: teams that adopt mandatory formatting report reduced code review friction and fewer style-related disputes (Google Engineering Practices Documentation, 2019).

#### Strengths and Limitations

The consistency principle is the least controversial of Ousterhout's positions and has the broadest empirical support. Its main limitation is identifying when a convention should be changed rather than followed --- the "when in Rome" heuristic can ossify genuinely bad practices.

### 4.12 Code Should Be Obvious

#### Theory and Mechanism

Obviousness is the antithesis of obscurity, which Ousterhout identifies as one of the two root causes of complexity. Code is obvious when "a quick skim is sufficient to know what the code does" and "the reader's first guesses about behavior or meaning are correct."

Ousterhout identifies several techniques for achieving obviousness: good naming, consistency, whitespace and logical grouping, documenting non-obvious logic, avoiding "clever" code that sacrifices readability for conciseness, and using well-known idioms. He also identifies anti-patterns: event-driven programming (where control flow is determined at runtime, making it impossible to trace execution statically), generic containers used in place of typed data structures, and declarations far from their usage.

The diagnostic test is social: "If someone says your code is not obvious, then it isn't." The author's intent is irrelevant; what matters is the reader's experience.

#### Literature Evidence

Empirical code readability research supports most of Ousterhout's specific claims. Buse & Weimer (2010) developed a machine-learned readability metric and found that it predicted defect density better than several traditional metrics. Oliveira et al. (2023) confirmed that simpler control flow, shorter scoping distance, and naming clarity all correlated with faster and more accurate comprehension.

#### Strengths and Limitations

The "obviousness" principle is intuitively clear and broadly applicable. Its weakness, as with the broader complexity definition, is the reliance on subjective assessment. What is obvious to an experienced systems programmer may be opaque to a junior web developer. Ousterhout does not address how to calibrate obviousness for audiences of varying skill levels, though the social test ("if someone says it's not obvious, it isn't") provides a pragmatic resolution.

### 4.13 Critique of Software Trends

#### Theory and Mechanism

Chapter 19 of the second edition evaluates several contemporary software trends through the lens of Ousterhout's complexity framework.

**Agile development**: Ousterhout's concern is that the sprint-based cadence of agile methodologies encourages tactical programming --- pressure to deliver working features within a sprint pushes design considerations aside. His recommendation: replace "features" with "abstractions" as the unit of development within sprints.

**Test-Driven Development**: Ousterhout argues that TDD focuses attention on getting specific features working rather than finding the best design, representing "tactical programming with its disadvantages." TDD encourages bottom-up design driven by test cases rather than top-down design driven by abstraction. He sees value in one specific TDD use case: when fixing bugs, writing a failing test first and then fixing the code to pass it.

**Design patterns**: Ousterhout warns against over-application. Not every problem fits an existing pattern, and forcing a problem into an ill-fitting pattern introduces more complexity than a custom solution. He specifically critiques the decorator pattern (as discussed above).

**Getters and setters**: Ousterhout objects to the Java convention of providing getters and setters for all fields, arguing that this creates shallow methods that expose implementation details rather than hiding them.

**Object-oriented programming and inheritance**: While Ousterhout does not reject OOP, he expresses concern about implementation inheritance, which creates parent-child dependencies and information leakage. He generally prefers composition.

#### Literature Evidence

Each of these critiques touches a live nerve in the software engineering community.

On **TDD**, the empirical evidence is mixed. A controlled experiment by Fucci et al. (2017) found that test-first and test-last development produced comparable code quality and productivity, suggesting that the benefits of TDD may come from the testing itself rather than the ordering. A meta-analysis by Rafique & Misic (2013) found modest improvements in code quality from TDD but no significant productivity difference.

On **agile and design**, the tension between sprint velocity and design quality is widely recognized. The Agile Manifesto's principle of "continuous attention to technical excellence and good design" explicitly calls for balancing velocity with design quality, though as Ousterhout observes, this principle is often honored in the breach.

On **design patterns**, the Gang of Four's original intent was descriptive (documenting recurring solutions) rather than prescriptive (mandating their use). The critique of over-application is widely shared (Norvig, 1998; Arcelli Fontana et al., 2012).

On **getters/setters**, the critique aligns with the Tell, Don't Ask principle (Hunt & Thomas, 2003) and with Holub's "Why getter and setter methods are evil" (2003), both of which argue that getters and setters expose internal state and violate encapsulation.

#### Strengths and Limitations

These critiques inject productive skepticism into practices that are often adopted uncritically. The limitation is that each critique paints with a broad brush --- Ousterhout acknowledges that these trends have value "in some contexts" but does not always specify which contexts. The TDD critique, in particular, has drawn pushback from practitioners who argue that TDD's benefits extend beyond test ordering to include design feedback, executable documentation, and regression safety.

## 5. Comparative Synthesis

The following table compares Ousterhout's framework with four other major design philosophies across key dimensions.

| Dimension | Ousterhout (APoSD) | Clean Code (Martin) | Unix Philosophy | Domain-Driven Design (Evans) | YAGNI / XP |
|---|---|---|---|---|---|
| **Central concern** | Complexity management | Readability via small units | Composability | Domain model fidelity | Eliminating waste |
| **Unit of design** | Deep module (class/subsystem) | Small function (2--4 lines ideal) | Small program (one job) | Bounded context / aggregate | User story / feature |
| **Module size preference** | Large modules with simple interfaces | Small classes, short methods | Small, composable programs | Sized to match domain concept | Minimal to satisfy current need |
| **Interface philosophy** | Minimize interface surface; hide complexity | Minimize function arguments; extract till you drop | Universal interface (text streams, stdin/stdout) | Published language between contexts | Defer interface decisions |
| **Comments** | Essential; describe what code cannot | "Always a failure"; code should be self-documenting | Man pages (separate from code) | Ubiquitous language in code and docs | Minimal; working software over documentation |
| **Error handling** | Define errors out of existence; mask, aggregate, crash | Prefer exceptions over error codes | Exit codes; pipeline handles errors | Domain events; anti-corruption layers | Test-driven error handling |
| **Testing role** | Secondary to design; useful for bug-fixing | Central; TDD drives design | Ad hoc; test scripts | Behavior specification | TDD is a core practice |
| **Generality** | Somewhat general-purpose interfaces | Single responsibility; narrow focus | General-purpose tools, specific combination | Model current domain accurately | Build only what is needed now |
| **Decomposition criterion** | Knowledge/design decisions to hide | Responsibility (SRP) | Function/task | Domain concept / bounded context | User-facing feature |
| **Upfront design** | Strategic investment (10--20% overhead) | Emergent from refactoring | Evolved through use | Extensive domain modeling | Minimal; respond to change |
| **Inheritance** | Skeptical; prefers composition | Cautious; favors polymorphism | N/A (process composition) | Used for domain model hierarchies | Not specifically addressed |
| **Key risk** | Over-engineering; excessively deep modules | Over-decomposition; "lasagna code" | Over-simplification; glue code explosion | Over-modeling; analysis paralysis | Under-design; accrued debt |
| **Evidence base** | CS 190 observations; personal career | Industry experience; consulting | Decades of Unix ecosystem use | Enterprise software consulting | XP project reports |

### 5.1 Key Tensions

**Ousterhout vs. Clean Code on method length.** This is the sharpest disagreement. Martin advocates methods of 2--4 lines; Ousterhout considers methods of hundreds of lines acceptable if the interface is simple and the code is readable. Their 2024--2025 debate centered on a `PrimeGenerator` case study: Martin decomposed it into eight methods; Ousterhout argued that this created "entanglement" --- methods that could not be understood independently because their logic was interleaved. Martin responded that trusting method names and reading top-down compensated for the splitting. No empirical resolution exists; the disagreement reflects different weightings of local readability (Martin) vs. cognitive continuity (Ousterhout).

**Ousterhout vs. YAGNI on generality.** Ousterhout advocates "somewhat general-purpose" interfaces; YAGNI advocates building only what is currently needed. The resolution, as Fowler notes, is that YAGNI applies to features, not to structural flexibility. A general interface that costs little extra effort to design is not a YAGNI violation. However, the boundary is fuzzy, and reasonable practitioners disagree on where it lies.

**Ousterhout vs. Unix on module depth.** The Unix philosophy's "do one thing well" could be read as advocating shallow modules --- small programs with narrow interfaces. But Unix programs like `grep`, `sort`, and `awk` are in fact deep: they provide powerful functionality through simple command-line interfaces. The disagreement is more apparent than real, arising from the difference between programs (which compose through pipes) and classes (which compose through method calls).

**Ousterhout vs. DDD on decomposition criteria.** DDD decomposes along domain boundaries; Ousterhout decomposes along knowledge-hiding boundaries. These often coincide (a `PaymentProcessor` aggregate hides payment logic), but can diverge when a domain concept is inherently shallow (a simple value object) or when technical knowledge (caching, concurrency) crosscuts domain boundaries.

**Ousterhout vs. SOLID on SRP.** The Single Responsibility Principle states that a class should have "one reason to change." Ousterhout's deep modules may have multiple internal responsibilities as long as they present a simple interface. The tension is whether "one reason to change" should be interpreted narrowly (one specific behavior) or broadly (one design decision to hide). Ousterhout's interpretation is closer to the broader reading, which he sees as compatible with Parnas.

## 6. Open Problems and Gaps

### 6.1 Empirical Validation

The most significant gap in Ousterhout's framework is the absence of rigorous empirical validation. The evidence base is primarily observational: Ousterhout's decades of personal experience and his observations of CS 190 students. While this provides rich qualitative insight, it does not constitute the kind of controlled experimentation that would allow confident causal claims. Specific open questions include:

- Does the deep module strategy produce lower defect rates or faster development in controlled settings?
- Is there a measurable relationship between the depth-to-interface ratio and maintainability metrics?
- Does "writing the comment first" improve design outcomes compared to code-first approaches?
- What is the actual return on strategic programming investment, and how does it vary by project type?

### 6.2 Scalability to Large Organizations

Ousterhout's principles are derived from individual and small-team coding contexts. How they scale to large organizations with hundreds of developers, microservice architectures, and organizational Conway's Law dynamics is an open question. Deep modules may be the right unit of design within a service, but the boundaries between services are governed by organizational, operational, and scalability concerns that Ousterhout's framework does not address.

The modular monolith movement --- which advocates logical module boundaries without physical service separation --- is perhaps the closest large-scale architectural expression of Ousterhout's principles. Research suggests that roughly 80% of the benefits of microservices come from logical boundaries rather than independent deployment, aligning with the deep-module philosophy applied at the service level.

### 6.3 Distributed Systems and Concurrency

The book's examples are predominantly single-process, single-threaded systems software. Ousterhout's own work on Raft and Homa demonstrates that his principles can be applied to distributed systems, but the book does not systematically address how complexity management changes when failures are partial, networks are unreliable, and consistency guarantees must be explicit. Orosz (The Pragmatic Engineer) flags this gap specifically with respect to event-driven programming, which Ousterhout criticizes for obscuring control flow but which is essential in many distributed architectures.

### 6.4 Dynamic and Functional Languages

Most of Ousterhout's examples are in Java and C++. How the deep module principle applies to dynamic languages (where interfaces are implicit rather than declared) or functional languages (where modules are composed of pure functions rather than stateful objects) is underexplored. The information hiding principle translates readily (Haskell's module system, for instance, supports explicit export lists), but the visual metaphor of "interface width vs. implementation depth" may need adaptation.

### 6.5 AI-Assisted Development

Ousterhout himself has noted (in his 2025 Pragmatic Engineer interview) that current AI coding tools are "tactical tornadoes" --- they generate code quickly but often create technical debt. This suggests that his principles may become **more** important as AI handles more of the tactical coding, elevating the human role to strategic design. However, the framework does not yet address how to design for AI-assisted maintenance, or how to structure prompts and constraints to guide AI toward deep rather than shallow modules.

### 6.6 Testability Trade-offs

The most persistent critique of deep modules is that they are harder to test. Deep modules with complex internal state may require elaborate test fixtures, and their simple interfaces may not provide the hooks needed for thorough unit testing. Ousterhout's framework does not systematically address the tension between depth and testability, and the book's treatment of testing is minimal. This is arguably its largest omission in an era where automated testing is considered foundational to software quality.

### 6.7 Quantifying the "Somewhat" in "Somewhat General-Purpose"

The guidance to build "somewhat general-purpose" modules acknowledges a spectrum but does not provide tools for locating the sweet spot on that spectrum. Decision frameworks that quantify the expected cost of over-generalization vs. under-generalization --- perhaps based on anticipated change frequency or use-case diversity --- would make the principle more actionable.

## 7. Conclusion

John Ousterhout's *A Philosophy of Software Design* represents a significant contribution to the practitioner software design literature, distinguished by its grounding in sustained pedagogical observation and its willingness to challenge conventional wisdom. Its central insight --- that managing complexity through deep, well-abstracted modules with strong information hiding is the primary task of software design --- extends and refines a line of thought that runs from Parnas through Brooks to the present day.

The framework's strengths lie in its coherence (every principle ties back to complexity reduction), its actionable specificity (concrete red flags and design rules), and its pedagogical power (the visual metaphors of module depth and the "tactical tornado" archetype). Its limitations lie in its empirical basis (observational rather than experimental), its scope (primarily single-process systems software), and its silence on several topics important to contemporary practice (testing, distributed systems, organizational dynamics).

The debate between Ousterhout and the Clean Code school, particularly as documented in their 2024--2025 exchange, illuminates a fundamental tension in software design: the trade-off between local readability (small, focused methods) and global coherence (deep modules that minimize interface complexity). This tension does not admit a universal resolution; it depends on the specific system, team, and domain context. The contribution of Ousterhout's work is not to resolve the tension but to articulate the deep-module pole with unprecedented clarity and to force practitioners to confront the costs of extreme decomposition.

The growing influence of AI-assisted development may shift the landscape further: if machines handle tactical coding, the human role becomes predominantly strategic --- precisely the role Ousterhout argues software engineers should already be playing. Whether this shift validates his framework or reveals new limitations remains to be seen.

## References

1. Abbes, M., Khomh, F., Gueheneuc, Y.-G., & Antoniol, G. (2011). An empirical study of the impact of two antipatterns, blob and spaghetti code, on program comprehension. *Proceedings of the 15th European Conference on Software Maintenance and Reengineering (CSMR)*. https://doi.org/10.1109/CSMR.2011.24

2. Allamanis, M., Barr, E. T., Bird, C., & Sutton, C. (2014). Learning natural coding conventions. *Proceedings of the 22nd ACM SIGSOFT International Symposium on Foundations of Software Engineering*. https://doi.org/10.1145/2635868.2635883

3. Armstrong, J. (2003). *Making reliable distributed systems in the presence of software errors*. PhD Thesis, Royal Institute of Technology, Stockholm.

4. Boehm, B. (1986). A spiral model of software development and enhancement. *ACM SIGSOFT Software Engineering Notes*, 11(4), 14--24. https://doi.org/10.1145/12944.12948

5. Brooks, F. P. (1986). No silver bullet --- Essence and accident in software engineering. *Proceedings of the IFIP Tenth World Computing Conference*, 1069--1076. Reprinted in *Computer*, 20(4), 10--19 (1987). https://www.cs.unc.edu/techreports/86-020.pdf

6. Buse, R. P. L., & Weimer, W. (2010). Learning a metric for code readability. *IEEE Transactions on Software Engineering*, 36(4), 546--558. https://doi.org/10.1109/TSE.2009.70

7. Cunningham, W. (1992). The WyCash portfolio management system. *OOPSLA '92 Experience Report*. http://c2.com/doc/oopsla92.html

8. Dijkstra, E. W. (1968). The structure of the "THE" multiprogramming system. *Communications of the ACM*, 11(5), 341--346. https://doi.org/10.1145/363095.363143

9. Evans, E. (2003). *Domain-Driven Design: Tackling Complexity in the Heart of Software*. Addison-Wesley.

10. Fowler, M. (2015). Yagni. *bliki*. https://martinfowler.com/bliki/Yagni.html

11. Fucci, D., Erdogmus, H., Turhan, B., Oivo, M., & Juristo, N. (2017). A dissection of the test-driven development process: Does it really matter to test-first or to test-last? *IEEE Transactions on Software Engineering*, 43(7), 597--614. https://doi.org/10.1109/TSE.2016.2616877

12. Gamma, E., Helm, R., Johnson, R., & Vlissides, J. (1994). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley.

13. Hatton, L. (1997). N-version design versus one good version. *IEEE Software*, 14(6), 71--76. https://doi.org/10.1109/52.636672

14. Holub, A. (2003). Why getter and setter methods are evil. *JavaWorld*. https://www.infoworld.com/article/2073723/why-getter-and-setter-methods-are-evil.html

15. Hunt, A., & Thomas, D. (2003). *The Pragmatic Programmer: From Journeyman to Master*. Addison-Wesley.

16. Koppel, J. (2018). Book review: Philosophy of software design. *Path-Sensitive Blog*. https://www.pathsensitive.com/2018/10/book-review-philosophy-of-software.html

17. Kruchten, P., Nord, R. L., & Ozkaya, I. (2012). Technical debt: From metaphor to theory and practice. *IEEE Software*, 29(6), 18--21. https://doi.org/10.1109/MS.2012.167

18. Lebedev, A. (2024). Not my philosophy of software design. *Medium*. https://andremoniy.medium.com/not-my-philosophy-of-software-design-13d9f1e09451

19. Lehman, M. M. (1974). Programs, cities, students --- limits to growth? *Imperial College of Science and Technology, London, Programming Research Group*.

20. Lehman, M. M., & Ramil, J. F. (1996). Laws of software evolution revisited. *Proceedings of the 5th European Workshop on Software Process Technology (EWSPT)*. https://gwern.net/doc/cs/1996-lehman.pdf

21. Martin, R. C. (2008). *Clean Code: A Handbook of Agile Software Craftsmanship*. Prentice Hall.

22. McCabe, T. J. (1976). A complexity measure. *IEEE Transactions on Software Engineering*, SE-2(4), 308--320. https://doi.org/10.1109/TSE.1976.233837

23. Meyer, B. (1988). *Object-Oriented Software Construction*. Prentice Hall.

24. Myers, B. A., & Stylos, J. (2016). Improving API usability. *Communications of the ACM*, 59(6), 62--69. https://doi.org/10.1145/2896587

25. Norvig, P. (1998). Design patterns in dynamic programming. *Presentation at Object World*. https://norvig.com/design-patterns/

26. Oliveira, R., et al. (2023). An empirical study on software understandability and its dependence on code characteristics. *Empirical Software Engineering*, 28(5). https://doi.org/10.1007/s10664-023-10396-7

27. Orosz, G. (2020). A philosophy of software design: My take (and a book review). *The Pragmatic Engineer*. https://blog.pragmaticengineer.com/a-philosophy-of-software-design-review/

28. Orosz, G. (2025). The philosophy of software design --- with John Ousterhout. *The Pragmatic Engineer Newsletter*. https://newsletter.pragmaticengineer.com/p/the-philosophy-of-software-design

29. Ousterhout, J. (2018). *A Philosophy of Software Design* (1st ed.). Yaknyam Press.

30. Ousterhout, J. (2021). *A Philosophy of Software Design* (2nd ed.). Yaknyam Press. https://web.stanford.edu/~ouster/cgi-bin/book.php

31. Ousterhout, J. (2021). A Linux kernel implementation of the Homa transport protocol. *USENIX Annual Technical Conference (ATC '21)*. https://www.usenix.org/conference/atc21/presentation/ousterhout

32. Ousterhout, J. (2025). APoSD vs Clean Code. GitHub. https://github.com/johnousterhout/aposd-vs-clean-code

33. Ousterhout, J. (2018). A philosophy of software design. *Talks at Google*. https://www.youtube.com/watch?v=bmSAYlu0NcY

34. Parnas, D. L. (1972). On the criteria to be used in decomposing systems into modules. *Communications of the ACM*, 15(12), 1053--1058. https://doi.org/10.1145/361598.361623

35. Rafique, Y., & Misic, V. B. (2013). The effects of test-driven development on external quality and productivity: A meta-analysis. *IEEE Transactions on Software Engineering*, 39(6), 835--856. https://doi.org/10.1109/TSE.2012.28

36. Stanford CS 190: Software Design Studio. Course Website. https://web.stanford.edu/~ouster/cs190-winter23/

37. Steidl, D., Hummel, B., & Juergens, E. (2013). Quality analysis of source code comments. *Proceedings of the 21st IEEE International Conference on Program Comprehension (ICPC)*. https://doi.org/10.1109/ICPC.2013.6613836

38. Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257--285. https://doi.org/10.1207/s15516709cog1202_4

39. Valente, M. T., Passos, L., & Hora, A. (2012). Using developers' expertise in software maintenance. *Proceedings of the 28th IEEE International Conference on Software Maintenance (ICSM)*. https://doi.org/10.1109/ICSM.2012.6405291

40. Ward, A. C., Liker, J. K., Cristiano, J. J., & Sobek II, D. K. (1995). The second Toyota paradox: How delaying decisions can make better cars faster. *Sloan Management Review*, 36(3), 43--61.

## Practitioner Resources

**Primary Sources**
- Ousterhout, J. *A Philosophy of Software Design*, 2nd ed. (2021). Available on Amazon. Book website: https://web.stanford.edu/~ouster/cgi-bin/book.php
- Stanford CS 190 course materials: https://web.stanford.edu/~ouster/cs190-winter23/
- Ousterhout's Talks at Google (2018): https://www.youtube.com/watch?v=bmSAYlu0NcY
- SE Radio Episode 520 interview (2022): https://se-radio.net/2022/07/episode-520-john-ousterhout-on-a-philosophy-of-software-design/
- APoSD vs. Clean Code debate transcript: https://github.com/johnousterhout/aposd-vs-clean-code

**Reviews and Commentary**
- Orosz, G. "A Philosophy of Software Design: My Take." *The Pragmatic Engineer*. https://blog.pragmaticengineer.com/a-philosophy-of-software-design-review/
- Orosz, G. "The Philosophy of Software Design --- with John Ousterhout." *The Pragmatic Engineer Newsletter*. https://newsletter.pragmaticengineer.com/p/the-philosophy-of-software-design
- Koppel, J. "Book Review: Philosophy of Software Design." *Path-Sensitive*. https://www.pathsensitive.com/2018/10/book-review-philosophy-of-software.html
- Duck, M. "A Philosophy of Software Design --- John Ousterhout." https://www.mattduck.com/2021-04-a-philosophy-of-software-design.html
- Lebrero, D. "Book Notes: A Philosophy of Software Design." https://danlebrero.com/2021/02/24/philosophy-of-software-design-summary/
- Lebedev, A. "Not My Philosophy of Software Design." *Medium*. https://andremoniy.medium.com/not-my-philosophy-of-software-design-13d9f1e09451

**Foundational Academic Papers**
- Parnas, D. L. (1972). "On the Criteria To Be Used in Decomposing Systems into Modules." https://doi.org/10.1145/361598.361623
- Brooks, F. P. (1986). "No Silver Bullet." https://www.cs.unc.edu/techreports/86-020.pdf
- Lehman, M. M. (1996). "Laws of Software Evolution Revisited." https://gwern.net/doc/cs/1996-lehman.pdf
- Sweller, J. (1988). "Cognitive Load During Problem Solving." https://doi.org/10.1207/s15516709cog1202_4

**Related Design Philosophies**
- Martin, R. C. *Clean Code* (2008). Prentice Hall.
- Evans, E. *Domain-Driven Design* (2003). Addison-Wesley.
- Raymond, E. S. *The Art of Unix Programming* (2003). http://www.catb.org/esr/writings/taoup/
- Gamma et al. *Design Patterns* (1994). Addison-Wesley.
- Beck, K. *Extreme Programming Explained* (2000). Addison-Wesley.
- Fowler, M. "Yagni." https://martinfowler.com/bliki/Yagni.html
