# AI Evaluator Calibration & Few-Shot Learning for Automated Code Review

*2026-03-25*

## Abstract

This survey examines the science of calibrating large language model (LLM) based evaluators using few-shot examples, with particular emphasis on automated code review. As LLM-as-judge pipelines become standard infrastructure in software engineering workflows, the reliability of these evaluators depends critically on how they are configured, calibrated, and maintained. Five interlocking problems are addressed: how few-shot examples shape evaluator behavior; how evaluator accuracy degrades as codebases and expectations evolve; how to select the right failure examples from a corpus of past mistakes; how to measure agreement across multiple AI reviewers; and how to elicit calibrated probability estimates from evaluators rather than binary verdicts.

The landscape divides into three broad intervention points: prompt-time calibration (few-shot example selection, rubric design, chain-of-thought decomposition), post-hoc statistical calibration (temperature scaling, adaptive temperature scaling, Thermometer, CalibraEval), and structural calibration (multi-judge ensembles, fine-tuned specialist judges, agent-based evaluation). Each approach addresses different failure modes: prompt-time methods reduce systematic bias; post-hoc methods correct distributional mismatch between model confidence and ground-truth accuracy; structural methods reduce individual model blind spots through diversity and redundancy.

Key findings from the literature include: strong LLM judges achieve roughly 80% agreement with human evaluators on general tasks, with position bias affecting 18-43% of judgments without mitigation; few-shot examples improve alignment but exhibit diminishing returns and can collapse performance beyond optimal counts; adaptive calibration methods reduce Expected Calibration Error by 10-50% over standard temperature scaling; and panel-based evaluation (PoLL) achieves higher Cohen's kappa with humans than single GPT-4 judgment at seven times lower cost. Specific to code review, current automated systems exhibit F1 scores below 20% on comprehensive benchmarks, with reasoning-capable models (DeepSeek-R1, Gemini-2.5-Pro) outperforming standard variants, and multi-run aggregation recovering up to 44% additional F1.

---

## 1. Introduction

### Problem Statement

LLM-based code review evaluators face a fundamental epistemological challenge: to determine whether an AI reviewer's verdict on a code change is trustworthy, one must already have a trustworthy judge. This circularity, named the "validator problem" by Shankar et al. (2024), manifests in practice as four distinct failure modes. First, unaided LLM judges exhibit systematic biases—favoring longer responses, first-position answers, and outputs resembling their own training distribution—that produce evaluation results misaligned with human developer judgment. Second, evaluators calibrated on one codebase or time period become stale as coding conventions, review standards, and prevalent bug patterns evolve; a judge trained on 2022-era TypeScript feedback may have miscalibrated priors when encountering 2025-era async/await patterns. Third, when multiple AI reviewers are deployed to achieve reliability through redundancy, their agreement or disagreement carries ambiguous signal—it is unclear whether concurrence reflects genuine consensus or shared bias, and whether divergence reflects genuine uncertainty or measurement noise. Fourth, evaluators trained or prompted to produce confidence scores do so in poorly calibrated ways: RLHF fine-tuning systematically inflates verbalized confidence, creating Dunning-Kruger-like patterns where the evaluator is most overconfident on the cases it is most likely to be wrong.

### Scope

This survey covers:
- Few-shot and many-shot calibration of LLM evaluators, with emphasis on example count, diversity, and selection strategy
- Calibration drift: temporal degradation of evaluator accuracy as codebases evolve
- Negative example curation: selecting past failure cases to maximally inform evaluator behavior
- Inter-rater reliability metrics between AI judges, including Cohen's kappa, Krippendorff's alpha, and newer formulations
- Confidence calibration: ECE-based methods, temperature scaling, adaptive variants, and verbalized probability calibration

The survey does not cover: evaluation of code generation quality more broadly (synthesis benchmarks like HumanEval, SWE-bench); general NLP evaluation benchmarks unrelated to code; reinforcement learning from human feedback (RLHF) as a training method; or specification testing and formal verification.

### Key Definitions

**LLM-as-judge**: Using a large language model to evaluate the output quality of another LLM or human, producing scores, labels, rankings, or natural language feedback.

**Calibration**: Alignment between a model's stated confidence and its actual accuracy; a perfectly calibrated model that claims 70% confidence is correct exactly 70% of the time.

**Expected Calibration Error (ECE)**: The weighted average of the gap between model confidence and accuracy across confidence bins; lower is better.

**Few-shot prompting**: Providing one or more worked examples in the prompt context to guide model behavior, as opposed to zero-shot (no examples) or fine-tuning (weight updates).

**Criteria drift**: A phenomenon identified by Shankar et al. (2024) where evaluation standards change through the act of grading; graders refine what they are looking for by seeing what models actually produce.

**Rating indeterminacy**: Conditions where multiple ratings are legitimately correct for a given item, making standard forced-choice agreement metrics misleading.

**Position bias**: The tendency of LLM judges to prefer one response position (first or last) independent of content quality.

**Verbosity bias**: The tendency of LLM judges to favor longer, more elaborate responses regardless of quality.

---

## 2. Foundations

### 2.1 LLM-as-Judge: Origins and Baseline Performance

The systematic study of LLMs as evaluators began with Zheng et al. (2023), who introduced MT-Bench (a multi-turn question dataset) and Chatbot Arena (crowdsourced pairwise comparisons) as benchmarks for validating judge systems against human preferences. Their core finding—that GPT-4 achieves over 80% agreement with human evaluators, matching inter-human agreement levels—established LLM-as-judge as a practical paradigm for scalable evaluation.

The paper also identified three foundational failure modes that have shaped subsequent research:
1. **Position bias**: Preference for solutions appearing in a particular prompt position
2. **Verbosity bias**: Preference for longer responses independent of quality
3. **Self-enhancement bias**: Models rating outputs resembling their own training distribution higher (GPT-4 showed a 10% higher win rate for its own outputs; Claude-v1 showed 25%)

These biases are not random noise—they are systematic, reproducible, and exploitable. Vicuna-13B was shown to beat ChatGPT on 66 of 80 tested queries when ChatGPT served as evaluator, simply through response reordering (Wang et al., 2023).

### 2.2 Theoretical Grounding: Calibration

Classical calibration theory (Guo et al., 2017) defines a model as calibrated when its predicted probabilities match empirical accuracy frequencies. For a classifier predicting P(y=1|x) = 0.7, the long-run accuracy on cases assigned that confidence should be 70%. Neural networks violate this property systematically—they tend toward overconfidence, clustering predictions near 0 or 1.

Temperature scaling addresses this by dividing logits by a scalar T before softmax application:

    P_calibrated(y|x) = softmax(z/T)

where T > 1 reduces overconfidence and T < 1 increases it. Temperature scaling is the single-parameter limiting case of Platt Logistic Scaling. It requires a held-out labeled validation set to fit T.

For LLMs used as judges, the calibration problem is complicated by: (a) outputs may be natural language rather than class probabilities, requiring logit extraction or verbalized probability elicitation; (b) RLHF fine-tuning degrades calibration substantially (Adaptive Temperature Scaling, Shen et al., 2024); (c) code review tasks involve partial correctness rather than binary labels, requiring extensions like Flex-ECE.

### 2.3 Few-Shot In-Context Learning Mechanics

Brown et al. (2020) established that LLMs exhibit emergent in-context learning: providing examples in the prompt shifts model behavior toward the demonstrated pattern without weight updates. The mechanism operates through pattern matching against the demonstration format, label distribution, and input-output correlation—not necessarily through semantic understanding of the examples (Min et al., 2022 showed that label correctness in demonstrations sometimes matters less than label format and distribution).

For evaluation tasks, few-shot examples serve three functions:
1. **Anchor calibration**: They establish the effective range and granularity of the score scale (what constitutes a "3" vs a "4" on a 5-point rubric)
2. **Bias reduction**: They shift the judge's prior away from systematic biases toward task-appropriate criteria
3. **Criteria specification**: They make implicit evaluation standards explicit through worked examples

The scaling behavior of many-shot prompting (Agarwal et al., 2024) demonstrates that performance continues improving with hundreds or thousands of examples for complex tasks, though with task-specific ceiling effects (MATH and GPQA plateau around 125 shots before declining). Crucially, ordering of examples within the prompt remains significant even at high shot counts—an ordering that excels in one task subarea may fail in another.

### 2.4 Concept Drift in ML Evaluation Systems

Classical concept drift theory (Gama et al., 2014) distinguishes: **sudden drift** (abrupt distribution shift), **gradual drift** (slow transition between distributions), and **recurrent drift** (periodic reappearance of past distributions). In the code review context, evaluator drift manifests differently from traditional ML drift: the input distribution (code) and the target function (human developer judgment) both change, creating compound drift where neither is stable.

Shankar et al. (2024)'s criteria drift is a specific mechanism: the evaluator's implicit standard drifts as users observe what the LLM produces and revise their expectations accordingly. This makes calibration inherently dynamic—an evaluator calibrated at deployment may be miscalibrated one sprint later not because the model changed but because the human standard changed.

Production evidence (Fiddler AI, 2025) suggests that LLM-based evaluators left without human oversight for six or more months experience error rates increasing by approximately 35% on new data patterns, driven by distributional shift in both code inputs and human review standards.

---

## 3. Taxonomy of Approaches

The following table organizes calibration approaches by intervention point, target failure mode, and data requirements:

| Category | Approach | Target Failure Mode | Data Required | Cost |
|---|---|---|---|---|
| **Prompt-Time** | Few-shot anchor examples | Criteria ambiguity, scale drift | 5-50 labeled examples | Low |
| **Prompt-Time** | Chain-of-thought decomposition (G-Eval) | Opaque scoring, criteria vagueness | None (zero-shot) | Low |
| **Prompt-Time** | Rubric-based criteria specification | Inconsistent standards | Domain expertise | Low |
| **Prompt-Time** | Balanced position calibration | Position bias | None | Low |
| **Prompt-Time** | Multiple evidence calibration | Overconfidence | None | Medium |
| **Post-Hoc Statistical** | Temperature scaling | Distributional overconfidence | Labeled validation set | Low |
| **Post-Hoc Statistical** | Adaptive Temperature Scaling (ATS) | RLHF calibration degradation | Fine-tuning dataset | Medium |
| **Post-Hoc Statistical** | Thermometer (IBM/MIT) | OOD task calibration | Multi-task training data | High |
| **Post-Hoc Statistical** | CalibraEval (NOA) | Selection/position bias | K unlabeled examples | Low |
| **Post-Hoc Statistical** | Invert-softmax + temperature scaling | Verbalized probability calibration | Small labeled set | Low |
| **Structural** | Multi-judge ensemble (PoLL) | Individual model bias | Multiple model APIs | Medium |
| **Structural** | Agent-as-judge (DEBATE, ChatEval) | Single-perspective blind spots | Multiple model APIs | High |
| **Structural** | Fine-tuned specialist (Prometheus, JudgeLM) | Generic judge misalignment | Domain evaluation data | High |
| **Structural** | Active negative example mining | Failure mode coverage gaps | Past failures corpus | Medium |
| **Drift Management** | Criteria drift monitoring (EvalGen) | Criteria staleness | Ongoing human labels | Medium |
| **Drift Management** | Agreement rate tracking | Evaluator-human drift | Human correction samples | Low |
| **Reliability Metrics** | Cohen's kappa / Krippendorff's alpha | Multi-rater consistency | Multi-rater samples | Low |
| **Reliability Metrics** | IRT-based reliability (GRM) | Discriminative capacity | Multi-item, multi-rater data | Medium |
| **Reliability Metrics** | Rating indeterminacy framework | Forced-choice validity | Multi-label rating samples | Medium |

---

## 4. Analysis

### 4.1 Few-Shot Calibration of LLM-as-Judge

#### Theory and Mechanism

Few-shot examples in evaluation prompts function as implicit calibration signals by establishing: (1) the effective endpoint anchors of a score scale, (2) the relative weight of different criteria, and (3) the evaluator's implicit prior on what constitutes an acceptable response. Without examples, LLM judges apply their pretraining priors—which for code review can be substantially misaligned with the specific team's standards, codebase idioms, or severity thresholds.

The AutoCalibrate framework (Liu et al., 2023, arXiv:2309.13308) formalizes this into a three-stage process: the LLM generates initial scoring criteria from diverse few-shot exemplars using in-context learning; a selection stage keeps the best-performing criteria variants; and a self-refinement stage produces a final calibrated rubric aligned with human labels. This is notable for being gradient-free—it operates entirely through prompt iteration rather than weight updates.

The challenge of few-shot selection is that examples are not interchangeable. Min et al. (2022) demonstrated that demonstrations inform scale and format more than content semantics. Zhang et al. (2022) showed that diversity-aware selection (Determinantal Point Processes) outperforms similarity-based retrieval when the task space is heterogeneous. For code review specifically, a corpus of past failures that all involve the same defect type (e.g., missing null checks) provides weaker calibration than a balanced set spanning different failure modes (logic errors, security issues, style violations).

#### Literature Evidence

The seminal MT-Bench paper (Zheng et al., 2023) established that few-shot prompting improves inter-rater reliability between LLM judges and humans, particularly for ambiguous tasks. G-Eval (Liu et al., 2023, EMNLP) demonstrated that decomposing evaluation criteria into chain-of-thought evaluation steps, combined with token-probability weighted scoring, improved Spearman correlation with human judgments to 0.514 on summarization tasks—outperforming all prior automated methods by a substantial margin. G-Eval achieves continuous scores by computing a probability-weighted average over possible integer scores, addressing the low-variance problem where LLMs produce only integer outputs.

CalibraEval (Li et al., 2024, ACL 2025) showed that the label-free non-parametric order-preserving algorithm (NOA) improves Fleiss's Kappa by an average of 39.16% and ICC by 83.38% across six LLMs on RewardBench, MTBench, and PreferenceBench. Critically, the method functions with 1-3 shot examples but shows decreasing effectiveness as example count increases, suggesting a non-monotonic relationship between example quantity and calibration quality for distribution-correction methods.

Many-shot experiments (Agarwal et al., 2024, arXiv:2404.11018) revealed that: performance scales with example count across diverse tasks; peak performance sometimes occurs below the maximum tested count (125 shots for MATH); and example ordering effects persist even at high shot counts. The finding that next-token prediction loss does not reliably predict downstream task performance undermines using loss as a proxy for calibration quality.

#### Implementations and Benchmarks

Concrete implementations include:
- **G-Eval** (DeepEval framework): Decomposes rubrics into criteria, generates CoT evaluation steps, scores via token probability weighted sums. Open source at `confident-ai/deepeval`.
- **AutoCalibrate**: Gradient-free rubric refinement pipeline published in arXiv:2309.13308, tested on multiple text quality datasets.
- **Prometheus** / **Prometheus 2** (Kim et al., 2024, ICLR): Fine-tuned on the Feedback Collection dataset (1K rubrics, 20K instructions, 100K GPT-4 feedback examples). Prometheus 2 (7B and 8x7B) supports both absolute scoring and pairwise ranking, using reference answers as calibration anchors. Available at `prometheus-eval/prometheus-eval`.
- **LangChain Align Evals**: Commercial tooling for collecting human corrections, building few-shot calibration examples, and tracking agreement metrics over time.

The GoDaddy Rubrics-as-Rewards (RaR) approach structures few-shot examples through a rubric hierarchy (essential / important / optional / pitfall criteria) rather than providing raw examples, trading example diversity for systematic coverage.

#### Strengths and Limitations

**Strengths**: Prompt-time few-shot calibration requires no model retraining, is immediately applicable, and produces interpretable calibration by making the evaluator's standard explicit. For code review, it allows rapid adaptation to team-specific standards.

**Limitations**: Performance exhibits non-monotonic behavior—adding more examples beyond an optimum can collapse performance ("few-shot collapse") through format anchoring or by triggering the LLM to over-pattern-match on irrelevant features. The optimal shot count is task- and model-specific with no reliable a priori predictor. Example selection requires human curation effort and can inadvertently introduce biases if selected examples are not representative of the full evaluation space.

---

### 4.2 Calibration Drift

#### Theory and Mechanism

Calibration drift in LLM-based code review evaluators has two distinct but coupled components:

**Model-side drift**: The evaluation LLM changes—either through provider-side updates (silent version bumps), RLHF alignment shifts, or context window changes—causing the model's calibration characteristics to change with no visible indicator. The output drift study (Thinking Machines Lab, arXiv:2511.07585) identified batch-size variation at the infrastructure level as a primary source of nondeterminism, showing that systems using T=0.0 achieve perfect consistency for small models (7-8B parameters) but only 12.5% consistency for very large models (120B parameters) regardless of temperature configuration.

**Distribution-side drift** (criteria drift per Shankar et al., 2024): The target distribution—what human reviewers consider acceptable or unacceptable—shifts as teams observe model outputs and revise their expectations. This creates a circular calibration problem: evaluation standards are not independent of the objects being evaluated. The EvalGen study (UIST 2024) found that some criteria can only be defined by observing the specific model outputs, making pre-deployment calibration inherently incomplete.

**Concept drift in the code distribution**: Code review patterns evolve with technology adoption (new language features, new frameworks, new security threats). An evaluator calibrated on React class components may have miscalibrated priors when reviewing React hooks code. The classical ML concept drift literature (Gama et al., 2014; Frontiers review, 2024) distinguishes gradual from sudden drift, but in the code context, framework migrations can cause sudden distributional shifts.

#### Literature Evidence

Fiddler AI (2025) operational data indicates that LLM-based evaluators without monitoring show error rate increases of approximately 35% over six months, driven by combined model and distribution drift. This is consistent with the classical concept drift literature's finding that classifiers trained on fixed time windows deteriorate quickly when evaluated on data collected months or years later.

The output drift paper (arXiv:2511.07585) showed that RAG-augmented systems—which code review tools often use to retrieve project-specific context—exhibited only 56-75% output consistency at T=0.2, substantially worse than non-RAG tasks. This is directly relevant to code review evaluators that retrieve historical review context or coding standards.

Shankar et al. (2024) documented criteria drift as a foundational challenge: in a qualitative study, participants consistently revised their evaluation criteria after observing model outputs, with some criteria only discoverable through the grading process. This suggests that static calibration sets become outdated not only because code patterns change but because human evaluator mental models evolve.

#### Implementations and Benchmarks

Drift management approaches in production:
- **Agreement rate tracking**: Monitor the percentage of evaluator verdicts that agree with a sample of human expert verdicts. A drop below a threshold triggers recalibration. LangChain and Fiddler AI both recommend this as a primary drift signal.
- **Reference set maintenance**: Maintain a "gold set" of 30-100 examples with known ground truth, run evaluator against this set periodically, and alert when accuracy drops below a defined threshold.
- **Continuous few-shot refresh**: As the criteria drift study suggests, few-shot examples should be updated regularly from recent human corrections rather than remaining static from initial deployment. The LangChain methodology advocates a feedback loop: collect corrections → update few-shot examples → re-measure agreement.
- **CalibraEval robustness**: The NOA-based approach achieved 85% of full-dataset calibration performance using only 10% of available data, suggesting efficient recalibration is feasible when triggered by drift signals.

#### Strengths and Limitations

**Strengths**: Drift detection through agreement rate monitoring is low-cost and directly measures the quantity of interest (human-evaluator alignment). Few-shot refresh requires no model retraining.

**Limitations**: Agreement rate monitoring requires ongoing human labeling effort, which is the bottleneck it was designed to reduce. Criteria drift creates a philosophical challenge: if the target distribution is inherently nonstationary (human standards evolve through observation), there is no stable calibration target. Sudden model-side drift from provider updates is largely uncontrollable.

---

### 4.3 Negative Example Curation

#### Theory and Mechanism

The core principle of negative example curation is that few-shot demonstrations showing the evaluator *what not to do* can be more informative than positive examples alone, particularly when the failure modes are systematic and learnable. This parallels the machine learning literature on hard negative mining and contrastive learning, where difficult negatives provide stronger gradient signal for representation learning.

For LLM evaluators, negative examples serve three functions: (1) they clarify decision boundaries by showing the evaluator cases where intuitive heuristics (favoring longer responses, favoring confident-sounding language) lead to wrong verdicts; (2) they calibrate severity thresholds by showing examples the evaluator previously scored incorrectly alongside their correct labels; (3) they prevent recurrence of specific past failures by making those failure patterns salient in the context window.

The example selection problem has two components: **relevance** (is this example from the same distribution as the current evaluation task?) and **informativeness** (does this example contribute new information not already covered by existing examples?). Naive similarity-based retrieval maximizes relevance at the expense of informativeness. Diversity-aware methods (DPP, clustering-based approaches, information gain strategies) optimize the joint criterion.

#### Literature Evidence

The negative-aware training study (Gou et al., 2024, arXiv:2402.11651) is the closest published analog to few-shot negative example curation for evaluators. Key findings:
- High-quality negative examples (from GPT-3.5) yielded +8.74 point improvement with 2,000 positive samples; low-quality negatives (from weaker fine-tuned models) caused -3.16 point degradation. **Quality of negative examples dominates quantity.**
- Performance shows diminishing returns around 11,000 negative examples with 2,000-5,000 positive examples.
- Fine-grained stratification by difficulty (F1 score ranges) outperforms treating all negatives uniformly.
- The mechanism appears to be implicit distribution differentiation rather than semantic understanding—models with interpretable and random labels achieved similar improvements (~63-64% accuracy), suggesting the learning signal is structural rather than semantic.

Active learning approaches for LLM evaluation (ActiveLLM, arXiv:2405.10808; PromptAL, arXiv:2507.16424) use the LLM itself to identify the most informative unlabeled instances for annotation. This is directly applicable to code review: rather than randomly sampling past reviews for human correction, active learning can prioritize reviews where the evaluator is most uncertain or most likely to be wrong.

JudgeLM's (Zhu et al., 2023) bias-aware training explicitly includes swap augmentation (presenting same answers in different positions) and reference drop (withholding reference answers) to expose the judge to failure modes during training. This is the fine-tuning analog of including negative examples in few-shot prompts.

The few-shot dilemma paper (Tang et al., 2025, arXiv:2509.13196) showed that TF-IDF-based example selection outperformed semantic embedding similarity for negative example selection, potentially because TF-IDF captures surface-level syntactic features that better identify distributional match with the test case.

#### Implementations and Benchmarks

Practical negative example curation strategies in code review:
- **Error stratification**: Categorize past review failures by type (false positive, false negative, wrong severity, wrong location). Select examples that cover all failure categories proportionally.
- **Boundary case selection**: Prioritize examples at the decision boundary (cases previously scored near the threshold), as these maximize calibration information per example.
- **Recency weighting**: For drift-sensitive applications, down-weight older failures relative to recent ones, as older examples may reflect superseded coding standards.
- **Contrastive pairs**: Present the same code pattern with two different reviewer verdicts—the correct and incorrect one—to make the decision boundary explicit.

The `lm-evaluation-harness` (EleutherAI) and `Prometheus` evaluation frameworks support programmatic construction of few-shot evaluation prompts from curated example corpora, though neither provides automated negative example selection.

#### Strengths and Limitations

**Strengths**: Negative examples address specific past failures with high precision, making them particularly valuable when failure modes are known and systematic (e.g., the evaluator consistently misses SQL injection patterns in parameterized query contexts).

**Limitations**: Poorly curated negative examples can degrade performance worse than zero-shot evaluation. Curation requires human domain expertise to distinguish genuine failures from borderline cases. Hard negative mining risks selecting false negatives (cases that appear to be failures but are actually correct evaluations), which can corrupt the calibration signal. The optimal balance between positive and negative examples is task-specific and requires empirical validation.

---

### 4.4 Evaluator Agreement Metrics

#### Theory and Mechanism

When multiple AI reviewers evaluate the same code artifact, their agreement or disagreement must be interpreted through a measurement framework that accounts for: (1) chance agreement (if reviewers answer randomly, they will agree some fraction of the time), (2) scale type (binary labels vs. ordinal severity vs. continuous scores), (3) number of raters (Cohen's kappa handles two; Fleiss's kappa and Krippendorff's alpha handle arbitrarily many), and (4) rating indeterminacy (some cases have no single correct answer).

**Cohen's kappa** (κ) is the most common pairwise agreement metric, defined as:
    κ = (Po - Pe) / (1 - Pe)
where Po is observed agreement and Pe is expected chance agreement. Interpretation conventions: κ < 0.2 (poor), 0.2-0.4 (fair), 0.4-0.6 (moderate), 0.6-0.8 (substantial), > 0.8 (almost perfect).

**Krippendorff's alpha** generalizes to multiple raters and multiple scale types (nominal, ordinal, interval, ratio), handles missing data, and allows custom distance functions. It is preferred over Fleiss's kappa for code review scenarios where the defect severity is ordinal and rater participation may be incomplete.

**Intraclass Correlation Coefficient (ICC)** is appropriate when scores are continuous or ordinal and raters are treated as a random sample from a population. It decomposes variance into between-rater, within-rater, and residual components.

The rating indeterminacy framework (Guerdan et al., NeurIPS 2025, arXiv:2503.05965) identifies a systematic failure mode in all forced-choice agreement metrics: when a case has multiple legitimate interpretations, forcing raters into a single choice introduces noise that cannot be distinguished from genuine disagreement. The framework's multi-label "response set" approach allows raters to select all valid options, with agreement measured as Mean Squared Error between multi-label distribution vectors.

#### Literature Evidence

The inter-rater reliability study (Borse et al., 2025, arXiv:2508.14764) provides the most direct evidence on LLM-human agreement in qualitative coding tasks. After prompt and hyperparameter optimization, GPT-4o and GPT-4.5 achieved κ values of 0.55-0.70 across four evaluation themes, classified as "substantial" agreement. Key findings:
- Optimal temperature was domain-specific: domain-specific themes (physics, mathematics) benefited from lower temperature (0.9); domain-general themes (metacognitive thinking) required higher temperature (1.1)
- "Polished few-shot prompts" improved kappa by an average of 0.14 across all themes
- Human oversight was judged necessary for domain-general constructs

PoLL (Verga et al., 2024, arXiv:2404.18796) demonstrated that a three-model panel (Command R, Claude Haiku, GPT-3.5) achieved Cohen's kappa of 0.763-0.906 with human judgments on single-hop QA datasets, compared to single GPT-4's 0.627-0.841. On Chatbot Arena, PoLL achieved Pearson correlation 0.917 versus GPT-4's 0.817. Intra-model bias (self-preference) is eliminated by the panel's model diversity.

The position bias study (Zhu et al., 2024, arXiv:2406.07791) quantified the position consistency (PC) metric—the fraction of judgments unchanged when solution order is reversed—finding values of 0.57-0.82 across 12 commercial and 3 open-source judges. Hard cases (genuine quality ties) drove virtually all position inconsistency; fewer than 4% of instances generated these hard cases but were responsible for most bias.

The CMU/Microsoft rating indeterminacy study (NeurIPS 2025) showed that standard forced-choice validation methods selected judges performing up to 31% worse than the true top-performing judge. GPT o3-Mini ranked fourth under forced-choice but first under multi-label response set evaluation.

The IRT-based framework (arXiv:2602.00521) using the Graded Response Model adds three new reliability dimensions: **Prompt Consistency** (Cv ≤ 0.10 acceptable), **Marginal Reliability** (ρ ≥ 0.70 acceptable), and **Discrimination Breadth Ratio** (ratios > 1 indicate insensitivity—judges amplifying quality differences beyond human perception). LLM judges consistently show insensitivity (θratio > 1), particularly for vision tasks (2.03-4.40), suggesting systematic over-discrimination relative to human evaluators.

#### Implementations and Benchmarks

- **RewardBench** (Lambert et al., 2024): Standard benchmark for pairwise preference models, used by CalibraEval for evaluation; organized by task category (chat, reasoning, code, safety)
- **Python IRR libraries**: `statsmodels` for Cohen's kappa and Krippendorff's alpha; `krippendorff` package for multi-rater alpha with custom distance metrics
- **Agent-as-a-Judge frameworks**: DEBATE, ChatEval, CourtEval—all multi-model systems that generate agreement statistics as a byproduct of evaluation. DevAI benchmark results showed agent judges disagreed with human majority only 0.3% of the time versus ~31% for single LLM judges (arXiv:2508.02994)
- **SWR-Bench** (September 2025): 1,000 manually verified pull requests with multi-annotator human agreement; reports 89.2-94.9% Hit-Agreement between human experts and LLM evaluators on binary detection tasks, dropping to 67.4-83.6% for change type classification

#### Strengths and Limitations

**Strengths**: Agreement metrics provide empirical validation that evaluator verdicts are reproducible and human-aligned, transforming subjective impressions into quantifiable reliability scores. Panel approaches reduce individual model biases through architectural diversity.

**Limitations**: Cohen's kappa is sensitive to class prevalence—for rare defects (low-base-rate code review issues), kappa can remain low even with high accuracy, creating a misleading impression of poor calibration. Standard agreement metrics assume independent raters; if multiple AI models share training data or architectural patterns, their agreement may reflect shared biases rather than genuine consensus. Rating indeterminacy research shows that forced-choice agreement metrics systematically mis-rank judge systems by up to 31%.

---

### 4.5 Confidence Calibration

#### Theory and Mechanism

LLM evaluators can express confidence through two channels: **logit-based probabilities** (computed from model output distributions) and **verbalized probabilities** (explicit "I am 80% confident" statements). These channels exhibit different failure modes and require different calibration treatments.

Logit-based probabilities from RLHF-tuned models are systematically overconfident: the fine-tuning process optimizes for human approval, which correlates with confident-sounding outputs, creating a reward gradient that compresses the probability distribution toward high values. Adaptive Temperature Scaling (ATS, arXiv:2409.19817) addresses this by predicting a per-token temperature parameter from token-level features, achieving 10-50% ECE reduction over standard temperature scaling across three benchmarks.

Verbalized probabilities face a different problem: they cannot be directly calibrated by temperature scaling because they are already normalized values in [0,1] rather than raw logits. The invert-softmax approach (arXiv:2410.06707) recovers a logit proxy via z_i = log(p_i) + c, enabling proper temperature scaling. Empirical results show ECE reductions from 7.8% to 4.1% (Claude-v3, Emotion dataset) and 11.1% to 7.3% (Amazon Massive dataset).

The Thermometer framework (IBM/MIT, ICML 2024, arXiv:2403.08819) addresses OOD calibration by training an auxiliary MLP that predicts task-specific temperature parameters from unlabeled test data. Unlike standard temperature scaling, which requires labeled validation data from the target task, Thermometer transfers calibration across tasks by learning general temperature-prediction patterns. On MMLU with LLaMA-2-Chat 7B, it achieved ECE of 0.078 versus vanilla's 0.260, reducing error by 70%.

#### Literature Evidence

The calibration and correctness paper for code LLMs (Spiess et al., ICSE 2025) extends ECE analysis to code generation, introducing Flex-ECE to handle partial correctness in generated code. The work demonstrates that both verbalized and logit-based confidence measures systematically overstate certainty on incorrect code completions, and that temperature scaling provides modest improvement, but task-specific calibration (Flex-ECE) is needed for code review scenarios where partial credit is meaningful.

The TH-Score and LLM-as-a-Fuser study (arXiv:2508.06225) specifically addresses overconfidence in judge roles. Using a fusion ensemble where a "fuser" LLM synthesizes critiques from multiple base models, the approach achieved ECE reductions from 11.78% to 6.42% on JudgeBench for a strong model (Qwen3-235B-A22B), and from ~62% to ~8% for weaker models (Mistral-Nemo: +47.14% accuracy, -53.73% ECE). The large improvement for weak models suggests that confidence calibration and accuracy improvement are coupled—better calibrated models also make better decisions.

The Dunning-Kruger analysis of LLMs (arXiv:2603.09985) found an inverse pattern in some domains: models are most overconfident precisely on tasks they perform poorly, creating systematic failure of confidence as a quality signal. In code review, this means evaluators may express highest confidence on precisely the defect categories where their detection accuracy is lowest.

Answer-Free Confidence Estimation (AFCE) provides a orthogonal approach: elicit confidence scores on question sets where the model cannot see the answers. On challenging tasks, this significantly reduces overconfidence. For code review, this suggests presenting code snippets without the reviewer's own generated verdict to elicit more calibrated uncertainty estimates.

#### Implementations and Benchmarks

- **DeepEval calibration module**: Measures ECE for LLM evaluation outputs with configurable bin counts
- **`gpleiss/temperature_scaling`** (GitHub): Reference implementation of temperature scaling from "On Calibration of Modern Neural Networks" (Guo et al., 2017)
- **Thermometer** (ICML 2024): Available in IBM Research publications; reduces ECE on all 57 tested MMLU datasets; requires 30+ unlabeled test instances for reliable temperature estimation
- **ATS** (arXiv:2409.19817): Token-level adaptive temperature, tested on LLaMA-2-7B-Chat and Qwen-7b-Chat; requires access to logits
- **QA-Calibration** (Amazon, ICLR 2025): Calibration of language model confidence scores on QA tasks; available via ICLR proceedings

#### Strengths and Limitations

**Strengths**: Post-hoc calibration methods operate without model retraining, are broadly applicable to any evaluator, and provide interpretable confidence estimates useful for routing (automatically escalate low-confidence reviews to human reviewers). ECE provides a single actionable metric for calibration quality.

**Limitations**: Temperature scaling requires a labeled validation set from the same distribution, which is unavailable for novel task types. Calibration in one domain (NLP QA) does not transfer to another (code review) without recalibration. Verbalized probabilities require the invert-softmax trick for proper treatment, adding implementation complexity. RLHF-tuned models present a moving calibration target as providers update models silently.

---

## 5. Comparative Synthesis

The following table presents cross-cutting trade-offs across all major calibration approaches:

| Approach | Human Labels Required | Model Retraining | Bias Addressed | ECE Improvement | Cost | Code Review Evidence |
|---|---|---|---|---|---|---|
| Few-shot anchor examples | 5-50 labeled | None | Criteria ambiguity, scale anchoring | Indirect | Low | Widely used in production |
| AutoCalibrate (rubric refinement) | Some, for selection | None | Criteria misalignment | Indirect | Low | Lab-validated, not code-specific |
| G-Eval (CoT + prob weighting) | None | None | Discrete score variance | Indirect | Low | Applicable, not code-specific |
| Balanced position calibration | None | None | Position bias (~18% of judgments) | N/A | Very Low | Applicable, generic |
| Temperature scaling | Labeled validation set | None | Distributional overconfidence | ~10-30% ECE reduction | Low | Applicable; requires logit access |
| ATS (token-level) | Fine-tuning data | None | RLHF calibration degradation | 10-50% ECE reduction | Medium | Applicable; requires logit access |
| Thermometer | Multi-task training | Auxiliary model | OOD task calibration | 70% ECE reduction (MMLU 7B) | High | Not code-specific; strong transfer evidence |
| CalibraEval (NOA) | None (label-free) | None | Selection/position bias | +39% Kappa, +83% ICC | Low | Not code-specific; directly applicable |
| Invert-softmax + TS | Small labeled set | None | Verbalized probability mismatch | 2-4% absolute ECE | Low | Directly applicable |
| PoLL (panel ensemble) | None | None | Self-preference, single model bias | 0.09-0.14 higher kappa | Medium (7x cost vs GPT-4) | Not code-specific; strongly applicable |
| Agent-as-judge (DEBATE) | None | None | Single-perspective failures | ~10-16% correlation improvement | High | 0.3% human disagreement on DevAI |
| Prometheus / JudgeLM | Domain evaluation data | Full fine-tune | Domain-specific misalignment | Competitive with GPT-4 | High | Applicable; requires training data |
| EvalGen (criteria drift) | Ongoing human labels | None | Criteria staleness | Agreement rate monitoring | Medium | Directly addresses review criteria drift |
| IRT-based reliability | Multi-rater samples | None | Discriminative capacity | Diagnostic | Medium | Applicable to code review rubrics |

**Key cross-cutting observations:**

1. **Calibration and accuracy are coupled**: Methods improving confidence calibration (TH-Score + LLM-as-a-Fuser) also improve task accuracy, particularly for weaker base models. This suggests that overconfidence and undercalibration are symptoms of the same underlying model limitation.

2. **No universal winner across tasks**: The IRT analysis found "no free lunch"—no model showed acceptable reliability across all evaluation criteria. The same holds for calibration methods: temperature scaling excels for well-characterized distributions but fails for OOD tasks where Thermometer excels.

3. **Bias mitigation and calibration are distinct**: Removing position bias (balanced position calibration, CalibraEval) does not automatically improve ECE, and reducing ECE does not eliminate position bias. These are orthogonal problems requiring separate interventions.

4. **Rating indeterminacy invalidates standard metrics**: For code review tasks with genuinely ambiguous cases (borderline security issues, stylistic conventions), forced-choice agreement metrics systematically mis-rank evaluators. The NeurIPS 2025 indeterminacy framework is the only method accounting for this.

5. **Code-specific evidence remains sparse**: Most calibration research is domain-agnostic or focused on NLG tasks (summarization, translation). Code review calibration evidence is largely indirect, with SWR-Bench (September 2025) and CodeReviewQA (ACL 2025) being the primary code-specific benchmarks.

6. **Ensemble approaches dominate accuracy but have cost implications**: PoLL achieves higher kappa at 7x lower cost than single GPT-4, but agent-as-judge (DEBATE, CourtEval) achieves highest agreement at substantially higher cost. The cost-performance frontier favors diverse small-model panels over single large models.

---

## 6. Open Problems and Gaps

**The code-specific calibration vacuum**: Most published calibration research uses NLG benchmarks (summarization, translation, dialogue). The assumption that findings transfer to code review is plausible but largely untested. Code review has distinctive properties—mixed natural language and formal code, deterministic semantic content, context-dependent severity—that may invalidate calibration techniques designed for natural language.

**Calibration under criteria drift**: The Shankar et al. (2024) criteria drift finding exposes a foundational problem: if evaluation standards are not independent of model outputs, there is no stable calibration target. No existing calibration framework addresses this dynamic target formally. The EvalGen approach monitors drift but does not provide a mechanism for converging to stable criteria.

**Optimal few-shot count prediction**: Research consistently finds non-monotonic performance-vs-shot-count relationships, but there is no reliable method for predicting the optimal count for a given model and task without empirical search. This makes deployment decisions uncertain and requires expensive per-task validation.

**False negative mining at scale**: For code security review, false negatives (missed vulnerabilities) are categorically more costly than false positives. Existing negative example curation research focuses on average-case performance; there is little work on selecting examples that specifically improve false-negative-rate calibration for safety-critical review categories.

**Confidence calibration for code review actions**: Current calibration research measures ECE against binary or ordinal ground truth. Code review produces actionable verdicts (block, warn, suggest, approve) with asymmetric costs. There is no calibration framework for evaluators producing action recommendations rather than quality scores.

**Multi-provider consistency**: The output drift study showed that very large models (120B+) achieve only 12.5% output consistency even at T=0.0. For ensemble evaluation pipelines using frontier models, this means individual reviews may be unreproducible. The interaction between calibration quality and output consistency is unstudied.

**IRT at scale for code review**: The IRT-based diagnostic framework is theoretically grounded but requires multiple raters evaluating the same items, making it expensive to apply to code review corpora where each review typically has one reviewer. Estimating discrimination parameters from single-rater data is an open research problem.

**Agreement vs. accuracy in multi-judge systems**: High inter-judge agreement could reflect genuine quality consensus or shared systematic bias. Distinguishing these cases requires an external ground truth oracle that is often unavailable for code review. The conditions under which disagreement is informative signal versus correlated noise are poorly characterized.

**Transfer of calibration across model generations**: Provider model updates (silent version bumps) invalidate calibration parameters tuned for earlier versions. Adaptive calibration methods (Thermometer, ATS) provide OOD transfer across tasks but not across model generations. There is no published framework for "calibration portability" across model versions.

---

## 7. Conclusion

AI evaluator calibration for automated code review is a technically sophisticated problem sitting at the intersection of probabilistic calibration theory, in-context learning, inter-rater reliability measurement, and software engineering practice. The literature demonstrates that uncalibrated LLM judges—deployed with default prompts and no systematic alignment—exhibit substantial systematic biases that can be partially but not completely mitigated through combinations of prompt engineering, post-hoc statistical correction, and structural ensemble approaches.

The most reliable calibration signal remains human-evaluator agreement rate, tracked over time and used to trigger few-shot example refresh. Methods that eliminate the need for ongoing human labels (Thermometer, CalibraEval, ATS) achieve meaningful calibration improvements but typically require some form of labeled data either for initial training or for held-out validation. The Thermometer auxiliary model approach, which transfers calibration from multi-task training without requiring labeled target data, offers a compelling direction for production deployment where ongoing labeling is costly.

For code review specifically, the evidence base is thin: most published results apply to NLG tasks, and the handful of code-specific benchmarks (SWR-Bench, CodeReviewQA, CASTLE) reveal that current automated code review systems achieve F1 scores below 20% on comprehensive benchmarks, suggesting that calibration improvements to already-poor underlying reviewers may not be the binding constraint—base capability gaps dominate. Reasoning-capable models (DeepSeek-R1, Gemini-2.5-Pro) and multi-review aggregation (up to 44% F1 improvement) represent the current state of the art.

The rating indeterminacy problem (Guerdan et al., NeurIPS 2025) introduces a fundamental challenge to all calibration research: if forced-choice agreement metrics are systematically biased, the empirical foundations of evaluator comparison are shakier than assumed. This is particularly relevant for code review, where many review decisions are genuinely ambiguous and different competent reviewers would legitimately reach different conclusions.

---

## References

1. Agarwal, R., et al. (2024). *Many-Shot In-Context Learning*. arXiv:2404.11018. https://arxiv.org/abs/2404.11018

2. Borse, I., et al. (2025). *Investigation of the Inter-Rater Reliability between Large Language Models and Human Raters in Qualitative Analysis*. arXiv:2508.14764. https://arxiv.org/abs/2508.14764

3. Gama, J., Žliobaitė, I., Bifet, A., Pechenizkiy, M., & Bouchachia, A. (2014). *A survey on concept drift adaptation*. ACM Computing Surveys, 46(4), 1-37.

4. Gou, Z., et al. (2024). *Learning From Failure: Integrating Negative Examples when Fine-tuning Large Language Models as Agents*. arXiv:2402.11651. https://arxiv.org/abs/2402.11651

5. Guerdan, L., et al. (2025). *Validating LLM-as-a-Judge Systems under Rating Indeterminacy*. NeurIPS 2025. arXiv:2503.05965. https://arxiv.org/abs/2503.05965

6. Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). *On calibration of modern neural networks*. ICML 2017.

7. Kim, S., et al. (2024). *Prometheus 2: An Open Source Language Model Specialized in Evaluating Other Language Models*. arXiv:2405.01535. GitHub: https://github.com/prometheus-eval/prometheus-eval

8. Li, H., et al. (2024). *CalibraEval: Calibrating Prediction Distribution to Mitigate Selection Bias in LLMs-as-Judges*. ACL 2025. arXiv:2410.15393. https://arxiv.org/abs/2410.15393

9. Liu, Y., et al. (2023). *AutoCalibrate: Calibrating LLM-Based Evaluator*. arXiv:2309.13308. https://arxiv.org/abs/2309.13308

10. Liu, Y., et al. (2023). *G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment*. EMNLP 2023. arXiv:2303.16634. https://arxiv.org/abs/2303.16634

11. Min, S., et al. (2022). *Rethinking the Role of Demonstrations: What Makes In-Context Learning Work?* EMNLP 2022.

12. Shen, D., et al. (2024). *Thermometer: Towards Universal Calibration for Large Language Models*. ICML 2024. arXiv:2403.08819. https://arxiv.org/abs/2403.08819

13. Shen, Z., et al. (2024). *Calibrating Language Models with Adaptive Temperature Scaling*. EMNLP 2024. arXiv:2409.19817. https://arxiv.org/abs/2409.19817

14. Shankar, S., et al. (2024). *Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences*. UIST 2024. arXiv:2404.12272. https://arxiv.org/abs/2404.12272

15. Thinking Machines Lab. (2025). *LLM Output Drift: Cross-Provider Validation & Mitigation for Financial Workflows*. arXiv:2511.07585. https://arxiv.org/abs/2511.07585

16. Verga, P., et al. (2024). *Replacing Judges with Juries: Evaluating LLM Generations with a Panel of Diverse Models*. arXiv:2404.18796. https://arxiv.org/abs/2404.18796

17. Wang, P., et al. (2023). *Large Language Models are Not Yet Human-Level Evaluators for Abstractive Summarization*. arXiv:2305.17926. https://arxiv.org/abs/2305.17926

18. Zhu, L., et al. (2023). *JudgeLM: Fine-tuned Large Language Models are Scalable Judges*. arXiv:2310.17631. https://arxiv.org/abs/2310.17631

19. Zhu, Y., et al. (2024). *Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge*. arXiv:2406.07791. https://arxiv.org/abs/2406.07791

20. Gao, Y., et al. (2025). *CodeReviewQA: The Code Review Comprehension Assessment for Large Language Models*. ACL 2025 Findings. arXiv:2503.16167. https://arxiv.org/abs/2503.16167

21. Anonymous. (2025). *Benchmarking and Studying the LLM-based Code Review* (SWR-Bench). arXiv:2509.01494. https://arxiv.org/abs/2509.01494

22. Anonymous. (2025). *Diagnosing the Reliability of LLM-as-a-Judge via Item Response Theory*. arXiv:2602.00521. https://arxiv.org/abs/2602.00521

23. Zhou, W., et al. (2025). *Overconfidence in LLM-as-a-Judge: Diagnosis and Confidence-Driven Solution*. arXiv:2508.06225. https://arxiv.org/abs/2508.06225

24. Ye, H., et al. (2024). *A Survey on LLM-as-a-Judge*. arXiv:2411.15594. https://arxiv.org/abs/2411.15594

25. Li, H., et al. (2024). *LLMs-as-Judges: A Comprehensive Survey on LLM-based Evaluation Methods*. arXiv:2412.05579. https://arxiv.org/abs/2412.05579

26. Anonymous. (2025). *When AIs Judge AIs: The Rise of Agent-as-a-Judge Evaluation for LLMs*. arXiv:2508.02994. https://arxiv.org/abs/2508.02994

27. Hu, J., Liu, W., & Du, M. (2024). *Strategic Demonstration Selection for Improved Fairness in LLM In-Context Learning*. EMNLP 2024. arXiv:2408.09757. https://arxiv.org/abs/2408.09757

28. Anonymous. (2024). *Calibrating Verbalized Probabilities for Large Language Models*. arXiv:2410.06707. https://arxiv.org/abs/2410.06707

29. Spiess, C., et al. (2025). *Calibration and Correctness of Language Models for Code*. ICSE 2025. https://www.software-lab.org/publications/icse2025_calibration.pdf

---

## Practitioner Resources

### Benchmarks and Evaluation Datasets

- **MT-Bench** — Multi-turn question benchmark for judge calibration validation. 80 high-quality multi-turn questions with human expert votes. Available via LMSYS: https://github.com/lm-sys/FastChat/tree/main/fastchat/llm_judge
- **Chatbot Arena** — Crowdsourced pairwise preference data. 30K+ conversations with human ratings. https://chat.lmsys.org
- **RewardBench** — Pairwise preference benchmark organized by task category (chat, reasoning, code, safety). Used as standard for reward model calibration. https://huggingface.co/datasets/allenai/reward-bench
- **SWR-Bench** — 1,000 real-world GitHub pull requests with manual annotation for code review evaluation. Published September 2025. arXiv:2509.01494
- **CodeReviewQA** — 900 manually curated code review comprehension examples across 9 languages, decomposed into change type recognition, change localization, solution identification. ACL 2025. https://huggingface.co/datasets/Tomo-Melb/CodeReviewQA
- **CASTLE** — Static code analysis benchmark for security-focused review calibration. https://ssvlab.github.io/lucasccordeiro/papers/tase2025.pdf

### Tools and Frameworks

- **DeepEval (Confident AI)** — Open-source LLM evaluation framework with G-Eval, calibration metrics, and ECE computation. https://github.com/confident-ai/deepeval
- **Prometheus / Prometheus 2** — Open-source fine-tuned evaluator LLMs (7B, 8x7B). Supports absolute scoring and pairwise ranking with custom rubrics. https://github.com/prometheus-eval/prometheus-eval
- **Langfuse** — Production LLM observability with LLM-as-judge support, drift monitoring, and human feedback collection. https://langfuse.com
- **LangChain Align Evals** — Human correction workflow for few-shot calibration example collection and agreement tracking. https://www.langchain.com/articles/llm-as-a-judge
- **CalibraEval** — NOA-based label-free selection bias mitigation. Reference implementation: https://github.com/CSHaitao/CalibraEval
- **Temperature Scaling** (gpleiss) — Reference implementation of post-hoc confidence calibration for neural networks. https://github.com/gpleiss/temperature_scaling
- **lm-evaluation-harness** (EleutherAI) — Few-shot evaluation framework supporting systematic prompting, scoring, and benchmark running. https://github.com/EleutherAI/lm-evaluation-harness
- **Awesome-LLMs-as-Judges** — Curated paper list covering the full LLM-as-judge landscape. https://github.com/CSHaitao/Awesome-LLMs-as-Judges
- **EvidentlyAI LLM-as-judge guide** — Practitioner guide to production LLM-as-judge deployment with monitoring. https://www.evidentlyai.com/llm-guide/llm-as-a-judge

### Key Academic Surveys

- Ye et al. (2024) — Comprehensive survey on LLM-as-a-Judge approaches, bias taxonomy, and mitigation strategies. arXiv:2411.15594
- Li et al. (2024) — LLMs-as-Judges: taxonomy, benchmarks, and failure modes. arXiv:2412.05579
- Anonymous (2025) — Survey on LLM-based active learning for annotation and example selection. arXiv:2502.11767

### Calibration Quick-Reference

| Scenario | Recommended Approach | Data Required |
|---|---|---|
| New evaluator, no labeled data | G-Eval with rubric decomposition + CalibraEval NOA | None |
| Have 30-50 labeled examples | Few-shot anchors + invert-softmax temperature scaling | Labeled set |
| Multiple models available | PoLL ensemble (diverse model families) | Multiple API keys |
| RLHF model, logit access | Adaptive Temperature Scaling (ATS) | Fine-tuning data |
| Cross-task deployment | Thermometer auxiliary model | Multi-task training data |
| Production monitoring | Agreement rate tracking + EvalGen criteria drift | Ongoing human labels (5-10/week) |
| Need reliability diagnosis | IRT-based GRM analysis (Cv, ρ, θratio) | Multi-rater samples |
