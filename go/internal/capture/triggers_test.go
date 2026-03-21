package capture

import (
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// --- DetectUserCorrection ---

func TestDetectUserCorrection_NilForEmptyMessages(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{},
		Context:  memory.Context{Tool: "", Intent: ""},
	})
	if result != nil {
		t.Fatal("expected nil for empty messages")
	}
}

func TestDetectUserCorrection_NilForSingleMessage(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"No, that is wrong"},
		Context:  memory.Context{Tool: "edit", Intent: "test"},
	})
	if result != nil {
		t.Fatal("expected nil for single message")
	}
}

func TestDetectUserCorrection_DetectsNoPattern(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"can you fix this bug?", "No, not that file - the other one"},
		Context:  memory.Context{Tool: "edit", Intent: "bug fix"},
	})
	if result == nil {
		t.Fatal("expected detection for 'no' pattern")
	}
	if !strings.Contains(result.Trigger, "correction") {
		t.Errorf("trigger should contain 'correction', got: %s", result.Trigger)
	}
}

func TestDetectUserCorrection_DetectsWrongPattern(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"update the config", "That is wrong, I meant the dev config"},
		Context:  memory.Context{Tool: "edit", Intent: "config update"},
	})
	if result == nil {
		t.Fatal("expected detection for 'wrong' pattern")
	}
}

func TestDetectUserCorrection_DetectsActuallyPattern(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"add a new function", "Actually, it should be a method on the class"},
		Context:  memory.Context{Tool: "write", Intent: "add feature"},
	})
	if result == nil {
		t.Fatal("expected detection for 'actually' pattern")
	}
}

func TestDetectUserCorrection_DetectsNotThatPattern(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"run the tests", "Not that command, use pnpm test"},
		Context:  memory.Context{Tool: "bash", Intent: "testing"},
	})
	if result == nil {
		t.Fatal("expected detection for 'not that' pattern")
	}
}

func TestDetectUserCorrection_DetectsIMeantPattern(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"open the file", "I meant the TypeScript version, not JavaScript"},
		Context:  memory.Context{Tool: "read", Intent: "view file"},
	})
	if result == nil {
		t.Fatal("expected detection for 'I meant' pattern")
	}
}

func TestDetectUserCorrection_NilForNormalConversation(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"can you add a test?", "Yes, I will add a test for this function"},
		Context:  memory.Context{Tool: "write", Intent: "testing"},
	})
	if result != nil {
		t.Fatal("expected nil for normal conversation without corrections")
	}
}

func TestDetectUserCorrection_IncludesContext(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"edit the config", "No, that is the wrong file"},
		Context:  memory.Context{Tool: "edit", Intent: "config update"},
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Context.Tool != "edit" {
		t.Errorf("expected tool 'edit', got %q", result.Context.Tool)
	}
	if result.Context.Intent != "config update" {
		t.Errorf("expected intent 'config update', got %q", result.Context.Intent)
	}
}

func TestDetectUserCorrection_ExtractsCorrectionMessage(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"add logging", "No, that is too verbose, use debug level"},
		Context:  memory.Context{Tool: "edit", Intent: "logging"},
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.CorrectionMessage != "No, that is too verbose, use debug level" {
		t.Errorf("unexpected correction message: %q", result.CorrectionMessage)
	}
}

func TestDetectUserCorrection_IsCaseInsensitive(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"update the API", "ACTUALLY we need to update the tests first"},
		Context:  memory.Context{Tool: "edit", Intent: "api update"},
	})
	if result == nil {
		t.Fatal("expected detection for case-insensitive 'ACTUALLY'")
	}
}

func TestDetectUserCorrection_SkipsEmptyMessages(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"first message", "", "No, that is wrong"},
		Context:  memory.Context{Tool: "edit", Intent: "test"},
	})
	if result == nil {
		t.Fatal("expected detection skipping empty message")
	}
	if result.CorrectionMessage != "No, that is wrong" {
		t.Errorf("expected correction in third message, got: %q", result.CorrectionMessage)
	}
}

func TestDetectUserCorrection_TriggerFormat(t *testing.T) {
	result := DetectUserCorrection(CorrectionSignal{
		Messages: []string{"do something", "No, wrong approach"},
		Context:  memory.Context{Tool: "edit", Intent: "refactoring"},
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	expected := "User correction during refactoring"
	if result.Trigger != expected {
		t.Errorf("expected trigger %q, got %q", expected, result.Trigger)
	}
}

// --- DetectSelfCorrection ---

func TestDetectSelfCorrection_NilForEmptyHistory(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{Edits: []EditEntry{}})
	if result != nil {
		t.Fatal("expected nil for empty history")
	}
}

func TestDetectSelfCorrection_NilForSingleEdit(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{
		Edits: []EditEntry{
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli()},
		},
	})
	if result != nil {
		t.Fatal("expected nil for single edit")
	}
}

func TestDetectSelfCorrection_NilForTwoEdits(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{
		Edits: []EditEntry{
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 2000},
			{File: "src/app.ts", Success: false, Timestamp: time.Now().UnixMilli() - 1000},
		},
	})
	if result != nil {
		t.Fatal("expected nil for fewer than 3 edits")
	}
}

func TestDetectSelfCorrection_DetectsSuccessFailSuccessPattern(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{
		Edits: []EditEntry{
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 3000},
			{File: "src/app.ts", Success: false, Timestamp: time.Now().UnixMilli() - 2000},
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 1000},
		},
	})
	if result == nil {
		t.Fatal("expected detection for success->fail->success pattern")
	}
	if result.File != "src/app.ts" {
		t.Errorf("expected file 'src/app.ts', got %q", result.File)
	}
}

func TestDetectSelfCorrection_NilForAllSuccessful(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{
		Edits: []EditEntry{
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 2000},
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 1000},
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli()},
		},
	})
	if result != nil {
		t.Fatal("expected nil for all successful edits")
	}
}

func TestDetectSelfCorrection_NilForDifferentFiles(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{
		Edits: []EditEntry{
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 3000},
			{File: "src/other.ts", Success: false, Timestamp: time.Now().UnixMilli() - 2000},
			{File: "src/app.ts", Success: true, Timestamp: time.Now().UnixMilli() - 1000},
		},
	})
	if result != nil {
		t.Fatal("expected nil when edits are on different files")
	}
}

func TestDetectSelfCorrection_TriggerFormat(t *testing.T) {
	result := DetectSelfCorrection(EditHistory{
		Edits: []EditEntry{
			{File: "src/utils/helper.ts", Success: true, Timestamp: time.Now().UnixMilli() - 3000},
			{File: "src/utils/helper.ts", Success: false, Timestamp: time.Now().UnixMilli() - 2000},
			{File: "src/utils/helper.ts", Success: true, Timestamp: time.Now().UnixMilli() - 1000},
		},
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	expected := "Self-correction on src/utils/helper.ts"
	if result.Trigger != expected {
		t.Errorf("expected trigger %q, got %q", expected, result.Trigger)
	}
}

// --- DetectTestFailure ---

func TestDetectTestFailure_NilForPassingTests(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   true,
		Output:   "All tests passed",
		TestFile: "src/app.test.ts",
	})
	if result != nil {
		t.Fatal("expected nil for passing tests")
	}
}

func TestDetectTestFailure_DetectsFailingTest(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "FAIL src/app.test.ts\n  Expected 1 but got 2",
		TestFile: "src/app.test.ts",
	})
	if result == nil {
		t.Fatal("expected detection for failing test")
	}
}

func TestDetectTestFailure_IncludesTestFile(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "TypeError: undefined is not a function",
		TestFile: "src/utils/helper.test.ts",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.TestFile != "src/utils/helper.test.ts" {
		t.Errorf("expected testFile %q, got %q", "src/utils/helper.test.ts", result.TestFile)
	}
}

func TestDetectTestFailure_IncludesErrorOutput(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "AssertionError: expected true to be false",
		TestFile: "src/app.test.ts",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if !strings.Contains(result.ErrorOutput, "AssertionError") {
		t.Errorf("expected error output to contain 'AssertionError', got: %q", result.ErrorOutput)
	}
}

func TestDetectTestFailure_ExtractsFirstErrorLine(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "FAIL src/app.test.ts\nExpected 1 but got 2\nStack trace here",
		TestFile: "src/app.test.ts",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	// "FAIL" matches the error/fail/assert pattern
	if !strings.Contains(result.Trigger, "FAIL") {
		t.Errorf("expected trigger to contain 'FAIL', got: %q", result.Trigger)
	}
}

func TestDetectTestFailure_FallsBackToFirstLine(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "Some unexpected output\nAnother line",
		TestFile: "src/app.test.ts",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if !strings.Contains(result.Trigger, "Some unexpected output") {
		t.Errorf("expected trigger to contain first line, got: %q", result.Trigger)
	}
}

func TestDetectTestFailure_HandlesEmptyOutput(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "",
		TestFile: "src/app.test.ts",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	expected := "Test failure in src/app.test.ts: "
	if result.Trigger != expected {
		t.Errorf("expected trigger %q, got %q", expected, result.Trigger)
	}
}

func TestDetectTestFailure_HandlesWhitespaceOnlyOutput(t *testing.T) {
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   "   \n   \n   ",
		TestFile: "src/app.test.ts",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	expected := "Test failure in src/app.test.ts: "
	if result.Trigger != expected {
		t.Errorf("expected trigger %q, got %q", expected, result.Trigger)
	}
}

func TestDetectTestFailure_TruncatesLongErrorLine(t *testing.T) {
	longLine := "Error: " + strings.Repeat("x", 200)
	result := DetectTestFailure(TestResult{
		Passed:   false,
		Output:   longLine,
		TestFile: "test.go",
	})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	// The trigger should have the error line truncated to 100 chars
	prefix := "Test failure in test.go: "
	errorPart := result.Trigger[len(prefix):]
	if len(errorPart) > 100 {
		t.Errorf("error line in trigger should be at most 100 chars, got %d", len(errorPart))
	}
}

// --- InferMemoryItemType ---

func TestInferMemoryItemType_PatternUseInsteadOf(t *testing.T) {
	got := InferMemoryItemType("Use Polars instead of pandas for large datasets")
	if got != memory.TypePattern {
		t.Errorf("expected %q, got %q", memory.TypePattern, got)
	}
}

func TestInferMemoryItemType_PatternPreferOver(t *testing.T) {
	got := InferMemoryItemType("Prefer async functions over callbacks in this codebase")
	if got != memory.TypePattern {
		t.Errorf("expected %q, got %q", memory.TypePattern, got)
	}
}

func TestInferMemoryItemType_PatternPreferTo(t *testing.T) {
	got := InferMemoryItemType("Prefer pnpm to npm for this project")
	if got != memory.TypePattern {
		t.Errorf("expected %q, got %q", memory.TypePattern, got)
	}
}

func TestInferMemoryItemType_SolutionWhen(t *testing.T) {
	got := InferMemoryItemType("When the database connection fails, restart the pool")
	if got != memory.TypeSolution {
		t.Errorf("expected %q, got %q", memory.TypeSolution, got)
	}
}

func TestInferMemoryItemType_SolutionIfThen(t *testing.T) {
	got := InferMemoryItemType("If tests fail with ENOENT, check that fixtures exist")
	if got != memory.TypeSolution {
		t.Errorf("expected %q, got %q", memory.TypeSolution, got)
	}
}

func TestInferMemoryItemType_SolutionIfComma(t *testing.T) {
	got := InferMemoryItemType("If the build breaks, clear the cache first")
	if got != memory.TypeSolution {
		t.Errorf("expected %q, got %q", memory.TypeSolution, got)
	}
}

func TestInferMemoryItemType_SolutionToFix(t *testing.T) {
	got := InferMemoryItemType("To fix the import error, add the .js extension")
	if got != memory.TypeSolution {
		t.Errorf("expected %q, got %q", memory.TypeSolution, got)
	}
}

func TestInferMemoryItemType_PreferenceAlways(t *testing.T) {
	got := InferMemoryItemType("Always run pnpm lint before committing code changes")
	if got != memory.TypePreference {
		t.Errorf("expected %q, got %q", memory.TypePreference, got)
	}
}

func TestInferMemoryItemType_PreferenceNever(t *testing.T) {
	got := InferMemoryItemType("Never deploy without running the full test suite first")
	if got != memory.TypePreference {
		t.Errorf("expected %q, got %q", memory.TypePreference, got)
	}
}

func TestInferMemoryItemType_LessonDefault(t *testing.T) {
	got := InferMemoryItemType("The database sometimes has connection issues in development")
	if got != memory.TypeLesson {
		t.Errorf("expected %q, got %q", memory.TypeLesson, got)
	}
}

func TestInferMemoryItemType_LessonGenericStatement(t *testing.T) {
	got := InferMemoryItemType("This project uses TypeScript with strict mode enabled")
	if got != memory.TypeLesson {
		t.Errorf("expected %q, got %q", memory.TypeLesson, got)
	}
}

func TestInferMemoryItemType_CaseInsensitive(t *testing.T) {
	tests := []struct {
		input    string
		expected memory.MemoryItemType
	}{
		{"USE vitest instead of jest for this project", memory.TypePattern},
		{"WHEN the build fails, clear the cache first", memory.TypeSolution},
		{"ALWAYS check types before pushing", memory.TypePreference},
	}
	for _, tt := range tests {
		got := InferMemoryItemType(tt.input)
		if got != tt.expected {
			t.Errorf("InferMemoryItemType(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestInferMemoryItemType_PatternBeforeSolution(t *testing.T) {
	// "use X instead of Y" matches pattern, even though "when" could match solution.
	// Pattern has higher priority.
	got := InferMemoryItemType("When possible, use goroutines instead of threads")
	if got != memory.TypePattern {
		t.Errorf("expected pattern (higher priority), got %q", got)
	}
}
