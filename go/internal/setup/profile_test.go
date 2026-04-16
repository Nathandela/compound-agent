package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- InitProfile validation ---

func TestInitRepo_ProfileInvalidErrorsBeforeFSChanges(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	_, err := InitRepo(dir, InitOptions{
		Profile:       "bogus",
		SkipHooks:     true,
		SkipTemplates: true,
	})
	if err == nil {
		t.Fatal("expected error for unknown profile, got nil")
	}
	if !strings.Contains(err.Error(), "profile") {
		t.Errorf("error should mention 'profile': %v", err)
	}
	// No filesystem changes: .claude should NOT exist
	if _, statErr := os.Stat(filepath.Join(dir, ".claude")); statErr == nil {
		t.Error("invalid profile must not create .claude/ before validation error")
	}
}

func TestInitRepo_ProfileDefaultIsFull(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	// Profile unset — should behave identically to ProfileFull.
	result, err := InitRepo(dir, InitOptions{SkipHooks: true})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}
	// Full install installs all phase skills (at least 5)
	if result.SkillsInstalled < 5 {
		t.Errorf("unset profile should default to full: got %d phase skills, want >=5", result.SkillsInstalled)
	}
	if result.CommandsInstalled < 5 {
		t.Errorf("unset profile should install all commands: got %d, want >=5", result.CommandsInstalled)
	}
}

// --- Profile: minimal ---

func TestInitRepo_ProfileMinimal_InstallsNoTemplates(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		Profile:   ProfileMinimal,
		SkipHooks: true,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}

	// Minimal: zero agents, zero commands, zero phase skills, zero role skills,
	// zero docs, zero research.
	if result.AgentsInstalled != 0 {
		t.Errorf("minimal: AgentsInstalled = %d, want 0", result.AgentsInstalled)
	}
	if result.CommandsInstalled != 0 {
		t.Errorf("minimal: CommandsInstalled = %d, want 0", result.CommandsInstalled)
	}
	if result.SkillsInstalled != 0 {
		t.Errorf("minimal: SkillsInstalled = %d, want 0", result.SkillsInstalled)
	}
	if result.RoleSkillsInstalled != 0 {
		t.Errorf("minimal: RoleSkillsInstalled = %d, want 0", result.RoleSkillsInstalled)
	}
	if result.DocsInstalled != 0 {
		t.Errorf("minimal: DocsInstalled = %d, want 0", result.DocsInstalled)
	}
	if result.ResearchInstalled != 0 {
		t.Errorf("minimal: ResearchInstalled = %d, want 0", result.ResearchInstalled)
	}

	// Minimal still installs lesson-capture skeleton: lessons dir + AGENTS.md + plugin.json
	if _, err := os.Stat(filepath.Join(dir, ".claude", "lessons", "index.jsonl")); err != nil {
		t.Errorf("minimal: lessons/index.jsonl missing: %v", err)
	}
	if !result.AgentsMdUpdated {
		t.Error("minimal: AGENTS.md should still be updated with lesson-capture section")
	}
	if !result.PluginCreated && !result.PluginUpdated {
		t.Error("minimal: plugin.json should be created or updated")
	}
}

func TestInitRepo_ProfileMinimal_InstallsOnlyPrimeAndUserPromptHooks(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	_, err := InitRepo(dir, InitOptions{
		Profile: ProfileMinimal,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}

	settings, err := ReadClaudeSettings(filepath.Join(dir, ".claude", "settings.json"))
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}

	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		t.Fatal("hooks map missing from settings.json")
	}

	// Must have prime in SessionStart + PreCompact, user-prompt in UserPromptSubmit.
	for _, required := range []string{"SessionStart", "PreCompact", "UserPromptSubmit"} {
		arr, ok := hooks[required].([]any)
		if !ok || len(arr) == 0 {
			t.Errorf("minimal: required hook type %q missing or empty", required)
		}
	}

	// Must NOT have phase-related hook types (empty or missing is both fine).
	for _, forbidden := range []string{"PreToolUse", "Stop", "PostToolUseFailure"} {
		arr, ok := hooks[forbidden].([]any)
		if ok && len(arr) > 0 {
			// Inspect: are any entries compound-agent-owned?
			for _, entry := range arr {
				if isCompoundHookEntry(entry) {
					t.Errorf("minimal: forbidden hook type %q has compound-agent entry: %v", forbidden, entry)
				}
			}
		}
	}
}

// --- Profile: workflow (everything except heavy research tree) ---

func TestInitRepo_ProfileWorkflow_InstallsSkillsButNoResearch(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		Profile:   ProfileWorkflow,
		SkipHooks: true,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}
	if result.SkillsInstalled < 5 {
		t.Errorf("workflow: SkillsInstalled = %d, want >=5", result.SkillsInstalled)
	}
	if result.CommandsInstalled < 5 {
		t.Errorf("workflow: CommandsInstalled = %d, want >=5", result.CommandsInstalled)
	}
	if result.ResearchInstalled != 0 {
		t.Errorf("workflow: ResearchInstalled = %d, want 0 (research is full-only)", result.ResearchInstalled)
	}
	// The research directory must not exist.
	if _, statErr := os.Stat(filepath.Join(dir, "docs", "compound", "research")); statErr == nil {
		t.Error("workflow: docs/compound/research/ should NOT exist")
	}
}

// --- Profile: full (backward compatibility guard) ---

func TestInitRepo_ProfileFull_InstallsEverything(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		Profile:   ProfileFull,
		SkipHooks: true,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}
	if result.ResearchInstalled == 0 {
		t.Error("full: ResearchInstalled = 0, want > 0")
	}
	if result.SkillsInstalled < 5 {
		t.Errorf("full: SkillsInstalled = %d, want >=5", result.SkillsInstalled)
	}
}

// --- Downgrade protection ---

func TestInitRepo_Downgrade_FullToMinimal_RequiresConfirm(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	// Seed: full install.
	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Profile: ProfileFull}); err != nil {
		t.Fatalf("seed InitRepo(full) failed: %v", err)
	}
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	before, _ := os.ReadDir(skillsDir)
	if len(before) == 0 {
		t.Fatal("seed: expected phase skills present after full install")
	}

	// Downgrade: minimal without ConfirmPrune → should error, templates preserved.
	_, err := InitRepo(dir, InitOptions{SkipHooks: true, Profile: ProfileMinimal})
	if err == nil {
		t.Fatal("downgrade from full to minimal must require --confirm-prune, got nil error")
	}
	if !strings.Contains(err.Error(), "confirm-prune") {
		t.Errorf("error should mention --confirm-prune: %v", err)
	}
	after, _ := os.ReadDir(skillsDir)
	if len(after) != len(before) {
		t.Errorf("templates should NOT be pruned without ConfirmPrune: before=%d after=%d",
			len(before), len(after))
	}
}

func TestInitRepo_Downgrade_WithConfirmPrunesTemplates(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Profile: ProfileFull}); err != nil {
		t.Fatalf("seed InitRepo(full) failed: %v", err)
	}
	// Downgrade with ConfirmPrune=true should succeed and prune.
	result, err := InitRepo(dir, InitOptions{
		SkipHooks:    true,
		Profile:      ProfileMinimal,
		ConfirmPrune: true,
	})
	if err != nil {
		t.Fatalf("downgrade with ConfirmPrune failed: %v", err)
	}
	if result.TemplatesPruned == 0 {
		t.Error("downgrade with ConfirmPrune should report pruned templates, got 0")
	}
	// Phase skills directory should be pruned or empty of phase content.
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	// Accept either: directory missing, directory empty, or directory with only preserved entries.
	entries, _ := os.ReadDir(skillsDir)
	for _, e := range entries {
		if e.IsDir() && e.Name() != "agents" {
			t.Errorf("unexpected phase skill dir remaining: %s", e.Name())
		}
	}
}

// --- Dry-run semantics: invalid profile ---

func TestValidateProfile(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in      string
		wantErr bool
	}{
		{"", false}, // empty = default = full
		{"minimal", false},
		{"workflow", false},
		{"full", false},
		{"MINIMAL", true}, // case-sensitive
		{"bogus", true},
		{"none", true},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.in, func(t *testing.T) {
			t.Parallel()
			err := validateProfile(InitProfile(tc.in))
			if tc.wantErr && err == nil {
				t.Errorf("validateProfile(%q): want error, got nil", tc.in)
			}
			if !tc.wantErr && err != nil {
				t.Errorf("validateProfile(%q): unexpected error: %v", tc.in, err)
			}
		})
	}
}

// --- Hook spec profile membership ---

func TestManagedHookSpecs_HaveValidProfiles(t *testing.T) {
	t.Parallel()
	for i, spec := range managedHookSpecs {
		if err := validateProfile(spec.profile); err != nil {
			t.Errorf("managedHookSpecs[%d] (%s): invalid profile %q: %v",
				i, spec.hookType, spec.profile, err)
		}
	}
}

func TestHookArrayJSON_MinimalHasOnlyTwoCategories(t *testing.T) {
	// Sanity check: assert that after minimal init, the serialized settings.json
	// on disk contains prime + user-prompt markers but not phase-guard / phase-audit.
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	if _, err := InitRepo(dir, InitOptions{Profile: ProfileMinimal}); err != nil {
		t.Fatalf("InitRepo(minimal): %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, ".claude", "settings.json"))
	if err != nil {
		t.Fatalf("read settings.json: %v", err)
	}
	s := string(data)

	for _, want := range []string{"prime", "user-prompt"} {
		if !strings.Contains(s, want) {
			t.Errorf("minimal settings.json missing expected marker %q", want)
		}
	}
	for _, forbid := range []string{"phase-guard", "phase-audit", "post-tool-failure", "post-read", "post-tool-success"} {
		if strings.Contains(s, forbid) {
			t.Errorf("minimal settings.json contains forbidden marker %q", forbid)
		}
	}

	// Sanity check: settings.json is parseable JSON.
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Errorf("settings.json not valid JSON: %v", err)
	}
}
