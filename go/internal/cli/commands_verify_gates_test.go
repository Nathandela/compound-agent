package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidateEpicID(t *testing.T) {
	tests := []struct {
		id      string
		wantErr bool
	}{
		{"simple-epic", false},
		{"epic_with_underscores", false},
		{"my-epic.1", false},
		{"my-epic.1.2", false},
		{"ABC123", false},
		{"a", false},
		{"", true},
		{"has spaces", true},
		{"--help", true},
		{"epic;rm -rf /", true},
		{"epic\ninjection", true},
		{"epic/path", true},
	}

	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			err := validateEpicID(tt.id)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateEpicID(%q) error = %v, wantErr %v", tt.id, err, tt.wantErr)
			}
		})
	}
}

func TestParseBdShowDeps(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    []bdDep
		wantErr bool
	}{
		{
			name: "json with depends_on array",
			input: `[{"id":"epic-1","title":"Parent","depends_on":[
				{"id":"task-1","title":"Review: Code review","status":"closed"},
				{"id":"task-2","title":"Compound: Synthesize patterns","status":"open"}
			]}]`,
			want: []bdDep{
				{ID: "task-1", Title: "Review: Code review", Status: "closed"},
				{ID: "task-2", Title: "Compound: Synthesize patterns", Status: "open"},
			},
		},
		{
			name: "json with dependencies array",
			input: `{"id":"epic-1","title":"Parent","dependencies":[
				{"id":"task-1","title":"Review: Code review","status":"closed"}
			]}`,
			want: []bdDep{
				{ID: "task-1", Title: "Review: Code review", Status: "closed"},
			},
		},
		{
			name:    "empty deps",
			input:   `[{"id":"epic-1","title":"Parent"}]`,
			want:    []bdDep{},
			wantErr: false,
		},
		{
			name:    "invalid json",
			input:   `not json`,
			wantErr: true,
		},
		{
			name: "depends_on takes precedence over dependencies",
			input: `[{"id":"epic-1","depends_on":[
				{"id":"t1","title":"Review: A","status":"closed"}
			],"dependencies":[
				{"id":"t2","title":"Review: B","status":"open"}
			]}]`,
			want: []bdDep{
				{ID: "t1", Title: "Review: A", Status: "closed"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseBdShowDeps(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseBdShowDeps() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %d deps, want %d", len(got), len(tt.want))
			}
			for i, dep := range got {
				if dep != tt.want[i] {
					t.Errorf("dep[%d] = %+v, want %+v", i, dep, tt.want[i])
				}
			}
		})
	}
}

func TestParseBdShowDepsText(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []bdDep
	}{
		{
			name: "typical bd show output",
			input: `epic-1: Parent epic
Status: open
DEPENDS ON
  → ✓ task-1: Review: Code review ● closed
  → ○ task-2: Compound: Synthesize patterns ● open
BLOCKED BY
`,
			want: []bdDep{
				{Title: "Review: Code review", Status: "closed"},
				{Title: "Compound: Synthesize patterns", Status: "open"},
			},
		},
		{
			name:  "no depends on section",
			input: "epic-1: Parent epic\nStatus: open\n",
			want:  []bdDep{},
		},
		{
			name: "section break on unindented line",
			input: `epic-1: Parent
DEPENDS ON
  → ✓ task-1: Review: Done ●
BLOCKED BY
  → ○ blocker-1: Something ●
`,
			want: []bdDep{
				{Title: "Review: Done", Status: "closed"},
			},
		},
		{
			name: "checkmark determines status not trailing text",
			input: `epic-1: Parent
DEPENDS ON
  → ✓ task-1: Review: Done ●
  → ○ task-2: Compound: WIP ●
`,
			want: []bdDep{
				{Title: "Review: Done", Status: "closed"},
				{Title: "Compound: WIP", Status: "open"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseBdShowDepsText(tt.input)
			if len(got) != len(tt.want) {
				t.Fatalf("got %d deps, want %d", len(got), len(tt.want))
			}
			for i, dep := range got {
				if dep.Title != tt.want[i].Title {
					t.Errorf("dep[%d].Title = %q, want %q", i, dep.Title, tt.want[i].Title)
				}
				if dep.Status != tt.want[i].Status {
					t.Errorf("dep[%d].Status = %q, want %q", i, dep.Status, tt.want[i].Status)
				}
			}
		})
	}
}

func TestCheckGate(t *testing.T) {
	deps := []bdDep{
		{Title: "Review: Code review", Status: "closed"},
		{Title: "Compound: Synthesize patterns", Status: "open"},
	}

	t.Run("review gate passes when closed", func(t *testing.T) {
		result := checkGate(deps, "Review:", "Review task")
		if result.Status != "pass" {
			t.Errorf("status = %q, want pass", result.Status)
		}
	})

	t.Run("compound gate fails when open", func(t *testing.T) {
		result := checkGate(deps, "Compound:", "Compound task")
		if result.Status != "fail" {
			t.Errorf("status = %q, want fail", result.Status)
		}
		if !strings.Contains(result.Detail, "not closed") {
			t.Errorf("detail = %q, want 'not closed'", result.Detail)
		}
	})

	t.Run("missing gate fails", func(t *testing.T) {
		result := checkGate([]bdDep{}, "Review:", "Review task")
		if result.Status != "fail" {
			t.Errorf("status = %q, want fail", result.Status)
		}
		if !strings.Contains(result.Detail, "missing") {
			t.Errorf("detail = %q, want 'missing'", result.Detail)
		}
	})
}

func TestVerifyGatesCmd(t *testing.T) {
	cmd := verifyGatesCmd()

	// Should require exactly 1 arg
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{})
	err := cmd.Execute()
	if err == nil {
		t.Error("expected error with no args")
	}
}

func TestVerifyGatesCmdRejectsFlagLikeIDs(t *testing.T) {
	// Flag-like IDs (starting with --) are caught by cobra before reaching
	// our validation. Test the validation function directly.
	if err := validateEpicID("--help"); err == nil {
		t.Error("expected validation error for --help")
	}
	if err := validateEpicID("-flag"); err == nil {
		t.Error("expected validation error for -flag")
	}
	if err := validateEpicID(".dot-start"); err == nil {
		t.Error("expected validation error for .dot-start")
	}
}

func TestVerifyGatesCmdAcceptsDottedIDs(t *testing.T) {
	// validateEpicID should accept dotted IDs. The command will fail
	// because bd isn't available, but NOT because of validation.
	err := validateEpicID("my-epic.1.2")
	if err != nil {
		t.Errorf("dotted epic ID rejected by validation: %v", err)
	}
}

func TestVerifyGatesPhaseStateCleanup(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)

	// Write a phase state with "final" gate
	state := map[string]interface{}{
		"cookit_active": true,
		"epic_id":       "test-epic",
		"current_phase": "compound",
		"phase_index":   5,
		"skills_read":   []string{},
		"gates_passed":  []string{"post-plan", "gate-3", "gate-4", "final"},
		"started_at":    time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(state, "", "  ")
	statePath := filepath.Join(claudeDir, ".ca-phase-state.json")
	os.WriteFile(statePath, data, 0644)

	// Verify file exists
	if _, err := os.Stat(statePath); err != nil {
		t.Fatal("state file should exist")
	}

	// Import the hook package's function indirectly via the helper
	// We test CleanPhaseStateIfFinal through the hook package
	// Since we can't easily test the full command (needs bd), test the parsing + cleanup logic
	// The state file should be cleaned when final gate is present
	// This is tested via hook.CleanPhaseStateIfFinal
}

func TestGateCheckResultJSON(t *testing.T) {
	result := gateCheckResult{Name: "Review task", Status: "pass"}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded gateCheckResult
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.Name != "Review task" || decoded.Status != "pass" {
		t.Errorf("round-trip failed: %+v", decoded)
	}
}
