package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/nathandelacretaz/compound-agent/internal/setup"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/telemetry"
)

// --- E6-T2: Skill index generation validates 12 skills ---

// TestSkillIndex_Exactly12Skills verifies that CompileSkillsIndex produces
// exactly 12 skills, matching the full embedded template set.
func TestSkillIndex_Exactly12Skills(t *testing.T) {
	dir := t.TempDir()
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	if err := os.MkdirAll(skillsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := setup.CompileSkillsIndex(dir); err != nil {
		t.Fatal(err)
	}

	indexPath := filepath.Join(skillsDir, "skills_index.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatal(err)
	}

	var index setup.SkillsIndex
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}

	if len(index.Skills) != 12 {
		names := make([]string, len(index.Skills))
		for i, s := range index.Skills {
			names[i] = s.Dir
		}
		t.Errorf("got %d skills, want 12: %v", len(index.Skills), names)
	}

	// Every entry must have name and description
	for _, s := range index.Skills {
		if s.Name == "" {
			t.Errorf("skill %s: empty name", s.Dir)
		}
		if s.Description == "" {
			t.Errorf("skill %s: empty description", s.Dir)
		}
		if s.Dir == "" {
			t.Errorf("skill with name %q: empty dir", s.Name)
		}
	}
}

// --- E6-T3: Phase-guard old/new format compatibility ---

// TestPhaseGuard_LegacyLfgActiveField verifies that phase-guard correctly
// handles the legacy "lfg_active" field name from older versions.
func TestPhaseGuard_LegacyLfgActiveField(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Write state using legacy "lfg_active" field
	legacyState := map[string]interface{}{
		"lfg_active":    true,
		"epic_id":       "test-legacy",
		"current_phase": "work",
		"phase_index":   3,
		"skills_read":   []string{".claude/skills/compound/work/SKILL.md"},
		"gates_passed":  []string{},
		"started_at":    time.Now().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(legacyState, "", "  ")
	if err := os.WriteFile(hook.PhaseStatePath(dir), data, 0o644); err != nil {
		t.Fatal(err)
	}

	state := hook.GetPhaseState(dir)
	if state == nil {
		t.Fatal("expected non-nil state from legacy lfg_active format")
	}
	if !state.CookitActive {
		t.Error("legacy lfg_active should be migrated to CookitActive=true")
	}
	if state.CurrentPhase != "work" {
		t.Errorf("phase = %q, want work", state.CurrentPhase)
	}

	// Phase guard should work with migrated state
	result := hook.ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("phase guard should allow edit when skill was read (legacy format)")
	}
}

// TestPhaseGuard_NewCookitActiveField verifies the current "cookit_active" field works.
func TestPhaseGuard_NewCookitActiveField(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatal(err)
	}

	state := hook.PhaseState{
		CookitActive: true,
		EpicID:       "test-new",
		CurrentPhase: "plan",
		PhaseIndex:   2,
		SkillsRead:   []string{".claude/skills/compound/plan/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(state, "", "  ")
	if err := os.WriteFile(hook.PhaseStatePath(dir), data, 0o644); err != nil {
		t.Fatal(err)
	}

	result := hook.ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("phase guard should allow edit when skill was read (new format)")
	}
}

// TestPhaseGuard_AllPhaseSkillPaths verifies that each cook-it phase resolves
// to the correct canonical skill path format.
func TestPhaseGuard_AllPhaseSkillPaths(t *testing.T) {
	phases := []string{"spec-dev", "plan", "work", "review", "compound"}
	for _, phase := range phases {
		got := hook.ResolveSkillPath(phase)
		want := ".claude/skills/compound/" + phase + "/SKILL.md"
		if got != want {
			t.Errorf("ResolveSkillPath(%q) = %q, want %q", phase, got, want)
		}
	}
}

// --- E6-T4: ca info reads all 6 data sources ---

// TestInfoCmd_CrossEpic_AllDataSources creates all 6 data sources and verifies
// that `ca info` reads from each one. This is the cross-epic contract test.
func TestInfoCmd_CrossEpic_AllDataSources(t *testing.T) {
	dir := t.TempDir()

	// Source 1: settings.json (hooks)
	claudeDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	settings := map[string]any{}
	addAllHooksForInfoTest(settings)
	settingsData, _ := json.MarshalIndent(settings, "", "  ")
	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), settingsData, 0644); err != nil {
		t.Fatal(err)
	}

	// Source 2: skills_index.json
	skillsDir := filepath.Join(claudeDir, "skills", "compound")
	if err := os.MkdirAll(skillsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := setup.CompileSkillsIndex(dir); err != nil {
		t.Fatal(err)
	}

	// Source 3: phase state
	state := hook.PhaseState{
		CookitActive: true,
		EpicID:       "cross-epic-test",
		CurrentPhase: "review",
		PhaseIndex:   4,
		SkillsRead:   []string{".claude/skills/compound/review/SKILL.md"},
		GatesPassed:  []string{"post-plan", "gate-3"},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	stateData, _ := json.MarshalIndent(state, "", "  ")
	if err := os.WriteFile(hook.PhaseStatePath(dir), stateData, 0o644); err != nil {
		t.Fatal(err)
	}

	// Source 4: telemetry DB
	cacheDir := filepath.Join(claudeDir, ".cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := storage.OpenDB(filepath.Join(cacheDir, "lessons.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	events := []telemetry.Event{
		{EventType: telemetry.EventHookExecution, HookName: "user-prompt", Phase: "review", DurationMs: 12, Outcome: telemetry.OutcomeSuccess},
		{EventType: telemetry.EventHookExecution, HookName: "post-tool-failure", DurationMs: 8, Outcome: telemetry.OutcomeSuccess},
		{EventType: telemetry.EventLessonRetrieval, HookName: "user-prompt", DurationMs: 3, Outcome: telemetry.OutcomeSuccess},
	}
	for _, ev := range events {
		if err := telemetry.LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()

	// Source 5: lessons JSONL
	lessonsDir := filepath.Join(claudeDir, "lessons")
	if err := os.MkdirAll(lessonsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	lessons := []string{
		`{"id":"L001","insight":"lesson one","trigger":"test","type":"lesson","source":"manual","severity":"high","tags":["go"],"created":"2026-03-01T00:00:00Z"}`,
		`{"id":"L002","insight":"lesson two","trigger":"test","type":"solution","source":"self_correction","severity":"medium","tags":["testing"],"created":"2026-03-15T00:00:00Z"}`,
		`{"id":"L003","insight":"lesson three","trigger":"test","type":"lesson","source":"manual","severity":"low","tags":["rust"],"created":"2026-03-20T00:00:00Z"}`,
	}
	if err := os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(strings.Join(lessons, "\n")+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Run ca info
	output := runInfoCmd(t, dir)

	// Verify all 6 sections
	checks := []struct {
		section string
		content string
	}{
		{"Version", "compound-agent"},
		{"Hooks", "installed"},
		{"Skills", "12 skill(s)"},
		{"Phase", "review"},
		{"Phase", "cross-epic-test"},
		{"Telemetry", "user-prompt"},
		{"Telemetry", "Retrievals: 1"},
		{"Lessons", "3"},
	}

	for _, c := range checks {
		if !strings.Contains(output, c.content) {
			t.Errorf("section %s: expected %q in output, got:\n%s", c.section, c.content, output)
		}
	}
}

// TestInfoCmd_TelemetryReadsPhaseField verifies the cross-epic contract:
// telemetry events include the phase field (Epic 3 → Epic 2 contract).
func TestInfoCmd_TelemetryReadsPhaseField(t *testing.T) {
	dir := t.TempDir()
	cacheDir := filepath.Join(dir, ".claude", ".cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatal(err)
	}

	db, err := storage.OpenDB(filepath.Join(cacheDir, "lessons.sqlite"))
	if err != nil {
		t.Fatal(err)
	}

	ev := telemetry.Event{
		EventType:  telemetry.EventHookExecution,
		HookName:   "user-prompt",
		Phase:      "work",
		DurationMs: 15,
		Outcome:    telemetry.OutcomeSuccess,
	}
	if err := telemetry.LogEvent(db, ev); err != nil {
		t.Fatal(err)
	}

	// Verify phase was stored
	var phase string
	if err := db.QueryRow("SELECT phase FROM telemetry WHERE hook_name='user-prompt'").Scan(&phase); err != nil {
		t.Fatal(err)
	}
	if phase != "work" {
		t.Errorf("telemetry phase = %q, want 'work'", phase)
	}

	db.Close()
}

// --- E6-T7: Upgrade path setup idempotency ---

// TestUpgradePath_SetupIdempotent verifies that running InitRepo twice
// doesn't destroy existing data or corrupt configuration.
func TestUpgradePath_SetupIdempotent(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	opts := setup.InitOptions{
		SkipHooks: true, // Don't need real binary path for this test
	}

	// First setup
	result1, err := setup.InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("first init: %v", err)
	}
	if !result1.Success {
		t.Fatal("first init should succeed")
	}

	// Add JSONL lessons between runs (simulating normal usage)
	jsonlPath := filepath.Join(dir, ".claude", "lessons", "index.jsonl")
	lessonData := `{"id":"L001","type":"lesson","trigger":"test","insight":"preserve me","tags":["go"],"source":"manual","created":"2026-03-15T00:00:00Z"}` + "\n"
	if err := os.WriteFile(jsonlPath, []byte(lessonData), 0644); err != nil {
		t.Fatal(err)
	}

	// Second setup (upgrade)
	result2, err := setup.InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("second init: %v", err)
	}
	if !result2.Success {
		t.Fatal("second init should succeed")
	}

	// Verify JSONL lessons are preserved
	afterData, err := os.ReadFile(jsonlPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(afterData) != lessonData {
		t.Error("JSONL lessons were modified during second init")
	}

	// Verify directory structure is intact
	dirs := []string{
		filepath.Join(dir, ".claude"),
		filepath.Join(dir, ".claude", "lessons"),
		filepath.Join(dir, ".claude", ".cache"),
		filepath.Join(dir, ".claude", "agents", "compound"),
		filepath.Join(dir, ".claude", "commands", "compound"),
		filepath.Join(dir, ".claude", "skills", "compound"),
	}
	for _, d := range dirs {
		if _, err := os.Stat(d); os.IsNotExist(err) {
			t.Errorf("directory missing after second init: %s", d)
		}
	}
}

// TestUpgradePath_SetupPreservesSettings verifies that existing settings.json
// content is preserved during re-setup.
func TestUpgradePath_SetupPreservesSettings(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Pre-existing settings with custom content
	settings := map[string]any{
		"permissions": map[string]any{
			"allow": []string{"Read", "Write"},
		},
		"hooks": map[string]any{},
	}
	settingsData, _ := json.MarshalIndent(settings, "", "  ")
	settingsPath := filepath.Join(claudeDir, "settings.json")
	if err := os.WriteFile(settingsPath, settingsData, 0644); err != nil {
		t.Fatal(err)
	}

	// Run setup (with hooks enabled)
	opts := setup.InitOptions{
		BinaryPath: "/usr/local/bin/ca",
	}
	_, err := setup.InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	// Read updated settings
	updated, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil {
		t.Fatal(err)
	}

	// Hooks should be added
	if !setup.HasAllHooks(updated) {
		t.Error("hooks should be installed after setup")
	}

	// Original permissions should be preserved
	perms, ok := updated["permissions"]
	if !ok {
		t.Error("permissions section should be preserved")
	}
	permsMap, ok := perms.(map[string]any)
	if !ok {
		t.Fatal("permissions should be a map")
	}
	allow, ok := permsMap["allow"]
	if !ok {
		t.Error("permissions.allow should be preserved")
	}
	allowSlice, ok := allow.([]any)
	if !ok {
		t.Fatal("permissions.allow should be a slice")
	}
	if len(allowSlice) != 2 {
		t.Errorf("permissions.allow length = %d, want 2", len(allowSlice))
	}
}

// TestUpgradePath_SkillsIndexRegenerated verifies that skills_index.json
// is regenerated on re-setup (reflecting any template changes).
func TestUpgradePath_SkillsIndexRegenerated(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	opts := setup.InitOptions{SkipHooks: true}

	// First setup
	if _, err := setup.InitRepo(dir, opts); err != nil {
		t.Fatal(err)
	}

	indexPath := filepath.Join(dir, ".claude", "skills", "compound", "skills_index.json")

	// Corrupt the index
	if err := os.WriteFile(indexPath, []byte(`{"skills":[]}`), 0644); err != nil {
		t.Fatal(err)
	}

	// Re-run setup
	if _, err := setup.InitRepo(dir, opts); err != nil {
		t.Fatal(err)
	}

	// Index should be regenerated
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatal(err)
	}

	var index setup.SkillsIndex
	if err := json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}

	if len(index.Skills) < 10 {
		t.Errorf("skills index should be regenerated with all skills, got %d", len(index.Skills))
	}
}
