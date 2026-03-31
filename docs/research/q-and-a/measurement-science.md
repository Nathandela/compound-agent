# Measurement Science for Multi-Agent Review Pipelines

*2026-03-25*

---

## Abstract

Multi-agent review pipelines -- compositions of specialized AI agents that inspect source code for defects, security vulnerabilities, architectural violations, and test adequacy -- are rapidly becoming a primary quality assurance mechanism in software development organizations. Yet the scientific foundations for measuring, evaluating, and optimizing such pipelines remain underdeveloped relative to their deployment. This survey addresses six interlocking measurement problems: the signal-to-noise ratio of individual review agents (which findings are actionable versus spurious); ablation methodology for identifying which agents contribute unique value; defect taxonomy schemes (ODC, IEEE 1044, and emerging AI-specific extensions) that make defect data comparable across reviewers; cost-benefit frameworks for computing the ROI of staged review; information-theoretic approaches to detecting redundancy between reviewers; and the problem of model capability drift -- how to re-evaluate pipeline assumptions as foundation models improve. We draw on five decades of empirical inspection research, recent LLM code review benchmarks, and information theory to synthesize a measurement framework for practitioners and researchers. The state of the art shows that current automated code review systems operate at 14-19% F1 on benchmark tasks, with precision as the primary bottleneck; that ensemble aggregation provides up to 43% F1 gains at marginal cost; that no standard defect ontology yet bridges classical ODC with LLM-specific failure modes; and that foundation model benchmarks suffer from saturation and contamination problems that invalidate naive capability tracking. Open problems include the absence of ground-truth defect-labeled industrial codebases, the lack of agreed metrics for reviewer redundancy in agentic contexts, and the absence of contamination-resistant capability tracking for code review specifically.

---

## 1. Introduction

### 1.1 The Measurement Gap

Software organizations deploying multi-agent review pipelines face a fundamental measurement problem: they do not know whether their pipeline is working. A pipeline may emit hundreds of review comments per week, yet if 95% of those comments are false positives or address style issues that developers ignore, the pipeline provides negative value -- consuming developer attention without reducing defect escape rates. Conversely, a pipeline that produces ten comments per week but consistently identifies the critical defects that would have reached production is extraordinarily valuable, even if its apparent coverage looks thin.

This is not a new problem. Michael Fagan's 1976 work at IBM Kingston that established formal code inspection as a engineering discipline began precisely with this question: how do you measure whether an inspection process is working? Fagan's answer -- track defect types found per phase, compare to the expected distribution, and use deviations as signals of process problems -- remains the most rigorous framework available. What has changed is the scale, speed, and agenticity of the reviewers: today's pipeline may involve a dozen specialized LLM agents, each with different prompts, tools, and knowledge, operating asynchronously on thousands of pull requests per day.

The six measurement sub-problems addressed by this survey are not independent. Signal-to-noise analysis (Section 3.1) requires a defect taxonomy (Section 3.3) to classify what counts as signal. Ablation experiments (Section 3.2) require cost metrics (Section 3.4) to define what "contribution" means. Redundancy detection (Section 3.5) requires information-theoretic tools that are only interpretable against a backdrop of what the reviewers are supposed to know. And model capability tracking (Section 3.6) determines when all other measurements become invalid.

### 1.2 Scope and Organization

This survey covers measurement methodology for automated and semi-automated multi-agent code review pipelines. The treatment is methodology-first: we examine what can be measured, how to measure it, and what the empirical literature shows about the measurements that have been taken. We do not prescribe pipeline architectures or make implementation recommendations.

Section 2 establishes foundations: the empirical tradition from formal inspection, information-theoretic primitives, and the current state of LLM code review benchmarking. Section 3 presents a taxonomy of the six measurement approaches in depth. Section 4 provides a comparative synthesis and cross-cutting analysis. Section 5 enumerates open problems. Section 6 concludes.

### 1.3 Key Definitions

- **Review agent**: A specialized AI component that examines code and emits structured findings with severity, location, and description attributes.
- **Finding**: A single identified potential issue emitted by a review agent. May be a true positive (actual defect or violation), false positive (spurious), or actionable (developer acts on it regardless of ground truth).
- **Pipeline**: An ordered or partially ordered composition of review agents applied to a common artifact (changeset, PR, file).
- **Signal**: Findings that correspond to genuine defects, violations, or meaningful improvement opportunities (regardless of whether developers act on them).
- **Noise**: Findings that do not correspond to genuine issues, duplicate prior findings, or address concerns so low in priority they would not be acted on under normal conditions.
- **Defect escape rate**: The fraction of defects present in a codebase that pass through a given review stage without being detected.
- **Coverage**: The fraction of defect classes or code regions that a reviewer is capable of detecting, given optimal conditions.
- **Key Bug Inclusion (KBI)**: The fraction of critical, high-severity defects (those that cause production incidents if undetected) that are identified by the review system. A recall metric specialized to severity.
- **False Alarm Rate (FAR)**: The fraction of emitted findings that are false positives. The complement of precision.
- **Comprehensive Performance Index (CPI)**: A proposed composite metric (analogous to F1) combining KBI and FAR for production code review contexts (Zhang et al., 2025).

---

## 2. Foundations

### 2.1 Empirical Inspection Research: The Measurement Tradition

The measurement of code review effectiveness has a five-decade empirical history. Fagan (1976) established the baseline: IBM inspection data showed defect removal rates of 60-82% for code and 70-93% for design artifacts when the formal six-phase procedure was followed (Planning, Overview, Preparation, Inspection Meeting, Rework, Follow-up). The inspection rate -- lines of code examined per hour -- emerged as the primary process control variable. Russell (1991) synthesized IBM multi-project data to find the critical finding: when inspection pace increased from 150 to 450 LOC/hour, defects found per KLOC dropped from approximately 50 to 15, a 70% reduction. This rate-quality trade-off is arguably the best-validated finding in the empirical inspection literature.

Subsequent research complicated the picture. Ackerman, Buchwald, and Lewski (1989) demonstrated that individual preparation -- reviewers examining the artifact independently before the group meeting -- accounts for the majority of defects found during formal inspection, with the group meeting adding relatively few additional defects. This finding has direct implications for multi-agent pipelines: the pipeline topology (whether agents operate sequentially or in parallel) affects the expected total coverage.

At industrial scale, Sadowski et al. (2018) analyzed approximately 9 million code reviews at Google, finding that 80%+ of reviews completed in a single iteration and that review velocity was highly skewed -- a small fraction of reviewers accounted for the majority of reviews. Bacchelli and Bird (2013) at Microsoft found the famous "motivation gap": developers state that defect detection is their primary motivation for code review, but analysis of 570 sessions shows that only 1 in 8 comments actually addresses defects, with knowledge transfer, style, and design alternatives dominating. Beller et al. (2014) confirmed that 75% of modern code review comments concern evolvability rather than functional correctness.

These findings establish a critical baseline for multi-agent pipeline measurement: even in well-functioning human review processes, the signal-to-noise ratio for defect-specific comments is approximately 1:7 (roughly 12.5% precision on defects), and the majority of review effort is spent on concerns that LLM agents can potentially address more efficiently than human reviewers.

### 2.2 Current LLM Code Review Benchmarks

The most comprehensive recent evaluation is Zhang et al. (2025), who introduced SWR-Bench -- a benchmark of 1,000 pull requests from open-source projects with ground-truth change-points labeled by domain experts. The benchmark employs an objective LLM-based evaluation framework that uses fact-based matching between predicted and ground-truth change-points rather than text similarity metrics (BLEU/ROUGE), which the authors demonstrate are poor proxies for review quality.

Key findings from SWR-Bench (Zhang et al., 2025):

| Approach | Model | Precision | Recall | F1 |
|---|---|---|---|---|
| PR-Review | Gemini-2.5-Pro | 16.65% | 23.18% | 19.38% |
| PR-Review | Claude-3.7-Sonnet | 14.90% | 23.50% | 18.23% |
| PR-Review | DeepSeek-R1 | 14.61% | 25.50% | 18.58% |
| LLM-Reviewer | Gemini-2.5-Pro | 8.02% | 21.29% | 11.65% |
| SWR-Agent | Gemini-2.5-Pro | 9.93% | 19.14% | 13.07% |
| CR-Agent | Gemini-2.5-Pro | 6.97% | 17.63% | 9.98% |
| Hybrid-Review | Gemini-2.5-Pro | 2.83% | 20.44% | 4.97% |

The finding that Hybrid-Review (incorporating static analysis) performs worst at 4.97% F1 while having the highest comment count per PR (6.64 average) illustrates the precision-count trade-off that defines the signal-to-noise problem. The paper's authors explicitly identify precision as the primary bottleneck: "all techniques except PR-Review showed precision below 10%, indicating excessive false positives."

The SWR-Bench study also found a critical instability finding: only 36 change-points overlapped across different LLMs reviewing identical PRs, and only 27 overlapped across five runs of the same LLM reviewing the same PR. This non-determinism complicates both evaluation and redundancy detection.

For defect-specific review (as opposed to general change-point detection), Zhang et al. (2025, ArXiv 2505.17928) introduced a specialized industrial benchmark on C++ codebases with documented fault histories. Their Key Bug Inclusion / False Alarm Rate framework showed that standard LLMs achieve near-zero KBI with 97%+ FAR, while their specialized code-slicing approach achieved 31% KBI with 87% FAR -- a 2x improvement over standard approaches and 10x over previous baselines. The three-stage multi-role filtering (reviewer scoring, meta-reviewer consolidation, validator re-scoring) reduced FAR but also inadvertently discarded some valid bug-detecting comments, revealing a fundamental precision-recall trade-off in multi-stage filtering.

### 2.3 Information-Theoretic Primitives

Several information-theoretic constructs underpin reviewer redundancy analysis. The key primitives are:

**Mutual Information (MI).** For two discrete random variables X and Y, I(X;Y) = H(X) + H(Y) - H(X,Y), where H is Shannon entropy. In the reviewer context, X may represent the set of defects found by reviewer A and Y the set found by reviewer B; I(X;Y) measures how much knowing one reviewer's findings reduces uncertainty about the other's.

**Total Correlation.** Watanabe (1960) defined total correlation for n random variables as:

C(X₁,...,Xₙ) = [Σᵢ H(Xᵢ)] - H(X₁,...,Xₙ)

This measures the total amount of redundancy across a set of reviewers. When total correlation is high, reviewers are detecting the same defects; when it approaches zero, reviewers are independent.

**Partial Information Decomposition (PID).** Williams and Beer (2010) proposed decomposing the mutual information between a set of sources (reviewers) and a target (defect presence) into unique, redundant, and synergistic components. For two reviewers A and B and target Y (defect present/absent): I(A,B;Y) = UI(A;Y\B) + UI(B;Y\A) + RI(A,B;Y) + SI(A,B;Y), where UI is unique information, RI is redundant information, and SI is synergistic information (information only available from the joint observation). The PID framework is theoretically well-motivated but remains mathematically contested: as of 2025, approximately 19 proposed measures exist, and no single measure satisfies all desirable axioms simultaneously (Gutknecht et al., 2025). The BROJA measure (Bertschinger et al., 2014) satisfies the most classical properties (16 of the standard axioms).

**Dual Total Correlation.** Also called "binding information," the dual total correlation measures synergy rather than redundancy:

D(X₁,...,Xₙ) = H(X₁,...,Xₙ) - Σᵢ H(Xᵢ | all others)

High dual total correlation indicates that some reviewers only contribute when considered jointly with others -- a signal of productive specialization rather than redundancy.

---

## 3. Taxonomy of Approaches

### 3.1 Signal-to-Noise Ratio in Multi-Agent Review

**Theory and mechanism.** The signal-to-noise ratio (SNR) of a review agent is the ratio of actionable findings (true positives at a given developer utility threshold) to total findings. Unlike classical SNR in communications theory, the threshold for "signal" in code review is context-dependent: a style comment that would be noise in a safety-critical embedded systems context is signal in a public API.

The standard precision/recall framing applies: precision = TP / (TP + FP) measures the fraction of findings that are genuine; recall = TP / (TP + FN) measures the fraction of genuine issues found. The F1 score harmonically combines them. However, all three metrics depend on what constitutes ground truth for code review, which is problematic: there is no agreed oracle for "genuine defect" that operates at the merge-request level and across all defect types.

Several alternative metrics have been proposed for production contexts:

- **Key Bug Inclusion (KBI)**: Recall restricted to defects that caused or would cause production incidents (Zhang et al., 2025). Addresses the problem that many defects in code are latent and may never be triggered; KBI focuses measurement on the defects that actually matter.
- **Actionable Comment Rate (ACR)**: The fraction of review comments on which developers take action (edit code, close as "will not fix" after consideration, or initiate further investigation). Requires developer behavioral data but is highly practical as it directly measures whether reviewers are producing useful output.
- **Comprehensive Performance Index (CPI)**: A composite of KBI and FAR analogous to F1, proposed in Zhang et al. (2025): CPI = 2 × KBI × (1-FAR) / (KBI + (1-FAR)).

**Empirical findings.** The empirical literature converges on precision (low noise) as the primary bottleneck in LLM code review, not recall. Zhang et al. (2025, SWR-Bench) found that the best-performing system (PR-Review with Gemini-2.5-Pro) achieved only 16.65% precision at 23.18% recall. This means approximately 83% of findings emitted by the best available system are false positives by the ground-truth standard of the benchmark. At lower-performing configurations (Hybrid-Review at 2.83% precision), 97% of findings are noise.

The multi-role filtering approach in Zhang et al. (2025, ArXiv 2505.17928) addresses the FAR problem explicitly: a three-stage pipeline (reviewer → meta-reviewer → validator) reduces FAR from 96% at the first stage to lower values, but the validator stage inadvertently discards valid bug-detecting comments, demonstrating that aggressive noise filtering comes at recall cost.

Reviewer count effects are well-characterized: increasing from one to three independent LLM passes lifts KBI but increases FAR from 88% to 96%. This ensemble-increases-recall-at-precision-cost pattern mirrors the classical ensemble tradeoff in classification literature.

**Evaluating individual agents within a pipeline.** Individual agent SNR is straightforward to compute for agents with well-defined, atomic finding types (e.g., a security agent flagging SQL injection patterns). It becomes difficult for agents whose findings are qualitative (e.g., an architectural coherence agent commenting on design patterns), because ground truth requires expert judgment at the finding level rather than the defect level.

The Yu et al. (2024) security code review study found that reasoning-enhanced models (DeepSeek-R1) outperform general-purpose models (GPT-4) but at the cost of generating inaccurate code details in their outputs -- suggesting that capability improvements in one dimension (reasoning depth) may correlate with precision decreases in another (factual accuracy).

**False positive asymmetry.** Evaluating GPT-4o vs. Gemini 2.0 Flash on code correctness review, Al-Sayouri and Baz (2025, ArXiv 2505.20206) found qualitative differences in error direction: GPT-4o had better false positive rates (higher precision), while Gemini had higher false negative rates (approved faulty code). This asymmetry matters for pipeline design: a high-FP agent followed by a filtering stage may be preferable to a low-FP agent that misses defects, depending on whether developer attention or defect escape is the binding constraint.

### 3.2 Ablation Studies for Review Components

**Theory and mechanism.** Ablation in machine learning refers to removing a component from a system and measuring the resulting performance degradation. Applied to multi-agent review pipelines, ablation answers: which agents contribute unique value, and which are redundant?

The fundamental challenge in review pipeline ablation is that agents may be complementary (agent B finds defects that agent A misses, so removing B reduces coverage) or redundant (agents A and B find the same defects, so removing B loses little value). Disentangling complementarity from redundancy requires a ground-truth defect set to evaluate coverage, which is rarely available in production.

**Experimental design for review ablation.** A valid ablation design for review pipelines requires:

1. **A labeled defect corpus**: A set of code artifacts with known defects (injected via mutation, drawn from historical bugs, or labeled by expert review). The corpus must cover the defect types the pipeline is intended to detect. The absence of such corpora is a primary barrier; the SWR-Bench dataset represents one of the few large-scale, labeled, open review corpora.
2. **Isolation**: Running each agent configuration independently (not in sequence) against the same artifact, so that later agents do not benefit from earlier agents' output. Alternatively, using the same agent in pipeline context vs. standalone to measure context effects.
3. **Controlled randomness**: LLM agents are non-deterministic; running the same agent multiple times on the same artifact produces different results. Ablation experiments should account for this variance, either by averaging across multiple runs or by using fixed seeds where available.
4. **Matching evaluation metric to objective**: Ablation measuring F1 may reach different conclusions than ablation measuring KBI, because removing an agent may hurt overall F1 while improving KBI if the agent was producing many low-severity false positives and few true positives on critical defects.

**Aggregate vs. per-defect-class ablation.** Aggregate ablation measures total finding quality with and without an agent. Per-defect-class ablation measures whether an agent contributes uniquely to a specific defect class (e.g., injection vulnerabilities, memory leaks, architectural violations). Per-defect-class ablation is more informative but requires a defect-labeled corpus with sufficient coverage of each class.

**The multi-review ablation finding.** Zhang et al. (2025, SWR-Bench) conducted a systematic ablation of the aggregation count parameter in their multi-review strategy:

| Aggregation Runs (n) | F1 | Recall | vs. Baseline |
|---|---|---|---|
| 1 (baseline) | 15.25% | 13.91% | — |
| 3 | 18.42% | 22.19% | +21% F1 |
| 5 | 19.68% | 25.13% | +29% F1 |
| 10 (self-aggregation) | 21.91% | 30.44% | +44% F1 |

This is, to the author's knowledge, the most methodologically clean ablation study currently available for LLM review pipelines. It demonstrates that review pipeline components (here, additional independent runs of the same model) contribute superlinearly at low counts and sublinearly at high counts -- consistent with the combinatorial model of independent defect detection.

The n=10 configuration on smaller open-source models (Qwen-Chat-7B and 32B) achieved F1 scores approaching commercial LLM baselines at lower cost per finding, establishing that aggregation can substitute for model capability to some degree.

**Absence of pipeline-level ablation in practice.** The literature contains almost no published ablations of multi-specialist-agent pipelines (e.g., removing the security agent vs. removing the architecture agent and measuring defect escape). This gap is partly methodological (labeled defect corpora for specific agents are rare) and partly organizational (production code review pipelines at large companies are typically not documented in a form that permits ablation).

### 3.3 Defect Taxonomy

**Theory and mechanism.** A defect taxonomy is an orthogonal classification scheme that categorizes software defects along independent dimensions, enabling statistical analysis of defect distributions, process feedback, and comparison across review methods. Without a taxonomy, "bugs found" is an undifferentiated count; with one, it becomes possible to ask which defect types are being detected, which are escaping, and which review mechanisms are best suited to each type.

**Orthogonal Defect Classification (ODC).** Chillarege et al. (1992) developed ODC at IBM Research as a framework for in-process measurement, grounded in the observation that the distribution of defect types across development phases encodes process health information. ODC is orthogonal in the sense that each attribute is intended to capture a different dimension of the defect that is not correlated with other attributes.

The core ODC dimensions are:

*Defect type* (cause): The nature of the code change required to fix the defect.
- Function: A defect in the logic, computation, or algorithm.
- Assignment: Incorrect initialization, incorrect value assignment.
- Interface: Incorrect call interface, wrong return type, incorrect parameter passing.
- Checking: Insufficient validation, missing or incorrect error handling.
- Algorithm: Selection of the wrong algorithmic approach.
- Timing/serialization: Concurrency, synchronization, race conditions.
- Build/package/merge: Environment configuration, dependency, build system defects.
- Documentation: Defects in documentation that cause incorrect system use.

*Trigger* (mechanism of detection): The condition that exposed the latent fault.
- For code review: Design conformance, backward compatibility, lateral compatibility, rare situations, coverage (exercising untested paths), language dependency, concurrency (requires specific execution ordering).
- For testing: Coverage (statement, branch), explicit triggers (specific test conditions), extraordinary conditions (stress, boundary).

*Impact* (severity on affected function):
- Stability, controls, performance, security, reliability, usability, installability, standards.

*Source* (origin of the defect): New code, reused code, ported code, third-party.

*Age*: New code, old code, base defect, exacerbated.

The key insight from ODC is that *defect type distributions shift predictably as a product matures*: early phases produce many Function and Algorithm defects; later phases produce more Interface and Checking defects as integration surfaces increase. A pipeline that produces a Distribution skewed toward Function defects during integration testing is a process health signal, not just a count.

**ODC application to automated review.** The trigger dimension is particularly relevant for review pipeline measurement: ODC triggers classify which detection mechanism surfaces a defect. A multi-agent pipeline with specialist agents corresponds naturally to ODC trigger categories -- a security agent maps to explicit trigger/coverage triggers for security-relevant paths; an architecture agent maps to design conformance triggers. Mapping agent findings to ODC trigger categories enables cross-agent analysis: if Agent A and Agent B both emit findings classified as "Design conformance" triggers, they may be redundant by ODC analysis even if their specific comments differ.

Automated ODC classification has been studied by several authors. Thung et al. (2012, ScienceDirect) applied machine learning to automate ODC type assignment, achieving 62-82% accuracy depending on defect type. More recent work applying neural classifiers achieves higher accuracy on the type dimension but lower accuracy on the trigger dimension, which requires understanding execution context as well as code structure.

**AI-ODC.** Nahar et al. (2025, ArXiv 2508.17900) proposed an extension of ODC for AI-based software systems (AI-ODC), adding three new attribute dimensions to the classical ODC framework:
- *Data*: Defects arising from training data quality, bias, distribution shift.
- *Learning*: Defects in model training, optimization, or fine-tuning processes.
- *Thinking*: Defects in model reasoning, inference, or decision-making logic.

AI-ODC also adds a "Catastrophic" severity level above the classical ODC severity range, to capture failure modes unique to AI systems (e.g., a model reasoning failure that causes cascading incorrect decisions across an entire codebase).

For multi-agent code review pipelines, AI-ODC is relevant in two directions: as a taxonomy for defects in the pipeline's own agents (reasoning errors, hallucination, incorrect tool invocations), and potentially as a taxonomy for AI-generated code defects that the pipeline is intended to detect.

**IEEE 1044-2009 Standard for Software Anomaly Classification.** The IEEE 1044 standard provides a uniform framework for classifying software anomalies across the development lifecycle, emphasizing that classification data should support defect causal analysis, project management, and process improvement. IEEE 1044 distinguishes:
- *Failure*: A departure from expected behavior, observed from the user perspective.
- *Fault*: The underlying code or design condition that caused the failure (a subtype of defect).
- *Defect*: The broadest category, including faults and other anomalies.

The standard provides a core attribute set (type, mode, severity, probability of recurrence) and allows extension for domain-specific attributes. Unlike ODC, IEEE 1044 does not prescribe specific type categories -- it provides a classification process and attribute schema that organizations are expected to instantiate with their own category vocabularies.

**Defect detectability by review method.** One of the most practically important questions for pipeline design is: which defect types are best detected by which review mechanisms? The empirical literature is sparse, but the following patterns emerge:

| Defect Type (ODC) | Best Detection Mechanism | Empirical Basis |
|---|---|---|
| Function / Algorithm | Human code review, formal inspection | Bacchelli & Bird 2013; Fagan 1976 |
| Checking / Validation | Static analysis, checklist-driven review | Ayewah et al. 2010 (FindBugs) |
| Interface | Integration testing, inter-module review | Rigby & Bird 2013 |
| Timing / Serialization | Concurrency analysis tools, property testing | Hard to detect in review; tool-dependent |
| Security (injection, auth) | Specialized security review agents | Yu et al. 2024 |
| Build / Package | CI pipeline static checks | Automated; rarely missed |

LLM review agents show particular strength in detecting Checking and Interface defects (missing validation, incorrect API usage) and relative weakness in Algorithm defects requiring deep domain knowledge and Timing defects requiring execution trace analysis (Zhang et al., 2025).

**Defect taxonomy for LLM-specific pipelines.** Classical ODC was designed for human-inspected software. When the software under review is AI-generated, or when the review pipeline itself consists of AI agents, several ODC categories require reinterpretation. Function defects in LLM-generated code often manifest as plausible but incorrect algorithms that pass shallow review; Algorithm defects may appear semantically correct in isolation but violate system-level invariants. This suggests that multi-agent pipelines reviewing AI-generated code may benefit from a hybrid taxonomy that combines classical ODC types with the Thinking and Learning dimensions from AI-ODC.

### 3.4 Cost-Benefit Analysis of Review Stages

**Theory and mechanism.** The cost-benefit problem for a review pipeline is: given a set of candidate review stages (agents), which stages should be included, and in what order, to maximize expected defect detection value minus review cost?

The cost side has four components:
1. **Token cost**: The number of input and output tokens consumed per review, multiplied by the per-token price of the model. At current (2025) pricing, GPT-4o costs approximately $2.50/M input tokens; Gemini 2.5 Pro costs approximately $1.25/M input tokens for short prompts. A typical PR review with 2,000 tokens of context costs approximately $0.005-$0.01 per model call. The SWR-Bench evaluation of 1,000 PRs with Gemini-2.5-Flash cost approximately $1.57 total ($0.00157 per PR), making the direct monetary cost of LLM review negligible compared to developer time.
2. **Latency cost**: The wall-clock time from PR submission to review completion. Sequential pipelines compound individual agent latencies; parallel pipelines cap latency at the slowest agent. At production scale with thousands of concurrent PRs, pipeline architecture affects infrastructure cost significantly.
3. **Developer attention cost**: The cognitive cost of reading and evaluating review comments. This is not a function of review quality alone -- even high-quality review comments consume developer attention and interrupt flow. False positives are particularly costly because they require developers to confirm the finding is spurious before discarding it. If a pipeline emits 100 comments on a PR of which 97 are false positives (the FAR observed in Hybrid-Review), the developer's true cost is examining all 100 to find the 3 genuine issues.
4. **Opportunity cost of delayed merge**: Review stages that add latency delay the integration of changes, potentially blocking downstream development.

The benefit side is more difficult to quantify. The standard framework equates the benefit of catching a defect in review to the cost differential between fixing it in review versus finding it in production. Jones (2012) synthesized multiple industrial studies to estimate relative defect costs across lifecycle phases:

| Phase of Detection | Relative Cost to Fix |
|---|---|
| Code review (pre-merge) | 1× |
| Integration testing | 10× |
| System testing | 20× |
| Production (post-release) | 40-100× |

These figures are widely cited but methodologically contested (Shull et al., 2002) -- they conflate defect severity (high-severity production defects are expensive regardless of when they would have been caught) with phase-of-detection costs, and are derived primarily from 1980s-1990s waterfall development contexts. In modern CI/CD pipelines with rapid deployment cycles, the cost differential between review and testing is lower, but the cost differential between testing and production remains high for security and data integrity defects.

**ROI frameworks.** A simple ROI model for a single review stage is:

ROI = (D × C_escape) / (T_pipeline + T_developer × (FP + TP)) - 1

Where D is the expected number of defects caught per PR, C_escape is the cost per escaped defect, T_pipeline is the per-PR pipeline cost, and T_developer is the per-comment developer review time. The model shows that high-FAR (low-precision) stages become ROI-negative when T_developer × FP exceeds D × C_escape -- a condition that is easily satisfied for low-severity finding types when developer time is expensive and defect escape cost is low.

**Multi-stage pipeline optimization.** For a sequential pipeline, the optimal ordering places high-precision, low-cost stages first (to filter out false positives cheaply before expensive agents see the code) and high-recall, high-cost stages last (to apply expensive specialized review only to code that has passed lightweight screening). This cascading architecture is analogous to the use of cheap binary classifiers as pre-filters in production ML inference.

The hybrid aggregation result from Zhang et al. (2025) suggests an alternative: running n independent passes of a cheap model and aggregating may outperform a single expensive model call. At n=10 with Gemini-2.5-Flash versus n=1 with Gemini-2.5-Pro, the multi-run approach achieved higher recall at significantly lower cost per finding, though the paper does not report per-finding costs in detail.

**Defect escape rate as the primary outcome metric.** The ultimate ROI metric for a review pipeline is its reduction in defect escape rate -- the fraction of defects that survive review and reach production. Elite software development teams (DORA 2024 classification) maintain change failure rates below 5%; multi-agent review is one mechanism for achieving this. However, attributing changes in escape rate to specific pipeline stages requires controlled experimental conditions (A/B testing with and without a stage) that are organizationally and ethically challenging to implement in production systems.

**Phase placement effects.** The value of catching a defect is higher earlier in the pipeline. A review stage placed at the pre-merge point (before integration) is worth more than the same stage placed at post-integration review, because early detection prevents defect propagation into integration artifacts. Multi-agent pipelines typically operate at the pre-merge point, which maximizes the cost-benefit of each stage.

### 3.5 Reviewer Redundancy Detection

**Theory and mechanism.** Reviewer redundancy exists when two agents detect substantially the same defects. Redundancy wastes pipeline resources without improving coverage; detecting it enables pipeline pruning. The theoretical framework for redundancy measurement draws on information theory.

**Set-theoretic measures.** The simplest redundancy measure is Jaccard similarity between finding sets:

J(A, B) = |A ∩ B| / |A ∪ B|

Where A and B are the finding sets of two agents. When findings are deduplicated by location and finding type, J(A,B) near 1 indicates high redundancy; J(A,B) near 0 indicates complementary coverage. The limitation is that findings rarely have identical representations across agents -- two agents may flag the same defect with different descriptions, line numbers, or severity ratings, requiring a fuzzy matching step before set operations.

**Mutual information approach.** Treating each agent's finding on a given defect d as a binary random variable (1 = found, 0 = not found), the mutual information I(A;B) over a labeled defect corpus measures the degree to which agent A's findings predict agent B's findings. High I(A;B) indicates redundancy; I(A;B) = 0 indicates statistical independence (the agents are finding entirely different defects). Normalized mutual information (NMI) provides a scale-free redundancy coefficient in [0,1].

**Partial Information Decomposition for multi-agent coverage.** For pipelines with n > 2 agents, pairwise MI analysis may miss higher-order redundancy patterns. PID (Williams and Beer, 2010) provides a framework for decomposing coverage into unique, redundant, and synergistic components. The synergistic component -- information only available when observing multiple agents jointly -- is particularly interesting: high synergy means some defects are only detectable by combining multiple agents' outputs (e.g., a defect that requires correlating a security finding with an architectural finding).

Applied to a three-agent pipeline (security, architecture, logic), PID would yield:
- UI(security; defects | architecture, logic): Defects uniquely detectable by the security agent.
- RI(security, architecture; defects): Defects detected by both security and architecture agents (candidates for elimination).
- SI(security, architecture; defects): Defects only detectable via the joint observation.

The practical barrier to PID-based redundancy analysis is the requirement for a labeled defect corpus: computing PID terms requires knowing ground-truth defect presence for a representative sample. In production, this requires periodic ground-truth labeling of a random sample of reviewed PRs -- a labor-intensive but feasible process if the pipeline has been running for some time.

**Total correlation as a pipeline redundancy score.** Watanabe's total correlation C(A₁,...,Aₙ) provides a single scalar summarizing the total redundancy across all n agents in the pipeline. A pipeline with high total correlation is over-specified (agents are detecting the same defects); a pipeline with low total correlation is well-diversified. Monitoring total correlation over time as models are updated provides an early warning when a model improvement in one agent causes it to begin overlapping with another.

**Test redundancy measurement analogy.** The problem of identifying redundant review agents is structurally analogous to identifying redundant tests in a test suite (Chen et al., 2002). Test redundancy measurement based on code coverage -- identifying tests that exercise identical code paths -- provides a methodological template. For review agents, "coverage" can be operationalized as the set of code regions that receive at least one finding, with overlap measured as the fraction of flagged regions flagged by multiple agents.

**SWR-Bench instability as evidence of redundancy.** The finding that only 36 change-points overlapped across different LLMs reviewing the same PR (Zhang et al., 2025) suggests low systematic redundancy between models -- each model is finding somewhat different issues. However, within a single model across five runs, only 27 change-points overlapped, indicating that apparent redundancy from running the same model multiple times is lower than one might expect. The practical implication is that running the same model n times is not equivalent to running n diverse models n times -- both ensemble strategies increase recall, but diverse models may provide more unique coverage per additional run.

### 3.6 Model Capability Tracking

**Theory and mechanism.** Multi-agent review pipelines are built on assumptions about the capabilities of the underlying foundation models: what defect types they can detect, at what precision, with what context lengths. These assumptions become invalid when the underlying models are updated or replaced. A pipeline configured for GPT-4 may be over-engineered (with redundant prompting strategies designed to compensate for GPT-4 limitations) when GPT-4o or GPT-5 is deployed, or under-engineered (lacking prompting strategies for capabilities that new models support but the pipeline does not exploit).

Model capability tracking is the practice of monitoring and re-evaluating pipeline assumptions as foundation models evolve. It requires:
1. A set of evaluation tasks that are representative of the pipeline's intended function.
2. A process for running new models against these tasks before deployment.
3. A monitoring mechanism that detects capability shifts in deployed models.

**Benchmark ecosystem.** The primary benchmarks for code capability tracking are:

- **SWE-bench** (Princeton, 2023): Issues and pull requests from Python repositories, testing end-to-end software engineering capability. Resolution rate improved from 1.96% (2023) to ~75% on SWE-bench Verified (2025), illustrating the pace of capability improvement.
- **SWE-rebench** (NeurIPS 2025): An automated pipeline that continuously generates fresh SWE tasks from GitHub, addressing contamination by construction. Comprising 21,000+ tasks, it provides contamination-resistant evaluation for rapidly improving models.
- **LiveCodeBench** (ICLR 2025): Time-segmented code evaluation using problems published after model training cutoffs, providing contamination resistance via temporal isolation. Demonstrated effectiveness at detecting contamination across GPT-4o, Claude, DeepSeek, and Codestral.
- **SWR-Bench** (Zhang et al., 2025): Review-specific benchmark; the most directly relevant to pipeline capability tracking.

**Benchmark saturation and contamination.** A saturated benchmark is one where leading models have reached near-ceiling performance, making it unable to distinguish between models. MMLU is saturated at ~88% for frontier models. Benchmark contamination -- test data appearing in model training corpora -- inflates measured performance. The 13% GSM8K accuracy drop observed when contaminated examples were removed (Shi et al., 2023) represents a documented lower bound for contamination effects.

For review pipeline capability tracking, the contamination problem manifests as overconfidence: if evaluation benchmarks are contaminated by model training data, measured improvements in review capability may be memorization artifacts rather than genuine improvements. The SWE-rebench automated pipeline approach -- continuously generating new tasks from fresh GitHub activity -- provides the most principled contamination-resistant evaluation approach currently available.

**METR's time-horizon methodology.** The Model Evaluation and Threat Research organization (METR) has developed a longitudinal framework for tracking AI capability improvement using time-horizon metrics: the task duration at which an agent achieves 50% or 80% success rates on autonomous software tasks. METR's analysis shows a doubling time of approximately 175-201 days for these metrics across model generations from 2019 to 2025. For review pipeline operators, this implies that the capability baseline for any agent component in the pipeline doubles roughly every six months -- a rapid change rate that demands regular re-evaluation.

**Capability elicitation.** A capability that exists in a model but is not elicited by the current prompting strategy is a measurement artifact, not a genuine limitation. Several studies have demonstrated that prompting strategies significantly affect measured review performance: the Yu et al. (2024) security review study found that combining commit messages with chain-of-thought guidance produced the best results for DeepSeek-R1, while CWE-list prompts worked best for GPT-4. Capability elicitation -- the process of identifying the prompting strategy that maximizes a model's performance on a target task -- should be part of model upgrade evaluation, because a new model may require different prompting to achieve its full potential.

**Pipeline assumption drift.** As models improve, pipeline design decisions that were sensible at one capability level may become suboptimal. An agent configured to use retrieval-augmented generation (RAG) because the base model's context window was insufficient may be over-complicated when a model with a 1M token context window is deployed. A filtering agent added to compensate for a high false positive rate may be unnecessary if model updates substantially reduce FAR. Systematic tracking of pipeline assumptions against current model capabilities -- analogous to the "drift detector" in the compound-agent project's subagent pipeline -- is necessary to prevent architectural ossification.

**Eval-driven pipeline governance.** The emerging practice of "eval-driven" pipeline governance treats pipeline configuration as a continuously-evaluated system rather than a static configuration. Key components:
- A frozen held-out evaluation set, never used for prompt optimization.
- Automated evaluation runs triggered by model updates (CI/CD for models).
- Metrics dashboards tracking precision, recall, KBI, and FAR over model generations.
- A versioned record of pipeline configuration per model version, enabling regression analysis.

LiveBench's approach of releasing new evaluation questions monthly (to maintain contamination resistance over time) provides a template for maintaining live evaluation sets for review-specific capability tracking.

---

## 4. Comparative Synthesis

### 4.1 Cross-Cutting Analysis

The six measurement approaches described in Section 3 are not independent methodologies but interlocking components of a coherent measurement system. The table below identifies the cross-dependencies and the data requirements for each approach:

| Measurement Approach | Data Required | Primary Output Metric | Key Dependency |
|---|---|---|---|
| SNR / Precision-Recall | Ground-truth labeled defects | KBI, FAR, F1, CPI | Requires defect taxonomy |
| Ablation Studies | Labeled corpus + isolated agent configs | ΔF1, ΔRecall per stage | Requires SNR methodology |
| Defect Taxonomy | Expert classification of defect corpus | Defect type distribution | Enables all other approaches |
| Cost-Benefit Analysis | Token costs + developer time + escape cost | ROI per stage | Requires SNR + Ablation |
| Redundancy Detection | Labeled corpus + pairwise finding comparison | Total correlation, NMI | Requires taxonomy for defect matching |
| Capability Tracking | Frozen eval set + model version history | Δ(F1, KBI) per model update | Requires SNR methodology |

The table reveals a central dependency: all six approaches are downstream of defect taxonomy. Without an agreed classification scheme for what counts as a defect and what category it belongs to, precision and recall cannot be computed for specific defect types, ablation cannot identify which agent covers which type, redundancy cannot be measured semantically (as opposed to textually), and cost-benefit analysis cannot weight findings by defect severity.

### 4.2 Precision vs. Recall: The Structural Tension

The empirical literature is remarkably consistent: current LLM review systems are recall-limited at acceptable precision levels, or precision-limited at acceptable recall levels. The top SWR-Bench result (Gemini-2.5-Pro, PR-Review, F1 19.38%) represents 16.65% precision at 23.18% recall -- both well below operational thresholds for most production deployments. Practitioners face a binary choice:

- **Precision-first deployment**: Accept low recall to avoid overwhelming developers with false positives. Appropriate for high-velocity teams with limited developer time for review triage.
- **Recall-first deployment**: Accept low precision in exchange for higher defect coverage. Appropriate for high-stakes domains (security, financial, safety-critical) where defect escape cost is extreme.

Multi-review aggregation (n independent passes of the same model, then self-aggregation) shifts the efficiency frontier: at n=10, F1 reaches 21.91% and recall reaches 30.44%, with minimal change to precision. This suggests that the precision-recall frontier for current models is genuinely constrained, and that the primary lever for improving both simultaneously is model quality improvement rather than architectural changes.

### 4.3 Taxonomy Gap: Classical vs. AI-Specific Defects

ODC was designed for defects in procedural and object-oriented software written by humans. AI-generated code introduces defect patterns that do not map cleanly to ODC categories:
- Hallucinated API calls (a form of Interface defect, but with a different root cause than human interface errors).
- Plausible-but-incorrect algorithms (an Algorithm defect, but one that is systematically harder to detect because the code "looks correct" to surface-level review).
- Context-length truncation artifacts (code that is locally correct but ignores distant context, an emergent failure mode with no classical ODC analogue).

AI-ODC (Nahar et al., 2025) addresses some of these, but as of 2025 it has not been empirically validated against large-scale AI-generated codebases or integrated with multi-agent review pipeline measurement.

### 4.4 Comparing Measurement Approaches: Costs and Benefits

| Approach | Implementation Cost | Data Cost | Time to Signal | Confidence in Output |
|---|---|---|---|---|
| Per-agent precision/recall (benchmark) | Medium (evaluation framework) | High (labeled corpus) | Weeks | High if benchmark is representative |
| Ablation by component removal | Medium (A/B infrastructure) | High (labeled corpus) | Weeks-Months | Medium (confounded by non-determinism) |
| ODC-based defect typing | Low-Medium (classifier training) | Medium (classified sample) | Days-Weeks | Medium (automated classification errors) |
| ROI estimation | Low (cost instrumentation) | Low (cost data) + Medium (escape data) | Ongoing | Low-Medium (escape data is sparse) |
| Information-theoretic redundancy | Medium (ground truth required) | High (labeled sample) | Weeks | Medium (PID axioms contested) |
| Model capability tracking (evals) | Low-Medium (eval pipeline) | Low (frozen eval set) | Hours (per model update) | High for eval coverage, low for generalization |

The asymmetry in data cost reveals the central bottleneck: most high-confidence approaches require a ground-truth labeled defect corpus, which is both expensive to create and rapidly becomes stale as codebases evolve. Approaches with low data cost (ROI estimation from token costs and change failure rate) provide only noisy signals because the signal (escape rate change) is sparse and confounded.

### 4.5 Human vs. Automated Review: Coverage Complementarity

The empirical baseline from five decades of human code review research shows:
- Formal inspection: 60-82% defect removal effectiveness.
- Modern code review: 12.5% of comments address defects (Bacchelli and Bird, 2013); absolute defect removal effectiveness unclear but substantially lower than formal inspection.
- Best current LLM review: 19.38% F1 on a benchmark with domain-expert ground truth.

These figures are not directly comparable because they measure different things: formal inspection effectiveness is measured against defects in the artifact at inspection time, while LLM F1 is measured against a benchmark corpus of change-point annotations. Nevertheless, the convergence on low absolute performance for both human MCR and current LLM review suggests that the two are more complementary than competitive: human reviewers catch different defect types (deep semantic, design, contextual) than LLM agents (pattern, validation, style), and a combined pipeline may substantially exceed either alone.

This complementarity is supported by the ODC trigger analysis: human reviewers primarily activate "design conformance" and "lateral compatibility" triggers (requiring domain knowledge); LLM agents primarily activate "coverage" and "explicit" triggers (requiring systematic checking of many conditions). A multi-agent pipeline that combines LLM agents with human review gates (where human reviewers are focused on the defect types LLMs miss) implements a naturally complementary coverage structure.

---

## 5. Open Problems and Gaps

### 5.1 The Ground Truth Problem

All six measurement approaches in this survey are blocked, to varying degrees, by the absence of large-scale, defect-labeled, industrial code review datasets. The SWR-Bench dataset (1,000 PRs) and SWE-bench Verified (500 problems) are valuable but small relative to production scale. The absence of public datasets representing diverse industrial codebases, language ecosystems, and defect type distributions means that:

1. Benchmark results may not generalize: A pipeline achieving 19% F1 on open-source Python projects may perform very differently on closed-source Java enterprise codebases.
2. Ablation results are non-portable: Stage-removal experiments on one codebase corpus may not reflect stage contributions on another.
3. ODC trigger mapping cannot be validated: Claimed mappings from LLM agent capabilities to ODC trigger categories are not empirically grounded in large-scale annotation studies.

Creating such datasets is expensive (expert annotation at scale), organizationally complex (industrial data is proprietary), and quickly outdated (codebases evolve). Mutation-based defect injection (systematically introducing known defect types via code transformations) provides a partial solution but does not capture the distribution of naturally occurring defects.

### 5.2 Non-Determinism and Measurement Validity

LLM review agents are non-deterministic: the same agent reviewing the same PR twice produces different findings. The SWR-Bench study found only 27/many overlapping change-points across five independent runs of the same model on the same PR. This non-determinism:

1. Inflates apparent coverage: A pipeline that runs k times on the same code will find more defects than a single run, but the relationship between k and total coverage is sublinear and data-dependent.
2. Complicates ablation: Removing an agent from a pipeline may have different measurable effects on different runs, requiring many replications to obtain stable estimates.
3. Undermines capability tracking: Measured precision/recall changes between model updates may be within the noise envelope of non-deterministic variation rather than genuine capability shifts.

No standard methodology exists for handling LLM non-determinism in review pipeline evaluation. The multi-review aggregation approach (run n times, self-aggregate) converts non-determinism from noise to a tunable parameter, but the optimal n depends on the model and the desired coverage level.

### 5.3 Missing Formalism for Review Agent Synergy

The partial information decomposition framework provides a theoretical basis for measuring synergy between review agents (defects that are only detectable by combining multiple agents' findings), but:

1. No published study has applied PID to multi-agent review agent combinations.
2. The computational requirements for PID scale exponentially with the number of agents, making it impractical for pipelines with more than 4-5 agents without approximation methods.
3. The contested mathematical foundations of PID (no measure simultaneously satisfies all desired axioms) mean that different PID measures may yield different conclusions about synergy.

The practical implication is that pipeline designers currently have no principled tool for detecting emergent value from agent combinations -- the kind of value that would be missed by any single-agent ablation.

### 5.4 Benchmark Contamination and Saturation in Review-Specific Evaluation

The general benchmark contamination and saturation problems are particularly acute for code review evaluation:

1. Review benchmarks constructed from public GitHub repositories are likely to appear in the training data of models trained on web-scale code corpora.
2. Review benchmarks that use PR-level metrics (does the model find the important change?) are more resistant to direct contamination (the model cannot memorize PR reviews) but may be contaminated at the code pattern level.
3. As model capabilities improve rapidly (METR's 175-day doubling time), review benchmarks may saturate within 1-2 years of publication, requiring continuous refresh.

SWE-rebench's automated pipeline for continuous benchmark generation provides the most principled approach to contamination resistance, but has not been adapted for review-specific evaluation (its tasks are bug-fix tasks, not code review tasks).

### 5.5 The Capability-Assumption Feedback Loop

Pipeline operators who update models without re-evaluating pipeline design assumptions risk two failure modes:

1. **Capability under-exploitation**: The new model can detect defect types that the pipeline's prompts and agent structure do not exercise. The pipeline continues to report the same performance as before model update, masking the available improvement.
2. **Assumption violation**: The new model behaves differently from its predecessor in ways that break downstream assumptions (e.g., a model that produces longer, more detailed findings may cause a downstream filtering agent that was calibrated to shorter outputs to discard valid findings).

Neither failure mode has a standard detection mechanism. Eval-driven pipeline governance (Section 3.6) provides an architectural response, but requires investment in maintaining frozen evaluation sets and automated regression testing for pipeline configurations.

### 5.6 Organizational Validity of Cost-Benefit Estimates

The cost-benefit framework in Section 3.4 requires estimates of defect escape cost (C_escape) and developer review time per finding (T_developer). Both are notoriously difficult to measure in practice:

- Defect escape cost is highly variable and severity-dependent; the commonly-cited 40-100x cost multiplier for production defects aggregates across all defect types and is not validated for modern CI/CD contexts.
- Developer attention cost per false positive has not been empirically measured for LLM-generated review comments specifically, though Bacchelli and Bird (2013) provide data on human-generated review comment processing times.

Without reliable estimates of these parameters, cost-benefit calculations for pipeline stages are highly sensitive to assumptions and should be treated as order-of-magnitude estimates rather than precise computations.

---

## 6. Conclusion

This survey examined the measurement science for multi-agent code review pipelines across six interlocking dimensions: signal-to-noise ratio, ablation methodology, defect taxonomy, cost-benefit analysis, reviewer redundancy detection, and model capability tracking.

The central finding is that all six measurement approaches are mature enough to be operationalized for research and production contexts, but each faces a common blocking constraint: the absence of large-scale, ground-truth-labeled defect corpora that are representative of industrial codebases. The SWR-Bench and SWE-bench ecosystems represent the best current approximations but remain inadequate in scale and diversity.

The empirical baseline for LLM code review is sharply defined: top systems achieve ~19% F1 on benchmark tasks, with precision as the primary bottleneck at ~17%. Multi-review aggregation (n independent passes, self-aggregation) can improve this to ~22% F1 at n=10, with recall gains exceeding 118% over baseline. These numbers establish the quantitative foundation against which pipeline improvements must be measured.

ODC provides the most operationally useful defect taxonomy for multi-agent pipeline analysis, with the AI-ODC extension addressing emerging AI-specific failure modes. The trigger dimension of ODC maps particularly cleanly to multi-agent pipeline structure, enabling principled assignment of finding types to agent specializations.

The information-theoretic redundancy detection framework (total correlation, mutual information, PID) is mathematically well-founded but practically blocked by PID's contested axioms and the computational scaling of the approach to many-agent pipelines. Simpler pairwise mutual information or Jaccard similarity measures are more immediately deployable.

Model capability tracking requires contamination-resistant evaluation infrastructure (following LiveCodeBench or SWE-rebench approaches) combined with eval-driven pipeline governance to prevent assumption drift between model updates. METR's finding of a 175-day capability doubling time establishes the urgency: pipeline configurations that are well-calibrated today may be significantly misconfigured within six months.

The field is young, active, and empirically underdeveloped relative to both its academic importance and its practical urgency. The next generation of measurement science for multi-agent review pipelines will likely be built on larger labeled corpora, contamination-resistant continuous benchmarks, and information-theoretic coverage analysis that goes beyond pairwise comparisons to capture the synergistic value of agent combinations.

---

## References

1. Fagan, M.E. (1976). Design and Code Inspections to Reduce Errors in Program Development. *IBM Systems Journal*, 15(3), 182-211. https://www.semanticscholar.org/paper/Design-and-Code-Inspections-to-Reduce-Errors-in-Fagan/fe02f66911c6331a81d01f9cf4fdce05b6b2aca3

2. Chillarege, R., Bhandari, I.S., Chaar, J.K., et al. (1992). Orthogonal Defect Classification — A Concept for In-Process Measurements. *IEEE Transactions on Software Engineering*, 18(11), 943-956. https://dl.acm.org/doi/10.1109/32.177364

3. Chillarege, R. (n.d.). Orthogonal Defect Classification — A Concept for In-Process Measurements. Chillarege Inc. https://www.chillarege.com/articles/odc-concept.html

4. Bacchelli, A. and Bird, C. (2013). Expectations, Outcomes, and Challenges of Modern Code Review. *ICSE 2013*, 712-721.

5. Beller, M., Bacchelli, A., Zaidman, A., and Jürgens, E. (2014). Modern Code Reviews in Open-Source Projects: Which Problems Do They Fix? *MSR 2014*.

6. Sadowski, C., Söderberg, E., Church, L., Sipko, M., and Bacchelli, A. (2018). Modern Code Review: A Case Study at Google. *ICSE 2018* (SEIP Track).

7. Rigby, P.C. and Bird, C. (2013). Convergent Contemporary Software Peer Review Practices. *ESEC/FSE 2013*.

8. Russell, R.T. (1991). Classic Inspections — Software Quality Improvement (Techniques). *CrossTalk*.

9. Ackerman, A.F., Buchwald, L.S., and Lewski, F.H. (1989). Software Inspections: An Effective Verification Process. *IEEE Software*, 6(3), 31-36.

10. Zhang, Y. et al. (2025). Towards Practical Defect-Focused Automated Code Review. *arXiv:2505.17928*. https://arxiv.org/html/2505.17928

11. Zhang, Y. et al. (2025). Benchmarking and Studying the LLM-based Code Review. *arXiv:2509.01494*. https://arxiv.org/html/2509.01494v1

12. Yu, Z. et al. (2024). An Insight into Security Code Review with LLMs: Capabilities, Obstacles, and Influential Factors. *arXiv:2401.16310*. https://arxiv.org/abs/2401.16310

13. Al-Sayouri, S. and Baz, M. (2025). Evaluating Large Language Models for Code Review. *arXiv:2505.20206*. https://arxiv.org/html/2505.20206v1

14. Nahar, N. et al. (2025). A Defect Classification Framework for AI-Based Software Systems (AI-ODC). *arXiv:2508.17900*. https://arxiv.org/pdf/2508.17900

15. Williams, P.L. and Beer, R.D. (2010). Nonnegative Decomposition of Multivariate Information. *arXiv:1004.2515*.

16. Gutknecht, A.J. et al. (2025). The Mathematical Landscape of Partial Information Decomposition: A Comprehensive Review. *arXiv:2603.06678*. https://arxiv.org/html/2603.06678

17. Watanabe, S. (1960). Information Theoretical Analysis of Multivariate Correlation. *IBM Journal of Research and Development*, 4(1), 66-82.

18. IEEE Std 1044-2009. IEEE Standard Classification for Software Anomalies. *IEEE*. https://standards.ieee.org/ieee/1044/4607/

19. Jones, C. (2012). *The Economics of Software Quality*. Addison-Wesley Professional.

20. Shull, F., Carver, J., and Travassos, G.H. (2002). An Empirical Methodology for Introducing Software Processes. *ESEC/FSE 2001*.

21. SWE-rebench. (2025). An Automated Pipeline for Task Collection and Decontaminated Evaluation. *NeurIPS 2025*. https://arxiv.org/abs/2505.20411

22. LiveCodeBench. (2025). Holistic and Contamination-Free Evaluation of LLMs for Code. *ICLR 2025*. https://proceedings.iclr.cc/paper_files/paper/2025/file/94074dd5a072d28ff75a76dabed43767-Paper-Conference.pdf

23. METR. (2025). Time Horizon Benchmark v1.0/v1.1. https://metr.org/

24. Shi, F. et al. (2023). Data Contamination: From Memorization to Exploitation. *ACL 2023*.

25. Bertschinger, N., Rauh, J., Olbrich, E., Jost, J., and Ay, N. (2014). Quantifying Unique Information. *Entropy*, 16(4), 2161-2183.

26. Thung, F., Lo, D., and Jiang, L. (2012). Automatic Defect Categorization. *WCRE 2012*. https://www.sciencedirect.com/science/article/abs/pii/S0167739X19308283

27. Chen, T.Y., Leung, H., and Mak, I.K. (2002). Adaptive Random Testing. *APAQS 2004*.

28. Beyond Task Completion: Assessment Framework for Evaluating Agentic AI Systems. (2025). *arXiv:2512.12791*. https://arxiv.org/html/2512.12791v1

29. Evaluation and Benchmarking of LLM Agents: A Survey. (2025). *arXiv:2507.21504*. https://arxiv.org/html/2507.21504v1

30. DORA (2024). Accelerate State of DevOps Report. Google Cloud. https://daily.dev/blog/defect-density-and-escape-rate-agile-metrics-guide-2024

---

## Practitioner Resources

### Tools and Frameworks

| Tool | Purpose | URL |
|---|---|---|
| SWR-Bench | Code review evaluation benchmark | arXiv 2509.01494 |
| SWE-bench Verified | Software engineering agent evaluation | https://openai.com/index/introducing-swe-bench-verified/ |
| SWE-rebench | Contamination-resistant continuous benchmark | https://arxiv.org/abs/2505.20411 |
| LiveCodeBench | Contamination-free code capability evaluation | https://github.com/LiveBench/LiveBench |
| METR Evals | Autonomous task time-horizon measurement | https://metr.org/ |
| DeepEval | LLM evaluation framework with CI integration | https://deepeval.com/ |
| Inspect AI (UK AISI) | Model and agent-level evaluation framework | https://ukgovernment.github.io/inspect_ai/ |

### Key Metrics Reference

| Metric | Formula | When to Use |
|---|---|---|
| KBI (Key Bug Inclusion) | TP_critical / (TP_critical + FN_critical) | High-stakes review contexts |
| FAR (False Alarm Rate) | FP / (FP + TN) | Developer attention budgeting |
| CPI (Comprehensive Performance Index) | 2×KBI×(1-FAR) / (KBI + (1-FAR)) | Combined KBI/FAR reporting |
| F1 Score | 2×P×R / (P+R) | Balanced benchmark comparison |
| Total Correlation | Σ H(Xᵢ) - H(X₁,...,Xₙ) | Pipeline redundancy audit |
| NMI (Normalized Mutual Information) | I(A;B) / √(H(A)×H(B)) | Pairwise agent redundancy |
| Defect Escape Rate | Defects in production / Total defects | Ultimate pipeline health KPI |

### ODC Trigger-to-Agent Mapping Template

| ODC Trigger Category | Suitable Agent Type | Expected Finding Pattern |
|---|---|---|
| Design Conformance | Architecture reviewer | Design pattern violations, abstraction leakage |
| Backward Compatibility | API compatibility checker | Breaking changes, deprecated API use |
| Lateral Compatibility | Integration reviewer | Cross-module contract violations |
| Coverage (code paths) | Test coverage agent | Missing test coverage for error paths |
| Language Dependency | Security/style agent | Language-specific pitfalls (e.g., SQL injection) |
| Explicit (security conditions) | Security specialist agent | CWE-specific vulnerabilities |
| Timing/Concurrency | Concurrency analyzer | Race conditions, lock order violations |

### Recommended Ablation Protocol

1. Establish ground-truth labeled defect corpus (minimum 200 labeled PRs per defect class under study).
2. Define "stage configuration" as a specific agent + prompt + context combination (versioned).
3. Run full pipeline (all stages) against corpus; record all findings and true/false classifications.
4. For each stage under ablation: remove it from the pipeline, re-run, record delta in precision, recall, KBI, and FAR for each ODC defect type.
5. Account for non-determinism: run each configuration at least 5 times; report mean and standard deviation.
6. Compute marginal ROI for each stage: (delta_KBI × C_escape) / (T_pipeline_stage + T_developer × delta_findings).
7. Report results per defect type, not only in aggregate.

### Benchmark Freshness Policy

Given METR's observed 175-day capability doubling time, review-specific evaluation benchmarks should be:
- Refreshed or extended at least every 6 months.
- Validated for contamination before each refresh (check training cutoff dates against benchmark construction dates).
- Run automatically on model updates before deployment to production pipeline.
- Maintained as a versioned, frozen dataset separate from any data used for prompt optimization or fine-tuning.
