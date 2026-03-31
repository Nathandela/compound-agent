package cli

import (
	"bytes"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/telemetry"
	"github.com/spf13/cobra"
)

func runHealthCmd(t *testing.T, dbPath string, args ...string) string {
	t.Helper()
	cmd := healthCmd(dbPath)
	rootCmd := &cobra.Command{Use: "ca"}
	rootCmd.AddCommand(cmd)

	var out bytes.Buffer
	rootCmd.SetOut(&out)
	rootCmd.SetErr(&out)
	rootCmd.SetArgs(append([]string{"health"}, args...))

	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("health command failed: %v", err)
	}
	return out.String()
}

func TestHealthCmd_Empty(t *testing.T) {
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	output := runHealthCmd(t, ":memory:")
	if !strings.Contains(output, "No telemetry") {
		t.Errorf("expected 'No telemetry' message, got: %s", output)
	}
}

func TestHealthCmd_WithEvents(t *testing.T) {
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}

	events := []telemetry.Event{
		{EventType: telemetry.EventHookExecution, HookName: "user-prompt", DurationMs: 10, Outcome: telemetry.OutcomeSuccess},
		{EventType: telemetry.EventHookExecution, HookName: "user-prompt", DurationMs: 20, Outcome: telemetry.OutcomeSuccess},
		{EventType: telemetry.EventHookExecution, HookName: "post-tool-failure", DurationMs: 30, Outcome: telemetry.OutcomeError},
		{EventType: telemetry.EventLessonRetrieval, HookName: "user-prompt", DurationMs: 5, Outcome: telemetry.OutcomeSuccess},
	}
	for _, ev := range events {
		if err := telemetry.LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()

	// Use a temp file db so healthCmd can open it
	dir := t.TempDir()
	dbPath := dir + "/test.sqlite"
	db2, err := storage.OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range events {
		if err := telemetry.LogEvent(db2, ev); err != nil {
			t.Fatal(err)
		}
	}
	db2.Close()

	output := runHealthCmd(t, dbPath)
	if !strings.Contains(output, "Total events") {
		t.Errorf("expected 'Total events' in output, got: %s", output)
	}
	if !strings.Contains(output, "user-prompt") {
		t.Errorf("expected 'user-prompt' in output, got: %s", output)
	}
	if !strings.Contains(output, "Lesson retrievals") {
		t.Errorf("expected 'Lesson retrievals' in output, got: %s", output)
	}
}

func TestHealthCmd_JSON(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/test.sqlite"
	db, err := storage.OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	ev := telemetry.Event{EventType: telemetry.EventHookExecution, HookName: "test", DurationMs: 5, Outcome: telemetry.OutcomeSuccess}
	if err := telemetry.LogEvent(db, ev); err != nil {
		t.Fatal(err)
	}
	db.Close()

	output := runHealthCmd(t, dbPath, "--json")
	if !strings.HasPrefix(strings.TrimSpace(output), "{") {
		t.Errorf("expected JSON output, got: %s", output)
	}
	if !strings.Contains(output, "totalEvents") {
		t.Errorf("expected 'totalEvents' in JSON, got: %s", output)
	}
}
