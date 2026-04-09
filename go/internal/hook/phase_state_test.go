package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGetPhaseState_NoFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	got := GetPhaseState(dir)
	if got != nil {
		t.Errorf("expected nil for missing state file, got %+v", got)
	}
}

func TestGetPhaseState_ValidState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	state := PhaseState{
		CookitActive: true,
		EpicID:       "test-epic",
		CurrentPhase: "plan",
		PhaseIndex:   2,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	got := GetPhaseState(dir)
	if got == nil {
		t.Fatal("expected non-nil state")
	}
	if got.CurrentPhase != "plan" {
		t.Errorf("got phase %q, want plan", got.CurrentPhase)
	}
	if got.PhaseIndex != 2 {
		t.Errorf("got phase_index %d, want 2", got.PhaseIndex)
	}
}

func TestGetPhaseState_CorruptedJSON(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), []byte("{bad json"), 0o644)

	got := GetPhaseState(dir)
	if got != nil {
		t.Errorf("expected nil for corrupted JSON, got %+v", got)
	}
}

func TestGetPhaseState_StaleState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	state := PhaseState{
		CookitActive: true,
		EpicID:       "old-epic",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Add(-73 * time.Hour).Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	got := GetPhaseState(dir)
	if got != nil {
		t.Errorf("expected nil for stale state (>72h), got %+v", got)
	}
}

func TestGetPhaseState_InactiveState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	state := PhaseState{
		CookitActive: false,
		EpicID:       "test-epic",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	got := GetPhaseState(dir)
	if got == nil {
		t.Fatal("expected non-nil state even if inactive")
	}
	if got.CookitActive {
		t.Error("expected cookit_active=false")
	}
}

func TestGetPhaseState_LegacyLfgActive(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	// Legacy format uses lfg_active
	raw := `{"lfg_active":true,"epic_id":"test","current_phase":"plan","phase_index":2,"skills_read":[],"gates_passed":[],"started_at":"` + time.Now().Format(time.RFC3339) + `"}`
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), []byte(raw), 0o644)

	got := GetPhaseState(dir)
	if got == nil {
		t.Fatal("expected non-nil state with legacy lfg_active")
	}
	if !got.CookitActive {
		t.Error("expected cookit_active=true from legacy lfg_active migration")
	}
}

func TestUpdatePhaseState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	state := PhaseState{
		CookitActive: true,
		EpicID:       "test-epic",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{"a.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	err := UpdatePhaseState(dir, map[string]interface{}{
		"skills_read": []string{"a.md", "b.md"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := GetPhaseState(dir)
	if got == nil {
		t.Fatal("expected non-nil state after update")
	}
	if len(got.SkillsRead) != 2 {
		t.Errorf("got %d skills_read, want 2", len(got.SkillsRead))
	}
}

func TestWritePhaseState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	state := &PhaseState{
		CookitActive: true,
		EpicID:       "write-test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{"post-plan"},
		StartedAt:    time.Now().Format(time.RFC3339),
	}

	if err := WritePhaseState(dir, state); err != nil {
		t.Fatalf("WritePhaseState: %v", err)
	}

	got := GetPhaseState(dir)
	if got == nil {
		t.Fatal("expected non-nil state after WritePhaseState")
	}
	if got.EpicID != "write-test" {
		t.Errorf("EpicID = %q, want write-test", got.EpicID)
	}
	if len(got.GatesPassed) != 1 || got.GatesPassed[0] != "post-plan" {
		t.Errorf("GatesPassed = %v, want [post-plan]", got.GatesPassed)
	}
}

func TestPhaseStatePath(t *testing.T) {
	t.Parallel()
	got := PhaseStatePath("/some/repo")
	want := filepath.Join("/some/repo", ".compound-agent", ".ca-phase-state.json")
	if got != want {
		t.Errorf("PhaseStatePath = %q, want %q", got, want)
	}
}

func TestIsValidPhase(t *testing.T) {
	t.Parallel()
	for _, p := range Phases {
		if !IsValidPhase(p) {
			t.Errorf("IsValidPhase(%q) = false, want true", p)
		}
	}
	if IsValidPhase("nonexistent") {
		t.Error("IsValidPhase(nonexistent) = true, want false")
	}
}

func TestIsValidGate(t *testing.T) {
	t.Parallel()
	for _, g := range Gates {
		if !IsValidGate(g) {
			t.Errorf("IsValidGate(%q) = false, want true", g)
		}
	}
	if IsValidGate("nonexistent") {
		t.Error("IsValidGate(nonexistent) = true, want false")
	}
}

func TestPhaseIndex(t *testing.T) {
	t.Parallel()
	tests := []struct {
		phase string
		want  int
	}{
		{"spec-dev", 1},
		{"plan", 2},
		{"work", 3},
		{"review", 4},
		{"compound", 5},
	}
	for _, tt := range tests {
		got := PhaseIndexOf(tt.phase)
		if got != tt.want {
			t.Errorf("PhaseIndexOf(%q) = %d, want %d", tt.phase, got, tt.want)
		}
	}
	if PhaseIndexOf("nonexistent") != 0 {
		t.Errorf("PhaseIndexOf(nonexistent) = %d, want 0", PhaseIndexOf("nonexistent"))
	}
}

func TestCleanPhaseStateIfFinal(t *testing.T) {
	t.Parallel()
	t.Run("cleans when final gate present", func(t *testing.T) {
		dir := t.TempDir()
		stateDir := filepath.Join(dir, ".compound-agent")
		os.MkdirAll(stateDir, 0o755)

		state := &PhaseState{
			CookitActive: true,
			EpicID:       "cleanup-test",
			CurrentPhase: "compound",
			PhaseIndex:   5,
			SkillsRead:   []string{},
			GatesPassed:  []string{"post-plan", "gate-3", "gate-4", "final"},
			StartedAt:    time.Now().Format(time.RFC3339),
		}
		WritePhaseState(dir, state)

		CleanPhaseStateIfFinal(dir)

		if _, err := os.Stat(PhaseStatePath(dir)); !os.IsNotExist(err) {
			t.Error("state file should be removed when final gate present")
		}
	})

	t.Run("preserves when final gate absent", func(t *testing.T) {
		dir := t.TempDir()
		stateDir := filepath.Join(dir, ".compound-agent")
		os.MkdirAll(stateDir, 0o755)

		state := &PhaseState{
			CookitActive: true,
			EpicID:       "keep-test",
			CurrentPhase: "review",
			PhaseIndex:   4,
			SkillsRead:   []string{},
			GatesPassed:  []string{"post-plan", "gate-3"},
			StartedAt:    time.Now().Format(time.RFC3339),
		}
		WritePhaseState(dir, state)

		CleanPhaseStateIfFinal(dir)

		if _, err := os.Stat(PhaseStatePath(dir)); err != nil {
			t.Error("state file should be preserved when final gate absent")
		}
	})

	t.Run("noop when no state file", func(t *testing.T) {
		dir := t.TempDir()
		CleanPhaseStateIfFinal(dir) // should not panic
	})
}

func TestPhaseIndex_Architect(t *testing.T) {
	t.Parallel()
	got := PhaseIndexOf("architect")
	if got != 6 {
		t.Errorf("PhaseIndexOf(architect) = %d, want 6", got)
	}
}

func TestGetPhaseState_ArchitectPhase(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".compound-agent")
	os.MkdirAll(stateDir, 0o755)

	state := PhaseState{
		CookitActive: true,
		EpicID:       "meta-epic-123",
		CurrentPhase: "architect",
		PhaseIndex:   6,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	got := GetPhaseState(dir)
	if got == nil {
		t.Fatal("expected non-nil state for architect phase (index 6)")
	}
	if got.CurrentPhase != "architect" {
		t.Errorf("got phase %q, want architect", got.CurrentPhase)
	}
	if got.PhaseIndex != 6 {
		t.Errorf("got phase_index %d, want 6", got.PhaseIndex)
	}
}

func TestMaxPhaseIndex(t *testing.T) {
	t.Parallel()
	max := maxPhaseIndex()
	if max < 6 {
		t.Errorf("maxPhaseIndex() = %d, want >= 6 (must include architect)", max)
	}
}

func TestExpectedGateForPhase(t *testing.T) {
	t.Parallel()
	tests := []struct {
		index int
		want  string
	}{
		{1, ""},
		{2, "post-plan"},
		{3, "gate-3"},
		{4, "gate-4"},
		{5, "final"},
		{6, ""},
	}
	for _, tt := range tests {
		got := ExpectedGateForPhase(tt.index)
		if got != tt.want {
			t.Errorf("ExpectedGateForPhase(%d) = %q, want %q", tt.index, got, tt.want)
		}
	}
}
