# Human-AI Collaboration in Software Quality Assurance

*2026-03-25*

---

## Abstract

As AI-driven review pipelines become a standard component of software quality assurance, the human role shifts from primary reviewer to orchestrator, escalation judge, and corrective agent. This survey examines the meta-level question of how humans and AI review pipelines work together effectively across seven interlocking subtopics: trust calibration (when to defer and when to override), escalation protocol design (what requires a human decision vs. automated resolution), cognitive load management (how AI findings are presented for efficient human action), adversarial robustness (whether the pipeline can be fooled into approving bad code), annotation and feedback loops (how human corrections improve the pipeline over time), developer experience with deployed AI review tools (adoption, satisfaction, productivity), and explanation and interpretability (why the AI flagged this, and whether that explanation is trustworthy). Drawing on foundational human factors theory, empirical HCI research, software engineering studies, and applied security research, we map the landscape without prescribing a canonical design. The evidence shows a field with real empirical traction in some areas -- automation bias, adoption patterns, adversarial robustness of code comment attacks -- and significant open questions in others: calibrated trust measurement, escalation protocol design for multi-agent review pipelines, and feedback loop quality in the face of model collapse risk.

---

## 1. Introduction

### 1.1 The Shift in Quality Assurance

Code review has been the dominant defect detection mechanism in software development since Michael Fagan's formalized inspection procedure at IBM in 1976, with modern tool-mediated pull request workflows handling billions of code changes annually across GitHub, GitLab, and Gerrit. The introduction of large language model (LLM)-based review agents -- GitHub Copilot Code Review, CodeRabbit, Codium PR-Agent, Amazon CodeGuru, Qodo -- changes the fundamental structure of the review interaction. Rather than one human reviewer examining another human's code, the review loop now contains AI agents capable of generating review comments at machine speed and scale.

This structural change raises questions that predate AI but take on new urgency in the AI context: How does a human reviewer relate to an automated system that is faster, more consistent on surface patterns, but less capable of reasoning about intent, cross-system implications, and business context? How should review findings be presented so that developers can act on them without being overwhelmed? What happens when the review system itself is attacked? How do human corrections feed back into improved AI behavior?

These questions are not unique to software quality assurance. Aviation, medical diagnosis, nuclear plant operation, and financial risk management have grappled with human-automation interaction for decades. A substantial theoretical and empirical literature exists, anchored in human factors and HCI research, that is only beginning to be systematically applied to software engineering. This survey draws from both bodies of work.

### 1.2 Scope and Organization

This survey covers human-AI interaction in the context of automated code review and software quality assurance pipelines. It does not cover AI-assisted code generation (Copilot-style completion), automated testing as a standalone discipline, or the purely technical question of which defect classes AI review excels at detecting. The focus throughout is on the human side of the human-AI interface: what do people do, what should they do, what cognitive mechanisms govern their behavior, and what design patterns shape outcomes.

The seven subtopics are addressed as an interlocking system. Trust calibration governs whether a developer acts on an AI finding; escalation design governs which findings require human judgment vs. automated resolution; cognitive load management governs whether the developer can act efficiently once they decide to engage; adversarial robustness governs whether the findings the developer sees are legitimate; feedback loops govern whether developer corrections improve the system; developer experience governs whether the system is adopted and used effectively; and explainability governs whether trust is appropriately placed.

### 1.3 Methodological Note

Primary sources include: peer-reviewed publications in CHI, ICSE, FSE, ASE, and human factors journals (Human Factors, Ergonomics, Computers in Human Behavior); industry surveys (Stack Overflow Developer Survey 2024-2025, GitHub research publications); arXiv preprints from major ML and security groups; and empirical studies from software engineering research groups at Microsoft, Google, Zoominfo, and others. Where multiple sources converge on similar findings, convergence is noted. Where sources conflict, conflict is surfaced.

---

## 2. Foundations

### 2.1 The Lee-See Trust Framework

The most widely cited theoretical framework for human-automation trust is Lee and See (2004), "Trust in Automation: Designing for Appropriate Reliance," published in Human Factors. The framework defines trust as the attitude that an agent will help achieve an individual's goals in a situation characterized by uncertainty and vulnerability. Three characteristics of the automation determine trust: performance (how often the system achieves its goals), process (how well the system's decision logic matches human expectations), and purpose (whether the system's goals align with the operator's goals).

The framework's central claim is that trust should be calibrated: matched to the actual reliability of the system in a given context. Under-trust leads to disuse -- operators reject AI findings even when they are correct, losing the benefit of automated analysis. Over-trust leads to misuse -- operators accept AI findings without verification, allowing AI errors to propagate to production. Calibrated trust, where reliance matches reliability, is the target state. The framework identifies three mechanisms through which trust influences reliance: analytic processing (deliberate reasoning about system reliability), analogical processing (pattern-matching to past system behavior), and affective processing (visceral reactions to system outputs, especially violations of expectations).

A 2023 CHI paper by Scharowski et al., "Measuring and Understanding Trust Calibrations for Automated Systems: A Survey of the State-Of-The-Art and Future Directions" (ACM DL DOI: 10.1145/3544548.3581197), surveyed 52 empirical studies and found that most trust research measures trust attitudes rather than trust calibration -- the alignment between trust and actual reliability. This distinction matters for software QA: what practitioners want is not high trust, but accurate trust.

### 2.2 Automation Bias and Complacency

Parasuraman and Riley (1997), "Humans and Automation: Use, Misuse, Disuse, Abuse," introduced the term "automation-induced complacency" to describe the pattern where operators reduce monitoring effort when automation is present, because the automation is usually correct, so monitoring seems wasteful. This is attentionally rational but reliability-threatening: when the automation fails, the operator has reduced vigilance precisely when vigilance is needed.

Automation bias -- the tendency to accept automated recommendations without independent verification -- is distinct from complacency but related. Cummings (2004) demonstrated automation bias in military target recognition; Goddard et al. (2012) demonstrated it in medical diagnosis; Perry et al. (2023) demonstrated an analog in software security review. In the Perry study (discussed further in Section 4.1), participants who used GitHub Copilot to generate code introduced significantly more security vulnerabilities than those who did not use Copilot, while also reporting higher confidence in their code's security. The automation's surface polish (syntactically correct, plausible-looking code) disarmed critical review.

A 2025 review, "Exploring automation bias in human-AI collaboration: a review and implications for explainable AI" (Springer AI & Society, DOI: 10.1007/s00146-025-02422-7), confirmed that automation bias is most pronounced when AI outputs are presented with high confidence signals, when verification is difficult, and when cognitive load is already high. All three conditions are common in code review under deadline pressure.

### 2.3 Sheridan and Verplank's Levels of Automation

Sheridan and Verplank (1978), "Human and Computer Control of Undersea Teleoperators," introduced the ten-level taxonomy of automation that remains the standard reference for discussing how much decision authority is allocated to the machine versus the human:

1. Human does everything
2. Computer offers alternatives
3. Computer narrows alternatives to a few
4. Computer suggests one alternative
5. Computer executes if human approves
6. Computer executes; human can veto
7. Computer executes; informs human
8. Computer executes; informs human if asked
9. Computer executes; informs human if it decides to
10. Computer acts entirely autonomously

Contemporary AI review pipelines occupy levels 2-7 depending on configuration. A pipeline that flags findings for human approval before blocking a pull request merge is at level 5. A pipeline that automatically closes issues tagged as low-risk is at level 7-8. The literature consistently shows that higher automation levels increase throughput but decrease situation awareness and increase automation bias (Endsley and Kiris, 1995; Endsley 1999). The implication for QA pipeline design is that automation levels should be matched to defect class risk: low-risk stylistic findings can tolerate level 7-8, while security-critical findings should remain at level 4-5.

### 2.4 Endsley's Situation Awareness Model

Endsley's (1995) three-level situation awareness (SA) model describes the cognitive state required for effective human supervision of automated systems: Level 1 is perception of relevant elements, Level 2 is comprehension of their meaning in context, and Level 3 is projection of future states. A consistent empirical finding is that higher automation reduces SA at Level 2 (comprehension) even when Level 1 (raw data) remains accessible -- operators can see the alert but lose the mental model needed to understand it.

The implications for code review are direct. A developer reviewing 50 AI-generated comments on a pull request may perceive all 50 (Level 1) but lose comprehension of which three actually matter (Level 2) and fail to anticipate the downstream effects of unaddressed findings (Level 3). The cognitive load of AI-generated review output is therefore not merely an efficiency concern but a situation awareness concern.

---

## 3. Taxonomy of Approaches

### 3.1 Trust Calibration Mechanisms

Three broad categories of mechanism appear in the literature for supporting trust calibration in human-AI collaboration:

**Transparency mechanisms** expose the AI's internal state to the human: confidence scores, uncertainty estimates, disagreement signals, provenance of findings. The hypothesis is that if the human can see how confident the AI is, they can calibrate their own reliance accordingly. The empirical evidence is mixed. Yin et al. (2019, CHI) found that showing AI confidence scores improved decision accuracy when the AI was reliable and reduced over-reliance when the AI was unreliable -- a positive result. However, Bansal et al. (2021, FAccT) found that providing explanations did not consistently improve calibration and sometimes backfired by increasing confidence in incorrect AI outputs, a phenomenon they termed "explanation-induced miscalibration." For code review specifically, Wu et al. (2023), "Investigating and Designing for Trust in AI-powered Code Generation Tools" (arXiv: 2305.11248), found that developers with calibrated trust detected more AI errors than those with either high or low trust.

**Verification friction** introduces deliberate obstacles to accepting AI recommendations without review: requiring the developer to mark a finding as "reviewed" before dismissing, surface-level tests embedded in the review UI, or forced delay before merge. The design rationale is that frictionless interfaces encourage automation bias. The tradeoff is alert fatigue: if verification friction is too high for low-risk findings, developers will habituate to clicking through friction without engaging with it.

**Calibration training** exposes developers to AI failures in a training context, building accurate mental models of where the AI is and is not reliable. Research in aviation has shown that showing trainees explicit examples of automation failure reduces complacency in deployed systems. No controlled study of calibration training for AI code review has been published as of early 2026, but this is an active research direction.

### 3.2 Escalation Protocol Design

Escalation design determines what types of findings are handled automatically vs. routed to human decision. The literature on adaptive automation (Parasuraman, Sheridan, and Wickens, 2000; Wiener, 1988) provides a framework:

**Criterion-based escalation** routes a finding to human review if it exceeds a threshold on a severity metric or risk score. This is the dominant design in current AI review tools: findings above a risk threshold block merge and require human approval. The limitations are threshold sensitivity (too low: every PR blocked; too high: critical findings auto-approved) and threshold drift over time as the distribution of code changes shifts.

**Uncertainty-based escalation** routes findings to human review when the AI expresses high uncertainty, independent of severity. This maps to Bayesian decision theory: the human's comparative advantage over the AI is largest when the AI is uncertain. The practical challenge is that current LLM-based review systems do not produce reliable uncertainty estimates; confidence calibration in LLMs is an active research area (Kadavath et al., 2022; Kuhn et al., 2023).

**Escalation by finding class** routes different defect types to different human roles: security findings to a security reviewer, performance findings to the tech lead, style findings to automated enforcement. This is a structural escalation design rather than threshold-based. The compound-agent pipeline in this codebase approximates this design: security findings route to specialized security subagents (`/security-injection`, `/security-auth`), with P0 findings blocking merge and requiring explicit acknowledgement.

**Human-on-the-loop vs. human-in-the-loop** is the fundamental dichotomy in escalation design. In human-in-the-loop (HITL) configurations, no finding proceeds without explicit human sign-off. In human-on-the-loop (HOTL) configurations, automated actions proceed unless the human actively intervenes within a window. HOTL increases throughput at the cost of requiring the human to monitor the automation continuously -- a vigilance demand that produces monitoring lapses over time (Parasuraman and Manzey, 2010).

### 3.3 Cognitive Load Management in Review Output

The theoretical foundation for cognitive load in review is Sweller's cognitive load theory (1988) and Wickens' multiple resource theory (2008). Sweller distinguishes intrinsic load (inherent to the task), extraneous load (imposed by poor design), and germane load (invested in schema construction). AI review output design aims to reduce extraneous load -- the overhead of parsing, sorting, and contextualizing AI findings -- so that cognitive capacity can be applied to germane load: understanding the actual defect.

The literature identifies several high-extraneous-load patterns in code review output:

**Information overload** occurs when the volume of findings exceeds what the reviewer can process. SOC operators average 4,484 security alerts per day, with 67% ignored due to volume (IBM, 2023). AI code review systems exhibit a structural analog: CodeRabbit's 2025 analysis found it to be the most "talkative" of deployed review tools, generating the highest comment volume per PR while scoring lowest on completeness and depth (AIMultiple, 2025). High comment volume with low actionability produces alert fatigue.

**Severity flattening** presents critical and trivial findings with equal visual weight. Springer and Lewandowsky (2022) demonstrated in an analogous medical context that severity highlighting reduces the false positive acceptance rate. In code review, a finding that a variable name could be improved should not compete visually with a finding that a SQL query is injectable.

**Context-stripping** presents findings without sufficient code context for the reviewer to verify them. Code review research (Bacchelli and Bird, 2013; Sadowski et al., 2018) consistently shows that reviewers prefer comments that are actionable: showing not just that a problem exists but where it is, why it matters, and what a fix would look like. AI tools that generate findings without diff context require the developer to re-establish context, increasing extraneous load.

**Temporal interruption** is the effect of review findings surfaced during active coding rather than at PR submission. Research on interruption management (Trafton and Monk, 2008; Bailey and Konstan, 2006) shows that interruptions during high-cognitive-demand tasks cause significantly greater performance decrements than interruptions during low-demand tasks, with recovery times ranging from seconds to minutes.

### 3.4 Adversarial Robustness of AI Review

AI review pipelines face adversarial threats that have no direct analog in human review. Three threat classes appear in the literature:

**Prompt injection in review contexts** exploits the fact that LLM-based reviewers process code as data. An attacker who can insert text into the code being reviewed (via comments, string literals, or variable names) can potentially inject instructions that alter the AI reviewer's behavior. Greshake et al. (2023), "Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injections," demonstrated this class of attack at scale. The code-specific version was studied by Hajipour et al. (2024), "Can Adversarial Code Comments Fool AI Security Reviewers?" (arXiv: 2602.16741), which found that while comment-based manipulation achieved 75-100% attack success in code generation contexts, it showed substantially lower success rates in security review contexts -- suggesting that the analysis task may be more robust than the generation task.

**Adversarial examples for code** are modifications to vulnerable code that preserve the vulnerability semantically while altering surface features that trigger the AI's detection heuristics. This is the code analog of adversarial examples in image classification. LLM-based code review systems are particularly susceptible because they pattern-match on code surface rather than executing semantic analysis. Research on this threat class remains nascent compared to the image domain.

**Supply chain injection** introduces malicious instructions into configuration files, dependency specifications, or CI/CD pipeline definitions that the AI review agent processes as trusted context. Aikido Security demonstrated in 2024 that GitHub Actions prompts can be used to inject instructions into AI coding agents that have repository access. OWASP's 2025 LLM Top 10 places prompt injection (including indirect forms) at position 1 for the second consecutive year.

**Model-level manipulation** addresses whether the reward model used to train or align an AI reviewer can be manipulated through adversarial preference data. This is a research-stage concern rather than a demonstrated attack, but it connects to the feedback loop design questions in Section 3.5.

Red teaming of AI review systems -- systematically attempting to identify evasion strategies -- is recognized as an important practice by OWASP and NIST's 2024 Generative AI Profile. Automated red teaming tools (Garak, DeepTeam, AutoRedTeamer) achieve higher attack success rates than manual red teaming (69.5% vs. 47.6% per Dawson et al., 2024). This implies that ad hoc manual testing is insufficient for characterizing an AI reviewer's robustness.

### 3.5 Annotation and Feedback Loops

Human corrections of AI review findings constitute the primary training signal for improving AI reviewers over time. The theoretical framework is reinforcement learning from human feedback (RLHF), introduced in Christiano et al. (2017), "Deep Reinforcement Learning from Human Preferences" (arXiv: 1706.03741), which trains a reward model to align with human preference rankings and uses it to improve a downstream policy.

Three annotation signal types are available in code review contexts:

**Implicit signals**: Developer accept/dismiss behavior on AI findings provides weak preference data. A dismissed finding is a preference signal that the finding was not actionable or relevant; an accepted finding is a preference signal that it was. The limitation is ambiguity: a developer may dismiss a correct finding because it is inconvenient, not because it is wrong.

**Explicit ratings**: Asking developers to rate AI findings (correct/incorrect, actionable/not actionable, severity level) provides stronger preference data but increases friction. The tradeoff between annotation quality and annotation cost is managed through active learning: selecting the findings most informative to the model for explicit rating, rather than requesting ratings uniformly.

**Correction traces**: When a developer edits AI-suggested code or modifies an AI-generated review comment before posting it, the delta constitutes a high-quality correction signal. Ziegler et al. (2022), in the context of Codex, showed that correction traces outperform preference ratings as a training signal for code generation quality.

The feedback loop design must address two risks. First, **annotation quality degradation**: if developers who are fatigued, time-pressured, or over-trusting provide low-quality annotations, the feedback loop will reinforce bad AI behavior. Inter-annotator agreement is low for complex code quality judgments (Bosu et al., 2015 found significant disagreement among experienced reviewers on what constitutes a "defect" vs. a "style issue"), which implies that preference data for code quality is inherently noisy.

Second, **model collapse**: Shumailov et al. (2024), "AI Models Collapse When Trained on Recursively Generated Data" (Nature, DOI: 10.1038/s41586-024-07566-y), demonstrated that iterative training on AI-generated data causes progressive quality degradation as the model's distribution converges away from the true data distribution. In a code review context, if AI-generated review comments become the reference material for new training rounds -- for example, if developers accept AI suggestions without modification, and those accepted suggestions are then used as training data -- the review model will lose coverage of rare defect classes over time. Maintaining human-generated annotations as ground truth anchors is a structural requirement for avoiding this failure mode.

### 3.6 Developer Experience with AI Review Tools

The developer experience with AI review tools is documented primarily through large-scale surveys and case studies. The major empirical anchors:

**Stack Overflow 2025 Developer Survey** (approximately 49,000 developers): 84% of developers use or plan to use AI tools, up from 76% in 2024. However, only 29% trust the accuracy of AI tool outputs, a decline of 11 percentage points from 2024. The trust gap is the defining characteristic of the current landscape: adoption is driven primarily by organizational mandate and competitive pressure, not by personal confidence in AI outputs.

**GitHub Copilot productivity studies**: Peng et al. (2023), "The Impact of AI on Developer Productivity: Evidence from GitHub Copilot" (arXiv: 2302.06590), reported a 55% speed increase on well-defined coding tasks in a controlled study. Zoominfo's internal study (arXiv: 2501.13282) reported more modest gains in production settings. The SPACE framework analysis (Forsgren et al., 2021) argues that velocity metrics alone are insufficient; satisfaction, flow state, and long-term maintainability are equally important dimensions of productivity.

**AI review tool adoption gap**: The 2025 Stack Overflow survey identified a specific gap between developer willingness and developer trust: 48% distrust AI tool accuracy even among those who use the tools regularly. An Atlassian survey of 2,000+ IT managers and developers (2024) found that managers cited AI as the most important factor in productivity improvement, while only one-third of developers reported experiencing actual AI-related productivity gains.

**CodeRabbit empirical analysis**: An independent 2025 analysis (AIMultiple) of CodeRabbit across 309 pull requests rated the tool 4/5 on correctness and actionability for syntax, security, and style issues, but 1/5 on completeness and 2/5 on depth: the tool reliably flags surface-level issues but does not catch intent mismatches, cross-service performance implications, or architectural concerns. A separate finding (CodeRabbit's own analysis, 2025) found that pull requests containing AI-generated code had approximately 1.7x more issues than human-written code -- suggesting that AI review tools are particularly challenged when reviewing AI-generated code, the scenario that is becoming increasingly common.

**The satisfaction paradox**: GitHub's 2023 survey of 2,000+ Copilot users found that 60-75% reported feeling more fulfilled and less frustrated, with 73% reporting that Copilot helped them stay in flow and 87% reporting reduced mental effort on repetitive tasks. By 2025, overall positive sentiment had declined to approximately 60%, with growing frustration around "almost-right" AI outputs that require significant debugging (Qodo, 2025; Stack Overflow, 2025). The satisfaction degradation pattern suggests that initial adoption is driven by relief from tedious tasks, while sustained satisfaction depends on AI accuracy in more complex work.

### 3.7 Explanation and Interpretability

Why did the AI flag this code? This question has both a technical answer (what features triggered the prediction) and a practical answer (is the explanation useful enough to act on?). The two answers diverge more than is commonly appreciated.

**Attribution methods** attempt to answer the technical question by attributing the AI's output to features of the input. SHAP (SHapley Additive Explanations, Lundberg and Lee, 2017) and LIME (Local Interpretable Model-Agnostic Explanations, Ribeiro et al., 2016) are the dominant methods. For vulnerability detection models specifically, SHAP analysis has been used to identify the code tokens most associated with specific CWE classifications. The practical limitation is that token-level attribution does not directly translate to developer-actionable explanation: knowing that the model's vulnerability prediction is associated with the token "malloc" does not tell the developer whether there is an actual memory management error.

**Counterfactual explanations** address a different question: "what would have to change for this code to not be flagged?" A counterfactual explanation for a SQL injection finding might be: "if the query were parameterized rather than concatenated, this finding would not be generated." This form of explanation directly specifies the remediation action, which is more actionable than attribution. The Berkeley CLTC white paper on counterfactual AI explanations (2024) argues that counterfactual forms are more natural for users because they answer "what-if" questions aligned with remediation goals.

**LLM-generated natural language explanations** are qualitatively different from attribution-based methods: rather than computing feature importance scores, the LLM is asked to explain its own finding in natural language. This produces more readable explanations but introduces a new risk: the explanation may be confabulated -- plausible-sounding but not reflecting the actual basis of the finding. Bansal et al. (2021) documented that natural language explanations can increase user confidence in incorrect AI outputs, suggesting that explanations that are coherent and confidently stated are trusted even when wrong.

**The explanation-trust calibration problem** is the intersection of explainability and trust calibration. The goal of explanation is to support appropriate trust -- the developer should trust findings that are well-supported and doubt findings that are poorly supported. The evidence suggests that current explanation mechanisms do not reliably achieve this. Complex explanations can increase cognitive load. Simple explanations can be wrong. Confident explanations can suppress verification. Designing explanations that support calibrated trust rather than uniformly increasing or decreasing trust is an open design problem.

---

## 4. Analysis

### 4.1 Trust Calibration: Empirical Evidence

The most controlled study of trust calibration in AI-assisted code review is Wu et al. (2023), "Investigating and Designing for Trust in AI-powered Code Generation Tools" (arXiv: 2305.11248). The study tested whether developers could be helped to form calibrated trust through interface design. Developers who received explanations alongside AI suggestions showed better-calibrated trust (improved error detection without prohibitive time costs) compared to those who received suggestions alone.

The Perry et al. study, "Do Users Write More Insecure Code with AI Assistants?" (SIGSAC, 2023), provides the clearest empirical data on trust miscalibration in the QA context: over-trusting developers produced substantially more insecure code when using Copilot than when coding without it, while reporting higher confidence. This finding was replicated in spirit by Pearce et al. (2023), "Security Weaknesses of Copilot-Generated Code in GitHub Projects: An Empirical Study" (arXiv: 2310.02059), which analyzed 733 Copilot-generated code snippets from real GitHub projects and found that 29.5% of Python snippets and 24.2% of JavaScript snippets contained security weaknesses spanning 43 CWE categories.

The structural pattern is that Copilot's code generation quality is high enough on surface dimensions (syntactic correctness, idiomatic style) that it disarms the developer's critical reading stance before they engage with deeper quality dimensions. This is a specific form of automation bias mediated by surface quality signals.

### 4.2 Escalation: Practice vs. Theory

In practice, escalation design in deployed AI review pipelines is binary: findings either block merge or do not. The nuanced levels of automation taxonomy from Sheridan and Verplank is not widely implemented. Two exceptions are worth noting.

Amazon CodeGuru implements a severity tiering system that routes P0 findings to mandatory review and P1 findings to advisory review. Internal AWS data (not published) reportedly shows that developers engage substantively with approximately 60-70% of P0 findings and approximately 20-30% of P1 findings -- consistent with the alert fatigue literature showing that lower-severity alerts are largely ignored when higher-severity alerts require attention.

The compound-agent pipeline in this codebase implements a structured escalation design with eight sequential review subagents, each with a specific mandate, and a final implementation-reviewer with blocking authority. This approximates Sheridan-Verplank level 5 for all findings -- no automated approval, human gate required. The design explicitly prohibits automated override of the final reviewer (see `.claude/agents/implementation-reviewer/AGENT.md`), placing the human escalation point at the end of the pipeline rather than throughout it.

The theoretical concern with end-of-pipeline escalation is automation trust inheritance: if the developer observes that the eight subagents have approved a change, they may enter the final review with elevated prior trust, effectively reducing the independence of the final human review. This is analogous to the "anchoring" effect studied in medical diagnosis, where a first diagnostic impression conditions all subsequent analysis.

### 4.3 Cognitive Load: Design Patterns and Evidence

The empirical record on cognitive load in code review is relatively well-developed. The foundational study is Baum et al. (2017), "Comparing formal and informal code review findings: measurement and findings" (EASE), which found that structured checklists significantly reduced cognitive load during formal inspection. More recent work by Chouchen et al. (2021) on code review anti-patterns identified comment volume, reviewer confusion, and context loss as primary extraneous load drivers in modern PR workflows.

For AI review specifically, the design pattern evidence is largely from adjacent domains. SOC alert management research (Veeramachaneni et al., 2016; Mirsky et al., 2023) has converged on several evidence-supported principles: severity-stratified presentation significantly reduces false positive acceptance; narrative summarization of correlated alerts reduces cognitive load compared to raw alert streams; time-boxed review sessions reduce vigilance decrement compared to continuous monitoring; and alert volume caps improve precision-recall tradeoffs from the human reviewer's perspective.

The code review translation of these principles: AI review tools should surface a small number of high-confidence, high-severity findings prominently; group related findings; summarize findings in natural language before presenting technical detail; and avoid surfacing trivial findings in the primary review interface.

### 4.4 Adversarial Robustness: Threat Landscape

The adversarial threat landscape for AI review pipelines is asymmetric. Comment-based prompt injection -- inserting adversarial instructions into code comments -- has been shown to be effective in code generation contexts (Hajipour et al., 2024) but less effective in pure code analysis contexts, where the model's task is to analyze fixed code rather than generate new code. This asymmetry may reflect a structural difference: generation tasks require the model to follow instructions embedded in the context, while analysis tasks require the model to reason about the context as an object.

However, the threat is real at the system level. A developer who asks an AI review agent to "review this PR" in a context where the PR contains adversarially crafted commit messages, issue references, or README content is exposing the review agent to indirect prompt injection. The Aikido Security demonstration (2024) of GitHub Actions prompt injection showed that routine development artifacts (rule files, configuration files, issue comments) can carry adversarial payloads that redirect AI agents.

The supply chain dimension is particularly concerning. As AI review tools gain the ability to read and act on broader repository context -- configuration files, dependency specifications, CI/CD definitions -- the attack surface expands beyond the code being reviewed to the entire repository context. OWASP's recognition of this (LLM01:2025 Prompt Injection) reflects a threat model shift from "the code being reviewed contains an attack" to "the environment the review agent operates in contains an attack."

### 4.5 Feedback Loops: Implementation Challenges

The gap between the theoretical appeal of feedback loops and the practical difficulty of implementing them in code review contexts is substantial. Three challenges dominate:

**Label noise from domain complexity**: Code quality judgments require domain expertise. A developer marking an AI finding as "incorrect" may be right (the AI found a false positive) or wrong (the AI found a real problem that the developer did not recognize). Without verification of developer judgment, feedback loops amplify developer error alongside developer expertise. This problem is particularly acute for security findings, where domain expertise required to evaluate the finding is often higher than the expertise of the reviewing developer.

**Distribution shift over time**: Code evolves. A feedback loop trained on Python 3.8 code patterns may not generalize to Python 3.12 patterns. CI/CD pipelines, dependency ecosystems, and organizational coding standards change over time. Feedback loops require continuous retraining or they will drift relative to the current code distribution, a problem compounded if the loop is also subject to model collapse risks.

**Organizational incentive misalignment**: Developers under time pressure have incentives to dismiss AI findings quickly rather than evaluate them carefully. If dismissal is the training signal for "not useful," the feedback loop will learn to surface fewer findings over time, degrading coverage. This is analogous to the "annotation fatigue" problem in active learning systems: annotator behavior under fatigue systematically differs from annotator behavior under normal conditions.

### 4.6 Developer Experience: Adoption and Abandonment

A distinctive pattern in AI tool adoption is the gap between initial adoption and sustained use. The satisfaction data shows a consistent arc: initial adoption driven by novelty and productivity on simple tasks, followed by friction from hallucinations and context errors on complex tasks, followed by either accommodation (developing personal heuristics for when to trust the AI) or abandonment.

The "almost-right problem" is a key driver of abandonment. Qodo's 2025 state-of-AI-code-quality report found that 66% of developers spend more time fixing AI-generated code than they would have spent writing it manually, and 45% cite "almost-right" AI outputs as their primary frustration. The asymmetry of fixing incorrect code vs. verifying correct code creates a net time cost that is not captured in productivity metrics focused on code generation speed.

For AI review tools specifically (as opposed to code generation tools), the adoption barriers include: skepticism about reliability and contextual accuracy (missing context was cited by 65% of developers as a cause of poor quality, more than hallucinations); professional identity concerns (developers trained for deterministic craftsmanship resist delegating quality judgment to probabilistic systems); and organizational deployment issues where tools are mandated by management without developer input, creating resistance.

### 4.7 Explainability: What Developers Need vs. What Systems Provide

The explanation literature identifies a persistent gap between what XAI systems provide (feature attributions, confidence scores, model internals) and what developers need (actionable guidance, causal explanations, counterfactual remediation paths). This gap is not unique to code review; a 2025 systematic review of XAI (ScienceDirect) found that traditional XAI methods remain insufficient for real-world trust and accountability in high-stakes applications because explanations fail to align with user needs.

For code review specifically, the developer's information need when encountering an AI finding is: (1) Is this real? (2) Where exactly? (3) What fix is needed? Current explanation mechanisms are better at answering (2) than (1) or (3). SHAP attributions can show which tokens triggered the finding, which partially addresses (2). LLM-generated explanations attempt to address (3) but with confabulation risk. Confidence scores attempt to address (1) but LLMs are poorly calibrated at expressing uncertainty.

A counterfactual explanation -- "this would not be flagged if you changed X to Y" -- directly addresses all three questions when it is correct. The challenge is generating correct counterfactual explanations: the AI must understand not just what the code does but what alternative implementations would satisfy both the functional requirement and the quality criterion. This requires a form of reasoning that current code review LLMs are not specifically optimized for.

---

## 5. Comparative Synthesis

The following table maps the seven subtopics against three dimensions: theoretical maturity (strength of foundational framework), empirical evidence base (quantity and quality of relevant studies), and deployment practice (how well current tools instantiate the theoretical recommendations).

| Subtopic | Theoretical Maturity | Empirical Evidence | Deployment Practice |
|---|---|---|---|
| Trust calibration | High (Lee-See framework; 50+ years HCI research) | Moderate (growing but mostly adjacent to code review; few direct studies) | Low (tools provide confidence scores but not calibration mechanisms) |
| Escalation protocols | High (Sheridan-Verplank LOA; adaptive automation literature) | Low (almost no controlled studies in software QA) | Low (mostly binary block/advisory; structured LOA rare) |
| Cognitive load management | High (CLT; multiple resource theory; alert fatigue) | Moderate (code review cognitive load well-studied; AI-specific less so) | Moderate (severity tiering partially implemented in major tools) |
| Adversarial robustness | Moderate (prompt injection well-characterized; code-specific study nascent) | Moderate-High (several key papers; active research area) | Low (ad hoc red-teaming; systematic adversarial testing rare) |
| Feedback loops | High (RLHF; active learning; preference learning) | Low in code review context (most evidence from NLP/CV) | Low (most tools do not close the annotation loop with developers) |
| Developer experience | Moderate (SPACE framework; adoption literature) | High (large-scale industry surveys; multiple case studies) | Moderate (satisfaction tracked; not fed back to tool design systematically) |
| Explainability | Moderate (SHAP, LIME, counterfactuals well-developed) | Moderate (general XAI evidence; code-specific sparse) | Low (LLM-generated explanations dominant; calibration poor) |

Key observations from the synthesis:

The highest gap between theoretical maturity and deployment practice is in **escalation protocols**. The Sheridan-Verplank taxonomy provides a clear design vocabulary for matching automation level to finding risk, but deployed tools overwhelmingly implement binary escalation. This is a design opportunity with strong theoretical backing.

The highest gap between empirical evidence and deployment practice is in **feedback loops**. Large-scale RLHF and active learning research demonstrates that feedback loops can significantly improve system quality over time, but most deployed AI review tools do not implement feedback mechanisms that close the loop with developer annotations in a systematic way.

**Trust calibration** has the most theoretically grounded framework and the most direct empirical evidence that miscalibration causes real harm (Perry et al.; Wu et al.), but current tools provide primarily confidence outputs rather than calibration mechanisms.

**Developer experience** has the strongest empirical evidence base, driven by large-scale industry surveys, but the evidence reveals a trust crisis (declining trust despite rising adoption) that is not being systematically addressed in tool design.

---

## 6. Open Problems and Gaps

### 6.1 Measuring Trust Calibration in Code Review

The distinction between trust attitude (how much does the developer report trusting the AI?) and trust calibration (does developer reliance match AI reliability?) is theoretically clear but empirically difficult to measure in ecological validity. Controlled studies use accuracy tasks with known ground truth; production code review involves judgments with no oracle. Developing methods for measuring trust calibration in production code review settings -- without requiring ground truth -- is an open methodological problem.

### 6.2 Escalation Protocol Formalization

No formal model of escalation protocol design for multi-agent AI review pipelines exists. The Sheridan-Verplank framework provides a vocabulary but not a design algorithm. Key unanswered questions: How should automation level vary by finding class? What is the optimal escalation threshold given a known AI reliability level and a known human reviewer reliability level? How does escalation design interact with cognitive load? These are tractable research questions with significant practical implications.

### 6.3 Feedback Loop Quality Control

How should feedback loops be designed to avoid reinforcing developer error, manage label noise from non-expert annotators, and prevent model collapse? The active learning literature provides partial answers (uncertainty sampling, query-by-committee, core-set selection), but direct application to code review feedback loops has not been studied empirically. The model collapse risk is particularly salient given the rapid increase in AI-generated code in repositories, which is becoming the training data for the next generation of AI reviewers.

### 6.4 Adversarial Testing Standards

There is no standardized red-teaming protocol or evaluation benchmark for AI code review adversarial robustness. The OWASP LLM Top 10 identifies the threat classes but does not provide code-review-specific test suites. Developing standardized adversarial benchmarks analogous to HarmBench (for LLM safety) but targeted at code review robustness is a gap with clear practical utility.

### 6.5 Counterfactual Explanations for Code Review

The theoretical case for counterfactual explanations in code review is strong -- they directly answer the developer's actionability question -- but generating reliable counterfactuals for code quality findings requires AI systems that can reason about alternative implementations that satisfy both functional requirements and quality criteria. This is a capability gap that neither current code review tools nor current XAI methods are designed to address. It likely requires tight integration of formal verification, program synthesis, and LLM reasoning.

### 6.6 The AI-Reviews-AI Problem

As AI-generated code becomes a larger fraction of submitted code, AI review tools will increasingly be reviewing AI-generated code. The CodeRabbit data (1.7x more issues in AI-generated PRs) suggests that current review tools are not optimized for this configuration. The theoretical question is whether AI review of AI-generated code requires different calibration, different escalation logic, or different explanation strategies than AI review of human-generated code. This is an emerging research area with essentially no empirical foundation.

### 6.7 Longitudinal Studies of Trust Dynamics

Most trust calibration studies are cross-sectional or short-duration lab studies. How does developer trust in AI review tools evolve over months and years of use? Does calibrated trust emerge naturally through experience, or does it require deliberate calibration intervention? The Stack Overflow data showing declining trust over time (2023-2025) suggests that unaided trust dynamics trend toward under-trust as initial adoption enthusiasm dissipates, but this is survey data, not a controlled study of calibration dynamics.

---

## 7. Conclusion

Human-AI collaboration in software quality assurance is a field where foundational theory is substantially ahead of deployment practice and empirical evidence. The Lee-See trust framework, Sheridan-Verplank levels of automation, Endsley situation awareness, Parasuraman automation bias, and Sweller cognitive load theory together provide a coherent theoretical basis for designing human-AI review pipelines. The empirical literature in software engineering has confirmed key predictions from this theory -- automation bias in AI-assisted coding, cognitive load effects from comment volume, trust miscalibration leading to security regressions -- but the controlled studies directly targeting code review interaction are sparse relative to the literature in aviation, medical diagnosis, and nuclear plant operation.

Deployed AI review tools are in an early empirical state: high adoption (84% of developers using or planning to use AI tools), low trust (29% trusting AI output accuracy), significant productivity claims with mixed independent validation, and essentially no systematic implementation of calibration mechanisms, structured escalation, adversarial testing, or annotation feedback loops.

The seven subtopics of this survey represent different positions in this landscape. Developer experience has the strongest empirical base. Trust calibration has the strongest theoretical framework. Escalation protocol design has the largest gap between theory and practice. Adversarial robustness is an active research frontier with near-term practical implications. Feedback loops have significant technical depth in adjacent fields but almost no direct empirical study in the code review context. Explanation and interpretability have mature methods but a persistent gap between what methods produce and what developers need.

The defining challenge for the next phase of this field is closing these gaps in a context where the interaction is fundamentally different from the aviation and medical precedents: AI review is faster, more voluminous, more continuous, more agentic, and more subject to adversarial manipulation than the automation systems that generated the foundational theory. Whether the theory transfers cleanly, transfers with modification, or requires substantial reconceptualization is the central open question.

---

## References

1. Lee, J.D., and See, K.A. (2004). Trust in Automation: Designing for Appropriate Reliance. *Human Factors*, 46(1), 50-80. https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392

2. Parasuraman, R., and Riley, V. (1997). Humans and Automation: Use, Misuse, Disuse, Abuse. *Human Factors*, 39(2), 230-253. https://journals.sagepub.com/doi/10.1518/001872097778543886

3. Parasuraman, R., and Manzey, D.H. (2010). Complacency and Bias in Human Use of Automation: An Attentional Integration. *Human Factors*, 52(3), 381-410. https://journals.sagepub.com/doi/10.1177/0018720810376055

4. Sheridan, T.B., and Verplank, W.L. (1978). Human and Computer Control of Undersea Teleoperators. MIT Man-Machine Systems Laboratory. https://www.semanticscholar.org/paper/Human-and-Computer-Control-of-Undersea-Sheridan-Verplank/d48b94e6af5093e7cc41e20fa6aca4f3a2d860bb

5. Endsley, M.R. (1995). Toward a Theory of Situation Awareness in Dynamic Systems. *Human Factors*, 37(1), 32-64. https://www.researchgate.net/publication/210198492_Endsley_MR_Toward_a_Theory_of_Situation_Awareness_in_Dynamic_Systems_Human_Factors_Journal_371_32-64

6. Endsley, M.R., and Kiris, E.O. (1995). The Out-of-the-Loop Performance Problem and Level of Control in Automation. *Human Factors*, 37(2), 381-394.

7. Sweller, J. (1988). Cognitive Load During Problem Solving: Effects on Learning. *Cognitive Science*, 12(2), 257-285.

8. Wickens, C.D. (2008). Multiple Resources and Mental Workload. *Human Factors*, 50(3), 449-455. https://journals.sagepub.com/doi/10.1518/001872008X288394

9. Scharowski, N. et al. (2023). Measuring and Understanding Trust Calibrations for Automated Systems: A Survey of the State-Of-The-Art and Future Directions. *CHI 2023*. https://dl.acm.org/doi/full/10.1145/3544548.3581197

10. Bansal, G. et al. (2021). Does the Whole Exceed Its Parts? The Effect of AI Explanations on Complementary Team Performance. *FAccT 2021*.

11. Wu, E. et al. (2023). Investigating and Designing for Trust in AI-powered Code Generation Tools. arXiv:2305.11248. https://arxiv.org/html/2305.11248

12. Perry, N. et al. (2023). Do Users Write More Insecure Code with AI Assistants? *CCS 2023*. https://arxiv.org/abs/2211.03622

13. Pearce, H. et al. (2023). Security Weaknesses of Copilot-Generated Code in GitHub Projects: An Empirical Study. arXiv:2310.02059. https://arxiv.org/abs/2310.02059

14. Bacchelli, A., and Bird, C. (2013). Expectations, Outcomes, and Challenges of Modern Code Review. *ICSE 2013*.

15. Sadowski, C. et al. (2018). Modern Code Review: A Case Study at Google. *ICSE 2018*.

16. Christiano, P. et al. (2017). Deep Reinforcement Learning from Human Preferences. *NeurIPS 2017*. https://arxiv.org/abs/1706.03741

17. Shumailov, I. et al. (2024). AI Models Collapse When Trained on Recursively Generated Data. *Nature*, 631, 755-759. https://www.nature.com/articles/s41586-024-07566-y

18. Hajipour, H. et al. (2024). Can Adversarial Code Comments Fool AI Security Reviewers? arXiv:2602.16741. https://arxiv.org/pdf/2602.16741

19. Greshake, K. et al. (2023). Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injections. arXiv:2302.12173.

20. Peng, S. et al. (2023). The Impact of AI on Developer Productivity: Evidence from GitHub Copilot. arXiv:2302.06590. https://arxiv.org/abs/2302.06590

21. Lundberg, S.M., and Lee, S.I. (2017). A Unified Approach to Interpreting Model Predictions. *NeurIPS 2017*. (SHAP)

22. Ribeiro, M.T. et al. (2016). "Why Should I Trust You?": Explaining the Predictions of Any Classifier. *KDD 2016*. (LIME)

23. Forsgren, N. et al. (2021). The SPACE of Developer Productivity. *ACM Queue*, 19(1).

24. OWASP Gen AI Security Project. (2025). LLM01:2025 Prompt Injection. https://genai.owasp.org/llmrisk/llm01-prompt-injection/

25. Stack Overflow. (2025). 2025 Developer Survey: AI. https://survey.stackoverflow.co/2025/ai/

26. Qodo. (2025). State of AI Code Quality in 2025. https://www.qodo.ai/reports/state-of-ai-code-quality/

27. Pullflow. (2025). 1 in 7 PRs Now Involve AI Agents: State of AI Code Review 2025. https://pullflow.com/state-of-ai-code-review-2025

28. Bosu, A. et al. (2015). Characteristics of Useful Code Reviews: An Empirical Study at Microsoft. *MSR 2015*.

29. Chouchen, M. et al. (2021). Anti-Patterns in Modern Code Review: Symptoms and Prevalence. *ICSME 2021*.

30. Muldrew, M. et al. (2024). Active Preference Learning for Large Language Models. *ICML 2024*. (Active Preference Learning)

31. Chiou, E.K., and Lee, J.D. (2023). Trusting Automation: Designing for Responsivity and Resilience. *Human Factors*. https://journals.sagepub.com/doi/10.1177/00187208211009995

32. Zoominfo Engineering. (2025). Experience with GitHub Copilot for Developer Productivity. arXiv:2501.13282. https://arxiv.org/html/2501.13282v1

33. Dawson, A. et al. (2024). The Automation Advantage in AI Red Teaming. arXiv:2504.19855.

34. Berkeley CLTC. (2024). White Paper on Explainable AI, Counterfactual Explanations. https://cltc.berkeley.edu/2024/07/02/new-cltc-white-paper-on-explainable-ai/

35. Aikido Security. (2024). Prompt Injection Inside GitHub Actions: The New Frontier of Supply Chain Attacks. https://www.aikido.dev/blog/promptpwnd-github-actions-ai-agents

---

## Practitioner Resources

### Frameworks and Standards

- **OWASP LLM Top 10 (2025)**: Prompt injection, sensitive data disclosure, and supply chain attacks specific to LLM-based systems. Mandatory reading for teams deploying AI review tools with repository access. https://genai.owasp.org/

- **NIST Generative AI Profile (2024)**: Calls for human review, documentation, and management oversight in critical contexts. Defines requirements for AI red teaming before deployment.

- **SPACE Framework**: Multidimensional developer productivity framework from GitHub/Microsoft Research. Covers Satisfaction, Performance, Activity, Communication, and Efficiency. Relevant for evaluating AI review tool impact beyond simple throughput metrics. https://blog.codacy.com/space-framework

### Key Papers

- **Lee and See (2004)**: The foundational trust-in-automation framework. Read Section 4 on designing for appropriate reliance. https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392

- **Perry et al. (2023)**: The most directly relevant empirical study of automation bias in AI-assisted code work. Shows security regression from over-trust in code generation context.

- **Scharowski et al. (2023 CHI)**: Best current survey of trust calibration measurement. Identifies the gap between trust attitude and trust calibration studies. https://dl.acm.org/doi/full/10.1145/3544548.3581197

- **Hajipour et al. (2024)**: The key paper on adversarial robustness of AI code analysis systems. Distinguishes generation vs. analysis task robustness. https://arxiv.org/pdf/2602.16741

- **Shumailov et al. (2024 Nature)**: Model collapse from recursive training data. Essential background for anyone designing feedback loops. https://www.nature.com/articles/s41586-024-07566-y

### Industry Reports and Surveys

- **Stack Overflow 2025 Developer Survey (AI section)**: Largest annual survey of developer sentiment on AI tools. Current snapshot of adoption, trust, and satisfaction patterns. https://survey.stackoverflow.co/2025/ai/

- **Pullflow State of AI Code Review 2025**: Empirical analysis of AI agent involvement in pull requests across thousands of repositories. Documents the "1 in 7 PRs" finding. https://pullflow.com/state-of-ai-code-review-2025

- **Qodo State of AI Code Quality 2025**: Developer survey focused specifically on AI code quality concerns, including the "almost-right" problem. https://www.qodo.ai/reports/state-of-ai-code-quality/

### Tools Relevant to Adversarial Testing

- **Garak**: Open-source LLM adversarial testing toolkit with 100+ attack modules, including prompt injection and data extraction scenarios. https://github.com/NVIDIA/garak

- **OWASP Gen AI Security Project**: Red teaming initiative with code-review-relevant attack taxonomies. https://genai.owasp.org/2024/09/12/research-initiative-ai-red-teaming-evaluation/

### Cognitive Load and Presentation Design

- **Zakirullin Cognitive Load Repository**: Practical catalog of cognitive load patterns in programming contexts, including notations for intrinsic vs. extraneous load. https://github.com/zakirullin/cognitive-load

- **Baum et al. (2017) Code Review Cognitive Load Study**: Controlled study showing checklist-based review reduces cognitive load. Foundational for structured review design. (DOI: 10.1007/s10664-022-10123-8 for the follow-up study) https://link.springer.com/article/10.1007/s10664-022-10123-8
