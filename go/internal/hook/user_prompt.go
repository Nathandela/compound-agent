package hook

import "regexp"

// CorrectionReminder is the message shown when a correction pattern is detected.
const CorrectionReminder = "Remember: You have memory tools available - `npx ca learn` to save insights, `npx ca search` to find past solutions."

// PlanningReminder is the message shown when a planning pattern is detected.
const PlanningReminder = "If you're uncertain or hesitant, remember your memory tools: `npx ca search` may have relevant context from past sessions."

var correctionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bactually\b`),
	regexp.MustCompile(`(?i)\bno[,.]?\s`),
	regexp.MustCompile(`(?i)\bwrong\b`),
	regexp.MustCompile(`(?i)\bthat'?s not right\b`),
	regexp.MustCompile(`(?i)\bthat'?s incorrect\b`),
	regexp.MustCompile(`(?i)\buse .+ instead\b`),
	regexp.MustCompile(`(?i)\bi told you\b`),
	regexp.MustCompile(`(?i)\bi already said\b`),
	regexp.MustCompile(`(?i)\bnot like that\b`),
	regexp.MustCompile(`(?i)\byou forgot\b`),
	regexp.MustCompile(`(?i)\byou missed\b`),
	regexp.MustCompile(`(?i)\bstop\s*(,\s*)?(doing|using|that)\b`),
	regexp.MustCompile(`(?i)\bwait\s*(,\s*)?(that|no|wrong)\b`),
}

var highConfidencePlanning = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bdecide\b`),
	regexp.MustCompile(`(?i)\bchoose\b`),
	regexp.MustCompile(`(?i)\bpick\b`),
	regexp.MustCompile(`(?i)\bwhich approach\b`),
	regexp.MustCompile(`(?i)\bwhat do you think\b`),
	regexp.MustCompile(`(?i)\bshould we\b`),
	regexp.MustCompile(`(?i)\bwould you\b`),
	regexp.MustCompile(`(?i)\bhow should\b`),
	regexp.MustCompile(`(?i)\bwhat'?s the best\b`),
	regexp.MustCompile(`(?i)\badd feature\b`),
	regexp.MustCompile(`(?i)\bset up\b`),
}

var lowConfidencePlanning = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bimplement\b`),
	regexp.MustCompile(`(?i)\bbuild\b`),
	regexp.MustCompile(`(?i)\bcreate\b`),
	regexp.MustCompile(`(?i)\brefactor\b`),
	regexp.MustCompile(`(?i)\bfix\b`),
	regexp.MustCompile(`(?i)\bwrite\b`),
	regexp.MustCompile(`(?i)\bdevelop\b`),
}

// SpecificOutput is the Claude Code hook output structure.
type SpecificOutput struct {
	HookEventName     string `json:"hookEventName"`
	AdditionalContext string `json:"additionalContext,omitempty"`
}

// UserPromptResult is the output of the user-prompt hook.
type UserPromptResult struct {
	SpecificOutput *SpecificOutput `json:"hookSpecificOutput,omitempty"`
}

func detectCorrection(prompt string) bool {
	for _, pat := range correctionPatterns {
		if pat.MatchString(prompt) {
			return true
		}
	}
	return false
}

func detectPlanning(prompt string) bool {
	for _, pat := range highConfidencePlanning {
		if pat.MatchString(prompt) {
			return true
		}
	}
	count := 0
	for _, pat := range lowConfidencePlanning {
		if pat.MatchString(prompt) {
			count++
		}
	}
	return count >= 2
}

// ProcessUserPrompt processes a user prompt and returns a reminder if patterns match.
func ProcessUserPrompt(prompt string) UserPromptResult {
	if detectCorrection(prompt) {
		return UserPromptResult{
			SpecificOutput: &SpecificOutput{
				HookEventName:     "UserPromptSubmit",
				AdditionalContext: CorrectionReminder,
			},
		}
	}
	if detectPlanning(prompt) {
		return UserPromptResult{
			SpecificOutput: &SpecificOutput{
				HookEventName:     "UserPromptSubmit",
				AdditionalContext: PlanningReminder,
			},
		}
	}
	return UserPromptResult{}
}
