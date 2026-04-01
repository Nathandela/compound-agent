package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestCompileSkillsIndex_ProducesValidJSON verifies that CompileSkillsIndex
// writes a valid JSON file with entries for all skills.
func TestCompileSkillsIndex(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	os.MkdirAll(skillsDir, 0o755)

	err := CompileSkillsIndex(dir)
	if err != nil {
		t.Fatalf("CompileSkillsIndex: %v", err)
	}

	indexPath := filepath.Join(dir, ".claude", "skills", "compound", "skills_index.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("read index: %v", err)
	}

	var index SkillsIndex
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatalf("parse index: %v", err)
	}

	if len(index.Skills) == 0 {
		t.Fatal("skills_index.json has no skills")
	}

	// Verify all expected skills are present
	dirSet := make(map[string]bool)
	for _, s := range index.Skills {
		dirSet[s.Dir] = true
	}

	expectedDirs := []string{
		"spec-dev", "plan", "work", "review", "compound",
		"architect", "cook-it", "researcher", "agentic",
		"test-cleaner", "build-great-things", "qa-engineer",
	}
	for _, d := range expectedDirs {
		if !dirSet[d] {
			t.Errorf("missing skill dir in index: %s", d)
		}
	}
}

// TestCompileSkillsIndex_PhaseFieldsCorrect verifies that skills with a phase
// in their frontmatter have the correct phase in the index.
func TestCompileSkillsIndex_PhaseFieldsCorrect(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	os.MkdirAll(skillsDir, 0o755)

	err := CompileSkillsIndex(dir)
	if err != nil {
		t.Fatalf("CompileSkillsIndex: %v", err)
	}

	indexPath := filepath.Join(dir, ".claude", "skills", "compound", "skills_index.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("read index: %v", err)
	}

	var index SkillsIndex
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatalf("parse index: %v", err)
	}

	expected := map[string]string{
		"spec-dev":           "spec-dev",
		"plan":               "plan",
		"work":               "work",
		"review":             "review",
		"compound":           "compound",
		"architect":          "architect",
		"researcher":         "spec-dev",
		"agentic":            "work",
		"test-cleaner":       "review",
		"build-great-things": "work",
		"qa-engineer":        "review",
	}

	skillMap := make(map[string]SkillEntry)
	for _, s := range index.Skills {
		skillMap[s.Dir] = s
	}

	for dir, wantPhase := range expected {
		entry, ok := skillMap[dir]
		if !ok {
			t.Errorf("missing skill in index: %s", dir)
			continue
		}
		if entry.Phase != wantPhase {
			t.Errorf("skill %s: phase = %q, want %q", dir, entry.Phase, wantPhase)
		}
	}

	// cook-it should have empty phase
	if entry, ok := skillMap["cook-it"]; ok {
		if entry.Phase != "" {
			t.Errorf("cook-it: phase = %q, want empty", entry.Phase)
		}
	}
}

// TestCompileSkillsIndex_HasNameAndDescription verifies each index entry
// has non-empty name and description fields.
func TestCompileSkillsIndex_HasNameAndDescription(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	os.MkdirAll(skillsDir, 0o755)

	err := CompileSkillsIndex(dir)
	if err != nil {
		t.Fatalf("CompileSkillsIndex: %v", err)
	}

	indexPath := filepath.Join(dir, ".claude", "skills", "compound", "skills_index.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("read index: %v", err)
	}

	var index SkillsIndex
	json.Unmarshal(data, &index)

	for _, s := range index.Skills {
		if s.Name == "" {
			t.Errorf("skill %s: empty name", s.Dir)
		}
		if s.Description == "" {
			t.Errorf("skill %s: empty description", s.Dir)
		}
	}
}
