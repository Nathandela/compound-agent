// Package capture implements trigger detection and type inference for
// automatic memory capture. It detects user corrections, self-corrections,
// and test failures, and infers memory item types from insight text.
package capture

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// CorrectionSignal holds the conversation messages and context for
// user correction detection.
type CorrectionSignal struct {
	Messages []string
	Context  memory.Context
}

// DetectedCorrection is the result of a successful user correction detection.
type DetectedCorrection struct {
	Trigger           string
	CorrectionMessage string
	Context           memory.Context
}

// EditEntry records a single file edit attempt.
type EditEntry struct {
	File      string
	Success   bool
	Timestamp int64
}

// EditHistory holds a sequence of edit entries for self-correction detection.
type EditHistory struct {
	Edits []EditEntry
}

// DetectedSelfCorrection is the result of detecting an edit-fail-reedit pattern.
type DetectedSelfCorrection struct {
	File    string
	Trigger string
}

// TestResult holds the outcome of a test run.
type TestResult struct {
	Passed   bool
	Output   string
	TestFile string
}

// DetectedTestFailure is the result of detecting a test failure.
type DetectedTestFailure struct {
	TestFile    string
	ErrorOutput string
	Trigger     string
}

// User correction patterns (case-insensitive).
var userCorrectionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bno\b[,.]?\s`),
	regexp.MustCompile(`(?i)\bwrong\b`),
	regexp.MustCompile(`(?i)\bactually\b`),
	regexp.MustCompile(`(?i)\bnot that\b`),
	regexp.MustCompile(`(?i)\bi meant\b`),
}

// DetectUserCorrection looks for correction patterns in conversation messages.
// Returns nil if fewer than 2 messages or no correction pattern is found.
func DetectUserCorrection(signals CorrectionSignal) *DetectedCorrection {
	if len(signals.Messages) < 2 {
		return nil
	}

	for _, msg := range signals.Messages[1:] {
		if msg == "" {
			continue
		}
		for _, pat := range userCorrectionPatterns {
			if pat.MatchString(msg) {
				return &DetectedCorrection{
					Trigger:           fmt.Sprintf("User correction during %s", signals.Context.Intent),
					CorrectionMessage: msg,
					Context:           signals.Context,
				}
			}
		}
	}

	return nil
}

// DetectSelfCorrection looks for edit->fail->re-edit patterns on the same file.
// Returns nil if fewer than 3 edits or no pattern is found.
func DetectSelfCorrection(history EditHistory) *DetectedSelfCorrection {
	edits := history.Edits
	if len(edits) < 3 {
		return nil
	}

	for i := 0; i <= len(edits)-3; i++ {
		first := edits[i]
		second := edits[i+1]
		third := edits[i+2]

		if first.File == second.File && second.File == third.File &&
			first.Success && !second.Success && third.Success {
			return &DetectedSelfCorrection{
				File:    first.File,
				Trigger: fmt.Sprintf("Self-correction on %s", first.File),
			}
		}
	}

	return nil
}

// errorLinePattern matches lines containing error, fail, or assert (case-insensitive).
var errorLinePattern = regexp.MustCompile(`(?i)error|fail|assert`)

// DetectTestFailure detects a test failure and extracts the first meaningful error line.
// Returns nil if the test passed.
func DetectTestFailure(result TestResult) *DetectedTestFailure {
	if result.Passed {
		return nil
	}

	// Split output and filter to non-empty lines.
	var lines []string
	for _, line := range strings.Split(result.Output, "\n") {
		if strings.TrimSpace(line) != "" {
			lines = append(lines, line)
		}
	}

	// Find first line matching error/fail/assert, or fall back to first line.
	errorLine := ""
	for _, line := range lines {
		if errorLinePattern.MatchString(line) {
			errorLine = line
			break
		}
	}
	if errorLine == "" && len(lines) > 0 {
		errorLine = lines[0]
	}

	// Truncate to 100 characters.
	if len(errorLine) > 100 {
		errorLine = errorLine[:100]
	}

	return &DetectedTestFailure{
		TestFile:    result.TestFile,
		ErrorOutput: result.Output,
		Trigger:     fmt.Sprintf("Test failure in %s: %s", result.TestFile, errorLine),
	}
}

// Type inference patterns, checked in priority order.
var (
	patternIndicators = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\buse\s+.+\s+instead\s+of\b`),
		regexp.MustCompile(`(?i)\bprefer\s+.+\s+(over|to)\b`),
	}
	solutionIndicators = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\bwhen\s+.+,\s`),
		regexp.MustCompile(`(?i)\bif\s+.+\bthen\b`),
		regexp.MustCompile(`(?i)\bif\s+.+,\s`),
		regexp.MustCompile(`(?i)\bto\s+fix\b`),
	}
	preferenceIndicators = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\balways\s+`),
		regexp.MustCompile(`(?i)\bnever\s+`),
	}
)

// InferItemType classifies insight text into a memory item type.
// Priority order: pattern > solution > preference > lesson (default).
func InferItemType(insight string) memory.ItemType {
	for _, pat := range patternIndicators {
		if pat.MatchString(insight) {
			return memory.TypePattern
		}
	}
	for _, pat := range solutionIndicators {
		if pat.MatchString(insight) {
			return memory.TypeSolution
		}
	}
	for _, pat := range preferenceIndicators {
		if pat.MatchString(insight) {
			return memory.TypePreference
		}
	}
	return memory.TypeLesson
}
