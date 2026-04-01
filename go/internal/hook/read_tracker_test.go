package hook

import (
	"path/filepath"
	"testing"
	"time"
)

func TestProcessReadTracker_NonReadTool(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	ProcessReadTracker(dir, "Edit", map[string]interface{}{"file_path": ".claude/skills/compound/work/SKILL.md"})

	state := GetPhaseState(dir)
	if len(state.SkillsRead) != 0 {
		t.Error("non-Read tool should not update skills_read")
	}
}

func TestProcessReadTracker_SkillFileRead(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	ProcessReadTracker(dir, "Read", map[string]interface{}{
		"file_path": filepath.Join(dir, ".claude/skills/compound/work/SKILL.md"),
	})

	state := GetPhaseState(dir)
	if len(state.SkillsRead) != 1 {
		t.Fatalf("expected 1 skill read, got %d", len(state.SkillsRead))
	}
	if state.SkillsRead[0] != ".claude/skills/compound/work/SKILL.md" {
		t.Errorf("got %q, want canonical path", state.SkillsRead[0])
	}
}

func TestProcessReadTracker_Deduplication(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{".claude/skills/compound/work/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	ProcessReadTracker(dir, "Read", map[string]interface{}{
		"file_path": ".claude/skills/compound/work/SKILL.md",
	})

	state := GetPhaseState(dir)
	if len(state.SkillsRead) != 1 {
		t.Errorf("expected dedup: got %d skills_read, want 1", len(state.SkillsRead))
	}
}

func TestProcessReadTracker_NonSkillFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	ProcessReadTracker(dir, "Read", map[string]interface{}{
		"file_path": filepath.Join(dir, "src/main.go"),
	})

	state := GetPhaseState(dir)
	if len(state.SkillsRead) != 0 {
		t.Error("non-skill file should not be tracked")
	}
}

func TestProcessReadTracker_BackslashNormalization(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "review",
		PhaseIndex:   4,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	ProcessReadTracker(dir, "Read", map[string]interface{}{
		"file_path": "C:\\Users\\dev\\.claude\\skills\\compound\\review\\SKILL.md",
	})

	state := GetPhaseState(dir)
	if len(state.SkillsRead) != 1 {
		t.Fatal("expected backslash path to be normalized and tracked")
	}
	if state.SkillsRead[0] != ".claude/skills/compound/review/SKILL.md" {
		t.Errorf("got %q, want canonical path", state.SkillsRead[0])
	}
}

func TestProcessReadTracker_Inactive(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: false,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	ProcessReadTracker(dir, "Read", map[string]interface{}{
		"file_path": ".claude/skills/compound/work/SKILL.md",
	})

	state := GetPhaseState(dir)
	if len(state.SkillsRead) != 0 {
		t.Error("inactive state should not track reads")
	}
}
