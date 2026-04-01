package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- Task 1: Doctor prefix casing ---

func TestDoctorResults_LowercasePrefixes(t *testing.T) {
	checks := []doctorCheck{
		{Name: "test pass", Status: "pass"},
		{Name: "test fail", Status: "fail", Fix: "fix it"},
		{Name: "test warn", Status: "warn", Fix: "maybe fix"},
		{Name: "test info", Status: "info"},
	}

	root := &cobra.Command{Use: "ca"}
	out, _ := executeCommand(root) // just to get a buffer
	_ = out

	// Test via printDoctorResults directly
	cmd := &cobra.Command{Use: "test"}
	var buf strings.Builder
	cmd.SetOut(&buf)

	// Simulate by calling printDoctorResults
	printDoctorResults(cmd, checks)
	output := buf.String()

	// Must use lowercase [ok], [fail], [warn], [info]
	if strings.Contains(output, "[FAIL]") {
		t.Error("doctor output should use lowercase [fail], not [FAIL]")
	}
	if strings.Contains(output, "[WARN]") {
		t.Error("doctor output should use lowercase [warn], not [WARN]")
	}
	if strings.Contains(output, "[INFO]") {
		t.Error("doctor output should use lowercase [info], not [INFO]")
	}
	if !strings.Contains(output, "[fail]") {
		t.Error("doctor output should contain [fail]")
	}
	if !strings.Contains(output, "[warn]") {
		t.Error("doctor output should contain [warn]")
	}
	if !strings.Contains(output, "[info]") {
		t.Error("doctor output should contain [info]")
	}
	if !strings.Contains(output, "[ok]") {
		t.Error("doctor output should contain [ok]")
	}
}

// --- Task 2: --json flag on ca info ---

func TestInfoCmd_JSONFlag(t *testing.T) {
	dir := t.TempDir()
	output := runInfoCmd(t, dir, "--json")

	var result map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &result); err != nil {
		t.Fatalf("info --json should produce valid JSON, got: %s\nerror: %v", output, err)
	}

	// Should have expected top-level keys
	for _, key := range []string{"version", "hooks", "skills", "phase", "telemetry", "lessons"} {
		if _, ok := result[key]; !ok {
			t.Errorf("info --json missing key %q", key)
		}
	}
}

// --- Task 3: writeJSON error handling ---

func TestWriteJSON_ReturnsError(t *testing.T) {
	// writeJSON should return an error for unmarshalable values.
	// A channel is not JSON-marshalable.
	cmd := &cobra.Command{Use: "test"}
	var buf strings.Builder
	cmd.SetOut(&buf)

	err := writeJSON(cmd, make(chan int))
	if err == nil {
		t.Error("writeJSON should return error for unmarshalable value")
	}
}

func TestReportError_ReturnsWriteJSONError(t *testing.T) {
	// reportError with jsonOut=true should propagate writeJSON error for valid data,
	// but the main contract is it always returns a non-nil error for the message.
	cmd := &cobra.Command{Use: "test"}
	var buf strings.Builder
	cmd.SetOut(&buf)
	cmd.SetErr(&buf)

	err := reportError(cmd, "test error", true)
	if err == nil {
		t.Error("reportError should always return non-nil error")
	}
	if err.Error() != "test error" {
		t.Errorf("reportError should return error with original message, got %q", err.Error())
	}
}

// --- Task 4: --json help text consistency ---

func TestJSONFlagHelpText_Lowercase(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	registerInfoCommands(root)
	registerSetupCommands(root)
	registerCaptureCommands(root)
	registerCrudCommands(root)

	var violations []string
	checkCmdFlags(root, &violations)

	if len(violations) > 0 {
		t.Errorf("JSON flag help text should be lowercase 'output as JSON':\n%s",
			strings.Join(violations, "\n"))
	}
}

// checkCmdFlags recursively checks all commands for uppercase JSON help text.
func checkCmdFlags(cmd *cobra.Command, violations *[]string) {
	f := cmd.Flags().Lookup("json")
	if f != nil {
		usage := f.Usage
		// Phase status uses "Output raw JSON" which is acceptable for its special case
		if strings.HasPrefix(usage, "Output") && !strings.Contains(usage, "raw") {
			*violations = append(*violations, cmd.CommandPath()+": "+usage)
		}
	}
	for _, sub := range cmd.Commands() {
		checkCmdFlags(sub, violations)
	}
}

// --- Task 5: --force short form ---

func TestForceFlag_HasShortForm(t *testing.T) {
	cmds := map[string]*cobra.Command{
		"improve": improveCmd(),
		"loop":    loopCmd(),
		"polish":  polishCmd(),
	}

	for name, cmd := range cmds {
		f := cmd.Flags().Lookup("force")
		if f == nil {
			t.Errorf("%s: missing --force flag", name)
			continue
		}
		if f.Shorthand != "f" {
			t.Errorf("%s: --force should have -f shorthand, got %q", name, f.Shorthand)
		}
	}
}

// --- Task 6: Empty-state messages ---

func TestEmptyStateMessages_HaveGuidance(t *testing.T) {
	tests := []struct {
		name   string
		output string
	}{
		{"load-session empty", formatSessionHuman(nil, 0)},
		{"info no skills", formatInfoSkills(t.TempDir())},
		{"info no telemetry", formatInfoTelemetry(t.TempDir())},
		{"info no lessons", formatInfoLessons(t.TempDir())},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lower := strings.ToLower(tt.output)
			// Each empty-state message should have some actionable guidance
			hasGuidance := strings.Contains(lower, "run ") ||
				strings.Contains(lower, "get started") ||
				strings.Contains(lower, "use ") ||
				strings.Contains(lower, "try ")
			if !hasGuidance {
				t.Errorf("empty-state message should include actionable guidance, got: %q", tt.output)
			}
		})
	}
}
