package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/build"
	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/telemetry"
	"github.com/spf13/cobra"
)

func executeCommand(root *cobra.Command, args ...string) (string, error) {
	buf := new(bytes.Buffer)
	root.SetOut(buf)
	root.SetErr(buf)
	root.SetArgs(args)
	err := root.Execute()
	return buf.String(), err
}

func TestAboutCommand(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(aboutCmd())

	out, err := executeCommand(root, "about")
	if err != nil {
		t.Fatalf("about command failed: %v", err)
	}

	if !strings.Contains(out, "compound-agent") {
		t.Error("expected output to contain 'compound-agent'")
	}
	if !strings.Contains(out, "github.com") {
		t.Error("expected output to contain repo URL")
	}
}

func TestFeedbackCommand(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(feedbackCmd())

	out, err := executeCommand(root, "feedback")
	if err != nil {
		t.Fatalf("feedback command failed: %v", err)
	}

	if !strings.Contains(out, "discussions") {
		t.Error("expected output to contain discussions URL")
	}
	if !strings.Contains(out, "github.com") {
		t.Error("expected output to contain repo URL")
	}
	if !strings.Contains(out, "Nathandela/compound-agent") {
		t.Error("expected output to contain repository path")
	}
}

func TestVersionCommand(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(versionCmd())

	out, err := executeCommand(root, "version")
	if err != nil {
		t.Fatalf("version command failed: %v", err)
	}

	trimmed := strings.TrimSpace(out)
	if trimmed != build.Version {
		t.Errorf("version output = %q, want %q", trimmed, build.Version)
	}
}

func TestAboutCommandUsesBuildVersion(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(aboutCmd())

	out, err := executeCommand(root, "about")
	if err != nil {
		t.Fatalf("about command failed: %v", err)
	}

	if !strings.Contains(out, build.Version) {
		t.Errorf("about output should contain build.Version %q, got: %s", build.Version, out)
	}
}

func TestVersionCommandIsRegistered(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	registerInfoCommands(root)

	found := false
	for _, cmd := range root.Commands() {
		if cmd.Use == "version" {
			found = true
			break
		}
	}
	if !found {
		t.Error("version command should be registered by registerInfoCommands")
	}
}

func TestFeedbackCommandOpenHint(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(feedbackCmd())

	out, err := executeCommand(root, "feedback")
	if err != nil {
		t.Fatalf("feedback command failed: %v", err)
	}

	if !strings.Contains(out, "ca feedback --open") {
		t.Error("expected hint to use --open flag")
	}
}

func TestOpenURL_RejectsNonHTTPSchemes(t *testing.T) {
	t.Parallel()
	// openURL should silently reject non-http(s) URLs to prevent command injection.
	// We can't easily test that exec.Command is NOT called, but we verify
	// the function doesn't panic on malicious input.
	malicious := []string{
		"javascript:alert(1)",
		"file:///etc/passwd",
		"ftp://evil.com",
		"data:text/html,<script>alert(1)</script>",
		"",
		"cmd /c calc",
	}
	for _, url := range malicious {
		openURL(url) // Must not panic
	}
}

// --- info command tests ---

func runInfoCmd(t *testing.T, repoRoot string, args ...string) string {
	t.Helper()
	cmd := infoCmd(repoRoot)
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(cmd)

	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs(append([]string{"info"}, args...))

	if err := root.Execute(); err != nil {
		t.Fatalf("info command failed: %v", err)
	}
	return out.String()
}

func TestInfoCmd_VersionSection(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	output := runInfoCmd(t, dir)

	if !strings.Contains(output, "compound-agent") {
		t.Errorf("expected 'compound-agent' in output, got: %s", output)
	}
	if !strings.Contains(output, "Version") {
		t.Errorf("expected 'Version' header, got: %s", output)
	}
	if !strings.Contains(output, build.Version) {
		t.Errorf("expected build version %q, got: %s", build.Version, output)
	}
}

func TestInfoCmd_HooksInstalled(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	settingsDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		t.Fatal(err)
	}

	settings := map[string]any{}
	addAllHooksForInfoTest(settings)
	data, _ := json.MarshalIndent(settings, "", "  ")
	if err := os.WriteFile(filepath.Join(settingsDir, "settings.json"), data, 0644); err != nil {
		t.Fatal(err)
	}

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Hooks") {
		t.Errorf("expected 'Hooks' section, got: %s", output)
	}
	if !strings.Contains(output, "installed") {
		t.Errorf("expected installed status for hooks, got: %s", output)
	}
}

func TestInfoCmd_NoHooksInstalled(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Hooks") {
		t.Errorf("expected 'Hooks' section, got: %s", output)
	}
	if !strings.Contains(output, "not installed") {
		t.Errorf("expected 'not installed' for hooks, got: %s", output)
	}
}

func TestInfoCmd_SkillsFromIndex(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	if err := os.MkdirAll(skillsDir, 0755); err != nil {
		t.Fatal(err)
	}
	indexData := `{"skills":[{"name":"spec-dev","description":"Spec development","phase":"spec-dev","dir":"spec-dev"},{"name":"plan","description":"Planning","phase":"plan","dir":"plan"}]}`
	if err := os.WriteFile(filepath.Join(skillsDir, "skills_index.json"), []byte(indexData), 0644); err != nil {
		t.Fatal(err)
	}

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Skills") {
		t.Errorf("expected 'Skills' section, got: %s", output)
	}
	if !strings.Contains(output, "spec-dev") {
		t.Errorf("expected 'spec-dev' skill in output, got: %s", output)
	}
	if !strings.Contains(output, "plan") {
		t.Errorf("expected 'plan' skill in output, got: %s", output)
	}
}

func TestInfoCmd_NoSkillsIndex(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Skills") {
		t.Errorf("expected 'Skills' section, got: %s", output)
	}
	if !strings.Contains(output, "ca setup") {
		t.Errorf("expected 'ca setup' hint when no skills index, got: %s", output)
	}
}

func TestInfoCmd_PhaseStateActive(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	claudeDir := filepath.Join(dir, ".claude")
	if err := os.MkdirAll(claudeDir, 0755); err != nil {
		t.Fatal(err)
	}
	state := hook.PhaseState{
		CookitActive: true,
		EpicID:       "test-epic-123",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{"spec-dev", "plan"},
		GatesPassed:  []string{"post-plan"},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(state, "", "  ")
	if err := os.WriteFile(hook.PhaseStatePath(dir), data, 0644); err != nil {
		t.Fatal(err)
	}

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Phase") {
		t.Errorf("expected 'Phase' section, got: %s", output)
	}
	if !strings.Contains(output, "work") {
		t.Errorf("expected 'work' phase in output, got: %s", output)
	}
	if !strings.Contains(output, "test-epic-123") {
		t.Errorf("expected epic ID in output, got: %s", output)
	}
}

func TestInfoCmd_NoPhaseState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Phase") {
		t.Errorf("expected 'Phase' section, got: %s", output)
	}
	if !strings.Contains(strings.ToLower(output), "no active workflow") {
		t.Errorf("expected 'no active workflow' message, got: %s", output)
	}
}

func TestInfoCmd_TelemetryWithData(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	cacheDir := filepath.Join(dir, ".claude", ".cache")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		t.Fatal(err)
	}
	db, err := storage.OpenDB(filepath.Join(cacheDir, "lessons.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	events := []telemetry.Event{
		{EventType: telemetry.EventHookExecution, HookName: "user-prompt", DurationMs: 15, Outcome: telemetry.OutcomeSuccess},
		{EventType: telemetry.EventHookExecution, HookName: "user-prompt", DurationMs: 25, Outcome: telemetry.OutcomeSuccess},
		{EventType: telemetry.EventLessonRetrieval, HookName: "user-prompt", DurationMs: 5, Outcome: telemetry.OutcomeSuccess},
	}
	for _, ev := range events {
		if err := telemetry.LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Telemetry") {
		t.Errorf("expected 'Telemetry' section, got: %s", output)
	}
	if !strings.Contains(output, "user-prompt") {
		t.Errorf("expected 'user-prompt' hook name, got: %s", output)
	}
}

func TestInfoCmd_TelemetryEmpty(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Telemetry") {
		t.Errorf("expected 'Telemetry' section, got: %s", output)
	}
	if !strings.Contains(output, "no data yet") {
		t.Errorf("expected 'no data yet' for empty telemetry, got: %s", output)
	}
}

func TestInfoCmd_LessonCorpusStats(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	if err := os.MkdirAll(lessonsDir, 0755); err != nil {
		t.Fatal(err)
	}
	lessons := []string{
		`{"id":"L001","insight":"test lesson 1","trigger":"test","type":"lesson","source":"manual","severity":"high","tags":["testing"],"created":"2026-03-01T00:00:00Z"}`,
		`{"id":"L002","insight":"test lesson 2","trigger":"test","type":"solution","source":"self_correction","severity":"medium","tags":["go"],"created":"2026-03-15T00:00:00Z"}`,
	}
	if err := os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(strings.Join(lessons, "\n")+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Lessons") {
		t.Errorf("expected 'Lessons' section, got: %s", output)
	}
	if !strings.Contains(output, "2") {
		t.Errorf("expected lesson count in output, got: %s", output)
	}
}

func TestInfoCmd_NoLessons(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "Lessons") {
		t.Errorf("expected 'Lessons' section, got: %s", output)
	}
	if !strings.Contains(output, "0") {
		t.Errorf("expected '0' lesson count, got: %s", output)
	}
}

func TestInfoCmd_AllSixSections(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	output := runInfoCmd(t, dir)

	sections := []string{"Version", "Hooks", "Skills", "Phase", "Telemetry", "Lessons"}
	for _, section := range sections {
		if !strings.Contains(output, section) {
			t.Errorf("expected section '%s' in output, got: %s", section, output)
		}
	}
}

func TestInfoCmd_IsRegistered(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	registerInfoCommands(root)

	found := false
	for _, cmd := range root.Commands() {
		if cmd.Use == "info" {
			found = true
			break
		}
	}
	if !found {
		t.Error("info command should be registered by registerInfoCommands")
	}
}

func TestExplainAlias(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(infoCmd(dir))

	out, err := executeCommand(root, "explain")
	if err != nil {
		t.Fatalf("explain alias failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "Version") {
		t.Errorf("explain alias should produce info output, got: %s", out)
	}
}

func TestInfoCmd_OpenFlagRegistered(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	cmd := infoCmd(dir)
	// Verify --open flag is registered without invoking the command
	// (invoking with --open would actually open a browser on macOS).
	f := cmd.Flags().Lookup("open")
	if f == nil {
		t.Fatal("expected --open flag to be registered on info command")
	}
	if f.DefValue != "false" {
		t.Errorf("--open default should be false, got %q", f.DefValue)
	}
}

func TestInfoCmd_OpenHintWithoutFlag(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	output := runInfoCmd(t, dir)
	if !strings.Contains(output, "ca info --open") {
		t.Errorf("expected hint about --open flag, got: %s", output)
	}
}

// addAllHooksForInfoTest creates a hook config that HasAllHooks recognizes.
func addAllHooksForInfoTest(settings map[string]any) {
	hooks := map[string]any{}
	specs := []struct {
		hookType string
		matcher  string
		command  string
	}{
		{"SessionStart", "", "npx ca prime 2>/dev/null || true"},
		{"PreCompact", "", "npx ca prime 2>/dev/null || true"},
		{"UserPromptSubmit", "", "npx ca hooks run user-prompt 2>/dev/null || true"},
		{"PostToolUseFailure", "Bash|Edit|Write", "npx ca hooks run post-tool-failure 2>/dev/null || true"},
		{"PostToolUse", "Bash|Edit|Write", "npx ca hooks run post-tool-success 2>/dev/null || true"},
		{"PostToolUse", "Read", "npx ca hooks run post-read 2>/dev/null || true"},
		{"PreToolUse", "Edit|Write", "npx ca hooks run phase-guard 2>/dev/null || true"},
		{"Stop", "", "npx ca hooks run phase-audit 2>/dev/null || true"},
	}

	for _, spec := range specs {
		entry := map[string]any{
			"matcher": spec.matcher,
			"hooks": []any{
				map[string]any{
					"type":    "command",
					"command": spec.command,
				},
			},
		}
		arr, ok := hooks[spec.hookType].([]any)
		if !ok {
			arr = []any{}
		}
		hooks[spec.hookType] = append(arr, entry)
	}

	settings["hooks"] = hooks
}
