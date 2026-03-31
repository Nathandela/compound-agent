# Specification & Acceptance Criteria Engineering for AI-Driven Development

*2026-03-25*

---

## Abstract

This survey examines the landscape of specification and acceptance criteria engineering as it applies to AI-driven software development, treating this domain as the intersection of classical formal methods, behavioral specification techniques, and the emergent practice of deploying LLM-based generator and evaluator agents that must operate from explicit, machine-checkable contracts. The central claim of the field is that specification quality -- measured along axes of completeness, consistency, unambiguity, and verifiability -- is the primary determinant of whether AI code generation produces correct, maintainable software, and that the traditional informal requirements document is an inadequate substrate for this purpose.

Six principal subtopics are analyzed: (1) formal specification languages -- TLA+, Alloy, Z notation, VDM, and EARS -- as the theoretical baseline for machine-checkable specifications; (2) contract negotiation between AI agents, examining how generator/evaluator pairs establish testable agreements prior to implementation; (3) specification completeness and the problem of detecting gaps, ambiguities, and contradictions before they propagate into defects; (4) behavioral specification via BDD, Gherkin, Specification by Example, and related executable notations; (5) requirements traceability as the discipline of linking spec clauses to tests to implementations to review findings; and (6) property-based specification, which expresses invariants and behavioral contracts rather than example-based assertions.

The evidence base spans classical program verification literature, contemporary LLM integration studies, industrial deployments at Amazon Web Services, and 2024-2025 empirical research on AI-assisted requirements engineering. A persistent finding across all subtopics is that the specification-implementation gap -- the distance between what is written and what is mechanically verifiable -- remains the primary source of failure in AI-driven development. Formal and semi-formal specification techniques narrow this gap substantially but impose adoption costs that remain high. NLP-driven automation is actively shrinking those costs, though hallucination, domain-context deficits, and governance gaps constrain its reliability. Open problems center on specification completeness oracle construction, automatic contract synthesis for multi-agent systems, and scalable traceability under continuous AI-assisted change.

---

## 1. Introduction

The deployment of LLM-based code generation agents has forced a re-examination of an old software engineering question: what constitutes a sufficiently precise specification? The question is not new -- it animated the formal methods community for five decades and gave rise to Z notation, TLA+, Alloy, VDM, and the design-by-contract movement. What is new is the practical urgency. When a human developer misinterprets a requirement, the cost is a code review comment and a fix. When an LLM code generator misinterprets a requirement at scale, across thousands of daily commits, the cost is systemic.

This creates a two-sided pressure on specification engineering. From the generator side, AI systems need specifications precise enough to constrain the generation space -- vague requirements produce plausible-but-wrong implementations, a failure mode extensively documented in the SWE-bench literature and described by Jimenez et al. (2024) as "specification underspecification." From the evaluator side, AI systems that check generated code need specifications precise enough to constitute acceptance tests -- if the specification cannot be mechanically verified, the evaluator can only appeal to heuristics, which are unreliable at the precision required for production software.

This survey does not advocate for any particular technique. It documents the design space with enough precision to allow practitioners and researchers to identify which techniques address which failure modes, and where evidence of effectiveness exists.

### 1.1 Scope and Terminology

**Specification**: A formalized statement of the properties a system must possess, expressed with sufficient precision that satisfaction can be mechanically checked or formally proved. Distinguished from a requirement (a stakeholder expression of need) by this checkability property.

**Acceptance criteria**: The subset of a specification that constitutes the contractual boundary between development and acceptance -- the conditions that, if met, constitute a releasable implementation.

**Contract**: In the design-by-contract tradition, a documented agreement between a caller and a callee consisting of a precondition (what the caller must ensure), a postcondition (what the callee guarantees upon normal return), and optionally a class or module invariant (what must hold at all stable states). Extended to multi-agent systems, a contract is an interface agreement between a generator agent and an evaluator agent.

**Machine-checkable**: A property of a specification such that there exists an automated procedure that, given a specification and a candidate implementation, can determine (possibly within a bounded scope) whether the implementation satisfies the specification without human interpretation.

**Executable specification**: A specification that can be run directly as tests, or from which tests can be automatically derived with no loss of semantic content.

### 1.2 Methodology

This survey integrates four bodies of evidence. First, the classical formal methods literature on TLA+, Alloy, Z, and VDM, drawing on prior work in this research collection. Second, the requirements engineering literature on EARS, BDD, and traceability. Third, 2024-2025 empirical studies on LLM integration in specification and requirements engineering. Fourth, industrial reports, particularly the Amazon AWS formal methods study and the SWE-bench benchmark literature. All claims are attributed; evidence gaps are flagged explicitly.

---

## 2. Foundations

### 2.1 The Specification-Implementation Gap

The fundamental problem in specification engineering is the gap between the artifact that communicates intent (the specification) and the artifact that can be mechanically verified (the implementation). This gap has at least three dimensions:

**Semantic gap**: Natural language specifications contain terms that are systematically ambiguous -- through lexical ambiguity (a word with multiple meanings), referential ambiguity (a pronoun whose antecedent is unclear), structural ambiguity (a phrase whose syntactic tree is underdetermined), and pragmatic ambiguity (where context must resolve meaning but the context is not specified). Classical work by Luisa Mich and others on NL ambiguity in specifications, surveyed in the companion natural language semantics research document in this collection, documents that industrial requirements documents consistently exhibit ambiguity rates of 20-40% per sentence when analyzed with automated tools.

**Completeness gap**: Specifications routinely omit constraints that are "obvious" to domain experts but not to code generation systems. The astropy issue documented in Jimenez et al. (2024) is canonical: a request for file format support omitted the bidirectional serializer-deserializer requirement because domain experts treat this as implicit. LLM generators implemented only the read direction. No test in the specification detected this omission until integration.

**Verifiability gap**: Even specifications that are complete and unambiguous may not be mechanically checkable without additional formalization. An English sentence like "the system shall process all requests within 500 milliseconds under normal load" is complete and unambiguous but requires a load definition, a measurement protocol, and an execution environment before it can be turned into a test. The IEEE 830 standard's requirement that requirements be "verifiable" acknowledges this gap without providing a constructive procedure for closing it.

### 2.2 Theoretical Foundations

The theoretical apparatus for machine-checkable specifications draws from three traditions.

**Predicate transformer semantics** (Dijkstra, 1975) frames program correctness as a relationship between preconditions and postconditions: `wp(S, R)` is the weakest precondition such that statement `S` terminates in a state satisfying postcondition `R`. This formalism underlies design-by-contract, JML, and Spec#, and provides the logical basis for why preconditions and postconditions are the minimal necessary components of a machine-checkable specification.

**Temporal logic of actions** (Lamport, 1994) extends this to reactive systems by treating specifications as predicates over infinite execution sequences -- behaviors -- rather than single input-output pairs. Safety properties (nothing bad happens) and liveness properties (something good eventually happens) are expressed as temporal formulas, enabling specification of distributed protocols where the relevant properties concern sequences of states rather than individual transitions.

**Relational model finding** (Jackson, 2006) takes a different approach: specifications are expressed as relational constraints over bounded scopes, and satisfaction is checked by translating to SAT. This provides complete automation within a finite scope at the cost of the small-scope hypothesis -- the assumption that counterexamples, if they exist, exist in small instances.

These three traditions define the extremes of the expressiveness-automation trade-off that characterizes the entire field. Predicate transformers give maximal expressiveness with manual proof burden. Temporal logic model checking gives automation with state-space constraints. Bounded relational model finding gives full automation with scope limitations.

### 2.3 The AI-Driven Development Context

The deployment of AI code generation agents adds a fourth dimension to this classical landscape: **the specification must serve as a communication protocol between the generator and the evaluator**, not merely a document for human readers. This requirement is qualitatively different from classical specification use.

A human developer reading a Z specification can leverage domain knowledge, ask clarifying questions, and make contextually appropriate interpretive choices. An LLM generator cannot reliably perform any of these operations. It processes the specification as a token sequence and generates code that is plausible conditioned on that sequence. If the specification is ambiguous, the generator will not detect the ambiguity -- it will make an implicit choice, silently. If the specification is incomplete, the generator will complete it -- with whatever the training distribution suggests is typical, which may or may not match intent.

An LLM evaluator faces a symmetric problem. Given a specification and a candidate implementation, it must determine whether the implementation satisfies the specification. If the specification is not machine-checkable, the evaluator can only reason probabilistically about satisfaction, introducing a second source of error layered on the generator's first. The compound failure probability is the product of generator misinterpretation rate and evaluator false-positive rate, and this product grows as specification quality degrades.

The practical implication is that specification quality in AI-driven development is not merely an engineering best practice -- it is an architectural invariant of the system. Degraded specification quality degrades the entire generator-evaluator loop.

---

## 3. Taxonomy of Approaches

The approaches surveyed in this document are organized along two dimensions: **formalism level** (from natural language patterns through behavioral specifications to formal logics) and **primary function** (from gap detection through contract definition to traceability management). The taxonomy below organizes the analysis sections.

| ID  | Approach family                          | Formalism level         | Primary function                  | Analysis section |
|-----|------------------------------------------|-------------------------|-----------------------------------|-----------------|
| F1  | Formal specification languages (TLA+, Alloy, Z, VDM) | Formal logic / set theory | Machine-checkable behavioral contracts | 4.1 |
| F2  | EARS and controlled natural language     | Semi-formal template    | Ambiguity reduction, machine-parsable structure | 4.2 |
| C1  | Design by contract (DbC) and JML-style annotations | Code-integrated assertions | Pre/postcondition contracts for generator/evaluator | 4.3 |
| C2  | Multi-agent contract negotiation         | Protocol specification  | Generator-evaluator agreement before implementation | 4.4 |
| B1  | BDD and Gherkin / Specification by Example | Natural language + structured | Behavioral contracts as executable scenarios | 4.5 |
| B2  | Property-based specification             | Predicate logic / generators | Invariant and property contracts | 4.6 |
| T1  | Requirements traceability                | Metadata / link graphs  | Spec-to-test-to-implementation coverage | 4.7 |
| D1  | Automated gap and ambiguity detection    | NLP / formal analysis   | Specification completeness verification | 4.8 |

Each leaf node in this taxonomy corresponds to a dedicated subsection in §4, and each subsection maps to exactly one taxonomy entry.

---

## 4. Analysis

### 4.1 Formal Specification Languages (F1)

#### Theory and Mechanism

Formal specification languages provide the strongest form of machine-checkable specification by expressing system properties in mathematically rigorous notations that support automated analysis. The four major languages surveyed in prior work in this collection (TLA+, Alloy, Z, VDM) occupy distinct positions in the expressiveness-automation space.

**TLA+** (Temporal Logic of Actions) treats a specification as a single temporal formula interpreted over infinite execution sequences (behaviors). The key construct is the specification formula `Spec = Init /\ [][Next]_vars /\ Fairness`, where `Init` constrains initial states, `Next` constrains state transitions, and `Fairness` constrains liveness. Properties are separate temporal formulas checked against this specification. TLC, the TLA+ model checker, explores the reachable state space exhaustively (within memory bounds). Apalache applies symbolic methods using SMT solving to mitigate state explosion. TLAPS supports interactive hierarchical proofs. [Merz, 2008; Lamport, 1994; https://members.loria.fr/SMerz/papers/tla+logic.pdf]

**Alloy** uses first-order relational logic with SAT-based bounded analysis. Every value in Alloy is a relation; specifications are constraints over relational state spaces. The Alloy Analyzer translates constraints to Boolean form via the Kodkod intermediate representation and invokes an off-the-shelf SAT solver. This provides complete automation within user-specified finite scopes (the "small scope hypothesis"). Extensions Alloy* and AlloyMax support higher-order quantification and optimization objectives respectively. [Jackson, 2006; https://dspace.mit.edu/bitstream/handle/1721.1/116144/Alloy.pdf]

**Z notation** expresses specifications through schemas -- constructs that package typed variable declarations with predicates -- over an underlying typed set theory. State schemas define state spaces and invariants; operation schemas relate before and after states using primed variables. The schema calculus supports modular composition. Unlike TLA+ and Alloy, Z does not prioritize automated analysis; verification relies on theorem proving and refinement reasoning. Tool support is more limited than for the other languages in this family. [Bowen, 1996; https://people.eecs.ku.edu/~saiedian/812/Lectures/Z/Z-Books/Bowen-formal-specs-Z.pdf]

**VDM** (Vienna Development Method) shares Z's model-based approach but uses keyword-based syntax and places greater emphasis on stepwise refinement. VDM originated from IBM Vienna laboratory work on formally defining PL/I semantics. Its emphasis on data refinement -- the systematic replacement of abstract data types with concrete representations while preserving established properties -- makes it particularly suited to specifications that must evolve toward implementation. Tool support has historically been stronger for VDM than for Z. [Jones, 1990; https://inpressco.com/wp-content/uploads/2015/06/Paper1082086-2091.pdf]

#### Application to AI-Driven Development

The practical application of formal specification languages to AI-driven development is documented most concretely in the Amazon Web Services report on TLA+ use in distributed systems design [Newcombe et al., 2015; https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf]. AWS engineers used TLA+ to specify and model-check distributed protocols including components of DynamoDB, S3, and EBS. The report documents that TLA+ specifications found subtle bugs -- race conditions and protocol violations that conventional testing had not exposed -- in widely-used systems prior to deployment. The key mechanism was that TLA+ specifications forced engineers to make implicit assumptions explicit and checkable: what are the invariants? What are the safety properties? What ordering guarantees does the protocol provide?

For AI-driven development, this experience suggests a concrete specification engineering practice: before an LLM generator implements a distributed protocol, a TLA+ specification of the protocol's safety and liveness properties should exist and should have been model-checked. The generator then implements to that specification, and the evaluator checks against it. The specification serves simultaneously as a precise description of intent, a machine-checkable contract, and an executable oracle for the evaluator.

The SysMoBench benchmark [arxiv:2509.23130] evaluates LLM capability to generate TLA+ specifications from natural language descriptions of real-world distributed systems including Raft and ZooKeeper consensus protocols. The benchmark finds that formal system modeling remains "a highly challenging expert task" and that current LLMs cannot reliably produce correct TLA+ specifications for non-trivial systems. This finding bounds the scope of automated specification generation: formal specifications can serve as machine-checkable contracts for AI-driven development, but as of 2025, their construction is largely a human engineering activity.

The multi-agent LLM repair study by Nargiz et al. (2024) [https://arxiv.org/html/2404.11050v2] provides a complementary data point: GPT-4o with a dual-agent architecture (Repair Agent + Instructor Agent with Alloy Analyzer feedback) achieved a 73.4% repair rate on defective Alloy specifications -- substantially outperforming traditional tools like BeAFix (63.2%) and ARepair (10.5%). This demonstrates that while LLMs cannot yet generate correct formal specifications from scratch, they can repair defective ones when given structured feedback from formal analysis tools. The practical implication is a human-AI workflow: a human specifies the skeleton; an LLM repairs inconsistencies identified by the analyzer.

#### Strengths and Limitations

Formal specification languages provide the strongest available guarantees about specification precision and machine-checkability. The AWS experience demonstrates that they find bugs invisible to testing. Their primary limitation is adoption cost: mastering TLA+, Alloy, or Z requires substantial investment, and industrial evidence suggests that adoption remains confined to organizations with either formal methods culture or extremely high cost-of-failure (safety-critical systems, distributed infrastructure). The SysMoBench findings reinforce this: even state-of-the-art LLMs cannot fully automate formal specification construction for non-trivial systems, meaning the adoption cost barrier does not dissolve with AI assistance.

---

### 4.2 EARS and Controlled Natural Language (F2)

#### Theory and Mechanism

The Easy Approach to Requirements Syntax (EARS) [Mavin et al., 2009; https://ieeexplore.ieee.org/document/5328509/] is a semi-formal controlled natural language that constrains requirement statements into one of five structural patterns:

- **Ubiquitous**: "The [system] shall [system response]."
- **Event-driven**: "WHEN [trigger], the [system] shall [system response]."
- **Unwanted behavior**: "IF [condition], THEN the [system] shall [system response]."
- **State-driven**: "WHILE [state], the [system] shall [system response]."
- **Optional feature**: "WHERE [feature], the [system] shall [system response]."

These patterns can be combined. The mechanism is structural: by forcing explicit separation of conditions, triggers, states, and responses, EARS eliminates the class of ambiguities that arise from unstructured English, where the scope of conditions and the identity of the actor are routinely underdetermined.

EARS was designed and evaluated in the context of extracting requirements from an aircraft engine airworthiness regulation. The original study reported reductions in ambiguity, vagueness, omissions, and duplication compared to unstructured natural language requirements from the same source material. [https://alistairmavin.com/ears/]

#### Machine-Checkability Properties

EARS requirements are not formally machine-checkable in the same sense as TLA+ specifications, but they have structural properties that support automated processing. The templated syntax can be parsed mechanically to extract: (1) triggering conditions (event or state), (2) guard conditions (IF clauses), (3) system responses. This structured extraction enables automated test case generation from EARS requirements -- given a When/Then pattern, a test harness can exercise the trigger and check the response.

A 2025 study in SN Computer Science [https://link.springer.com/article/10.1007/s42979-025-03843-3] empirically investigated EARS notation for both requirements engineering and test specification in PLC (Programmable Logic Controller) systems, finding that EARS requirements provide a structurally consistent basis for specification-based test generation in safety-critical industrial control applications.

The SENSE framework extends EARS with semantics-based validation: requirements are classified by type, appropriate patterns are selected, and validity checks are applied to detect structural inconsistencies. This moves EARS from a stylistic convention toward a semi-formal specification language with automated consistency checking. [SENSE project documentation]

#### Application to AI-Driven Development

EARS occupies a practical sweet spot for AI-driven development. It is substantially more precise than free-form English -- structured enough to parse and process mechanically -- while being far less costly to learn and apply than TLA+, Alloy, or Z. For LLM generators, EARS requirements provide clearer constraints than prose requirements because the template structure limits the interpretation space: "WHEN [trigger]" tells the generator that there is an event to detect; "the system shall [response]" tells it there is an action to implement.

For LLM evaluators, EARS requirements provide a structured basis for acceptance test generation. The five-pattern taxonomy maps onto a test generation procedure: identify the guard condition, trigger the event, verify the response. This is more reliable than asking an evaluator to infer test cases from unstructured prose.

#### Strengths and Limitations

EARS reduces the most common linguistic ambiguities in requirements without requiring formal methods expertise, making it broadly adoptable. Its primary limitation is expressiveness: EARS cannot express quantitative performance requirements, temporal ordering constraints, or complex invariants without extension. It also does not address completeness -- EARS requirements can be individually well-formed while the set is incomplete, with critical behaviors unspecified. Industry adoption at Intel and aerospace organizations suggests that practical uptake is achievable, though comparative controlled studies across domains remain limited.

---

### 4.3 Design by Contract and Code-Level Specification (C1)

#### Theory and Mechanism

Design by Contract (DbC), introduced by Meyer (1992) in the context of the Eiffel language, treats every software component as offering a contract consisting of:

- **Precondition** (`require`): The condition the caller must establish before invoking the routine.
- **Postcondition** (`ensure`): The condition the routine guarantees upon normal return.
- **Invariant** (`invariant`): The condition that must hold in all stable states of the object.

The causal mechanism is the responsibility assignment: when preconditions are violated, the fault lies with the caller; when postconditions or invariants are violated, the fault lies with the callee. This assignment makes contracts executable in two senses: violations manifest as runtime assertion failures, and they constitute proof obligations in static verification systems. [Meyer, 1992; https://kth.se/social/files/59526bfb56be5b4f17000807/meyer-92-contracts.pdf]

The Java Modeling Language (JML) extends this concept to Java through annotation-based contracts that can be checked either at runtime (via bytecode instrumentation) or statically (via proof obligations generated for tools like KeY and OpenJML). JML adds frame conditions (what the routine may modify), model fields (abstract state), and specification cases (case-split postconditions for exceptional behavior). [Leavens et al., 2006; https://www.cse.chalmers.se/~ahrendt/papers/JML16chapter.pdf]

#### AI-Generated Code Contracts

Greiner et al. (2024) at the University of Bern investigated whether generative AI could automatically generate code contracts (preconditions, postconditions, and class invariants) from source code and documentation [https://scg.unibe.ch/archive/papers/Grei24a-CodeContracts.pdf]. The study found that LLMs generate formally valid contracts more often than available training set contracts, and that GPT-4 family models significantly outperform earlier models. The primary limitation is that LLMs struggle with complex logical specifications requiring deep code semantic understanding, and that completeness and soundness are not guaranteed -- generated contracts may be syntactically valid but semantically vacuous (trivially true preconditions, over-constrained postconditions).

The Lemur system [published 2024] uses GPT-4 to generate candidate loop invariants for bounded model checking, treating LLM-generated invariants as assumptions until formally proved. Lemur outperforms existing ML-based invariant synthesizers on standard benchmarks. This represents a hybrid human-AI specification workflow: LLM proposes candidates; formal tool verifies them.

#### Application to AI-Driven Development

For AI-driven development, DbC-style contracts serve as the most operationally grounded form of specification. A generator agent that must implement a function has concrete, executable targets: make the postcondition hold whenever the precondition holds. An evaluator agent that must check a generated implementation has a concrete oracle: does the postcondition hold after execution from valid precondition states? The oracle problem -- the question of how to determine whether an output is correct -- is solved (for the contractually specified behavior) by the postcondition.

The practical challenge is that writing complete and correct contracts is itself a specification engineering task. A postcondition that says `result != null` is checkable but underspecified if the actual requirement is about the structure and content of the result. The evaluator will pass implementations that return an empty result object. This is not a failure of the DbC framework -- it is a failure to write a complete postcondition -- but it is a systematic risk in AI-assisted contract generation.

#### Strengths and Limitations

DbC provides the most direct path from specification to machine-checkable contract, scales well to method and class granularity, and integrates with existing IDEs and test infrastructure. Its limitations include the annotation burden for complex behaviors, performance overhead of runtime checking, and the risk of incomplete contracts (which pass incorrect implementations silently). The empirical literature on contracts in practice ["Contracts in Practice"] documents that preconditions are written more consistently than postconditions and invariants, suggesting that generator agents receive clearer guidance about what they must receive than about what they must produce.

---

### 4.4 Multi-Agent Contract Negotiation (C2)

#### Theory and Mechanism

The problem of contract negotiation between AI agents is a novel specification engineering problem without a fully established theoretical framework. It can be understood as an extension of classical assume-guarantee (A/G) contract theory [Benveniste et al., 2018; https://arxiv.org/abs/1712.10233] to the multi-agent setting, where agents take the roles of Generator (a code synthesis agent) and Evaluator (an acceptance checking agent), and where the contract governs what the Evaluator commits to accept and what the Generator commits to produce.

The classical A/G framework defines a contract `C = (A, G)` where `A` is the assumption on the environment and `G` is the guarantee on the component's behavior. For a generator-evaluator pair, the contract might be:
- **Assumption (A)**: The generator receives a structured specification in format F, with all required fields populated.
- **Guarantee (G)**: The evaluator will accept any implementation that satisfies the specification's postconditions under the specification's preconditions, within the specified performance bounds.

Without explicit contracts between generator and evaluator, each makes implicit assumptions about what the other will produce or accept. These implicit assumptions are a primary source of AI development system failures: the generator assumes the evaluator will be lenient about edge cases; the evaluator assumes the generator will have handled them.

#### Contemporary Practice

The agent systems survey by Peng et al. (2025) [https://arxiv.org/html/2601.01743v1] describes multi-agent AI systems where role separation (planner, executor, reviewer) is implemented through "explicit handoff artifacts" and typed tool schemas. The survey documents that typed tool schemas -- structured interfaces specifying input types, output types, and constraint sets -- reduce brittleness by "turning open-ended text into typed actions." This is the functional equivalent of a contract: the schema defines what the downstream agent can assume about the upstream agent's output.

The SWE-Skills-Bench design [https://arxiv.org/html/2603.15401] provides a concrete example of acceptance criteria engineering for AI agents: acceptance criteria are written as structured requirement documents, then translated by a "professional test engineer" LLM prompt into executable pytest test files. This establishes complete traceability from acceptance criteria to test oracle. The key design choice is that the translation from criteria to tests happens before the generator sees the task, ensuring the evaluator oracle is not contaminated by knowledge of how the generator will approach the implementation.

The Jimenez et al. challenges paper [https://arxiv.org/html/2503.22625] documents the critical limitation in current practice: "AI systems lack mechanisms to recognize when specifications are inadequate" and "rarely request disambiguation before proceeding." Unlike human developers who ask clarifying questions about scope and edge cases, LLM generators make implicit interpretive choices silently. A contract negotiation protocol would surface these ambiguities before generation begins.

#### Specification Completeness as a Prerequisite for Contract Negotiation

Before generator and evaluator can negotiate a contract, the specification must be complete enough to be the subject of negotiation. A generator that receives an underspecified task cannot propose contract terms because the specification does not bound what terms are relevant. Several approaches exist for eliciting complete specifications before generation:

1. **Scenario expansion**: The generator agent is asked, before coding, to enumerate the scenarios it believes the specification covers and the scenarios it believes are ambiguous or omitted. The evaluator then confirms or corrects this enumeration. This operationalizes the "dead spec" problem -- the risk that a specification is syntactically complete but semantically empty on the dimensions that matter.

2. **Precondition/postcondition elicitation**: The generator is asked to state the preconditions and postconditions it intends to implement. If these do not match the evaluator's expectations, the mismatch is surfaced before the implementation is written.

3. **Example instantiation**: The BDD approach (see §4.5) instantiates this as concrete Given-When-Then examples. The generator proposes scenarios; the evaluator accepts or amends them. This is the most broadly practiced form of pre-implementation contract negotiation in contemporary software development.

#### Strengths and Limitations

Multi-agent contract negotiation is the least mature of the approaches surveyed here, with the fewest established tools and the thinnest empirical evidence. The theoretical framework from A/G contract theory is well-developed but has not been operationalized for LLM agent pairs. The practical evidence from multi-agent development systems (SWE-bench, agent harness designs) is encouraging but focused on task execution rather than pre-implementation contract establishment. The open problem is whether LLM agents can reliably identify specification ambiguities and negotiate resolutions without human intervention, and the 2024-2025 literature suggests this remains out of reach.

---

### 4.5 Behavioral Specification: BDD, Gherkin, and Specification by Example (B1)

#### Theory and Mechanism

Behavior-Driven Development (BDD) [North, 2006] is a specification-first methodology in which desired system behavior is expressed as structured natural-language scenarios before implementation begins. The canonical notation is Gherkin, which structures scenarios as:

```
Feature: [feature name]
  Scenario: [scenario name]
    Given [initial context]
    When [event or action]
    Then [expected outcome]
    And [additional expected outcomes...]
```

Gherkin scenarios are simultaneously: requirements documents (they specify what the system must do), acceptance tests (they define pass/fail criteria), and living documentation (they are kept in sync with the implementation by test execution). The three-audience design is intentional: scenarios are intended to be readable by business stakeholders, developers, and testers alike, enabling a shared language for specification. [Smart, 2014; https://serenity-bdd.github.io/docs/reporting/living_documentation]

Specification by Example (SbE) [Adzic, 2011] generalizes this into a process pattern: teams derive scope from goals, specify collaboratively using concrete examples, refine examples into a specification, automate validation against the live system, and maintain the resulting document as "living documentation." SbE treats examples not as tests but as the canonical form of the specification: the examples are the spec.

#### LLM Integration with BDD

The 2024-2025 literature documents active integration of LLMs into the BDD specification workflow at both the scenario generation and test execution stages.

AutoUAT [arxiv:2504.07244] is an LLM-powered tool that generates Gherkin acceptance test scenarios directly from user story titles and descriptions. The architecture separates scenario generation (structured Gherkin) from test script generation (executable Cypress code), maintaining the distinction between behavioral specification and implementation. An industrial case study reports effective support for ATDD (Acceptance Test-Driven Development) workflows, with LLM-generated scenarios used to clarify requirements and guide implementation.

A comparative study [scitepress.org, 2025] evaluating GPT-3.5, GPT-4, Llama-2-13B, and PaLM-2 for generating syntactically correct Gherkin scenarios from user stories found that GPT models produce syntax errors in only 1 of 50 generated feature files. This is a low baseline standard (syntactic correctness), but it demonstrates that LLM-generated Gherkin is viable as a specification artifact for toolchain consumption.

The most ambitious integration is agentic BDD execution [ACM, 2024; https://dl.acm.org/doi/10.1145/3678719.3685692]: multi-agent systems using the AutoGen framework can autonomously execute Gherkin test specifications by exploring the system under test, generating executable test code dynamically, and evaluating results. This closes the loop from natural language specification to automated acceptance testing without human intervention at the execution stage.

LLM-based BDD for hardware design [arxiv:2512.17814] demonstrates the approach in a non-web domain: the system processes textual hardware specifications using ChatGPT-5 to produce both synthesizable Verilog implementations and comprehensive BDD scenario sets. The scenarios test both functional outcomes and status signals, with boundary conditions (overflows, edge cases) generated automatically from the specification context. The evaluation reports that generated Verilog required "no manual debugging," though the claim rests on simulation correctness rather than formal verification.

#### The LLM-as-Judge Evaluator Pattern

The LLM-as-a-Judge pattern [arxiv:2512.01232] extends BDD evaluation by using LLMs to assess test coverage of specifications rather than simply executing tests. Given a specification (in any form) and a test suite, an LLM judge evaluates whether the test suite adequately exercises the specified behavior. This is particularly relevant for acceptance criteria where the relevant behaviors are complex, contextual, or non-deterministic -- cases where mechanical test execution may pass while the behavioral intent is violated.

#### Serenity BDD and Living Documentation

Serenity BDD [Smart, 2014; https://serenity-bdd.github.io/docs/reporting/living_documentation] is the most complete industrial framework for the living documentation vision. It executes Gherkin scenarios as acceptance tests and generates rich HTML reports that display: which scenarios pass and fail, what features have been tested, what the test narrative says about system behavior, and what gaps exist in scenario coverage. This transforms the specification document from a static artifact into a continuously maintained contract between the specification and the implementation -- the "living" in living documentation.

#### Strengths and Limitations

BDD and Gherkin occupy the most accessible point of the specification landscape: they require no formal methods expertise, produce human-readable artifacts, and integrate with mainstream test automation infrastructure. Their limitations are precision limits: Gherkin scenarios describe behaviors by example rather than by universal quantification over all inputs. A scenario that says "Given a user with a valid password, When they log in, Then they see the dashboard" does not specify what happens when the password is incorrect, when the account is locked, or when the system is under load. These gaps must be explicitly covered by additional scenarios, and there is no mechanical procedure for determining when the scenario set is complete -- the coverage question requires human judgment or formal supplement. Evidence from the BDD literature consistently documents that the primary failure mode is incomplete scenario sets, not imprecise individual scenarios.

---

### 4.6 Property-Based Specification (B2)

#### Theory and Mechanism

Property-based specification inverts the example-based paradigm: rather than asserting `f(2) = 4`, it asserts `forall x: f(x) = x * 2`. A property-based testing engine (generator) then samples the input space, checking whether the property holds, and upon finding a counterexample, applies shrinking to find the minimal failing input.

QuickCheck [Claessen and Hughes, 2000; ICFP 2000] introduced this paradigm for Haskell. The key abstractions are:

- **Property**: A universally quantified predicate `P(x)` expected to hold for all values produced by a generator.
- **Generator (Arbitrary)**: A parameterized probability distribution over a domain, biased toward boundary values.
- **Shrinking**: A procedure that, given a failing input, produces candidate "smaller" inputs, recursively descending to the minimal counterexample.

The connection to specification engineering is direct: a property is a specification. The property `forall xs: sort(sort(xs)) == sort(xs)` (idempotency of sort) specifies a behavioral contract of the sort function. The property `forall xs: length(sort(xs)) == length(xs)` (length preservation) specifies another. A complete property-based specification of sort is a set of properties that jointly characterize all correct sort implementations and exclude all incorrect ones -- the specification completeness question in property-based form.

The property-based testing survey in this research collection (property-testing/property-based-testing-and-invariants.md) provides full coverage of the QuickCheck heritage, stateful model-based testing, coverage-guided property testing, and the Daikon dynamic invariant discovery system. This section focuses on property-based specification as a contract mechanism for AI-driven development.

#### PropertyGPT: LLM-Driven Formal Property Generation

PropertyGPT [Liu et al., 2024; https://arxiv.org/html/2405.02580v1] is a system for LLM-driven formal property generation for smart contract verification. The architecture uses retrieval-augmented generation: the LLM retrieves human-written properties from a reference library and uses them as in-context examples for generating new properties for unseen contracts. The properties are expressed as Hoare logic pre/postconditions and temporal logic formulas, making them formally verifiable by the target smart contract analyzer.

The key innovation is that PropertyGPT treats property generation as a retrieval-plus-adaptation task rather than synthesis-from-scratch: given a new contract, find the most similar contracts in the reference library, take their verified properties, and adapt them to the new context. This substantially reduces the hallucination risk relative to unconstrained property generation, because the generated properties are grounded in verified reference examples.

#### SmartINV: Multimodal Invariant Inference

SmartINV [Columbia/IEEE S&P 2024; https://www.cs.columbia.edu/~junfeng/papers/smartinv-sp24.pdf] focuses on invariant inference for smart contracts using multimodal learning (combining code structure, transaction history, and natural language documentation). Invariants are expressed as logical predicates that must hold at specified program points. The system demonstrates that combining multiple information modalities substantially improves invariant quality over code-only or documentation-only approaches.

#### Property-Based Testing for AI Agent Simulations

Behavior specification in multi-agent simulation systems uses property-based testing to verify emergent properties of agent interactions [Springer, 2020; https://link.springer.com/article/10.1007/s10458-020-09473-8]. The specification challenge in this domain is that individual agent behaviors can be specified precisely (pre/postconditions on individual agent actions) while system-level emergent behavior cannot be specified from components alone. Property-based specification at the system level addresses this by expressing invariants over simulation traces: `forall traces: the_invariant_holds_at_every_step`.

#### Application to AI-Driven Development

For AI-driven development, property-based specification offers a middle ground between example-based BDD (low precision) and full formal specification (high adoption cost). A generator agent that receives a set of properties has clear, mechanically verifiable targets. An evaluator agent that receives the same properties has an oracle. The coverage question -- are these properties sufficient to characterize the intended behavior? -- remains open, but the evaluation of any individual property is mechanical.

The practical challenge is property authoring. Writing complete, non-trivial properties that capture behavioral intent without being vacuously true requires substantial expertise and domain knowledge. The LLM-assisted property generation literature (PropertyGPT, Lemur, automated code contracts) demonstrates that LLMs can assist with this task, but that human expert review of generated properties remains essential.

#### Strengths and Limitations

Property-based specification provides stronger semantic guarantees than example-based BDD (because it quantifies universally over inputs) while remaining more readable and writable than full formal logic. The QuickCheck-derived tooling ecosystem is mature across dozens of programming languages. Primary limitations include: the property completeness problem (how many properties are enough?), the oracle problem for stateful systems (properties over sequences of states are harder to write and verify than point-in-time assertions), and the generator completeness problem (the testing engine may not generate the inputs that violate a property, especially if they require complex preconditions to construct).

---

### 4.7 Requirements Traceability (T1)

#### Theory and Mechanism

Requirements traceability is the ability to "describe and follow the life of a requirement from origin through specification, design, implementation, and use, in both forward and backward directions" [Ramesh and Jarke, 2001; formalized in ISO/IEC/IEEE 29148]. A trace link connects a source artifact (requirement) to a target artifact (design element, test case, implementation unit, or review finding). A complete traceability matrix ensures that every requirement is covered by at least one test, and every test can be attributed to at least one requirement.

The operational value of complete traceability for AI-driven development is threefold:

1. **Coverage verification**: A traceability matrix makes visible which requirements lack test coverage and which tests lack requirement attribution, enabling identification of specification gaps before implementation.
2. **Impact analysis**: When a requirement changes, the trace graph identifies which tests, design elements, and implementations are affected, enabling targeted re-verification.
3. **Audit trails**: For regulated domains, traceability provides the documentation chain from requirement to implementation to verification that compliance audits require.

#### Modern AI-Enhanced Traceability

The 2024-2025 traceability tooling landscape has undergone substantial AI augmentation. Key developments include:

**Automated link creation**: AI systems analyze requirement text and implementation artifacts and propose trace links based on semantic similarity. This addresses the primary adoption barrier for traceability: the manual cost of creating and maintaining links. Accenture reported a 70% reduction in change impact assessment time when AI-assisted traceability was deployed. [https://aqua-cloud.io/ai-requirement-traceability/]

**CI/CD-embedded traceability**: Modern CI/CD pipelines (Jenkins, GitLab CI/CD, Azure DevOps) embed traceability functions that link requirements to code commits and automated test executions. Each commit can be tagged with the requirement IDs it addresses; the pipeline verifies that all tagged requirements have passing tests. This makes traceability a continuous invariant of the development process rather than a documentation artifact produced at milestones.

**Modern Requirements4DevOps**: The ModernRequirements tool integrates with Azure DevOps and incorporates AI via Copilot4DevOps to extend traceability into Agile sprint workflows. This addresses the historically documented tension between heavyweight traceability practices and agile development pace.

The systematic literature review on generative AI in requirements engineering [Arora et al., 2024; https://arxiv.org/html/2409.06741v1] identified requirements management -- which includes traceability maintenance -- as the most critically underresearched phase of the RE lifecycle. Only 3.7% of reviewed studies addressed requirements management, compared to 51.9% addressing elicitation. This gap is particularly acute for AI-driven development, where requirements can be generated, modified, and traced at high velocity.

#### Tool Landscape

Historical industrial tools for requirements management include IBM DOORS (now DOORS Next) and Siemens Polarion, which provide mature traceability features but have high configuration and licensing costs. Modern alternatives include Jama Connect, Visure Requirements, and the CI/CD-embedded approaches noted above. For open-source and developer-centric contexts, tools like TestRail maintain requirements-to-test traceability without the systems engineering overhead of DOORS.

#### Strengths and Limitations

Traceability is the only approach in this taxonomy that addresses the requirements lifecycle rather than a point-in-time specification artifact. Complete traceability means that a change anywhere in the requirements-design-implementation-test chain surfaces its downstream implications automatically, enabling continuous correctness of the specification contract. The primary limitations are adoption cost (particularly for complex bidirectional traceability) and the difficulty of automated link correctness: AI-proposed trace links can have high false positive rates when requirement and implementation text are semantically similar but not causally linked.

---

### 4.8 Automated Gap and Ambiguity Detection (D1)

#### Theory and Mechanism

Automated gap and ambiguity detection addresses the specification completeness problem directly: given a requirements document, what is missing? What is ambiguous? What is contradictory? Three families of techniques exist.

**NLP-based ambiguity detection** applies linguistic analysis to requirement statements to identify patterns associated with ambiguity. Tools like QUARS and QVscribe score requirements against quality metrics (ambiguity, vagueness, weak phrasing, passive voice, incomplete conditions). SpanBERT-based approaches [Talha et al., 2025; https://onlinelibrary.wiley.com/doi/10.1002/smr.70041] use fine-tuned BERT models for named entity recognition and span classification to detect ambiguous references and modifier attachment ambiguities in requirements documents.

**Formal consistency checking** translates requirements into a formal logic representation and applies automated reasoning to detect contradictions. The ALICE system (Automated Logic for Identifying Contradictions in Engineering) [Springer, 2024; https://link.springer.com/article/10.1007/s10515-024-00452-x] combines formal logic with LLMs to identify and classify contradictions in controlled-natural-language requirements. The ARSENAL framework uses dependency parsing to detect semantic dependencies and converts them into a tabular intermediate representation for formal consistency checking, applicable to automotive requirements.

**LLM-based quality assessment** applies LLMs directly to requirements quality evaluation under ISO 29148 characteristics. The study by Tjong et al. [MDU, 2024; https://www.ipr.mdu.se/pdf_publications/7221.pdf] demonstrates that LLMs (Llama 2, 70B) can provide binary evaluations per quality characteristic (completeness, singularity, verifiability) with "combined assessment workflows" (independent evaluation followed by "bound" evaluation using a second LLM pass) that achieve stronger reviewer agreement than single-pass evaluation.

#### LLM-Based Requirement Repair

The automated repair paper [arxiv:2505.07270] addresses the downstream of ambiguity detection: once ambiguous requirements are identified, can they be automatically repaired? The study evaluates LLM-based requirement repair, finding that GPT-4 outperforms smaller models for repair tasks and that repair quality degrades for requirements with complex structural ambiguity. This establishes a two-stage pipeline: detect ambiguities with NLP tools; repair them with LLM assistance under human review.

#### The Systematic Literature Review Picture

The 2024 SLR on generative AI in requirements engineering [Arora et al.; https://arxiv.org/html/2409.06741v1] identifies the following documented AI capabilities in specification quality:
- Hallucinations remain a primary risk, with LLM-generated requirements or analyses requiring human verification
- GPT-4 outperforms earlier models for inconsistency detection and repair tasks
- Only formal methods integration provides rigorous completeness guarantees; NLP-based detection remains heuristic
- "Ensuring the accuracy and reliability of GenAI-generated requirements" is identified as the critical unresolved challenge

The industry survey by Rashid et al. [arxiv:2511.01324] confirms: 58.2% of practitioners use AI in RE processes, with gap detection documented as a use case, but "AI models lack deep industry expertise, domain-specific knowledge, regulatory knowledge" essential for reliable gap detection in specialized domains.

#### Strengths and Limitations

Automated gap and ambiguity detection provides the only scalable approach to the specification completeness problem -- manual review does not scale to large requirement sets, and formal completeness checking (in the sense of proving a specification complete) is undecidable in general. The primary limitation is that NLP-based detection is necessarily heuristic: it flags patterns associated with ambiguity but cannot determine whether ambiguity exists in the semantic domain-specific sense that matters for a given application. Formal consistency checking provides stronger guarantees but requires requirements to be expressed in formal or controlled natural language, which is itself an adoption challenge. The combination of EARS-formatted requirements with ALICE-style consistency checking represents the current best practice for automated quality assurance.

---

## 5. Comparative Synthesis

The following table synthesizes the surveyed approaches along five dimensions: specification precision (how tightly the spec constrains the implementation space), machine-checkability (how readily the spec serves as an automated oracle), adoption cost (the expertise and tooling investment required), AI-driver suitability (how well the spec format serves as input to LLM generator agents), and AI-evaluator suitability (how well the spec format serves as an oracle for LLM evaluator agents).

| Approach | Specification Precision | Machine-Checkability | Adoption Cost | AI-Generator Suitability | AI-Evaluator Suitability |
|----------|------------------------|---------------------|---------------|--------------------------|--------------------------|
| **TLA+** | Very high (temporal + set-theoretic) | High (TLC, Apalache for finite systems; TLAPS for proofs) | Very high (years to master) | Low (LLMs cannot reliably generate; serve as reference once written) | High (model checker is oracle) |
| **Alloy** | High (relational constraints, bounded) | High (SAT-based, automatic within scope) | High (weeks to months) | Moderate (LLMs can repair; dual-agent achieves 73% repair rate [Nargiz 2024]) | High (Alloy Analyzer is oracle) |
| **Z Notation** | High (typed set theory) | Moderate (theorem proving; not automatic) | High | Low (tooling ecosystem weaker) | Moderate (requires proof tool integration) |
| **VDM** | High (model-based refinement) | Moderate (tool-supported, not fully automatic) | High | Low | Moderate |
| **EARS / CNL** | Moderate (semi-formal template) | Moderate (parseable; test-gen possible) | Low (days) | High (structured enough to parse for generation) | Moderate (structured enough for test generation) |
| **Design by Contract (DbC/JML)** | High (pre/postconditions + invariants) | High (runtime assertion checking; static verification with KeY/OpenJML) | Moderate (annotation overhead) | High (LLMs generate more valid contracts than training set [Greiner 2024]) | Very high (contracts are directly executable assertions) |
| **BDD / Gherkin / SbE** | Moderate (example-based, coverage-dependent) | High for individual scenarios; Low for completeness | Very low | Very high (LLMs generate Gherkin from user stories with low syntax errors [2025 study]) | High (Cucumber/Serenity execute scenarios mechanically) |
| **Property-based spec** | High (universal quantification) | High (PBT engines are oracles) | Moderate (property authoring expertise) | Moderate (PropertyGPT-style retrieval-augmented generation viable [Liu 2024]) | Very high (PBT engines are automated oracles) |
| **Traceability (RTM)** | N/A (metadata; not a spec form) | High (link completeness automatically checkable) | Moderate (tooling + process) | Moderate (LLMs propose trace links with semantic similarity) | Moderate (coverage gaps are automatically detectable) |
| **Automated ambiguity detection** | N/A (analysis tool; not a spec form) | Moderate (NLP heuristic; formal for CNL) | Low (tools are accessible) | N/A | High (flags generator-spec mismatches) |

**Key non-obvious trade-offs:**

1. **The precision-adoptability inversion**: The approaches with the highest specification precision (TLA+, Z, VDM) have the highest adoption cost and the lowest suitability as direct input to LLM generators. Conversely, the most LLM-accessible approaches (Gherkin, EARS) provide the weakest formal guarantees. There is no approach in the current landscape that combines high formal precision with high adoptability.

2. **The completeness asymmetry**: For AI-driven development, specification incompleteness is more dangerous than imprecision. An imprecise specification generates a wrong implementation that an evaluator can identify as wrong against the intended behavior. An incomplete specification generates a wrong implementation that passes all evaluator checks, because the missing behavior was never specified. Property-based and DbC approaches address completeness more directly than example-based BDD, but writing complete contracts requires expertise BDD does not.

3. **The oracle construction problem**: The most critical question for an evaluator agent is: "Given a specification and an implementation, can I mechanically determine whether the implementation satisfies the specification?" DbC postconditions and property-based predicates are the strongest oracle forms. Gherkin scenarios are reliable oracles for specified scenarios only. Formal languages (TLA+, Alloy) provide oracles via their analysis tools. EARS and natural language specifications require a translation step before they can serve as mechanical oracles, and that translation step introduces potential error.

4. **AI-specific failure modes**: The 2024-2025 literature documents AI-specific failure modes that do not appear prominently in the classical specification engineering literature:
   - **Silent ambiguity resolution**: LLM generators do not flag ambiguous specifications; they silently adopt one interpretation.
   - **Implicit context omission**: Specifications that rely on domain-implicit conventions (like the bidirectionality of serializers) fail silently with LLM generators that lack domain background.
   - **Evaluation hallucination**: LLM evaluators using BDD-style prose specifications can incorrectly declare implementations correct, a failure mode absent when the oracle is a mechanical checker.
   - **Property vacuity**: LLM-generated contracts and properties may be syntactically correct but semantically vacuous (trivially satisfied by any implementation), passing the evaluator without constraining the generator.

---

## 6. Open Problems and Gaps

### 6.1 Specification Completeness Oracle

The fundamental open problem is the absence of a reliable specification completeness oracle: given a specification, how can a system determine whether it covers all the behaviors that matter for a given application? This question is undecidable in general (a complete specification for an arbitrary behavioral requirement is equivalent to solving the halting problem in the limit), but practical approximations are needed.

Current approaches are all heuristic:
- EARS pattern conformance detects structural omissions (a state-driven requirement without an entry condition) but not semantic omissions.
- Property-based specifications have no principled method for determining when the property set is sufficient.
- BDD scenario coverage can be measured (how many specification clauses are covered by scenarios) but coverage metrics only capture what has been specified, not what should have been.

An approach that combines formal specification fragments (for core invariants) with example-based specification (for normal-path behaviors) and NLP-based gap detection (for identifying missing scenario classes) is theoretically possible but has not been formalized into a toolchain with empirical evaluation.

### 6.2 Automated Contract Synthesis for Multi-Agent Systems

The problem of automatically synthesizing contracts (preconditions, postconditions, invariants) that are both sound and complete for a given implementation remains unsolved. Current LLM-based approaches (Greiner 2024, PropertyGPT, Lemur) demonstrate that LLMs can generate valid contracts more reliably than training baselines, but cannot guarantee completeness or soundness. A specification synthesis approach that combines LLM generation with formal verification feedback (along the lines of the Nargiz dual-agent Alloy repair architecture) is a promising direction, but the evaluation evidence is limited to small-scale benchmarks.

### 6.3 Scalable Traceability Under AI-Driven Change

AI-driven development introduces high-velocity specification change: LLM generators can refactor, extend, and modify implementations in seconds. Maintaining complete traceability under this velocity requires traceability tools that update automatically when implementations change, propagate impacts to tests and specifications, and flag coverage gaps in near-real-time. Current CI/CD-embedded traceability approaches address some of these requirements but lack the semantic link intelligence needed to distinguish implementation changes that preserve specification satisfaction from those that violate it.

### 6.4 The Implicit Constraint Problem

The Jimenez et al. (2024) finding -- that LLM generators routinely miss implicit constraints that domain experts treat as obvious -- represents a deep specification engineering challenge. Human developers build up implicit domain models through years of experience; these implicit models inform how they interpret underspecified requirements. LLM generators have different implicit models derived from training distributions that may or may not match the domain expert's mental model.

No established technique exists for systematically eliciting and encoding implicit domain constraints in a form that can be communicated to LLM generators. Domain ontologies and knowledge graphs represent one approach, but their construction is expensive and their maintenance in evolving domains is poorly supported. The Rashid et al. industry survey confirms: 58% of practitioners report that AI systems "lack deep industry expertise, domain-specific knowledge, regulatory knowledge" essential for complete requirements handling.

### 6.5 LLM Specification Language Model

The SysMoBench benchmark (2025) establishes that current LLMs struggle to generate correct formal specifications for complex real-world distributed systems. The benchmark uses TLA+ as its target language, focusing on systems like Raft and ZooKeeper. The finding is that while LLMs can generate syntactically correct TLA+ and plausible semantic structure, correctness at the level required for model checking remains below expert performance. A dedicated specification language model -- fine-tuned or trained on verified specifications in TLA+, Alloy, and related languages -- is an open research direction.

### 6.6 Evaluator Reliability for Non-Formal Specifications

When acceptance criteria are expressed in BDD or EARS rather than formal logic, LLM evaluators replace formal oracles. The reliability of LLM evaluators for non-formal specifications is not well-characterized. The LLM-as-a-Judge literature [arxiv:2512.01232] addresses coverage evaluation (does the test suite exercise the spec?) but not conformance evaluation (does the implementation satisfy the spec?). A systematic empirical study of LLM evaluator accuracy for different specification formats would substantially clarify the practical adoption tradeoffs.

---

## 7. Conclusion

Specification and acceptance criteria engineering for AI-driven development sits at the intersection of five decades of formal methods research, the requirements engineering discipline's accumulated understanding of specification quality, and the emergent practice of deploying LLM-based generator-evaluator agent pairs. The key structural finding of this survey is that specification quality is not merely an engineering best practice in this context -- it is an architectural invariant. Degraded specification quality compound-multiplies through generator misinterpretation and evaluator false-positive rates to produce incorrect implementations that pass all automated checks.

The available specification techniques span a precision-adoptability spectrum. Formal languages (TLA+, Alloy, Z, VDM) provide the strongest machine-checkable contracts but impose high adoption costs. The AWS experience with TLA+ in distributed systems design demonstrates that these costs are recoverable in high-stakes contexts where bugs are expensive. Controlled natural languages (EARS) and behavioral specifications (BDD, Gherkin, SbE) occupy the accessible middle of the spectrum: they reduce the most common linguistic ambiguities, produce machine-parsable artifacts, and integrate with mainstream test infrastructure, at the cost of weaker formal guarantees. Property-based specification and DbC-style contracts provide a precision intermediate between BDD and full formal logic while remaining compatible with contemporary development toolchains.

The 2024-2025 literature on LLM integration with specification techniques establishes several empirical data points: LLMs can generate syntactically valid Gherkin at scale; LLMs can repair defective Alloy specifications with dual-agent architectures at 73% accuracy; LLMs can generate code contracts that improve on training-set baselines; and LLMs struggle to generate correct formal specifications for complex systems from scratch. The practical implication is a division of labor: human engineers specify core invariants and structural properties in formal or semi-formal notation; LLMs assist with scenario expansion, contract completion, ambiguity detection, and traceability link proposal; formal analysis tools (model checkers, SAT solvers, runtime assertion checkers) serve as mechanical evaluator oracles.

Open problems -- specification completeness, contract synthesis, implicit constraint elicitation, scalable traceability under AI-driven change, and evaluator reliability for non-formal specifications -- define the frontier of the field. Each is tractable in principle; none has a deployed solution with strong empirical evidence. The convergence of formal methods, NLP-based specification analysis, and LLM-assisted specification engineering is the defining research direction in this domain for the near term.

---

## References

1. Lamport, L. (1994). "The Temporal Logic of Actions." *ACM Transactions on Programming Languages and Systems*, 16(3). https://lamport.azurewebsites.net/pubs/lamport-actions.pdf

2. Jackson, D. (2006). *Software Abstractions: Logic, Language, and Analysis*. MIT Press. https://dspace.mit.edu/bitstream/handle/1721.1/116144/Alloy.pdf

3. Merz, S. (2008). "The Logic of TLA+." LORIA Technical Report. https://members.loria.fr/SMerz/papers/tla+logic.pdf

4. Meyer, B. (1992). "Applying 'Design by Contract'." *IEEE Computer*, 25(10). https://kth.se/social/files/59526bfb56be5b4f17000807/meyer-92-contracts.pdf

5. Liskov, B. and Wing, J. (1994). "A Behavioral Notion of Subtyping." *ACM Transactions on Programming Languages and Systems*. https://cs.cmu.edu/~wing/publications/LiskovWing94.pdf

6. Mavin, A., Wilkinson, P., Harwood, A., Novak, M. (2009). "Easy Approach to Requirements Syntax (EARS)." *IEEE RE 2009*. https://ieeexplore.ieee.org/document/5328509/

7. Leavens, G., Poll, E., Clifton, C., et al. (2006). "JML Reference Manual." Chapter in *Formal Methods for Java*. https://www.cse.chalmers.se/~ahrendt/papers/JML16chapter.pdf

8. Benveniste, A., Caillaud, B., Nickovic, D., et al. (2018). "Contracts for System Design." *Foundations and Trends in Electronic Design Automation*. https://arxiv.org/abs/1712.10233

9. Newcombe, C., Rath, T., Zhang, F., Munteanu, B., et al. (2015). "How Amazon Web Services Uses Formal Methods." *Communications of the ACM*. https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf

10. North, D. (2006). "Introducing BDD." https://dannorth.net/introducing-bdd/

11. Adzic, G. (2011). *Specification by Example*. Manning.

12. Smart, J.F. (2014). *BDD in Action*. Manning. https://serenity-bdd.github.io/docs/reporting/living_documentation

13. Claessen, K. and Hughes, J. (2000). "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs." *ICFP 2000*.

14. Dijkstra, E. (1975). "Guarded Commands, Nondeterminacy and Formal Derivation of Programs." *Communications of the ACM*, 18(8).

15. Ramesh, B. and Jarke, M. (2001). "Toward Reference Models for Requirements Traceability." *IEEE Transactions on Software Engineering*, 27(1).

16. Nargiz, M., et al. (2024). "An Empirical Evaluation of Pre-Trained LLMs for Repairing Declarative Formal Specifications." *Chalmers University*. https://arxiv.org/html/2404.11050v2

17. Liu, Y., et al. (2024). "PropertyGPT: LLM-Driven Formal Verification of Smart Contracts through Retrieval-Augmented Property Generation." https://arxiv.org/html/2405.02580v1

18. Greiner, A., et al. (2024). "Automated Generation of Code Contracts: Generative AI to the Rescue?" *University of Bern SCG*. https://scg.unibe.ch/archive/papers/Grei24a-CodeContracts.pdf

19. Arora, C., et al. (2024). "Generative AI for Requirements Engineering: A Systematic Literature Review." https://arxiv.org/html/2409.06741v1

20. Rashid, A., et al. (2025). "AI for Requirements Engineering: Industry." https://arxiv.org/html/2511.01324

21. Jimenez, C., et al. (2024). "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?" https://github.com/SWE-bench/SWE-bench

22. Peng, Z., et al. (2025). "AI Agent Systems: Architectures, Applications, and Evaluation." https://arxiv.org/html/2601.01743v1

23. Challenges paper (2025). "Challenges and Paths Towards AI for Software Engineering." https://arxiv.org/html/2503.22625

24. SWE-Skills-Bench (2025). "SWE-Skills-Bench: Do Agent Skills Actually Help in Real-World Software Engineering?" https://arxiv.org/html/2603.15401

25. SysMoBench (2025). "SysMoBench: Evaluating AI on Formally Modeling Complex Real-World Systems." https://arxiv.org/pdf/2509.23130

26. AutoGen BDD (2024). "First Experiments on Automated Execution of Gherkin Test Specifications with Collaborating LLM Agents." *ACM A-TEST 2024*. https://dl.acm.org/doi/10.1145/3678719.3685692

27. LLM-as-Judge (2024). "LLM-as-a-Judge for Scalable Test Coverage Evaluation." https://arxiv.org/html/2512.01232

28. Hardware BDD (2024). "LLM-Based Behaviour Driven Development for Hardware Design." https://arxiv.org/html/2512.17814

29. Talha, M., et al. (2025). "A Semiautomated Approach for Detecting Ambiguities in Software Requirements Using SpanBERT." *Journal of Software: Evolution and Process*. https://onlinelibrary.wiley.com/doi/10.1002/smr.70041

30. ALICE system (2024). "Automated Requirement Contradiction Detection through Formal Logic and LLMs." *Automated Software Engineering*. https://link.springer.com/article/10.1007/s10515-024-00452-x

31. Bowen, J. (1996). *Formal Specification and Documentation Using Z*. https://people.eecs.ku.edu/~saiedian/812/Lectures/Z/Z-Books/Bowen-formal-specs-Z.pdf

32. ISO/IEC/IEEE 29148 (2011, 2018). *Systems and Software Engineering -- Life Cycle Processes -- Requirements Engineering*. https://webstore.iec.ch/en/publication/64315

33. IEEE 830 (1998). *Recommended Practice for Software Requirements Specifications*. https://standards.ieee.org/ieee/830/1222/

34. SmartINV (2024). "SMARTINV: Multimodal Learning for Smart Contract Invariant Inference." *IEEE S&P 2024*. https://www.cs.columbia.edu/~junfeng/papers/smartinv-sp24.pdf

35. Tjong, S.F., et al. (2024). "Requirements Ambiguity Detection and Explanation with LLMs: An Industrial Study." *MDU/ISERN*. https://www.ipr.mdu.se/pdf_publications/7221.pdf

---

## Practitioner Resources

### Formal Specification

- **TLA+ Learning Path**: Lamport's video course "Learn TLA+" at https://learntla.com; the TLA+ toolbox (IDE) at https://github.com/tlaplus/tlaplus
- **Alloy**: The Alloy 6 analyzer at https://alloytools.org; Alloy documentation at https://alloy.readthedocs.io
- **JML**: OpenJML documentation and tools at https://www.openjml.org
- **AWS TLA+ Use Cases**: Newcombe et al. "How AWS Uses Formal Methods" at https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf

### Behavioral Specification

- **Gherkin / Cucumber**: https://cucumber.io/docs/gherkin/
- **Serenity BDD**: https://serenity-bdd.github.io/ (living documentation)
- **EARS notation guide**: https://alistairmavin.com/ears/
- **Specification by Example**: Adzic, G. "Specification by Example" (Manning, 2011)

### Property-Based Testing

- **QuickCheck (Haskell)**: https://hackage.haskell.org/package/QuickCheck
- **fast-check (JavaScript)**: https://fast-check.io
- **Hypothesis (Python)**: https://hypothesis.readthedocs.io
- **PropEr (Erlang)**: https://proper-testing.github.io
- **quickcheck-dynamic**: https://github.com/input-output-hk/quickcheck-dynamic (stateful model-based testing)

### Traceability and Requirements Management

- **Jama Connect**: https://www.jamasoftware.com/
- **Visure Requirements**: https://visuresolutions.com/
- **Modern Requirements (Azure DevOps)**: https://www.modernrequirements.com/
- **TestRail**: https://www.testrail.com/ (test-to-requirement traceability)

### Automated Specification Quality

- **QVscribe** (requirements quality analysis): https://qracorp.com/qvscribe/
- **aqua cloud** (AI-assisted traceability): https://aqua-cloud.io/
- **ALICE** (contradiction detection): https://link.springer.com/article/10.1007/s10515-024-00452-x

### Related Research in This Collection

- `docs/research/spec_design/formal_specification_methods.md` -- TLA+, Alloy, Z, VDM survey
- `docs/research/spec_design/design_by_contract.md` -- DbC, BDD, A/G contracts survey
- `docs/research/spec_design/requirements_engineering.md` -- RE methodology survey
- `docs/research/spec_design/natural_language_formal_semantics_abuguity_in_specifications.md` -- Ambiguity theory
- `docs/research/property-testing/property-based-testing-and-invariants.md` -- Property-based testing survey
- `docs/research/tdd/test-driven-development-methodology.md` -- TDD methodology survey
- `docs/research/spec_design/systems_engineering_specifications_emergent_behavior_interface_contracts.md` -- Systems engineering specifications
