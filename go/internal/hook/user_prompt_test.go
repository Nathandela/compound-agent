package hook

import (
	"encoding/json"
	"testing"
)

func TestProcessUserPrompt_CorrectionPatterns(t *testing.T) {
	t.Parallel()
	tests := []struct {
		prompt string
		want   bool
	}{
		{"actually, use a map instead", true},
		{"no, that's wrong", true},
		{"that's not right", true},
		{"you forgot the error handling", true},
		{"stop doing that", true},
		{"wait, no", true},
		{"use goroutines instead", true},
		{"I told you to use channels", true},
		{"hello world", false},
		{"please implement the feature", false},
	}
	for _, tt := range tests {
		result := ProcessUserPrompt(tt.prompt)
		data, _ := json.Marshal(result)
		var m map[string]interface{}
		json.Unmarshal(data, &m)

		hasContext := m["hookSpecificOutput"] != nil
		if hasContext != tt.want {
			label := "correction"
			if !tt.want {
				label = "no match"
			}
			t.Errorf("ProcessUserPrompt(%q): got hasContext=%v, want %s", tt.prompt, hasContext, label)
		}
	}
}

func TestProcessUserPrompt_PlanningHighConfidence(t *testing.T) {
	t.Parallel()
	tests := []string{
		"which approach should we take?",
		"decide between A and B",
		"choose the right framework",
		"should we use REST or GraphQL?",
		"how should we structure this?",
		"add feature for logging",
		"set up the test environment",
	}
	for _, prompt := range tests {
		result := ProcessUserPrompt(prompt)
		data, _ := json.Marshal(result)
		var m map[string]interface{}
		json.Unmarshal(data, &m)

		if m["hookSpecificOutput"] == nil {
			t.Errorf("ProcessUserPrompt(%q): expected planning match", prompt)
		}
	}
}

func TestProcessUserPrompt_PlanningLowConfidence(t *testing.T) {
	t.Parallel()
	// Single low-confidence keyword: no match
	result := ProcessUserPrompt("implement the feature")
	data, _ := json.Marshal(result)
	var m map[string]interface{}
	json.Unmarshal(data, &m)
	if m["hookSpecificOutput"] != nil {
		t.Error("single low-confidence keyword should not match")
	}

	// Two low-confidence keywords: match
	result = ProcessUserPrompt("implement and build the module")
	data, _ = json.Marshal(result)
	json.Unmarshal(data, &m)
	if m["hookSpecificOutput"] == nil {
		t.Error("two low-confidence keywords should match")
	}
}

func TestProcessUserPrompt_CorrectionPriority(t *testing.T) {
	t.Parallel()
	// When both correction and planning match, correction wins
	result := ProcessUserPrompt("actually, decide on the approach")
	if result.SpecificOutput == nil {
		t.Fatal("expected output")
	}
	if result.SpecificOutput.AdditionalContext != CorrectionReminder {
		t.Error("correction should take priority over planning")
	}
}

func TestProcessUserPrompt_EmptyPrompt(t *testing.T) {
	t.Parallel()
	result := ProcessUserPrompt("")
	if result.SpecificOutput != nil {
		t.Error("empty prompt should produce no output")
	}
}

func TestProcessUserPrompt_OutputFormat(t *testing.T) {
	t.Parallel()
	result := ProcessUserPrompt("actually fix this")
	if result.SpecificOutput == nil {
		t.Fatal("expected hook output")
	}
	if result.SpecificOutput.HookEventName != "UserPromptSubmit" {
		t.Errorf("got event name %q, want UserPromptSubmit", result.SpecificOutput.HookEventName)
	}
}
