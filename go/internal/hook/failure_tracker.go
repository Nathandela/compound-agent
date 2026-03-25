package hook

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	sameTargetThreshold   = 2
	totalFailureThreshold = 3
	failureStateFileName  = ".ca-failure-state.json"
	stateMaxAge           = time.Hour
)

const failureTip = "Tip: Multiple failures detected. `npx ca search` may have solutions for similar issues."

type failureState struct {
	Count           int    `json:"count"`
	LastTarget      string `json:"lastTarget"`
	SameTargetCount int    `json:"sameTargetCount"`
	Timestamp       int64  `json:"timestamp"`
}

// ToolFailureResult is the output of the post-tool-failure hook.
type ToolFailureResult struct {
	SpecificOutput *SpecificOutput `json:"hookSpecificOutput,omitempty"`
}

func readFailureState(stateDir string) failureState {
	data, err := os.ReadFile(filepath.Join(stateDir, failureStateFileName))
	if err != nil {
		return failureState{Timestamp: time.Now().UnixMilli()}
	}
	var state failureState
	if err := json.Unmarshal(data, &state); err != nil {
		return failureState{Timestamp: time.Now().UnixMilli()}
	}
	// Check staleness
	if time.Now().UnixMilli()-state.Timestamp > stateMaxAge.Milliseconds() {
		return failureState{Timestamp: time.Now().UnixMilli()}
	}
	return state
}

func writeFailureState(stateDir string, state failureState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("marshal failure state: %w", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, failureStateFileName), data, 0o644); err != nil {
		return fmt.Errorf("write failure state: %w", err)
	}
	return nil
}

func deleteFailureState(stateDir string) {
	// Best-effort: if the file doesn't exist or can't be removed, the state
	// will be treated as stale on next read (timestamp check).
	os.Remove(filepath.Join(stateDir, failureStateFileName))
}

func getFailureTarget(toolName string, toolInput map[string]interface{}) string {
	switch toolName {
	case "Bash":
		cmd, ok := toolInput["command"].(string)
		if !ok {
			return ""
		}
		trimmed := strings.TrimSpace(cmd)
		if idx := strings.IndexByte(trimmed, ' '); idx != -1 {
			return trimmed[:idx]
		}
		return trimmed
	case "Edit", "Write":
		fp, ok := toolInput["file_path"].(string)
		if !ok {
			return ""
		}
		return fp
	default:
		return ""
	}
}

// ProcessToolFailure processes a tool failure and returns a tip if thresholds are met.
// This is the backward-compatible version without search integration.
func ProcessToolFailure(toolName string, toolInput map[string]interface{}, stateDir string) ToolFailureResult {
	return ProcessToolFailureWithSearch(toolName, toolInput, "", stateDir, nil)
}

// ProcessToolFailureWithSearch processes a tool failure with optional lesson search.
// When thresholds are met and searchFn is provided, it searches for relevant lessons
// and injects them into the hook output. Falls back to a static tip on search errors
// or when no results are found.
func ProcessToolFailureWithSearch(toolName string, toolInput map[string]interface{}, toolOutput string, stateDir string, searchFn LessonSearchFunc) ToolFailureResult {
	state := readFailureState(stateDir)
	state.Count++
	target := getFailureTarget(toolName, toolInput)

	if target != "" && target == state.LastTarget {
		state.SameTargetCount++
	} else {
		state.SameTargetCount = 1
		state.LastTarget = target
	}

	if state.SameTargetCount >= sameTargetThreshold || state.Count >= totalFailureThreshold {
		deleteFailureState(stateDir)
		tip := buildFailureTip(toolName, target, toolOutput, searchFn)
		return ToolFailureResult{
			SpecificOutput: &SpecificOutput{
				HookEventName:     "PostToolUseFailure",
				AdditionalContext: tip,
			},
		}
	}

	state.Timestamp = time.Now().UnixMilli()
	// Write error is non-fatal: worst case, the counter resets and
	// the user sees the tip one failure later than expected.
	_ = writeFailureState(stateDir, state)
	return ToolFailureResult{}
}

// buildFailureTip attempts to search for relevant lessons and falls back to a static tip.
func buildFailureTip(toolName, target, toolOutput string, searchFn LessonSearchFunc) string {
	if searchFn == nil {
		return failureTip
	}

	tokens := BuildSearchTokens(toolName, target, toolOutput)
	if len(tokens) == 0 {
		return failureTip
	}

	matches, err := searchLessonsWithTimeout(searchFn, tokens)
	if err != nil || len(matches) == 0 {
		return failureTip
	}

	return FormatLessonResults(matches)
}

// ProcessToolSuccess clears the failure state.
func ProcessToolSuccess(stateDir string) {
	deleteFailureState(stateDir)
}
