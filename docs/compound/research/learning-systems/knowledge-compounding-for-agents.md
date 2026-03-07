# Knowledge Compounding for AI Agents
*PhD-Level Survey for Compound Agent Learning Phase*

---

## Abstract

Knowledge compounding — the systematic accumulation, organization, and application of experience to improve future performance — represents one of the central unsolved challenges in the design of autonomous AI agents. Unlike human cognition, which naturally encodes lessons from past failures into durable behavioral heuristics through neural consolidation and reflective processing, current large language model (LLM)-based agents operate predominantly within stateless context windows, discarding the residue of each interaction at session boundaries. This survey synthesizes research from twelve disciplines bearing on this problem: cognitive science, organizational learning theory, information retrieval, reinforcement learning, continual learning, knowledge management, and the nascent field of AI agent memory architectures.

The survey organizes this literature along a unifying axis: the tension between plasticity (the capacity to integrate new knowledge) and stability (the preservation of prior knowledge against interference). This tension — formally called the stability-plasticity dilemma in continual learning and double-loop versus single-loop learning in organizational theory — recurs across every approach examined. We identify twelve distinct approaches to knowledge compounding, ranging from Ebbinghaus-derived spaced repetition scheduling (SM-2, FSRS) through Nonaka's SECI spiral, experience replay buffers in deep reinforcement learning, retrieval-augmented generation, and the emerging generation of agentic memory architectures (MemGPT, Reflexion, Voyager, LATS, A-MEM, Zep). The survey concludes by identifying open problems including cross-session lesson transfer, deduplication at scale, multi-agent knowledge fusion, and the absence of agreed evaluation protocols for long-horizon knowledge compounding.

---

## 1. Introduction

### 1.1 Problem Statement

Contemporary AI agents face a structural amnesia problem. A large language model invoked to complete a software engineering task carries into that session the statistical residue of its pretraining corpus but none of the specific, corrective, hard-won knowledge accumulated across prior sessions with the same codebase. When the agent makes an error — misapplying an API, choosing a flawed architectural pattern, misunderstanding a project convention — that error is recorded nowhere the agent will consult in a subsequent session. The same mistake recurs. This structural deficit is not incidental to current architectures; it reflects deep choices about context locality, stateless inference, and gradient-free deployment.

The problem is not unique to AI. Organizational learning researchers have long documented analogous failure modes in human institutions: medical teams that repeat the same postoperative complications, military units that neglect lessons from prior campaigns, software organizations that rediscover the same architectural anti-patterns across product generations. The mechanisms humans and institutions use to prevent this recurrence — after-action reviews, lessons-learned databases, spaced repetition curricula, double-loop learning — constitute a rich corpus of tested practice that has received limited attention from the AI agent community.

Knowledge compounding, as defined in this survey, is the process by which an agent (human, institutional, or artificial) systematically transforms experience into reusable, retrievable knowledge that meaningfully improves future performance on related problems. Compounding implies not merely accumulation but interest: each lesson should increase the agent's leverage on future problems at a rate exceeding linear.

### 1.2 Scope and Inclusions

This survey covers twelve categories of approach:

1. Spaced repetition and retrieval practice scheduling
2. Organizational knowledge management (KMS) and the SECI model
3. Curriculum learning and machine teaching
4. Experience replay in reinforcement learning
5. Continual learning and catastrophic forgetting mitigation
6. Retrieval-augmented generation (RAG)
7. Knowledge graph architectures for agent memory
8. Agentic memory systems (MemGPT, Reflexion, Voyager, LATS, Generative Agents, A-MEM, Zep)
9. Lessons-learned databases (NASA LLIS, military after-action review)
10. Deduplication and near-duplicate detection (LSH, MinHash, embedding similarity)
11. Pattern mining and frequent-pattern extraction
12. Knowledge distillation and compression

### 1.3 Key Definitions

**Knowledge**: Justified, reusable representation of regularities in experience that improves future decision quality. Includes declarative (factual), procedural (how-to), and reflective (meta-cognitive) varieties.

**Compounding**: The property that accumulated knowledge generates returns above linear; each unit of stored knowledge increases the leverage of future units by enabling compositional reasoning and error-avoidance.

**Agent**: Any computational or organizational entity that perceives an environment, takes actions, and receives feedback. Includes single LLM agents, multi-agent systems, and human organizations where the analogy illuminates design choices.

**Lesson**: A structured encoding of a specific past experience: what happened, why it happened, and what action should be taken differently next time.

**Plasticity**: Capacity to update internal representations based on new evidence.

**Stability**: Resistance to losing previously acquired knowledge when processing new information.

---

## 2. Foundations

### 2.1 The Stability-Plasticity Dilemma

The central tension in any learning system that must operate continuously over time is the stability-plasticity dilemma (Grossberg, 1987). A system with maximal plasticity learns rapidly but overwrites prior knowledge catastrophically when trained on new data. A system with maximal stability preserves prior knowledge but cannot adapt to new evidence. All approaches surveyed in this document represent particular resolutions of this dilemma, and the key engineering decisions — what to store, how long to retain it, when to evict or update it, how to weight new versus old evidence — are all instantiations of this tradeoff.

In biological systems, the hippocampus provides rapid one-shot encoding of episodic experiences while the neocortex provides slow integration of statistical regularities across many experiences. The interplay between these systems, including sleep-phase memory consolidation, provides the biological archetype that most AI memory architectures attempt to emulate.

### 2.2 Cognitive Science Foundations

Hermann Ebbinghaus's 1885 monograph *Über das Gedächtnis* established the empirical foundation for memory research, demonstrating that retention follows a forgetting curve with the form R = e^(-t/S) where R is retention, t is time, and S is relative strength. Ebbinghaus also demonstrated the spacing effect: distributed practice over time produces superior long-term retention to massed practice, a finding replicated hundreds of times across modalities, ages, and populations (Cepeda et al., 2006). The direct implication for knowledge management systems is that retrieval timing matters as much as storage content.

The testing effect (Roediger & Karpicke, 2006) extends this insight: the act of retrieval itself strengthens memory more than passive re-exposure. This has direct implications for agent architectures: a system that is periodically queried to retrieve relevant lessons will retain those lessons better than one that merely stores them.

### 2.3 Organizational Learning Theory

Argyris and Schön (1974, 1978) formalized the distinction between single-loop and double-loop learning. In single-loop learning, an agent detects a mismatch between outcome and intention and adjusts its actions while leaving its governing assumptions unchanged. In double-loop learning, the agent interrogates and revises the governing assumptions themselves. This distinction maps directly onto the difference between an AI agent that updates its action selection given fixed objectives (single-loop) and one that revises its representation of the problem, its evaluation criteria, or its model of the environment (double-loop). Most current AI agent improvement mechanisms are single-loop; genuine knowledge compounding arguably requires double-loop capability.

Nonaka and Takeuchi's (1995) SECI model (Socialization, Externalization, Combination, Internalization) provides a complementary framework describing how tacit knowledge — skill held implicitly in practice — is transformed into explicit codified knowledge and then re-internalized. The model predicts that knowledge creation is fundamentally a social process and that the conversion between tacit and explicit forms is the locus of value creation.

### 2.4 Information-Theoretic Foundations

From an information-theoretic perspective, knowledge compounding can be analyzed as the compression of experience. A lesson-learned database that requires O(n) storage to represent n experiences achieves no compounding; one that achieves O(log n) or O(k) fixed-size storage (through abstraction, generalization, and deduplication) is genuinely compounding. The minimum description length (MDL) principle (Rissanen, 1978) provides a formal criterion: the best model of a phenomenon is the one that most compresses the data describing it. Applied to agent knowledge bases, MDL motivates active deduplication, abstraction, and hierarchical organization.

---

## 3. Taxonomy of Approaches

The following table organizes the twelve approaches surveyed along four dimensions: primary mechanism, knowledge representation, scope (session-local vs. persistent), and primary source community.

| # | Approach | Primary Mechanism | Knowledge Representation | Persistence | Source Community |
|---|----------|------------------|--------------------------|-------------|-----------------|
| 1 | Spaced Repetition (SM-2/FSRS) | Interval scheduling | Flash-card facts | Persistent | Cognitive psychology |
| 2 | Organizational KMS / SECI | Tacit-explicit conversion spiral | Documents, narratives | Persistent | Management science |
| 3 | Lessons-Learned Databases | Structured event capture | Structured records | Persistent | NASA, military |
| 4 | Curriculum Learning | Training order optimization | Gradient updates | Parametric | Machine learning |
| 5 | Machine Teaching | Optimal data selection | Gradient updates | Parametric | ML theory |
| 6 | Experience Replay (RL) | Buffered transition resampling | (s,a,r,s') tuples | Session/episode | Reinforcement learning |
| 7 | Continual Learning / EWC | Parameter regularization | Model weights | Parametric | ML research |
| 8 | Retrieval-Augmented Generation | Dense retrieval + generation | Vector index + documents | Persistent | NLP |
| 9 | Knowledge Graphs | Structured entity-relation triples | Graphs / embeddings | Persistent | Knowledge engineering |
| 10 | Agentic Memory (MemGPT, Reflexion, Voyager, A-MEM, Zep) | Hierarchical memory management | Mixed: text, vectors, graphs | Persistent | LLM agents |
| 11 | Near-Duplicate Detection (LSH/MinHash/Embeddings) | Approximate nearest-neighbor hashing | Hash signatures / embeddings | Applied at write-time | Information retrieval |
| 12 | Knowledge Distillation | Teacher-student soft-label transfer | Model weights | Parametric | Model compression |

---

## 4. Analysis

### 4.1 Spaced Repetition and Retrieval Practice

**Theory and Mechanism**

Spaced repetition systems operationalize the spacing effect and the testing effect into scheduling algorithms. The foundational insight from Ebbinghaus (1885) is that memory retention decays exponentially with time but that each successful retrieval resets and elongates the retention curve. The SM-2 algorithm, developed by Piotr Wozniak (1987) for the SuperMemo application, is the historical standard. SM-2 schedules reviews based on a learner-specific "easiness factor" (EF) that increases with successful recalls and decreases with failures. The initial interval is 1 day, the second is 6 days, and subsequent intervals are I(n) = I(n-1) * EF. The EF is updated based on performance using a quality score from 0 to 5.

The Free Spaced Repetition Scheduler (FSRS), introduced by Jarrett Ye in 2022 and now the default algorithm in the Anki application, replaces SM-2 with a neural-inspired model of memory based on the three-component model (retrievability, stability, and difficulty). FSRS-6 demonstrates superior predictive accuracy over SM-17 on cross-comparison benchmarks (Ye, 2022).

**Literature Evidence**

Cepeda et al. (2006) conducted a meta-analysis of 254 studies covering 14,000 participants and confirmed that optimal spacing gaps increase as a function of target retention interval. For retention over one year, optimal spacing is approximately 10-20% of the retention interval. Roediger and Karpicke (2006) demonstrated in controlled experiments that retrieval practice (testing) produces 50% better retention at one week than repeated study, even when total study time is held constant.

**Implementations and Benchmarks**

The Anki flashcard application, using SM-2 and now FSRS, represents the most widely deployed implementation with millions of active users. Studies of medical students using Anki for board examination preparation show substantial knowledge retention gains. SuperMemo continues to use proprietary SM-17 and SM-18 algorithms. Duolingo's Birdbrain system applies spaced repetition at scale across language-learning vocabulary.

**Strengths and Limitations**

Strengths: extremely well-validated empirically across decades and populations; computationally inexpensive; granular scheduling at the individual knowledge item level; naturally handles the stability-plasticity tradeoff by scheduling each item independently. Limitations: assumes discrete, independently reviewable knowledge items — a representation that fits vocabulary learning but maps poorly to complex relational knowledge or multi-step procedural lessons; provides no mechanism for lesson generalization or abstraction; does not handle the case where the value of a lesson depends on context; scheduling quality degrades when items are not truly independent.

**Relevance to AI Agents**

For agents maintaining a lessons-learned knowledge base, spaced repetition provides a principled scheduling layer: lessons that have not been retrieved recently should be surfaced more aggressively during knowledge base review or context injection. The FSRS model's retrievability estimate (the probability of correct recall at a given time) could serve as a confidence-weighted relevance score during retrieval.

---

### 4.2 Organizational Knowledge Management and the SECI Model

**Theory and Mechanism**

Nonaka and Takeuchi's (1995) *The Knowledge-Creating Company* argues that sustainable competitive advantage derives not from static assets but from an organization's capacity to continuously create new knowledge. Their SECI model identifies four knowledge conversion modes arranged as a spiral:

1. **Socialization** (tacit to tacit): Knowledge transferred through shared experience, mentorship, and apprenticeship. The defining characteristic is that knowledge remains in tacit form throughout — the baker's kneading skill transferred to an apprentice.
2. **Externalization** (tacit to explicit): Tacit knowledge is articulated through metaphor, analogy, and dialogue into explicit documents, rules, or models.
3. **Combination** (explicit to explicit): Separate bodies of explicit knowledge are combined, reconfigured, and systematized to produce new explicit knowledge.
4. **Internalization** (explicit to tacit): Explicit knowledge is absorbed through practice until it becomes embodied skill or intuition.

The SECI spiral implies that knowledge creation is a continuous process in which each pass through the four quadrants produces higher-order knowledge. Argyris's (1977) double-loop learning adds the critical observation that organizational learning fails when the underlying governing assumptions are never examined. Organizations that engage only in single-loop adaptation (adjusting actions without questioning assumptions) tend to generate defensive routines that protect existing mental models at the expense of genuine learning.

**Literature Evidence**

The SECI model has been extensively applied in empirical studies of knowledge management across industries. Frontiers in Psychology (2019) published an operationalization study by Castillo and Cazarini documenting structured measurements of each SECI quadrant. Von Krogh et al. (2000) extended the model with the concept of "enabling conditions" (intention, autonomy, fluctuation/creative chaos, redundancy, and requisite variety) that must be present for knowledge creation to proceed.

**Implementations and Benchmarks**

Enterprise KMS platforms including Confluence, SharePoint, and Notion embody the Combination and Externalization quadrants. Communities of practice (Wenger, 1998) provide organizational structures for Socialization. The challenge for AI agent systems is that the SECI model was designed for human organizations and the Socialization and Internalization quadrants have no direct computational analogs — tacit knowledge in an LLM is dispersed across billions of parameters and is not transferable through shared experience in the SECI sense.

**Strengths and Limitations**

Strengths: the most comprehensive theoretical framework for organizational knowledge dynamics; explains why knowledge management is not reducible to document storage; highlights the tacit-explicit interface as the site of value creation; has generated decades of empirical research. Limitations: the tacit/explicit distinction is philosophically contested (Polanyi, 1966; Collins, 2010); the model is descriptive rather than prescriptive and provides limited engineering guidance; difficult to operationalize quantitatively; the spiral metaphor can obscure rather than illuminate actual mechanisms.

---

### 4.3 Lessons-Learned Databases and After-Action Reviews

**Theory and Mechanism**

Lessons-learned systems are the oldest and most institutionally mature approach to organizational knowledge compounding. The foundational structure, refined through decades of practice by NASA, the U.S. military, and defense contractors, involves five phases: identify, verify, store, disseminate, and apply. Each lesson captures: (1) the driving event or situation, (2) the recommendation for future action, (3) the responsible organization, and (4) links to related lessons.

NASA's Lessons Learned Information System (LLIS), established after the *Challenger* disaster (1986) and significantly expanded after *Columbia* (2003), contains thousands of reviewed and approved lessons from across agency programs. The military's After-Action Review (AAR) methodology, developed by the U.S. Army in the 1970s, structures post-event reflection through four questions: What was supposed to happen? What actually happened? Why was there a difference? What should we do differently next time?

The U.S. Army's Center for Army Lessons Learned (CALL) and NATO's Joint Analysis and Lessons Learned Centre (JALLC) represent the operational scale of this approach. The Joint Lessons Learned Information System (JLLIS) provides the U.S. Department of Defense with a unified database intended to enable cross-service lesson sharing.

**Literature Evidence**

A 2002 GAO report (*NASA: Better Mechanisms Needed for Sharing Lessons Learned*, GAO-02-195) documented systemic failures in NASA's lesson dissemination, finding that lessons were collected but rarely applied because retrieval interfaces were poor, lessons lacked action-forcing mechanisms, and incentive structures did not reward lesson application. This finding directly implicates the distinction between a lessons-learned database as a storage system and one that actively compunds — generating returns from retrieval.

**Implementations and Benchmarks**

The APPEL (Academy of Program/Project and Engineering Leadership) KM program at NASA represents the state of practice for government knowledge management. The "Pause and Learn" methodology adapted the military AAR to longer-horizon NASA projects by conducting reflective sessions at milestone boundaries rather than only at project completion. Boeing, Lockheed Martin, and other defense primes maintain proprietary equivalent systems.

**Strengths and Limitations**

Strengths: institutionally proven over decades; structured format ensures minimum information content per lesson; organizational mandate for capture and review; human-vetted quality. Limitations: severe dissemination failure — lessons are captured but not retrieved or applied at decision points; search interfaces are typically keyword-based and unable to surface lessons relevant to semantically-similar but terminologically-distinct situations; lessons age and become misleading as technical context changes without invalidation mechanisms; the process is slow (weeks to months between event and approved lesson) which creates recency gaps; no automated deduplication leads to redundancy and contradiction across entries.

---

### 4.4 Curriculum Learning and Machine Teaching

**Theory and Mechanism**

Curriculum learning (Bengio et al., 2009) is the observation that training machine learning models on examples ordered from simple to complex produces faster convergence and better generalization than random ordering. The approach draws on two precedents: behavioral shaping in animal training (Skinner, 1938), which rewards approximations of desired behavior rather than requiring perfect performance from the start; and structured pedagogy in human education, in which foundational concepts precede advanced applications.

Bengio et al. (2009) demonstrated that curriculum learning can be interpreted as a continuation method: training on simple examples first defines a smooth optimization landscape that can be progressively sharpened. The formal connection is to simulated annealing — easy examples define a heavily smoothed loss surface, and the curriculum progressively reduces the temperature.

Machine teaching (Zhu, 2015; Zhu et al., 2018) is the dual of machine learning: given a target model, what is the minimum-size training dataset that causes a learner to converge to that model? Machine teaching formalizes the inverse problem and provides theoretical results on teaching dimension — the minimum number of examples needed to uniquely specify a concept to a learner with known learning algorithm. For learners with known hypothesis classes, teaching dimensions can be dramatically smaller than the VC dimension, implying that carefully selected examples compound the learning leverage of each example.

Self-paced learning (Kumar et al., 2010) extends curriculum learning by having the model itself determine the ordering — selecting the next examples based on the model's current confidence, rather than relying on a fixed externally-defined curriculum.

**Literature Evidence**

Bengio et al. (2009) demonstrated curriculum learning benefits on language modeling and image classification tasks at ICML. Hacohen and Weinshall (2019) provided systematic analysis of when curriculum learning helps: it is most beneficial when the hypothesis class has large capacity relative to the dataset size and when the data contains genuine difficulty structure (not just noise). Graves et al. (2017) applied curriculum learning in a framework called Automated Curriculum Learning that uses multi-armed bandit methods to select task difficulty online.

**Implementations and Benchmarks**

OpenAI's reinforcement learning from human feedback (RLHF) pipeline implicitly incorporates curriculum principles through the staged finetuning process: supervised finetuning on demonstrations precedes reward model training precedes PPO optimization, each stage providing progressively more abstract feedback. Self-play systems such as AlphaZero (Silver et al., 2018) implement an organic curriculum through opponent matching: the agent always trains against versions of itself at the frontier of its current capability, providing a curriculum that continuously adapts to the agent's level.

**Strengths and Limitations**

Strengths: well-grounded theoretically and empirically; directly applicable to training pipelines; the machine teaching formulation provides optimal data selection guarantees under idealized conditions; self-paced variants do not require external curriculum design. Limitations: curriculum design for real-world open-ended tasks remains largely a manual art; the theoretical guarantees of machine teaching assume fixed learner algorithms, which does not hold for deep learning; the field lacks agreed-upon difficulty metrics for complex multi-step tasks; curricula designed for one domain do not transfer to others.

---

### 4.5 Experience Replay in Reinforcement Learning

**Theory and Mechanism**

Experience replay (Lin, 1992) is a technique in which an RL agent stores its past transitions (state, action, reward, next-state) in a replay buffer and periodically samples mini-batches from this buffer to train its value function. The motivation is twofold: (1) decorrelation — sequential transitions from a single trajectory are highly correlated, which violates the i.i.d. assumption of gradient descent; and (2) data efficiency — each transition can be reused for multiple gradient updates, dramatically improving sample efficiency over pure online learning.

Mnih et al. (2015) demonstrated in the DQN paper that experience replay was one of two critical components (alongside target networks) enabling deep Q-learning to achieve human-level performance on Atari games. Without replay, the online DQN diverged on most games; with replay and target networks, it surpassed human performance on 29 of 49 games.

Prioritized Experience Replay (Schaul et al., 2016) replaces uniform sampling from the replay buffer with weighted sampling based on the absolute temporal-difference (TD) error of each transition. Transitions with high TD error are more surprising and thus more informative for learning. Stochastic prioritization uses P(i) = p_i^α / Σ p_j^α with importance-sampling corrections to control bias.

**Literature Evidence**

Schaul et al. (2016) demonstrated that prioritized replay significantly outperforms uniform replay across a large fraction of Atari games when combined with Double DQN, with improvements of up to 30% in normalized score. Andrychowicz et al. (2017, Hindsight Experience Replay) extended replay to sparse-reward settings by relabeling failed trajectories with alternative goals, enabling learning from failure even when the intended goal was never reached.

Map-based experience replay (Emre et al., 2023) addresses the memory efficiency problem, showing that compact state-based abstraction of replay buffers can achieve equivalent anti-forgetting performance with dramatically lower storage overhead.

**Implementations and Benchmarks**

Experience replay is a standard component of virtually all off-policy deep RL algorithms: DQN, DDPG, SAC, TD3. The OpenAI Gym and Atari ALE benchmarks serve as the standard evaluation platforms. At industrial scale, DeepMind's AlphaGo and AlphaZero use replay buffers storing millions of self-play game states; reinforcement learning from human feedback (RLHF) pipelines store human preference labels for policy optimization.

**Strengths and Limitations**

Strengths: proven to be essential for sample-efficient deep RL; theoretically well-motivated as decorrelation and data reuse; prioritized variants efficiently allocate compute to high-information transitions; hindsight relabeling extends utility to sparse reward settings; memory requirements are manageable with fixed-size circular buffers. Limitations: standard replay assumes a stationary environment — in non-stationary settings, old transitions may be misleading; prioritization based on TD error can bias toward rare but unimportant outlier transitions; replay buffers do not abstract or generalize — each transition is stored atomically with no lesson extraction; does not naturally scale to multi-task or continual learning settings where distributions shift fundamentally.

---

### 4.6 Continual Learning and Catastrophic Forgetting Mitigation

**Theory and Mechanism**

Continual learning (also called lifelong learning or sequential learning) addresses the problem of training a neural network on a sequence of tasks without catastrophic forgetting — the phenomenon in which learning new information destroys performance on previously learned tasks. McCloskey and Cohen (1989) identified catastrophic interference in connectionist networks; Ratcliff (1990) formalized the problem for neural networks; and the problem has been a central challenge in the field ever since.

Three families of solutions have been identified:

1. **Regularization-based methods** add penalty terms to the loss function that constrain the movement of parameters important to prior tasks. Elastic Weight Consolidation (EWC, Kirkpatrick et al., 2017) uses the Fisher Information Matrix to measure parameter importance and imposes a quadratic penalty scaled by that importance. Formally: L = L_B(θ) + (λ/2) Σ F_i (θ_i - θ^*_A,i)^2 where F_i is the Fisher information for parameter i and θ^*_A is the parameter vector after training on task A.

2. **Replay-based methods** retain either actual examples from prior tasks or generative model outputs and interleave them with new-task training. Progressive Neural Networks (Rusu et al., 2016) freeze prior task columns and grow new lateral connections. DEN (Dynamically Expandable Networks) adds capacity as needed.

3. **Architectural methods** partition network capacity across tasks, dedicating subnetworks or modules to specific task families. PackNet (Mallya & Lazebnik, 2018) uses iterative parameter pruning and packing to allocate disjoint parameter subsets to successive tasks.

**Literature Evidence**

Kirkpatrick et al. (2017, PNAS) demonstrated that EWC preserves performance on prior tasks in a continual Atari learning setting where standard deep RL catastrophically forgets. A 2022 comprehensive survey (De Lange et al., IEEE TPAMI) covers over 300 papers in the field and provides a systematic taxonomy.

**Implementations and Benchmarks**

Standard benchmarks include Split CIFAR-10, Permuted MNIST, and Split MiniImagenet for supervised settings; and continual Atari for RL. The Avalanche framework (Lomonaco et al., 2021) provides a unified implementation of major CL algorithms.

**Strengths and Limitations**

Strengths: directly targets the stability-plasticity dilemma at the parameter level; EWC is elegant and computationally tractable; regularization-based methods require no separate memory stores. Limitations: EWC's Fisher Information approximation is imprecise for deep nonlinear networks; regularization-based methods face gradient interference in overparameterized regimes; architectural methods scale poorly with number of tasks; none of these methods abstract or generalize — they preserve task performance but do not extract reusable knowledge in an inspectable form.

---

### 4.7 Retrieval-Augmented Generation

**Theory and Mechanism**

Retrieval-Augmented Generation (RAG, Lewis et al., 2020) augments the generation process of a language model by conditioning it on documents retrieved from an external non-parametric knowledge store. The architecture combines a dense retriever (typically a bi-encoder neural model such as DPR) with a sequence-to-sequence generator. The retriever selects the k most relevant documents from the knowledge base given the input query; the generator is conditioned on both the query and the retrieved documents to produce the output.

RAG addresses a fundamental limitation of purely parametric models: knowledge is frozen at training time, requires expensive retraining to update, and the parametric representation makes knowledge attribution difficult (hallucination). By externalizing knowledge to a retrievable store, RAG enables knowledge updates at near-zero cost (add or modify documents without retraining) and provides attributable, inspectable knowledge grounding.

GraphRAG (Edge et al., 2024; Microsoft Research) extends RAG by replacing the vector store with a knowledge graph, enabling multi-hop relational reasoning that dense vector similarity cannot support. The Graph Retrieval-Augmented Generation survey (Guo et al., 2024, arXiv 2408.08921) systematizes GraphRAG methods along Graph-Based Indexing, Graph-Guided Retrieval, and Graph-Enhanced Generation axes.

**Literature Evidence**

Lewis et al. (2020, NeurIPS) demonstrated state-of-the-art performance on Open-domain QA benchmarks including Natural Questions, WebQuestions, and TriviaQA. The REALM (Guu et al., 2020) and Atlas (Izacard et al., 2022) systems further refined dense retrieval for knowledge-intensive tasks. A comprehensive survey (Zhang et al., 2024, arXiv 2410.12837) covers the evolution from vanilla RAG through modular and adaptive RAG variants.

**Implementations and Benchmarks**

LangChain, LlamaIndex, Haystack, and Weaviate represent the primary open-source implementation ecosystems. BEIR (Thakur et al., 2021) provides a heterogeneous benchmark of 18 information retrieval tasks for retriever evaluation. RAGAS provides a framework for automated RAG pipeline evaluation.

**Strengths and Limitations**

Strengths: knowledge updates do not require retraining; knowledge is inspectable and attributable; dramatically reduces hallucination on knowledge-grounded tasks; composable with any generator architecture; scales gracefully with knowledge base size through approximate nearest-neighbor indexing. Limitations: retrieval quality is a hard ceiling on generation quality — relevant but poorly-indexed knowledge cannot be surfaced; long-context integration of multiple retrieved documents is an unsolved problem; dense embedding similarity is poor at multi-hop reasoning; no mechanism for identifying knowledge base conflicts or contradictions; naive RAG accumulates knowledge without compressing, abstracting, or deduplicating.

---

### 4.8 Knowledge Graphs for Agent Memory

**Theory and Mechanism**

Knowledge graphs represent facts as typed triples (head entity, relation, tail entity), enabling structured, queryable, and compositional knowledge representation. The Semantic Web stack (Berners-Lee et al., 2001) provided early formal foundations through RDF, OWL, and SPARQL. The modern knowledge graph era was inaugurated by Google's Knowledge Graph (2012), followed by Freebase, Wikidata, DBpedia, and domain-specific graphs in medicine, law, and science.

Knowledge graph embedding (KGE) methods learn low-dimensional vector representations of entities and relations to enable efficient similarity computation and link prediction. TransE (Bordes et al., 2013) represents relations as translations in embedding space: for a valid triple (h, r, t), h + r ≈ t. More expressive models include RotatE (Sun et al., 2019), ComplEx (Trouillon et al., 2016), and QuatE (Zhang et al., 2019).

For agent memory, knowledge graphs offer three critical advantages over vector stores: (1) explicit relational structure enables multi-hop reasoning; (2) entity disambiguation via unique identifiers prevents the conflation of distinct entities with similar surface forms; and (3) temporal provenance can be attached to triples, enabling time-aware reasoning.

**Literature Evidence**

The survey by Cai et al. (2022, arXiv 2208.11652) reviews knowledge graph completion methods systematically. The Knowledge Graph Embedding survey (Liang et al., 2022, arXiv 2211.03536) covers representation space perspectives from algebraic, geometric, and analytical angles.

**Implementations and Benchmarks**

Wikidata (55+ million entities), Google Knowledge Graph, Microsoft Satori, and Neo4j represent production-scale deployments. FB15k-237 and WN18RR are standard benchmarks for KGE evaluation. The Zep system (Rasmussen et al., 2025, arXiv 2501.13956) represents the state of the art in applying temporal knowledge graphs to agent memory, achieving 94.8% accuracy on the Deep Memory Retrieval benchmark — compared to 93.4% for MemGPT — while reducing response latency by 90% on LongMemEval.

**Strengths and Limitations**

Strengths: structured representation enables formal reasoning and query languages; knowledge is inspectable, editable, and attributable; temporal KGs support fact validity tracking; entity canonicalization prevents synonym proliferation; scales to billions of facts. Limitations: knowledge graph construction from natural language is imperfect — entity extraction and relation classification introduce errors that compound; sparse coverage for long-tail entities; ontology design is a high-overhead process; the gap between graph-structured knowledge and natural language generation requires bridging mechanisms; temporal KGs are more complex to maintain than static graphs.

---

### 4.9 Agentic Memory Architectures

This subsection covers six systems that represent the current frontier of AI agent memory design.

**MemGPT (Packer et al., 2023)**

*Theory and mechanism*: MemGPT (arXiv 2310.08560, UC Berkeley) applies operating system concepts to LLM context management. The system maintains a hierarchy: a fast main context (analogous to RAM) and a slower external storage (analogous to disk). The LLM itself controls memory movement between tiers via function calls — it can write important information to external storage, retrieve relevant information into context, and search the storage when needed. This turns the LLM into an active memory manager rather than a passive consumer of fixed context.

*Literature evidence and benchmarks*: MemGPT demonstrated superior performance on multi-session conversational tasks requiring recall across sessions and on document analysis tasks requiring processing of documents larger than the context window.

*Strengths and limitations*: The OS abstraction is elegant and directly addresses the core context locality problem. Limitations include dependence on the LLM's self-assessment of what deserves storage (which can be miscalibrated), high token cost for memory management function calls, and no principled mechanism for deduplication or knowledge abstraction.

**Reflexion (Shinn et al., 2023)**

*Theory and mechanism*: Reflexion (arXiv 2303.11366, NeurIPS 2023) implements verbal reinforcement learning — the agent generates natural language reflections on its past failures and stores these in an episodic memory buffer. On subsequent episodes, the reflection is prepended to the agent's context, providing a semantic gradient signal without weight updates. The framework converts environment feedback (binary success/failure signals) into actionable textual self-critiques.

*Literature evidence and benchmarks*: Reflexion agents improved over baselines by 22% on AlfWorld decision-making tasks in 12 iterative steps, by 20% on HotpotQA reasoning, and by 11% on HumanEval Python programming — all without gradient updates.

*Strengths and limitations*: The verbal reflection mechanism is a clean instantiation of double-loop learning — the agent revises not just its action but its model of why the action failed. Limitations: reflections accumulate without consolidation or deduplication; the memory buffer grows unboundedly with episodes; reflections are not abstracted into generalizable lessons, making them session-specific; there is no mechanism to detect when prior reflections become outdated or misleading.

**Voyager (Wang et al., 2023)**

*Theory and mechanism*: Voyager (arXiv 2305.16291) is a lifelong learning agent operating in Minecraft. Its key innovation for knowledge compounding is the skill library — an ever-growing repository of executable JavaScript functions representing skills the agent has developed. Each skill is stored with its natural language description, allowing the agent to retrieve relevant skills by semantic similarity when planning new tasks. The automatic curriculum component determines which tasks to attempt next, implementing an emergent self-paced curriculum.

*Literature evidence and benchmarks*: Voyager obtains 3.3x more unique items, unlocks stone tools 8.5x faster and iron tools 6.4x faster than baseline agents. The skill library enables progressive skill composition — later skills are built on top of earlier ones, implementing genuine knowledge compounding.

*Strengths and limitations*: The executable skill library is a significant advance — skills are verifiable (they either work or they do not), composable, and retrievable. Limitations: the approach is specific to coding environments; skill quality is uneven (some stored skills are overfitted to specific situations); no mechanism for skill abstraction or generalization; the curriculum is implicit and may miss important skill gaps.

**LATS (Zhou et al., 2023/2024)**

*Theory and mechanism*: Language Agent Tree Search (arXiv 2310.04406, ICML 2024) unifies reasoning, acting, and planning by applying Monte Carlo Tree Search (MCTS) to LLM-based agents. The LLM serves three roles simultaneously: action generator, value function, and reflection generator. Critically, LATS generates self-reflections at suboptimal tree nodes, which are incorporated into subsequent search trajectories — implementing a within-episode form of knowledge compounding through tree-structured exploration with reflection.

*Literature evidence and benchmarks*: LATS achieves 92.7% pass@1 on HumanEval (GPT-4), state-of-the-art at publication, and strong performance on WebShop navigation.

*Strengths and limitations*: The tree search structure provides a principled exploration mechanism; reflections are used within-episode to guide search away from previously failed paths. Limitations: LATS knowledge is within-episode only — reflections are not persisted across agent sessions; tree search scales poorly to very long-horizon tasks; high computational cost per query.

**Generative Agents (Park et al., 2023)**

*Theory and mechanism*: Park et al. (arXiv 2304.03442, UIST 2023) introduced a memory architecture for believable human-like simulation in a sandbox environment. The architecture has three key components: a memory stream (a complete natural language log of all experiences), reflection (periodic synthesis of high-level observations from recent memories), and planning (translating reflections into future actions). The reflection component is particularly relevant: the agent periodically identifies its most salient recent memories, poses questions about them, and synthesizes higher-level insights — an explicit externalization step in the SECI sense.

*Literature evidence and benchmarks*: Qualitative evaluation showed that agents with the full architecture (stream + reflection + planning) behaved significantly more coherently and believably than ablated versions missing reflection, confirming that periodic knowledge abstraction is critical for long-horizon coherence.

*Strengths and limitations*: The reflection mechanism implements explicit episodic-to-semantic memory consolidation. Limitations: reflections are in natural language and are not structured or indexed; no deduplication mechanism; the reflection schedule is time-based rather than triggered by knowledge need; the architecture was designed for social simulation, not for error correction in tool-using agents.

**A-MEM (Xu et al., 2025)**

*Theory and mechanism*: A-MEM (arXiv 2502.12110, NeurIPS 2025) introduces an agentic memory system inspired by the Zettelkasten note-taking method. When a new memory is added, the system generates a structured note containing contextual descriptions, keywords, and tags, then analyzes historical memories to identify relevant connections and establishes links between related memories. Critically, integrating new memories can trigger updates to the contextual representations of existing memories — the memory network continuously refines its understanding rather than merely accumulating.

*Literature evidence and benchmarks*: Experiments on six foundation models show superior performance against existing state-of-the-art baselines, including MemGPT.

*Strengths and limitations*: The Zettelkasten-inspired architecture is a significant step toward genuine knowledge compounding — new knowledge not only adds to but restructures existing knowledge. Limitations: the LLM-based memory management is expensive; the quality of automatically generated tags and connections depends heavily on the LLM's judgment; the system has not yet been evaluated on long multi-session tasks requiring knowledge transfer across distant problem domains.

**Zep / Graphiti (Rasmussen et al., 2025)**

*Theory and mechanism*: Zep (arXiv 2501.13956) builds agent memory on a temporally-aware dynamic knowledge graph engine called Graphiti. The graph maintains three tiers: an episode subgraph (raw conversation records), a semantic entity subgraph (extracted entities and relations), and a community subgraph (higher-level clusters). The bi-temporal data model tracks both event occurrence time and ingestion time, enabling reasoning about when facts were true and when they were learned — supporting temporal queries unavailable to purely vector-indexed systems.

*Literature evidence and benchmarks*: Zep achieves 94.8% accuracy on Deep Memory Retrieval vs. 93.4% for MemGPT, and up to 18.5% accuracy improvement on LongMemEval while reducing response latency by 90%.

*Strengths and limitations*: The temporal knowledge graph provides the most structured and queryable knowledge representation among current agent memory systems. Limitations: construction of the knowledge graph from unstructured dialogue introduces extraction errors; the system requires a running graph database (Neo4j-compatible) adding operational complexity; the community subgraph construction has latency that makes it unsuitable for real-time high-frequency updates.

---

### 4.10 Near-Duplicate Detection and Knowledge Base Deduplication

**Theory and Mechanism**

As knowledge bases grow, deduplication becomes a critical maintenance operation. Without it, redundant or near-redundant lessons accumulate, increasing retrieval noise, conflicting with each other, and consuming storage without proportional value. Three families of deduplication techniques are relevant to knowledge compounding systems:

1. **Exact deduplication** using cryptographic hashing (MD5, SHA-256) identifies bit-identical documents and is trivially applicable but insufficient for near-duplicates.

2. **MinHash / Locality-Sensitive Hashing (LSH)** (Broder, 1997; Indyk & Motwani, 1998) provides probabilistic near-duplicate detection at scale. MinHash estimates Jaccard similarity between documents by computing the probability that the minimum hash value of their shingle sets (k-word subsequences) is identical. LSH partitions the MinHash signature into bands so that document pairs sharing at least one band in the same bucket are flagged as candidates. The expected false negative rate is (1 - s^r)^b where s is true similarity, r is rows per band, and b is the number of bands. This enables sublinear-time near-duplicate detection in corpora of billions of documents.

3. **Embedding similarity** uses dense vector representations from a pretrained language model to identify semantically similar (but not necessarily lexically similar) documents. Cosine similarity between embedding vectors captures semantic near-duplication that MinHash (which operates on surface-level shingles) misses. For knowledge base deduplication, this is critical: two lessons expressing the same recommendation in different terminology should be merged.

**Literature Evidence**

MinHash was originally published by Broder (1997) for web page deduplication at AltaVista. Rajaraman and Ullman (2011, *Mining of Massive Datasets*) provide the canonical formal treatment of LSH. For LLM training data deduplication, Lee et al. (2022, arXiv) demonstrated that MinHash deduplication of Common Crawl significantly improves downstream LLM quality. Zilliz (2024) documented MinHash LSH applied at trillion-document scale for LLM pretraining deduplication. The critique of cosine similarity as a semantic similarity metric by Steck et al. (2024, arXiv 2403.05440) provides important nuance: cosine similarity of embeddings captures direction but not magnitude, and may produce surprising similarity patterns in high-dimensional spaces.

**Implementations and Benchmarks**

The datasketch library provides Python implementations of MinHash and LSH. The text-dedup library supports both MinHash and embedding-based deduplication for large corpora. For knowledge base management, the practical implementation combines MinHash for high-recall candidate generation with embedding similarity reranking for high-precision deduplication decisions.

**Strengths and Limitations**

Strengths: MinHash LSH scales to massive datasets with sublinear time and space complexity; embedding similarity captures semantic near-duplication beyond lexical overlap; both methods are well-characterized mathematically. Limitations: MinHash's shingle-based similarity is brittle to reordering and paraphrase; embedding similarity collapses distinct lessons that happen to share contextual features; no deduplication technique addresses the harder problem of lesson conflict detection — identifying lessons that provide contradictory recommendations for the same situation.

---

### 4.11 Pattern Mining and Frequent-Pattern Extraction

**Theory and Mechanism**

Frequent-pattern mining (Agrawal & Srikant, 1994) identifies regularities in event databases by discovering itemsets that co-occur with frequency above a minimum support threshold. The Apriori algorithm exploits the anti-monotonicity of support (any superset of an infrequent itemset is also infrequent) to prune the exponential search space. The FP-Growth algorithm (Han et al., 2000) eliminates candidate generation entirely by encoding the database as a compressed FP-Tree, achieving runtime independent of the number of frequent patterns.

Applied to knowledge compounding for AI agents, pattern mining offers a path to lesson abstraction: if a specific error pattern (tool misuse, schema misunderstanding, faulty chain-of-thought structure) recurs across multiple episodes, the recurring pattern is a candidate for abstraction into a general lesson. A system that stores 100 episode-specific observations about API parameter ordering errors can, through frequent-pattern mining, extract a single general lesson about that error class — compressing 100 items into one.

Sequential pattern mining (Srikant & Agrawal, 1996) extends the approach to ordered sequences, enabling discovery of recurring action sequences or error sequences in agent trajectories.

**Literature Evidence**

Han et al.'s (2000) FP-Growth paper remains among the most-cited papers in data mining. Recent work on learning from agent trajectories has applied sequence mining to identify recurring failure patterns; Carta et al. (2023) demonstrated pattern mining over agent experience logs to extract recurring behavioral templates. Association rule mining (confidence, lift, and leverage metrics) provides the evaluation framework for extracted patterns.

**Implementations and Benchmarks**

The mlxtend library provides implementations of Apriori, FP-Growth, and association rule mining. SPMF (Sequential Pattern Mining Framework) covers 200+ algorithms for sequential and temporal pattern mining. PrefixSpan is the standard efficient algorithm for sequential pattern mining.

**Strengths and Limitations**

Strengths: scales to large episode databases; produces human-interpretable rules; the frequent-pattern constraint ensures that extracted lessons reflect genuine regularities rather than idiosyncratic observations; sequential mining captures temporal structure of error cascades. Limitations: frequent-pattern mining produces rules, not lessons — the extracted pattern must still be translated into actionable advice; support-threshold selection is a hyperparameter with no principled optimal setting; patterns are symmetric whereas lessons are directional (condition → recommendation); rare but high-impact errors (the long tail of failure) are systematically suppressed by frequency-based filtering.

---

### 4.12 Knowledge Distillation and Compression

**Theory and Mechanism**

Knowledge distillation (Hinton et al., 2015, arXiv 1503.02531) transfers knowledge from a large, high-capacity teacher model to a smaller student model by training the student to match the teacher's soft output distributions rather than hard labels. The soft outputs (with temperature parameter T > 1 increasing distribution entropy) encode rich information about the teacher's uncertainty and the relative similarities between classes — information that is discarded by hard labels. Formally, the distillation loss is L = (1-α) L_CE(y, p_s) + α L_CE(q_T, p_T) where q_T and p_T are teacher and student soft outputs at temperature T.

Applied to knowledge compounding for AI agents, distillation provides a mechanism for compressing experience into parametric representations. An agent that has accumulated many episodic lessons can use those lessons as supervision signal to finetune a smaller model that implicitly generalizes across lessons. This transforms external knowledge storage (the lessons database) into internal parametric knowledge (model weights) — the Internalization step in the SECI spiral.

Model compression techniques more broadly — pruning, quantization, and low-rank factorization — are complementary approaches that reduce parametric knowledge to a more compact form without knowledge transfer from a teacher.

**Literature Evidence**

Hinton et al. (2015) demonstrated distillation on MNIST and speech recognition, achieving student performance competitive with the teacher at a fraction of the parameter count. Gou et al. (2021, IJCV) provide a comprehensive survey of knowledge distillation covering response-based, feature-based, and relation-based distillation variants. For LLMs specifically, Gu et al. (2024) demonstrated that distilling reasoning traces from GPT-4 into smaller open-source models yields strong performance on reasoning benchmarks — an approach they call knowledge chain-of-thought distillation.

**Implementations and Benchmarks**

DistilBERT (Sanh et al., 2019) achieves 97% of BERT performance at 40% of the parameter count using distillation. TinyBERT (Jiao et al., 2020) extends distillation to intermediate layer activations. The HuggingFace ecosystem provides tooling for distillation-based model compression.

**Strengths and Limitations**

Strengths: compresses accumulated knowledge into a compact parametric form that requires no retrieval infrastructure at inference time; can generalize beyond specific stored lessons if the training signal provides sufficient coverage; established theoretical and empirical literature. Limitations: the distilled model inherits the teacher's errors and biases; lessons learned after distillation require re-distillation to be incorporated; the mapping from external lessons to appropriate soft-label supervision signals is non-trivial for complex procedural knowledge; distillation fundamentally cannot exceed the teacher's capability ceiling on held-out distributions.

---

## 5. Comparative Synthesis

The following table presents a cross-cutting comparative analysis of the twelve approaches across seven dimensions: computational cost, knowledge representation expressiveness, ability to support cross-session persistence, deduplication support, abstraction capability, support for multi-hop reasoning, and editability.

| Approach | Compute Cost | Knowledge Representation | Cross-Session Persistence | Deduplication | Abstraction | Multi-Hop Reasoning | Editability |
|---|---|---|---|---|---|---|---|
| Spaced Repetition (SM-2/FSRS) | Very Low | Flat fact items | Yes | Manual | None | None | Full |
| Org. KMS / SECI | Low (human cost high) | Documents, narratives | Yes | Manual | Human-driven | Weak | Full |
| Lessons-Learned DBs | Low | Structured records | Yes | Manual | Human-driven | Keyword search | Full |
| Curriculum Learning | High (training) | Model weights | Via retraining | N/A | Implicit | Via model | None |
| Machine Teaching | High (optimal design) | Model weights | Via retraining | N/A | Implicit | Via model | None |
| Experience Replay | Medium | Transition tuples | No (episode-local) | None | None | None | Limited |
| Continual Learning / EWC | High (training) | Model weights | Via regularization | N/A | Implicit | Via model | None |
| RAG | Low (retrieval) | Vectors + documents | Yes | Partial (chunking) | None | Limited | Full |
| Knowledge Graphs | Medium | Typed triples | Yes | Via entity resolution | Limited | Full | Full |
| Agentic Memory (MemGPT etc.) | Medium-High | Mixed | Yes | Limited | Partial | Partial | Partial |
| LSH / MinHash / Embedding Dedup | Low-Medium | Hash signatures / vectors | Applied at write-time | Full (this IS dedup) | None | None | N/A |
| Knowledge Distillation | Very High (training) | Model weights | Via retraining | N/A | Implicit | Via model | None |

**Cross-Cutting Observations**

*Persistence vs. Parametric Trade-off*: Approaches that store knowledge externally (RAG, knowledge graphs, lessons-learned DBs, agentic memory systems) provide full editability and immediate update without retraining, but require retrieval infrastructure and are subject to retrieval failures. Approaches that encode knowledge parametrically (curriculum learning, EWC, distillation) require no retrieval overhead at inference time but cannot be updated incrementally and cannot explain their knowledge.

*Abstraction Gap*: Nearly all current approaches treat the abstraction problem as solved externally or not at all. Experience replay stores raw transitions; RAG stores raw documents; MemGPT stores raw text. Only Voyager (skill library), A-MEM (Zettelkasten linking), and Generative Agents (periodic reflection) implement any form of automatic abstraction. Pattern mining provides a principled mechanism for abstraction that has been underutilized in the agent memory literature.

*Deduplication Gap*: The majority of approaches have no principled deduplication mechanism. Knowledge bases that accumulate without deduplication develop noise, redundancy, and contradiction that degrade retrieval precision. LSH/MinHash and embedding-based deduplication address this directly but are typically not integrated into the agent memory pipeline.

*Evaluation Fragmentation*: Each research community uses different benchmarks and evaluation protocols, making cross-approach comparison difficult. RL replay methods are evaluated on Atari or MuJoCo; continual learning uses Split CIFAR or Permuted MNIST; agentic memory systems use DMR, LongMemEval, or task-specific benchmarks; KMS approaches use qualitative organizational case studies. No unified benchmark for long-horizon knowledge compounding in AI agents currently exists.

---

## 6. Open Problems and Gaps

**6.1 Cross-Session Lesson Transfer**

The most urgent unsolved problem is the reliable transfer of lessons across agent sessions. Current systems either ignore this (standard LLM inference), handle it manually (human-maintained instructions), or use retrieval mechanisms that assume the future query will be lexically or semantically similar to the stored lesson. When future problems are structurally analogous but surface-form different — the hallmark of genuine understanding — current retrieval mechanisms fail. Analogical reasoning over a lesson base remains an open problem.

**6.2 Conflict Detection and Resolution**

As knowledge bases grow, conflicting lessons accumulate. Two lessons recommending opposite actions in similar situations cannot both be correct, yet no current automated system detects or resolves such conflicts. This is qualitatively different from deduplication (which merges similar items) — it requires semantic reasoning about lesson semantics and the ability to assign revision priorities based on evidence quality, recency, and domain scope.

**6.3 Lesson Granularity and Scope**

What is the right level of abstraction for a lesson? Too specific (this API call fails when parameter X is None) and the lesson does not generalize; too general (validate all inputs) and the lesson does not provide actionable guidance. Current systems do not address this question principled. The machine teaching literature's concept of teaching dimension provides a partial theoretical handle, but operationalizing it for natural-language lessons in open-ended domains remains an open problem.

**6.4 Multi-Agent Knowledge Fusion**

When multiple agents accumulate knowledge independently, how should their knowledge bases be merged? This problem is analogous to distributed database reconciliation but complicated by the absence of a shared ontology, the possibility of conflicting observations from different contexts, and the difficulty of attributing lesson provenance. The A-MEM Zettelkasten approach hints at a path through link-based integration, but multi-agent settings introduce additional challenges.

**6.5 Temporal Decay and Lesson Invalidation**

Lessons have lifetimes. A lesson about a specific library API version becomes misleading when the API changes. A lesson about a model behavior becomes invalid when the model is updated. Current lessons-learned systems (NASA LLIS, military AAR databases) handle this through manual review cycles, which scale poorly. Automated temporal decay modeling — combining the Ebbinghaus forgetting curve's insights about memory strength with explicit validity tracking from temporal knowledge graphs — represents an important design target.

**6.6 Evaluation Protocols**

The field lacks agreed evaluation protocols for knowledge compounding. Proposed metrics include: (a) compounding efficiency — the ratio of performance improvement to knowledge base size growth; (b) lesson transfer distance — how different (in embedding space) the retrieval query can be from the stored lesson while still producing useful guidance; (c) anti-forgetting rate — the rate at which old lessons are invalidated by new ones; and (d) abstraction quality — the degree to which stored lessons generalize beyond their source episodes.

**6.7 Interpretability and Auditability**

For AI systems deployed in high-stakes contexts (software engineering, medical information retrieval, legal analysis), the knowledge base must be auditable. Parametric approaches (distillation, continual learning) make knowledge opaque; they cannot explain which stored lesson influenced a given output. External knowledge stores (KGs, RAG systems, structured lessons DBs) are inherently more auditable but require retrieval attribution to trace the influence of specific stored knowledge on specific outputs.

**6.8 Tacit Knowledge Capture**

The SECI model identifies tacit knowledge as the most valuable and least tractable form. In AI systems, tacit knowledge corresponds to capabilities distributed across model weights that are not expressible as discrete lessons — the model's implicit understanding of coding style, problem structure, or user intent. Current knowledge compounding systems focus exclusively on explicit, declarative knowledge. Mechanisms for externalizing and then re-internalizing tacit model knowledge remain entirely open.

---

## 7. Conclusion

This survey has examined twelve bodies of research bearing on the problem of knowledge compounding for AI agents. Several cross-cutting structural observations emerge without resolving into a single preferred approach.

First, the most mature approaches to knowledge compounding are not in the AI literature at all. NASA's LLIS, the U.S. Army's AAR methodology, and Nonaka and Takeuchi's SECI framework represent decades of disciplined practice and theorization about how organizations capture, organize, and apply hard-won experience. The AI agent community would benefit significantly from more substantive engagement with this literature.

Second, the stability-plasticity dilemma is ubiquitous and irreducible. Every approach in this survey represents a different resolution of the tension between preserving old knowledge and integrating new knowledge. No approach resolves the dilemma; each shifts the tradeoff point. The appropriate resolution is domain- and context-dependent: high-stakes, slow-changing domains warrant stronger stability constraints; high-velocity, exploratory domains warrant stronger plasticity.

Third, abstraction is the bottleneck. The gap between accumulating experience (which all systems can do) and compounding knowledge (which requires abstraction into reusable, generalizable lessons) is the central unsolved problem. Pattern mining, reflection mechanisms (Generative Agents, Reflexion), and the Zettelkasten-inspired architecture of A-MEM provide partial solutions. None provides a complete, principled, automated pathway from raw experience to abstract reusable lesson.

Fourth, deduplication is a prerequisite, not an afterthought. Knowledge bases that grow without principled deduplication develop properties — noise, redundancy, contradiction — that make them progressively worse as retrieval substrates. The near-duplicate detection literature (MinHash, LSH, embedding similarity) provides well-validated, scalable solutions that should be integrated into every knowledge compounding system from the start.

Fifth, evaluation fragmentation prevents systematic progress. The field cannot improve what it cannot measure. The development of a unified, task-independent benchmark for long-horizon knowledge compounding in AI agents is a prerequisite for the community to make cumulative progress.

The overall landscape suggests that genuine knowledge compounding in AI agents — the achievement of logarithmic or constant storage growth with increasing experience through principled abstraction and generalization — remains an open problem. Current systems achieve at best linear accumulation with retrieval indexing. The theoretical tools to reason about knowledge compounding efficiency exist (MDL, teaching dimension, information-theoretic compression); the practical systems that implement these principles at the scale and speed required for deployed agents do not yet exist.

---

## References

**Foundational Cognitive Science**

- Ebbinghaus, H. (1885). *Über das Gedächtnis: Untersuchungen zur experimentellen Psychologie*. Duncker & Humblot. [Translated as *Memory: A Contribution to Experimental Psychology*, 1913]
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3), 249-255.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354-380.

**Spaced Repetition Algorithms**

- Wozniak, P. A. (1987). SM-2 Algorithm. SuperMemo. https://www.supermemo.com/
- Ye, J. (2022). FSRS Algorithm. Open Spaced Repetition. https://github.com/open-spaced-repetition/fsrs4anki/wiki/spaced-repetition-algorithm:-a-three%E2%80%90day-journey-from-novice-to-expert
- Expertium. (2024). Abridged History of Spaced Repetition. https://expertium.github.io/History.html

**Organizational Learning and Knowledge Management**

- Argyris, C. (1977). Double-loop learning in organizations. *Harvard Business Review*, 55(5), 115-125. https://hbr.org/1977/09/double-loop-learning-in-organizations
- Argyris, C., & Schön, D. (1978). *Organizational Learning: A Theory of Action Perspective*. Addison-Wesley.
- Nonaka, I., & Takeuchi, H. (1995). *The Knowledge-Creating Company*. Oxford University Press. https://global.oup.com/academic/product/the-knowledge-creating-company-9780195092691
- Wenger, E. (1998). *Communities of Practice: Learning, Meaning, and Identity*. Cambridge University Press.
- Castillo, E. A., & Cazarini, E. V. (2019). Managing Knowledge in Organizations: A Nonaka's SECI Model Operationalization. *Frontiers in Psychology*, 10, 2730. https://pmc.ncbi.nlm.nih.gov/articles/PMC6914727/

**Lessons-Learned Databases and After-Action Reviews**

- NASA APPEL. (2015). After Action Review (Pause and Learn). https://appel.nasa.gov/wp-content/uploads/2015/11/After-Action-Review.pdf
- NASA Lessons Learned Information System (LLIS). https://llis.nasa.gov/
- U.S. GAO. (2002). NASA: Better Mechanisms Needed for Sharing Lessons Learned (GAO-02-195). https://www.gao.gov/products/gao-02-195
- NASA APPEL Knowledge Services. Lessons Learned Lifecycle and Highlights. https://appel.nasa.gov/lessons-learned/lessons-learned-lifecycle-and-highlights/

**Curriculum Learning and Machine Teaching**

- Bengio, Y., Louradour, J., Collobert, R., & Weston, J. (2009). Curriculum learning. *ICML 2009*. https://ronan.collobert.com/pub/2009_curriculum_icml.pdf
- Kumar, M. P., Packer, B., & Koller, D. (2010). Self-paced learning for latent variable models. *NeurIPS 2010*.
- Zhu, X. (2015). Machine teaching: An inverse problem to machine learning and an approach toward optimal education. *AAAI 2015*. https://www.researchgate.net/publication/363003952
- Graves, A., Bellemare, M. G., Menick, J., Munos, R., & Kavukcuoglu, K. (2017). Automated curriculum learning for neural networks. *ICML 2017*.
- Hacohen, G., & Weinshall, D. (2019). On the power of curriculum learning in training deep networks. *ICML 2019*. https://arxiv.org/pdf/1904.03626
- Soviany, P., Ionescu, R. T., Rota, P., & Sebe, N. (2021). Curriculum learning: A survey. *arXiv 2101.10382*. https://arxiv.org/pdf/2101.10382

**Experience Replay and Deep Reinforcement Learning**

- Lin, L.-J. (1992). Self-improving reactive agents based on reinforcement learning, planning and teaching. *Machine Learning*, 8, 293-321.
- Mnih, V., Kavukcuoglu, K., Silver, D., et al. (2015). Human-level control through deep reinforcement learning. *Nature*, 518, 529-533. https://web.stanford.edu/class/psych209/Readings/MnihEtAlHassibis15NatureControlDeepRL.pdf
- Schaul, T., Quan, J., Antonoglou, I., & Silver, D. (2016). Prioritized experience replay. *ICLR 2016*. https://arxiv.org/pdf/1511.05952
- Andrychowicz, M., Wolski, F., Ray, A., et al. (2017). Hindsight experience replay. *NeurIPS 2017*.
- Silver, D., Schrittwieser, J., Simonyan, K., et al. (2018). Mastering chess and shogi by self-play with a general reinforcement learning algorithm. *arXiv 1712.01815*. https://arxiv.org/abs/1712.01815
- Emre, T., Sarafian, H., & Krause, J. (2023). Map-based experience replay. *arXiv 2305.02054*. https://arxiv.org/abs/2305.02054

**Continual Learning and Catastrophic Forgetting**

- Kirkpatrick, J., Pascanu, R., Rabinowitz, N., et al. (2017). Overcoming catastrophic forgetting in neural networks. *PNAS*, 114(13), 3521-3526. https://arxiv.org/pdf/1612.00796
- Rusu, A. A., et al. (2016). Progressive neural networks. *arXiv 1606.04671*.
- De Lange, M., Aljundi, R., Masana, M., et al. (2022). A continual learning survey: Defying forgetting in classification tasks. *IEEE TPAMI*, 44(7). https://ieeexplore.ieee.org/iel7/34/4359286/09349197.pdf
- Van de Ven, G. M., Tuytelaars, T., & Tolias, A. S. (2024). Continual learning and catastrophic forgetting. *arXiv 2403.05175*. https://arxiv.org/html/2403.05175v1

**Retrieval-Augmented Generation**

- Lewis, P., Perez, E., Piktus, A., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *NeurIPS 2020*. https://proceedings.neurips.cc/paper/2020/file/6b493230205f780e1bc26945df7481e5-Paper.pdf
- Guo, J., et al. (2024). Graph retrieval-augmented generation: A survey. *arXiv 2408.08921*. https://arxiv.org/abs/2408.08921
- Zhang, Y., et al. (2024). A comprehensive survey of retrieval-augmented generation (RAG). *arXiv 2410.12837*. https://arxiv.org/pdf/2410.12837
- Edge, D., Trinh, H., Cheng, N., et al. (2024). From local to global: A graph RAG approach to query-focused summarization. Microsoft Research.

**Knowledge Graphs**

- Bordes, A., Usunier, N., Garcia-Duran, A., Weston, J., & Yakhnenko, O. (2013). Translating embeddings for modeling multi-relational data (TransE). *NeurIPS 2013*.
- Sun, Z., Deng, Z.-H., Nie, J.-Y., & Tang, J. (2019). RotatE: Knowledge graph embedding by relational rotation in complex space. *ICLR 2019*.
- Liang, S., et al. (2022). Knowledge graph embedding: A survey from the perspective of representation spaces. *arXiv 2211.03536*. https://arxiv.org/pdf/2211.03536
- Cai, L., et al. (2022). A review of knowledge graph completion. *arXiv 2208.11652*. https://arxiv.org/pdf/2208.11652

**Agentic Memory Systems**

- Packer, C., Wooders, S., Lin, K., et al. (2023). MemGPT: Towards LLMs as operating systems. *arXiv 2310.08560*. https://arxiv.org/abs/2310.08560
- Shinn, N., Cassano, F., Berman, E., et al. (2023). Reflexion: Language agents with verbal reinforcement learning. *NeurIPS 2023*. https://arxiv.org/abs/2303.11366
- Wang, G., Xie, Y., Jiang, Y., et al. (2023). Voyager: An open-ended embodied agent with large language models. *arXiv 2305.16291*. https://arxiv.org/abs/2305.16291
- Zhou, A., Yan, K., Shlapentokh-Rothman, M., Wang, H., & Wang, Y.-X. (2024). Language agent tree search unifies reasoning, acting, and planning in language models. *ICML 2024*. https://arxiv.org/abs/2310.04406
- Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). Generative agents: Interactive simulacra of human behavior. *UIST 2023*. https://arxiv.org/abs/2304.03442
- Xu, W., Liang, Z., et al. (2025). A-MEM: Agentic memory for LLM agents. *NeurIPS 2025*. https://arxiv.org/abs/2502.12110
- Rasmussen, P., et al. (2025). Zep: A temporal knowledge graph architecture for agent memory. *arXiv 2501.13956*. https://arxiv.org/abs/2501.13956
- Hu, Y., Liu, S., Yue, Y., Zhang, G., et al. (2025). Memory in the age of AI agents: A survey. *arXiv 2512.13564*. https://arxiv.org/abs/2512.13564

**Near-Duplicate Detection**

- Broder, A. Z. (1997). On the resemblance and containment of documents. *Compression and Complexity of Sequences 1997*.
- Indyk, P., & Motwani, R. (1998). Approximate nearest neighbors: Towards removing the curse of dimensionality. *STOC 1998*.
- Rajaraman, A., & Ullman, J. D. (2011). *Mining of Massive Datasets*. Cambridge University Press.
- Lee, K., Ippolito, D., Nystrom, A., et al. (2022). Deduplicating training data makes language models better. *ACL 2022*.
- Steck, H., Ekanadham, C., & Kallus, N. (2024). Is cosine-similarity of embeddings really about similarity? *arXiv 2403.05440*. https://arxiv.org/html/2403.05440v1

**Pattern Mining**

- Agrawal, R., & Srikant, R. (1994). Fast algorithms for mining association rules. *VLDB 1994*.
- Han, J., Pei, J., & Yin, Y. (2000). Mining frequent patterns without candidate generation (FP-Growth). *SIGMOD 2000*. http://hanj.cs.illinois.edu/cs412/bk3/06.pdf
- Srikant, R., & Agrawal, R. (1996). Mining sequential patterns: Generalizations and performance improvements. *EDBT 1996*.

**Knowledge Distillation**

- Hinton, G., Vinyals, O., & Dean, J. (2015). Distilling the knowledge in a neural network. *arXiv 1503.02531*. https://arxiv.org/abs/1503.02531
- Gou, J., Yu, B., Maybank, S. J., & Tao, D. (2021). Knowledge distillation: A survey. *IJCV*, 129, 1789-1819.
- Sanh, V., Debut, L., Chaumond, J., & Wolf, T. (2019). DistilBERT, a distilled version of BERT. *arXiv 1910.01108*.

**Meta-Learning**

- Finn, C., Abbeel, P., & Levine, S. (2017). Model-agnostic meta-learning for fast adaptation of deep networks. *ICML 2017*. https://arxiv.org/abs/1703.03400

---

## Practitioner Resources

**Open-Source Frameworks and Tools**

- **Anki** (https://apps.ankiweb.net): The most widely deployed spaced repetition system, now using the FSRS algorithm. Directly applicable for building human-maintained lesson review systems.

- **open-spaced-repetition / fsrs4anki** (https://github.com/open-spaced-repetition/fsrs4anki): Open-source implementation of the FSRS algorithm with detailed documentation of the underlying three-component memory model. Suitable for embedding spaced repetition scheduling into AI agent knowledge bases.

- **Avalanche** (https://avalanche.continualai.org): Comprehensive continual learning library implementing EWC, GEM, iCaRL, Progressive Networks, and 30+ other algorithms. Useful for building agents that update weights without catastrophic forgetting.

- **datasketch** (https://github.com/ekzhu/datasketch): Python implementation of MinHash, LSH, and related data structures for near-duplicate detection at scale. Suitable for knowledge base deduplication pipelines.

- **text-dedup** (https://github.com/ChenghaoMou/text-dedup): Multi-backend text deduplication library supporting MinHash, SimHash, suffix array, and embedding-based deduplication. Directly applicable to large lessons-learned database maintenance.

- **LlamaIndex** (https://docs.llamaindex.ai): Framework for building RAG systems over custom knowledge bases. Provides document ingestion, chunking, vector indexing, retrieval, and synthesis pipelines. Directly applicable to knowledge-grounded agent systems.

- **LangChain** (https://python.langchain.com): Complementary to LlamaIndex, providing agent orchestration and tool-use frameworks for knowledge-augmented agents.

- **Neo4j** (https://neo4j.com): The leading production graph database, used by Zep's Graphiti engine for temporal knowledge graph storage. Provides Cypher query language for complex multi-hop reasoning over agent knowledge graphs.

- **Graphiti** (https://github.com/getzep/graphiti): Open-source implementation of the Zep temporal knowledge graph engine. Directly applicable for building production-grade agent memory systems with bi-temporal tracking.

- **A-MEM** (https://github.com/agiresearch/A-mem): Reference implementation of the Zettelkasten-inspired agentic memory system. Useful for understanding memory evolution and link-based knowledge integration.

- **Voyager** (https://github.com/MineDojo/Voyager): Reference implementation of the Voyager lifelong learning agent including the skill library implementation. Demonstrates executable-code-based knowledge representation.

- **Reflexion** (https://github.com/noahshinn/reflexion): Reference implementation of verbal reinforcement learning with episodic memory buffer. Directly applicable for building agents that generate and store textual self-reflections.

- **mlxtend** (https://rasbt.github.io/mlxtend): Python library including Apriori and FP-Growth implementations for frequent-pattern and association-rule mining over agent episode databases.

- **SPMF** (https://www.philippe-fournier-viger.com/spmf): Java-based sequential pattern mining framework with 200+ algorithms, including PrefixSpan and SPADE for sequence mining over agent trajectories.

**Key Survey Papers and Reading Lists**

- **Memory in the Age of AI Agents** (arXiv 2512.13564): The most current comprehensive survey of agent memory architectures, covering taxonomy, evaluation benchmarks, and open research frontiers. Essential reading for understanding the current state of the art. https://arxiv.org/abs/2512.13564

- **Continual Learning and Catastrophic Forgetting** (arXiv 2403.05175): Authoritative survey of the continual learning field, covering the stability-plasticity dilemma, regularization/replay/architectural approaches, and current benchmarks. https://arxiv.org/html/2403.05175v1

- **A Continual Learning Survey: Defying Forgetting in Classification Tasks** (De Lange et al., IEEE TPAMI 2022): Systematic taxonomy of over 300 continual learning papers. https://ieeexplore.ieee.org/iel7/34/4359286/09349197.pdf

- **Graph Retrieval-Augmented Generation: A Survey** (arXiv 2408.08921): First comprehensive survey of GraphRAG methods, covering indexing, retrieval, and generation components. https://arxiv.org/abs/2408.08921

- **Awesome-GraphRAG** (https://github.com/DEEP-PolyU/Awesome-GraphRAG): Curated resource list for graph-based RAG research.

- **Agent-Memory-Paper-List** (https://github.com/Shichun-Liu/Agent-Memory-Paper-List): Curated paper list accompanying the *Memory in the Age of AI Agents* survey.

- **NASA APPEL Knowledge Services** (https://appel.nasa.gov): Comprehensive documentation of NASA's knowledge management practices including After-Action Reviews, lessons-learned lifecycle guidance, and Pause and Learn methodology. Directly applicable as institutional best-practice reference.

**Key Articles and Blog Posts**

- Zilliz Blog: Data Deduplication at Trillion Scale (https://zilliz.com/blog/data-deduplication-at-trillion-scale-solve-the-biggest-bottleneck-of-llm-training): Practical treatment of MinHash LSH deduplication at production scale.

- Voyager project site (https://voyager.minedojo.org): Overview of the Voyager architecture with qualitative analysis of the skill library and curriculum mechanisms.

- Zep/Graphiti Neo4j blog (https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory): Technical walkthrough of the Graphiti temporal knowledge graph architecture for agent memory.

- AlphaGo Zero DeepMind post (https://deepmind.google/blog/alphago-zero-starting-from-scratch): Accessible explanation of self-play curricula and knowledge compounding through skill competition.

---