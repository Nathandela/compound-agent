# Context Management in Long-Running AI Agent Systems

*2026-03-25*

---

## Abstract

Long-running AI agent pipelines — systems that sustain coherent work across hours, sessions, and phase transitions — face a structural challenge that is orthogonal to raw model capability: the managed persistence of working state against the hard boundary of a finite context window. This survey examines the six principal dimensions of this problem. First, structured handoff artifacts: the design of information containers that survive phase transitions, and the theory of what must be explicitly carried versus what can be re-derived. Second, context window economics: the token-budget algebra of priority-based allocation, compaction triggers, and sliding-window tradeoffs. Third, information loss during summarization: the empirical evidence on what LLM compression drops and the methods developed to limit this loss. Fourth, multi-session coherence: how architectural vision and accumulated project knowledge can be made persistent across session boundaries via external memory and retrieval-augmented generation. Fifth, decision provenance: the structural problem of tracing why a decision was made when the context that motivated it is gone, and the spectrum from ADRs to decision-trace architectures. Sixth, memory architectures for agents: a comparative treatment of MemGPT, Reflexion, Generative Agents, HippoRAG, A-MEM, Zep, and their cognitive architecture antecedents (SOAR, ACT-R, CoALA). The survey synthesizes findings from academic research through mid-2025 and practitioner engineering accounts, identifies the dominant open problems, and provides a comparative synthesis table across the major architectural choices.

---

## 1. Introduction

### 1.1 The Structural Problem

A large language model performing a software engineering task inherits, at the start of each invocation, a context window that is both its workspace and its memory. When the task extends beyond a single invocation — as it does in every practically interesting agentic system — the agent faces a resource management problem with no analogue in classical computing: the primary medium of reasoning is also the medium of storage, both are finite, and the "memory" has no stable persistence mechanism other than what the system explicitly engineers outside the model.

This is not merely a capacity problem solvable by larger context windows. Models with one-million-token contexts face the same structural question: given that the total accumulated state of a multi-day project exceeds any window, and given that what occupies the context directly governs reasoning quality, what principles should govern what is retained, what is compressed, and what is evicted?

The problem has several distinct facets that require separate treatment:

1. **Phase transitions**: When control passes from one agent or one session to the next, what structured artifacts encode the necessary state?
2. **Within-session budget management**: Given a finite window filling with conversation history, tool outputs, and retrieved documents, what allocation and compaction policies preserve reasoning quality?
3. **Summarization fidelity**: When the window compresses older content, what is lost and what mechanisms reduce that loss?
4. **Cross-session coherence**: How does an agent maintain a consistent architectural vision and avoid re-discovering decisions already made in prior sessions?
5. **Decision provenance**: When the original context motivating a decision no longer exists, how can the decision's rationale be reconstructed or retrieved?
6. **Memory architecture**: What memory tier designs — drawing on cognitive science, operating systems, and knowledge engineering — best serve long-running agents?

### 1.2 Why Existing Approaches Are Insufficient

The default strategy in most deployed agent systems is implicit: allow the context window to fill, then either (a) truncate from the top, dropping the oldest messages, or (b) delegate to the model's built-in compaction. Both strategies are empirically suboptimal. Naive truncation eliminates information that may still be causally relevant to current work. LLM-driven compaction, as the Factory.ai evaluation of 36,611 production messages demonstrated, achieves only 2.19–2.45 out of 5.0 on artifact tracking even with best-in-class commercial implementations, because generic summarization treats all content as equally compressible and silently drops file paths, error codes, and decision rationale.

The research program surveyed here represents the systematic effort to replace implicit default strategies with principled architectures.

### 1.3 Scope

This survey covers the academic literature through mid-2025 and practitioner engineering accounts through early 2026. It addresses software engineering agents as its primary use case but draws on research from multi-session dialogue agents, interactive simulation agents (Park et al., 2023), knowledge management, cognitive architectures, and retrieval systems where those literatures contribute conceptual tools applicable to the engineering domain.

---

## 2. Foundations

### 2.1 The Context Window as Resource

A context window is best understood as a combination of three distinct resource types whose scarcity pressures interact. First, it is a **communication channel**: the only mechanism by which the model receives input for a given invocation. Second, it is a **reasoning workspace**: chain-of-thought reasoning, intermediate results, and multi-step inference all consume tokens that might otherwise hold useful prior context. Third, it is an **attention budget**: the transformer attention mechanism distributes computational capacity across all tokens in the window, but not uniformly. Liu et al. (2023) established the "lost in the middle" effect: LLMs demonstrate a U-shaped retrieval curve across context positions, performing best when relevant information appears at the beginning or end and significantly degrading when it appears in the middle, even in models explicitly trained for long-context reasoning. This is not merely a capacity limitation; it is a structural property of how transformers process sequences, with roots in the serial-position effect from cognitive psychology.

The implication is that context window management is not only a question of what fits but of where things are placed. Information placed in the middle of a large context may receive less effective attention than information placed at the same position in a shorter context, making compaction decisions position-sensitive as well as content-sensitive.

### 2.2 The Stability-Plasticity Tradeoff in Agent Memory

The classical stability-plasticity dilemma from continual learning (Grossberg, 1987) appears in agent context management as the tension between context stability (preserving the project history and decisions that anchor current work) and context plasticity (having room for new observations, tool outputs, and retrieved knowledge). Every compaction policy is implicitly a resolution of this dilemma: what proportion of the context budget is allocated to accumulated state versus available for new input.

The biological analogy (hippocampus for rapid episodic encoding; neocortex for slow statistical integration) motivates most modern agentic memory architectures. HippoRAG explicitly encodes this theory in its design; Generative Agents' reflection mechanism simulates the consolidation process by periodically synthesizing high-level abstractions from accumulated episodic events.

### 2.3 Cognitive Architecture Antecedents

Before the LLM era, cognitive architectures provided the most systematic thinking about agent memory. Two are particularly relevant.

**SOAR** (State, Operator, And Result; Laird, 2022) organizes knowledge into working memory (the agent's current goals, situation, and intermediate results), procedural memory (skills and processing rules), semantic memory (facts about the world), and episodic memory (memories of specific past experiences). The distinction between working memory — which is finite, rapidly accessed, and ephemeral — and long-term memory stores — which are unbounded, slower, and persistent — directly maps to the distinction between the context window and external memory stores in LLM systems.

**ACT-R** (Adaptive Control of Thought — Rational; Anderson, 2007) adds an activation-based retrieval model in which declarative memory items have activation levels determined by recency, frequency, and associative context. Items below a retrieval threshold are effectively unavailable. The direct parallel in LLM systems is relevance-ranked retrieval in RAG pipelines, where items below a similarity threshold are excluded from the context.

The CoALA framework (Sumers et al., 2023) is the most systematic recent attempt to map these cognitive architecture principles onto language agent design. CoALA organizes agents along three dimensions: information storage (working memory, short-term; and long-term memory subdivided into episodic, semantic, and procedural), action space (internal actions including reasoning, retrieval, and learning; and external actions including grounding on the world), and a decision-making loop. This provides a principled vocabulary for the discussion that follows.

### 2.4 Token Economics: The Cost Structure of Context

Understanding the economic constraints of context management requires appreciating that token costs are not uniform. At the resource level, input tokens to transformer models have a quadratic attention cost that incentivizes shorter contexts for identical reasoning tasks. At the deployment level, most commercial API pricing charges per token; a 100k-token context per agent call fundamentally changes the cost structure of a production system. The Getmaxim framework identifies a practical budget structure: system instructions (10-15%), tool context (15-20%), knowledge context (30-40%), history context (20-30%), and a buffer reserve (10-15%). The asymmetry between budget categories reflects the empirical finding that system instructions have disproportionate influence on behavior and justify premium allocation relative to historical detail.

---

## 3. Taxonomy of Approaches

This section organizes the principal approaches to context management across the six problem dimensions identified in the introduction.

### 3.1 Structured Handoff Artifacts

When a multi-phase pipeline passes control from one agent or one session to the next, the receiving agent begins with a cold start problem: the prior context no longer exists. The central design question is what information must be explicitly serialized into a handoff artifact versus what can be re-derived from other sources.

**The carry-vs-derive principle**: Information falls into one of three categories with respect to handoffs. First, information that must be explicitly carried because it cannot be reliably re-derived: file modifications, specific error messages, architectural decisions made and alternatives rejected, current task intent, and open questions. Second, information that can be derived with acceptable cost: repository structure, API signatures, and documentation content are typically better retrieved fresh than carried in compressed form, because a fresh retrieval is authoritative and avoids the fidelity loss of compression. Third, information that should not be carried because it clutters the new context without adding value: verbose reasoning chains, intermediate tool outputs that led to dead ends, and exploratory paths ultimately abandoned.

**Google ADK's working context model**: The ADK (Agent Development Kit) formalizes this distinction through the concept of a **working context** — an ephemeral, per-invocation view recomputed from durable sources. The working context comprises system instructions, agent identity, selected conversation history, tool outputs, optional memory results, and references to artifacts. Artifacts themselves — large binary or textual objects — are stored externally and addressed by name, with an `LoadArtifactsTool` providing on-demand ephemeral expansion into the context window. This converts context pollution by large payloads into precise, controlled retrieval. The architecture thereby preserves the working context for high-value reasoning content while externalizing bulky artifacts.

**OpenAI Agents SDK handoff semantics**: The SDK supports two handoff modes. In the first ("agent as tool"), the receiving agent receives only a focused sub-prompt and specified artifacts; it does not see prior conversation history. In the second ("agent transfer"), the new agent inherits the full conversation view, optionally filtered by an `input_filter` function that receives the prior `HandoffInputData` and returns a modified version. A `nest_handoff_history` option collapses prior transcripts into summary messages rather than passing raw history. The narrative casting mechanism reframes prior assistant messages so the new agent does not misattribute previous work as its own.

**Claude Code's capacity-triggered handoff**: Claude Code implements a budget-aware handoff trigger: agents monitor their remaining output token budget in real-time, beginning handoff preparation at 80% capacity and executing a forced handoff at 95% capacity with full state preservation. This converts a potentially catastrophic truncation event into a planned state transition.

**Factory's anchored iterative summarization**: The most empirically validated handoff artifact design at the time of writing is the structured section summary developed by Factory.ai and evaluated on 36,611 production software engineering session messages. Rather than generating a free-form summary, the system maintains a persistent structured document with mandatory sections: session intent, file modifications, decisions made, and next steps. When a new compression point is reached, only the newly truncated conversation span is summarized and merged into the existing sections — rather than regenerating the entire summary from scratch. The mandatory section structure forces the summarizer to populate each category explicitly; it cannot silently drop file paths or decisions without leaving a visible gap. This design scored 3.70/5.0 against Anthropic's full-regeneration approach (3.44) and OpenAI's opaque compressed representation (3.35) across all six evaluation dimensions.

### 3.2 Context Window Economics

**Priority-based allocation**: The Getmaxim framework and its cognates treat context allocation as a portfolio optimization problem. At any given moment, the context budget is partitioned across categories with different priority weights. High-priority categories (current task objective, safety constraints) are allocated first and placed at the beginning or end of context for maximum attention. Lower-priority categories (historical summaries, background reference material) are allocated last and placed in the middle — or excluded if the budget is exhausted — accepting the known degradation in retrieval accuracy for this positional region.

**Compaction triggers and thresholds**: In Claude Code's auto-compaction, compression triggers when the context window is approximately 70-80% full. The PreCompact hook fires before compression executes, allowing user-defined logic to run at the exact moment full conversational history is still available. This is the critical observation: once compression has run, the original is gone; the hook provides the only window for full-fidelity state preservation.

**Sliding window strategies**: A sliding window maintains a fixed-width view of recent history while summarizing or evicting older content. The ConversationSummaryBufferMemory pattern in LangChain implements a hybrid: it retains the most recent N message pairs verbatim while maintaining a rolling summary of older content. This preserves recent context at full fidelity (important for task continuity) while compressing distant context (less immediately relevant). The choice of N is a hyperparameter that balances recency coverage against budget consumption.

**Activation Beacon and KV cache compression**: At the model-internal level, Zhang et al. (2024) introduced Activation Beacon, a plug-in module that compresses key-value cache activations rather than surface-level tokens, achieving a 2x inference acceleration and 8x KV cache memory reduction while maintaining quality on 128k-token tasks. This is a complementary technique to handoff artifact design: where handoff artifacts manage inter-session context, KV cache compression manages intra-session computational cost.

**Semantic relevance scoring for budget allocation**: Dynamic allocation adjusts the budget for each category based on the current task. Factual lookup tasks allocate more budget to retrieved documents; complex architectural reasoning tasks allocate more to conversation history holding the prior design rationale. Embedding-based semantic relevance scoring applied to candidate context items enables quantitative prioritization: items with higher cosine similarity to the current task description rank higher for inclusion.

### 3.3 Information Loss During Summarization

The empirical literature on LLM summarization faithfulness reveals a consistent pattern: summaries produced by language models are not lossless compressions. They exhibit two distinct failure modes. The first is **omission**: content that appears in the middle of long source documents receives less attention and is dropped at higher rates, consistent with the lost-in-the-middle effect. The second is **distortion**: models introduce information not present in the source (hallucination) or alter key details while maintaining surface fluency — what the summarization literature calls faithfulness hallucination or context inconsistency.

**Quantitative evidence**: The Factory.ai benchmark establishes that even best-in-class commercial compressors achieve only 2.19-2.45/5.0 on artifact tracking — the lowest scoring dimension across all approaches. All systems dropped file paths, function names, exact error codes, and decision reasoning at similar rates. The study's conclusion that "artifact preservation probably requires specialized handling beyond summarization" is significant: it implies that the summarization approach itself has an architectural limitation for this category of information.

Studies on multi-document summarization (Pang et al., 2024) found hallucination rates reaching 75% in some configurations, with a distinctive failure mode where overlapping information across multiple documents is linked incorrectly or lost rather than integrated. Faithfulness measures decline as summary length increases (below 0.65 in the final segment for long outputs).

**What gets dropped**: Empirically, the content categories most vulnerable to summarization loss are:
- Exact technical identifiers: file paths, endpoint URLs, function names, error codes, configuration values
- Decision rationale: why an approach was chosen, what alternatives were considered
- Artifact trail: which files were accessed and modified in what order
- Intermediate states: the sequence of attempts before the final successful approach
- Quantitative specifics: benchmark numbers, timing data, token counts

**Mitigation strategies**: Three approaches have demonstrated efficacy. First, **structured section summaries** (Factory's approach): by dedicating mandatory sections to specific information categories, the template forces explicit representation rather than allowing categories to be absorbed into prose narrative. Second, **SliSum** (Li et al., 2024): sliding-window generation with self-consistency aggregation, dividing the source into overlapping windows, generating local summaries for each, then using clustering and majority voting to produce the final summary. SliSum significantly improves factual consistency for LLaMA-2, Claude-2, and GPT-3.5 without fine-tuning. Third, **external artifact tracking**: rather than trying to preserve file paths and modification histories through summarization, maintaining an external register of artifacts that is updated deterministically. This separates the inherently lossy summarization path from the deterministically accurate artifact tracking path.

**Faithfulness metrics**: The NLP literature has developed several automated metrics for assessing summary faithfulness. FactCC and DAE (Document-level Annotation Evaluation) frame faithfulness as a natural language inference problem, classifying each summary sentence as entailed or contradicted by the source. BERTScore captures semantic similarity. For agent context management, probe-based evaluation — asking agents questions that require specific details from truncated history and measuring answer quality — is more practically relevant than intrinsic faithfulness metrics, because it directly measures functional information preservation rather than linguistic fidelity.

### 3.4 Multi-Session Coherence

The multi-session coherence problem is distinct from within-session context management: where the latter is about managing a filling buffer, the former is about re-establishing working state at the start of a new session from scratch.

**The prime pattern**: The most common practitioner approach is manual context injection at session start. The `prime.md` command pattern observed in compound-agent and documented across multiple engineering blogs involves loading a set of structured documents — project specification, architectural plan, current status, and standing constraints — into the session before any task begins. These documents serve as the reconstructed working context. The pattern's limitation is that it requires maintained freshness: if the documents are not updated as the project evolves, the primed context diverges from ground truth.

**Auto-memory systems**: Claude Code's auto-memory mechanism addresses this through continuous accumulation rather than periodic re-priming. During each session, the model documents project patterns, debugging insights, architectural decisions, and user preferences into a persistent `MEMORY.md` file. The first 200 lines of this file are loaded automatically into each subsequent session's system prompt. The system effectively implements a slow-write, frequent-read memory that accumulates actionable knowledge without requiring manual curation. The separation between auto-memory (for gradual knowledge accumulation) and PreCompact hooks (for emergency state preservation at compression boundaries) implements the hippocampus/neocortex parallel: slow integration for long-term patterns, rapid encoding for episodic events.

**CLAUDE.md as parametric memory**: Project-level instruction files (CLAUDE.md, system prompts) function as a form of parametric memory: they encode standing constraints, architectural standards, and workflow requirements that are stable across sessions. Unlike episodic memory (which captures what happened in particular sessions), these instruction files encode procedural and semantic knowledge that should govern all sessions. The key design property is that they survive context resets: they are re-injected at the start of every session regardless of what the previous session contained.

**Retrieval-augmented generation for agents**: For knowledge that exceeds what can be pre-loaded into the session, retrieval-augmented generation (RAG) enables on-demand context injection. Gao et al. (2024) survey three RAG paradigms. Naive RAG indexes documents and retrieves based on query-document similarity; Advanced RAG adds pre-retrieval (query reformulation, query routing) and post-retrieval (re-ranking, filtering) stages; Modular RAG composes retrieval and generation components flexibly, enabling iterative, interleaved, or adaptive retrieval patterns. For multi-session agent coherence, the key question is what to index. Two categories deserve dedicated indexes: project-specific knowledge (architectural decisions, lessons learned, code patterns) and session-specific knowledge (what happened in prior sessions on this project).

The compound-agent system illustrates a production implementation: lessons extracted after each session are stored in `.claude/lessons/index.jsonl` (git-tracked) and indexed in a local SQLite + FTS5 database with vector embeddings via a Rust IPC daemon. The `npx ca search` command performs hybrid retrieval (keyword + vector) over this index, retrieving relevant lessons for injection into the current session's context. This converts past session experience into retrievable knowledge without burdening the context window with undifferentiated history.

### 3.5 Decision Provenance

Decision provenance addresses a specific failure mode of multi-session agents: arriving at a point in the project where a past decision constrains current options, but the original context motivating that decision is gone. Without provenance, the agent either (a) re-debates settled questions, wasting cycles, (b) violates prior decisions unknowingly, introducing architectural drift, or (c) arrives at contradictory conclusions from the same underlying constraints.

**Architectural Decision Records (ADRs)**: The classical software engineering approach to decision provenance is the Architectural Decision Record (ADR), a lightweight structured document capturing a single decision and its rationale. The standard ADR structure includes: title, status, context (the forces and constraints that motivated the decision), decision (what was chosen), and consequences (expected outcomes, both positive and negative). ADRs are explicitly designed for durability: they survive personnel changes, codebase evolution, and documentation decay because they are self-contained and explicitly linked to the conditions that would invalidate them.

Applied to AI agent systems, ADRs function as a persistent rationale layer that is neither part of the live context window nor part of the codebase itself. When the compound-agent system's `doc-gardener` agent checks `docs/decisions/` for ADRs contradicted by recent work and sets their status to `deprecated` when a decision is reversed, it is implementing decision provenance at the session boundary. The key property is that the ADR captures not just the decision but the conditions under which it should be reconsidered.

**Decision trace architectures**: For finer-grained provenance in production systems, decision trace architectures (Streamkap, 2025) capture the full chain from triggering event to outcome. A decision trace is a structured record with five phases: the triggering data event (what changed, when, from what source), context lookup (every piece of supplementary data retrieved before deciding), reasoning (rule executions, confidence scores, policy evaluations, competing factor weighting), action (what was executed with exact parameters and timestamps), and outcome (what happened after). A correlation ID links all five phases across potentially separate storage topics, enabling reconstruction of the complete decision context at any future time.

The critical property of decision traces is that they capture the counterfactual: not just what was decided but what was considered and why it was rejected. This is precisely the information that free-form narrative summaries drop preferentially, since narrative summarization tends toward teleological reconstruction — presenting the chosen path as though it were obvious — rather than preserving the deliberative structure.

**Context graphs**: Context graphs (FalkorDB, Foundation Capital, 2024-2025) extend the provenance concept to the semantic layer, linking decisions to their consequences, their antecedents, and the factual context that supported them. Zep's Graphiti engine implements a temporal variant of this: a knowledge graph where every node and edge carries both event time (when the fact occurred) and ingestion time (when it was recorded). This bitemporal representation enables precise reasoning over retroactive corrections — if a prior decision was made based on information later discovered to be incorrect, the temporal metadata enables the agent to identify which decisions may need revisiting.

### 3.6 Memory Architectures for Agents

The preceding subsections treated specific problem dimensions. This subsection surveys the integrated memory architectures — systems that address multiple dimensions simultaneously through a unified design.

**MemGPT (Packer et al., 2023)**: MemGPT frames the LLM context window as analogous to the limited registers and caches of a CPU, and designs a virtual context management system analogous to OS virtual memory. The core mechanism involves hierarchical memory tiers: in-context memory (what is currently in the context window), external memory (documents and conversation history stored outside the model), and archival memory (persistent long-term storage). MemGPT manages data movement between tiers using the LLM itself as the controller, issuing explicit memory management function calls (read from external storage, write to external storage, search archival memory). Interrupts allow the system to pause in-context reasoning to perform memory operations. Evaluated on document analysis (documents exceeding the context window) and multi-session chat (conversations requiring persistence across sessions), MemGPT enables the LLM to handle content many times larger than its native context window.

The critical insight is that the LLM is both the processor and the memory manager: it decides what to load into context, what to evict, and what to retrieve. This self-directed memory management is more flexible than rule-based compaction but introduces latency from function-call overhead and risks of suboptimal management if the LLM misestimates future information needs.

**Generative Agents (Park et al., 2023)**: Park et al. placed 25 LLM-driven characters in a Sims-like social simulation running over 48 simulated hours and required coherent behavior over time. The memory architecture uses a single **memory stream** — a linear sequence of natural-language observations stored as events — with a composite retrieval scoring function combining three dimensions: recency (how recently the memory was created), importance (an LLM-assigned score from 1-10 for how significant the event was), and relevance (cosine similarity to the current query). Retrieved memories are those with the highest composite score.

Two derived mechanisms extend this base: **reflection** (periodic synthesis of high-level insights from the memory stream, triggered when the accumulated importance score of recent events exceeds a threshold) and **planning** (forward projections stored in the memory stream and retrievable alongside observations). The reflection mechanism is directly analogous to the hippocampal-neocortical consolidation process: episodic events are periodically abstracted into semantic summaries that can be retrieved without loading the full episodic record.

**Reflexion (Shinn et al., 2023)**: Reflexion addresses a different dimension of the memory problem: how an agent can learn from failure within and across trials without weight updates. The architecture maintains an **episodic memory buffer** containing natural-language reflections on prior attempts. After each trial, an evaluator component assesses the outcome and a self-reflection component generates a verbal critique of what went wrong and what should be done differently. This reflection is stored in the buffer and prepended to the context in subsequent trials. On HumanEval coding benchmarks, Reflexion achieved 91% pass@1 versus GPT-4's 80%, demonstrating that verbal reinforcement over a small episodic buffer can match or exceed raw model scale for tasks where feedback is available.

The limitation is explicit in the architecture: the episodic memory buffer is finite (bounded by context window), and Reflexion provides no mechanism for long-term cross-session retention. It is an intra-episode learning mechanism rather than a cross-session memory architecture.

**A-MEM (Weng et al., 2025)**: A-MEM (Agentic Memory) adopts the Zettelkasten method as its design principle, creating interconnected knowledge networks through dynamic indexing and linking. Each memory note contains seven components: original content, timestamp, LLM-generated keywords, tags, contextual description, embedding vector, and linked memories. When a new memory arrives, the system (a) computes cosine similarity against existing memories to find candidates for linking, (b) uses an LLM to evaluate whether meaningful connections exist among top candidates, and (c) triggers **memory evolution**: existing memories whose contextual attributes have become outdated by the new memory are revised. Unlike MemGPT's cache-oriented design (which prioritizes recency) or Generative Agents' importance-weighted retrieval, A-MEM emphasizes the network structure of knowledge: memories that are densely linked to others become more reachable through associative traversal, implementing an implicit form of importance weighting through graph centrality.

**HippoRAG (Gutierrez et al., 2024)**: HippoRAG maps the hippocampal indexing theory of human long-term memory onto a retrieval architecture. The architecture uses an LLM to extract entities and relations from documents into a knowledge graph, then applies the Personalized PageRank (PPR) algorithm to propagate relevance scores through the graph starting from query-matched seed nodes. This enables **multi-hop integration**: a query about concept A can retrieve documents about concept B if A and B are connected through shared entities in the knowledge graph, even if B does not appear in documents semantically similar to the query. On multi-hop QA benchmarks, HippoRAG outperforms standard RAG by up to 20% while achieving 10-20x cost reduction versus iterative retrieval methods. The neurobiological inspiration is explicit: the LLM plays the role of the neocortex (slow, general-purpose pattern matching), the knowledge graph plays the role of the hippocampal index (fast structured association), and PPR mimics the spreading activation of associative retrieval.

**Zep / Graphiti (Rasmussen et al., 2025)**: Zep introduces a temporally-aware knowledge graph (Graphiti) that maintains three subgraph layers. The **episodic subgraph** stores raw conversational and event data. The **semantic subgraph** stores entities, relationships, and facts extracted from the episodic layer. The **community subgraph** stores high-level domain summaries clustered from semantic content. The distinguishing feature is **bitemporal modeling**: every node and edge carries event time T (when the fact occurred) and ingestion time T' (when it was recorded). This enables reasoning over temporal corrections: if fact F was believed at time T1 but discovered to be false at T2, the bitemporal representation preserves both the prior belief and its correction, along with the reasoning that depended on F. Graphiti's incremental real-time architecture ingests new episodes continuously, extracting and resolving entities against existing nodes without requiring batch reprocessing. On the LongMemEval benchmark, Zep achieves 18.5% accuracy improvement while reducing latency by 90% compared to baselines, with P95 retrieval latency of 300ms — a property critical for interactive agent applications.

**Mem0 (Chhikara et al., 2025)**: Mem0 implements a production-oriented memory layer with a two-phase pipeline: extraction (identifying salient facts from conversation) and update (merging extracted facts with the existing memory store, resolving conflicts and deduplicating). An enhanced variant (Mem0-g) augments the flat memory store with a graph representation to capture relational structure. Mem0 achieves 26% higher response accuracy compared to OpenAI's memory baseline and 66.9% overall accuracy with 0.71s median end-to-end latency. The production orientation distinguishes Mem0 from research systems: it explicitly targets the latency and throughput constraints of deployed multi-user applications.

---

## 4. Analysis

### 4.1 The Irreducible Gap Between Lossless and Lossy Context

A fundamental tension runs through all context management approaches: the gap between what an agent needs for complete coherence (the full conversation history, all tool outputs, all prior decisions) and what fits in the context window. No compression strategy eliminates this gap; all strategies make choices about which information to drop at higher rates. The empirical evidence consistently shows that the categories of information most valuable for task continuation — exact technical identifiers, decision rationale, artifact modification trails — are precisely the categories most vulnerable to LLM summarization loss.

This creates what might be called the provenance paradox: the information most needed for multi-session coherence is the information least likely to survive naive summarization. The practitioner responses (structured section templates, external artifact tracking, ADRs, decision traces) are all attempts to route high-value information around the LLM summarization path rather than improve the summarization path itself.

### 4.2 Self-Directed vs. Rule-Based Memory Management

Memory architectures differ fundamentally on whether the LLM itself manages memory tier movement (MemGPT, A-MEM) or whether external rule-based mechanisms govern tier transitions (Claude Code auto-compaction, LangChain ConversationSummaryBufferMemory). Self-directed memory management is more flexible — the LLM can assess semantic importance and make finer-grained decisions — but introduces three risks. First, the LLM may misjudge future information needs and evict content it will require later. Second, memory management function calls introduce latency and token overhead. Third, the quality of memory management decisions depends on the underlying model's capability.

Rule-based mechanisms are more predictable and auditable: a threshold-triggered compaction at 70% window fullness behaves consistently regardless of content. But they cannot assess semantic importance; they can only apply structural heuristics (recency, position, size). The Factory evaluation suggests that structural approaches leave significant room for improvement on semantically important categories.

### 4.3 The Positional Bias Problem and Context Engineering

The lost-in-the-middle finding (Liu et al., 2023) has a direct engineering implication: context placement is as important as context content. Engineering practices have adapted accordingly. The standard recommendation places task objective and current instructions first and most recent messages last, with historical context in the middle — accepting that middle-positioned history will receive reduced attention but placing critical anchors at the high-attention extremes.

This positional engineering is a workaround rather than a solution. The "Found in the Middle" work (He et al., 2024) demonstrates that calibrating positional attention biases through training can substantially mitigate the U-curve effect, suggesting that future models trained with explicit long-context attention objectives may partially dissolve this constraint. However, for currently deployed models, positional engineering remains a necessary component of context management practice.

### 4.4 The Temporal Dimension of Agent Knowledge

Temporal reasoning in agent memory has received limited attention relative to its importance. Projects evolve: architectural decisions made early in a project are overridden; bugs are discovered and fixed; the understanding of requirements changes. An agent working from a flat memory store that accumulates facts without temporal metadata may reason from outdated facts without awareness of their currency.

Zep's bitemporal modeling directly addresses this. The explicit separation of when-a-fact-was-believed from when-it-was-recorded enables queries of the form "what did the agent know at time T?" — critical for auditing decisions made under prior beliefs. The compound-agent approach handles a subset of this through ADR deprecation: when a decision is reversed, the old ADR is marked deprecated with a reference to the new one, preserving the decision history while making the current state clear. However, the granularity of ADR-based provenance is coarser than per-fact bitemporal modeling.

### 4.5 Multi-Agent Memory Coordination

When multiple agents operate on the same project — a common pattern in orchestrator-worker architectures — they create a memory coordination problem not present in single-agent systems. A worker agent may discover a fact that should update the orchestrator's model. Two concurrent workers may make contradictory modifications to shared state. A specialized subagent may accumulate task-specific knowledge that should be integrated into the shared project memory but not necessarily loaded into every future session.

None of the current architectures provides a complete solution to this problem. The standard approaches are coarse: full shared history (expensive, context-polluting), no shared history (each agent starts fresh, losing coordination benefits), or explicit structured handoff at defined phase transitions (the approach used in most practitioner systems). The LLM multi-agent memory survey (Shichun Liu et al., 2024) identifies this as an open research problem, noting that mechanisms for collective memory formation — where multiple agents contribute to a shared evolving knowledge representation — are substantially underdeveloped relative to single-agent memory research.

---

## 5. Comparative Synthesis

The following table compares the major architectural approaches across the dimensions most relevant to practitioners designing long-running agent systems.

| Approach | Primary Mechanism | Persistence | Multi-session | Decision Provenance | Temporal Reasoning | Latency | Artifact Fidelity |
|---|---|---|---|---|---|---|---|
| Naive Truncation | Drop oldest tokens | None | No | None | None | Minimal | Poor |
| Sliding Window + Rolling Summary | Recency buffer + LLM summary | Session | Partial (summary) | None | None | Low | Moderate |
| MemGPT | LLM-directed tier movement | External files | Yes | None explicit | None | High (function calls) | Moderate |
| Generative Agents | Importance+recency+relevance scoring | Memory stream | Yes | None | Recency only | Moderate | Moderate |
| Reflexion | Verbal episodic buffer | Episode-scoped | No | Failure chains | None | Low | N/A |
| A-MEM | Zettelkasten-inspired linked notes, evolving | External graph | Yes | None | Timestamp only | Moderate | Moderate |
| HippoRAG | Knowledge graph + PPR retrieval | External KG | Yes | None | None | Low (single-step) | Varies |
| Zep / Graphiti | Temporal KG, bitemporal modeling | External KG | Yes | Via temporal edges | Full bitemporal | Very Low (300ms P95) | High |
| Mem0 | Extraction-update pipeline | External store | Yes | None | None | Very Low (710ms median) | Moderate |
| Structured Section Summary | Mandatory-section template | Artifact file | Yes | Decisions section | Recency (incremental) | Low | High (for tracked categories) |
| ADR + Decision Log | Structured rationale documents | Document store | Yes | Full | Via status/timestamps | None (passive) | High (for decisions) |
| Decision Traces | 5-phase correlation-ID record | Streaming store | Yes | Full chain | Full (event + ingestion time) | Moderate | High |
| PreCompact Hook | Snapshot at compression boundary | Artifact file | Yes (on demand) | Partial | Timestamp of snapshot | Very Low (async) | High (pre-compression only) |
| RAG (Naive) | Dense retrieval over document index | Vector index | Yes | None | None | Low-Moderate | Varies |
| RAG (Advanced/Modular) | Pre/post-retrieval + modular composition | Vector index + reranker | Yes | None | None | Moderate | Varies |
| CoALA Framework | Episodic + semantic + procedural LTM taxonomy | Abstract | Yes | Via procedural memory | Via episodic memory | Architecture-dependent | Architecture-dependent |

**Key patterns visible in the table:**

Temporal reasoning support strongly correlates with architecture complexity: only Zep and full decision trace architectures provide first-class support for reasoning over temporal changes in belief. The majority of memory architectures treat knowledge as timeless facts.

Decision provenance is underserved: only ADRs, decision logs, and decision traces explicitly capture the reasoning that led to a decision. Memory architectures optimized for retrieval (A-MEM, HippoRAG, Mem0) optimize for recalling what was decided rather than why.

Artifact fidelity and low latency are in tension: the highest-fidelity approaches (structured section summaries, PreCompact hooks, decision traces) involve structured templates, append-only logging, or snapshot mechanisms that are inherently low-throughput. The high-performance retrieval systems (Zep, Mem0) optimize for latency at the cost of fidelity on specific information categories.

---

## 6. Open Problems and Gaps

### 6.1 Agreed Evaluation Protocols

There is no agreed benchmark for long-running agent context management analogous to the GLUE benchmark for NLP tasks. The Factory.ai probe-based evaluation is a significant step toward a practical benchmark, but it is domain-specific (software engineering), proprietary in its message corpus, and uses a commercial LLM (GPT-5.2) as judge — introducing a potential model-specific bias. Evaluation dimensions differ across papers: MemGPT evaluates document analysis completion; Reflexion evaluates task pass@k; Zep evaluates on LongMemEval's temporal reasoning questions. Without a shared evaluation suite covering multiple task domains, context management systems, and information categories, comparisons across architectures remain approximate.

### 6.2 Artifact Tracking

The Factory.ai evaluation's most striking finding is that artifact tracking — maintaining accurate records of which files were accessed and modified — achieves only 2.19-2.45/5.0 across all tested approaches, the weakest dimension by a significant margin. The conclusion that this "probably requires specialized handling beyond summarization" has not yet been translated into a standard architectural component. The obvious solution — a deterministic file-modification register maintained outside the summarization path — exists as an ad hoc pattern in some frameworks but has not been standardized or systematically evaluated.

### 6.3 Cross-Agent Memory Fusion

Multi-agent systems that accumulate knowledge in parallel face a fusion problem with no satisfactory solution: how to merge the knowledge accumulated by N concurrent agents into a coherent shared store without either requiring serial processing that defeats the purpose of parallelism or accepting inconsistency that degrades future session quality. The mechanisms used in distributed database systems (conflict-free replicated data types, optimistic concurrency control, causal consistency) have potential applicability but have not been translated into agent memory architecture design.

### 6.4 Computational Cost of Self-Directed Memory Management

MemGPT's self-directed memory management requires the LLM to explicitly manage its own memory tiers via function calls. The overhead scales with the frequency of memory operations. For agents performing many short tasks, the memory management overhead may exceed the cost of the task itself. Techniques for amortizing memory management — lazy evaluation, batched writes, background consolidation — have been proposed informally but not systematically studied.

### 6.5 When Summarization Loses Too Much

The practical question of when to prefer retrieval over summarization remains unresolved at a principled level. The empirical evidence suggests that technical identifiers and decision rationale are poorly served by summarization, while narrative intent and high-level architectural direction are relatively well-preserved. But the boundary between these categories varies with domain, task type, and context length, and there are no practical heuristics with empirical backing for determining in real-time which path to take for a given piece of content.

### 6.6 Memory Representation for Collaborative Agents

All surveyed memory architectures treat memory as ultimately owned by a single agent or shared passively through a common store. No architecture addresses the case where multiple agents have different beliefs about the same fact (legitimately, because they have different information) and need to reason about this divergence explicitly. This is the multi-agent epistemology problem: the knowledge held by an agent collective is not simply the union of individual knowledge stores, and the coordination of conflicting partial views requires mechanisms not present in any current architecture.

### 6.7 Long-Horizon Evaluation Gaps

The LongMemEval benchmark used to evaluate Zep is the most demanding publicly available evaluation for long-term agent memory, but it is oriented toward temporal question answering rather than task continuation and architectural coherence — the properties most important for software engineering agents. Research on evaluation methodologies for multi-session task coherence, where success requires not just remembering individual facts but maintaining consistent architectural vision across multiple work sessions spanning different code changes, represents a significant gap.

---

## 7. Conclusion

Context management in long-running AI agent systems is a problem at the intersection of operating system design (resource management under scarcity), cognitive science (the structure and retrieval of human memory), information retrieval (ranking, indexing, and compression), and software engineering practice (traceability, documentation, artifact management). No single approach addresses all dimensions simultaneously, and the practitioner landscape reflects this: deployed systems combine multiple mechanisms — CLAUDE.md for parametric persistence, RAG for knowledge retrieval, structured handoff artifacts for phase transitions, ADRs for decision provenance, and compaction triggers with PreCompact hooks for within-session management.

The field's most significant recent empirical contribution is the Factory.ai evaluation on 36,611 production messages, which established (a) that artifact tracking is the most vulnerable dimension under all current compression approaches, (b) that structured section templates outperform both full regeneration and opaque compression on most quality dimensions, and (c) that incremental merging is strictly preferable to regeneration for multi-compression-point scenarios.

The most significant theoretical contribution is the convergence on temporal knowledge graphs (Zep, HippoRAG) as a viable architecture for long-term agent memory, with Zep's bitemporal modeling addressing a limitation — the inability to reason over changes in belief over time — that none of the prior approaches handled systematically.

The dominant open problem is the absence of agreed evaluation benchmarks spanning task types, agent architectures, and information categories. Without shared evaluation, the comparative analysis presented here rests partly on the combination of results from incompatible setups. Developing such benchmarks — particularly covering multi-session task coherence for code-intensive workloads — is the highest-leverage infrastructure investment for this research area.

---

## References

1. **Packer et al. (2023)** — MemGPT: Towards LLMs as Operating Systems. arXiv:2310.08560. [https://arxiv.org/abs/2310.08560](https://arxiv.org/abs/2310.08560)

2. **Park et al. (2023)** — Generative Agents: Interactive Simulacra of Human Behavior. ACM UIST 2023. arXiv:2304.03442. [https://arxiv.org/abs/2304.03442](https://arxiv.org/abs/2304.03442)

3. **Shinn et al. (2023)** — Reflexion: Language Agents with Verbal Reinforcement Learning. NeurIPS 2023. arXiv:2303.11366. [https://arxiv.org/abs/2303.11366](https://arxiv.org/abs/2303.11366)

4. **Sumers et al. (2023)** — Cognitive Architectures for Language Agents (CoALA). arXiv:2309.02427. [https://arxiv.org/abs/2309.02427](https://arxiv.org/abs/2309.02427)

5. **Liu et al. (2023)** — Lost in the Middle: How Language Models Use Long Contexts. TACL 2024. arXiv:2307.03172. [https://arxiv.org/abs/2307.03172](https://arxiv.org/abs/2307.03172)

6. **Gao et al. (2024)** — Retrieval-Augmented Generation for Large Language Models: A Survey. arXiv:2312.10997. [https://arxiv.org/abs/2312.10997](https://arxiv.org/abs/2312.10997)

7. **Gutierrez et al. (2024)** — HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language Models. NeurIPS 2024. arXiv:2405.14831. [https://arxiv.org/abs/2405.14831](https://arxiv.org/abs/2405.14831)

8. **Zhang et al. (2024)** — Long Context Compression with Activation Beacon. arXiv:2401.03462. [https://arxiv.org/abs/2401.03462](https://arxiv.org/abs/2401.03462)

9. **Li, Li & Zhang (2024)** — Improving Faithfulness of Large Language Models in Summarization via Sliding Generation and Self-Consistency (SliSum). LREC-COLING 2024. arXiv:2407.21443. [https://arxiv.org/abs/2407.21443](https://arxiv.org/abs/2407.21443)

10. **Li et al. (2024)** — Prompt Compression for Large Language Models: A Survey. arXiv:2410.12388. [https://arxiv.org/abs/2410.12388](https://arxiv.org/abs/2410.12388)

11. **Weng et al. (2025)** — A-MEM: Agentic Memory for LLM Agents. NeurIPS 2025. arXiv:2502.12110. [https://arxiv.org/abs/2502.12110](https://arxiv.org/abs/2502.12110)

12. **Rasmussen et al. (2025)** — Zep: A Temporal Knowledge Graph Architecture for Agent Memory. arXiv:2501.13956. [https://arxiv.org/abs/2501.13956](https://arxiv.org/abs/2501.13956)

13. **Chhikara et al. (2025)** — Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory. arXiv:2504.19413. [https://arxiv.org/abs/2504.19413](https://arxiv.org/abs/2504.19413)

14. **Shichun Liu et al. (2024)** — Memory in the Age of AI Agents: A Survey. [https://github.com/Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List)

15. **He et al. (2024)** — Found in the Middle: Calibrating Positional Attention Bias Improves Long Context Utilization. arXiv:2406.16008. [https://arxiv.org/abs/2406.16008](https://arxiv.org/abs/2406.16008)

16. **Factory.ai (2025)** — Evaluating Context Compression Strategies for Long-Running AI Agent Sessions. [https://factory.ai/news/evaluating-compression](https://factory.ai/news/evaluating-compression)

17. **Factory.ai (2025)** — The Context Window Problem: Scaling Agents Beyond Token Limits. [https://factory.ai/news/context-window-problem](https://factory.ai/news/context-window-problem)

18. **Google ADK (2025)** — Architecting Efficient Context-Aware Multi-Agent Framework for Production. [https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)

19. **OpenAI Agents SDK (2025)** — Handoffs Documentation. [https://openai.github.io/openai-agents-python/handoffs/](https://openai.github.io/openai-agents-python/handoffs/)

20. **Streamkap (2025)** — Decision Traces: Building Audit Trails for Autonomous AI Agents. [https://streamkap.com/resources-and-guides/decision-traces-ai-agents](https://streamkap.com/resources-and-guides/decision-traces-ai-agents)

21. **ADR GitHub (ongoing)** — Architectural Decision Records. [https://adr.github.io/](https://adr.github.io/)

22. **Getmaxim (2025)** — Context Engineering for AI Agents: Token Economics and Production Optimization Strategies. [https://www.getmaxim.ai/articles/context-engineering-for-ai-agents-production-optimization-strategies/](https://www.getmaxim.ai/articles/context-engineering-for-ai-agents-production-optimization-strategies/)

23. **Anthropic Claude Code (2025)** — Hooks Reference. [https://code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)

24. **Anthropic Claude Code (2025)** — How Claude Remembers Your Project (Memory). [https://code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)

25. **Grossberg, S. (1987)** — Competitive Learning: From Interactive Activation to Adaptive Resonance. Cognitive Science, 11(1), 23-63.

26. **Anderson, J.R. (2007)** — How Can the Human Mind Occur in the Physical Universe? Oxford University Press.

27. **Laird, J.E. (2022)** — Introduction to the Soar Cognitive Architecture. arXiv:2205.03854. [https://arxiv.org/abs/2205.03854](https://arxiv.org/abs/2205.03854)

28. **Pang et al. (2024)** — From Single to Multi: How LLMs Hallucinate in Multi-Document Summarization. arXiv:2410.13961. [https://arxiv.org/abs/2410.13961](https://arxiv.org/abs/2410.13961)

---

## Practitioner Resources

### Implementation Frameworks

- **Letta (MemGPT successor)**: Production framework for MemGPT-style virtual context management. [https://www.letta.com/](https://www.letta.com/)
- **Mem0**: Production memory layer with Python and JavaScript SDKs. [https://mem0.ai/](https://mem0.ai/)
- **Zep / Graphiti**: Temporal knowledge graph for agent memory. [https://github.com/getzep/graphiti](https://github.com/getzep/graphiti)
- **Google ADK**: Agent Development Kit with working context, artifact management, and multi-agent handoff. [https://google.github.io/adk-docs/](https://google.github.io/adk-docs/)
- **OpenAI Agents SDK**: Handoffs, input filters, history nesting. [https://openai.github.io/openai-agents-python/](https://openai.github.io/openai-agents-python/)

### Evaluation Tools

- **LongMemEval**: Benchmark for long-term memory temporal reasoning. Available via HuggingFace datasets.
- **HumanEval + Reflexion setup**: Code generation with verbal reinforcement baseline. [https://github.com/noahshinn/reflexion](https://github.com/noahshinn/reflexion)
- **Factory probe-based evaluation**: Recall, artifact, continuation, and decision probes for compression quality.

### ADR Templates

- **MADR (Markdown Architectural Decision Records)**: Lightweight, schema-free format. [https://adr.github.io/madr/](https://adr.github.io/madr/)
- **Michael Nygard's ADR format**: The original lightweight format. [https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- **AWS ADR Process**: Enterprise-scale ADR workflow. [https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)

### Survey Papers for Deeper Reading

- Gao et al. (2024) RAG survey (arXiv:2312.10997) — comprehensive treatment of retrieval paradigms
- Shichun Liu et al. (2024) Agent Memory survey — paper list tracking 100+ relevant papers
- Li et al. (2024) Prompt Compression survey (arXiv:2410.12388) — soft and hard compression taxonomy
- Sumers et al. (2023) CoALA (arXiv:2309.02427) — principled cognitive architecture vocabulary for language agents
