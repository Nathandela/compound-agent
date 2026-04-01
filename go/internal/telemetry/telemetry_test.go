package telemetry

import (
	"database/sql"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	return db
}

func TestHashQuery(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		query string
	}{
		{"non-empty", "SELECT * FROM users WHERE id = 42"},
		{"empty", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := HashQuery(tt.query)
			if tt.query == "" {
				if h != "" {
					t.Errorf("HashQuery(%q) = %q, want empty", tt.query, h)
				}
				return
			}
			// Must be deterministic
			if h != HashQuery(tt.query) {
				t.Error("HashQuery is not deterministic")
			}
			// Must not contain raw query
			if h == tt.query {
				t.Error("HashQuery returned raw query")
			}
			// Must be truncated (16 hex chars)
			if len(h) != 16 {
				t.Errorf("HashQuery length = %d, want 16", len(h))
			}
		})
	}
}

func TestLogEvent(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	ev := Event{
		EventType:  EventHookExecution,
		HookName:   "user-prompt",
		Phase:      "retrieve",
		DurationMs: 42,
		Outcome:    OutcomeSuccess,
		QueryHash:  HashQuery("test query"),
		Metadata:   map[string]interface{}{"key": "val"},
	}
	err := LogEvent(db, ev)
	if err != nil {
		t.Fatalf("LogEvent: %v", err)
	}

	// Verify row was inserted
	var eventType, hookName, phase, queryHash string
	var durationMs int64
	var success int
	err = db.QueryRow("SELECT event_type, hook_name, phase, duration_ms, success, query_hash FROM telemetry WHERE id = 1").
		Scan(&eventType, &hookName, &phase, &durationMs, &success, &queryHash)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if eventType != string(EventHookExecution) {
		t.Errorf("event_type = %q, want %q", eventType, EventHookExecution)
	}
	if hookName != "user-prompt" {
		t.Errorf("hook_name = %q, want %q", hookName, "user-prompt")
	}
	if durationMs != 42 {
		t.Errorf("duration_ms = %d, want 42", durationMs)
	}
	if success != 1 {
		t.Errorf("success = %d, want 1", success)
	}
	if queryHash == "" {
		t.Error("query_hash should not be empty")
	}
}

func TestLogEvent_OutcomeMapping(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	tests := []struct {
		outcome Outcome
		wantOK  int
	}{
		{OutcomeSuccess, 1},
		{OutcomeError, 0},
		{OutcomeTimeout, 0},
		{OutcomeEmpty, 1},
	}
	for _, tt := range tests {
		ev := Event{EventType: EventHookExecution, HookName: "test", Outcome: tt.outcome}
		if err := LogEvent(db, ev); err != nil {
			t.Fatalf("LogEvent(%s): %v", tt.outcome, err)
		}
	}

	rows, err := db.Query("SELECT success FROM telemetry ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	i := 0
	for rows.Next() {
		var success int
		if err := rows.Scan(&success); err != nil {
			t.Fatal(err)
		}
		if success != tests[i].wantOK {
			t.Errorf("outcome %s: success = %d, want %d", tests[i].outcome, success, tests[i].wantOK)
		}
		i++
	}
}

func TestLogEvent_TimestampIsSet(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	before := time.Now().UTC()
	ev := Event{EventType: EventHookExecution, HookName: "test"}
	if err := LogEvent(db, ev); err != nil {
		t.Fatal(err)
	}

	var ts string
	if err := db.QueryRow("SELECT timestamp FROM telemetry WHERE id = 1").Scan(&ts); err != nil {
		t.Fatal(err)
	}
	parsed, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		t.Fatalf("parse timestamp: %v", err)
	}
	if parsed.Before(before.Add(-time.Second)) {
		t.Error("timestamp is too old")
	}
}

func TestPruneEvents_UnderLimit(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	// Insert 5 rows
	for i := 0; i < 5; i++ {
		ev := Event{EventType: EventHookExecution, HookName: "test"}
		if err := LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}

	pruned, err := PruneEvents(db, 100000)
	if err != nil {
		t.Fatal(err)
	}
	if pruned != 0 {
		t.Errorf("pruned = %d, want 0 (under limit)", pruned)
	}
}

func TestPruneEvents_OverLimit(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	// Insert 15 rows, set limit to 10
	for i := 0; i < 15; i++ {
		ev := Event{EventType: EventHookExecution, HookName: "test"}
		if err := LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}

	pruned, err := PruneEvents(db, 10)
	if err != nil {
		t.Fatal(err)
	}
	if pruned != 5 {
		t.Errorf("pruned = %d, want 5", pruned)
	}

	// Verify only 10 remain
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 10 {
		t.Errorf("remaining rows = %d, want 10", count)
	}
}

func TestPruneEvents_Atomic(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	// Insert 20 rows
	for i := 0; i < 20; i++ {
		ev := Event{EventType: EventHookExecution, HookName: "test"}
		if err := LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}

	// Prune to 10 — should delete exactly 10 oldest
	pruned, err := PruneEvents(db, 10)
	if err != nil {
		t.Fatal(err)
	}
	if pruned != 10 {
		t.Errorf("pruned = %d, want 10", pruned)
	}

	// Verify exactly 10 remain and they are the newest
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 10 {
		t.Errorf("remaining = %d, want 10", count)
	}

	// The remaining rows should have ids 11-20 (newest)
	var minID int
	if err := db.QueryRow("SELECT MIN(id) FROM telemetry").Scan(&minID); err != nil {
		t.Fatal(err)
	}
	if minID != 11 {
		t.Errorf("min remaining id = %d, want 11", minID)
	}
}

func TestQueryStats(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	// Insert some events
	events := []Event{
		{EventType: EventHookExecution, HookName: "user-prompt", DurationMs: 10, Outcome: OutcomeSuccess},
		{EventType: EventHookExecution, HookName: "user-prompt", DurationMs: 20, Outcome: OutcomeSuccess},
		{EventType: EventHookExecution, HookName: "post-tool-failure", DurationMs: 30, Outcome: OutcomeError},
		{EventType: EventLessonRetrieval, HookName: "user-prompt", DurationMs: 5, Outcome: OutcomeSuccess},
	}
	for _, ev := range events {
		if err := LogEvent(db, ev); err != nil {
			t.Fatal(err)
		}
	}

	stats, err := QueryStats(db)
	if err != nil {
		t.Fatalf("QueryStats: %v", err)
	}

	if stats.TotalEvents != 4 {
		t.Errorf("TotalEvents = %d, want 4", stats.TotalEvents)
	}
	if len(stats.HookStats) == 0 {
		t.Error("HookStats should not be empty")
	}
	// user-prompt should have avg 15ms ((10+20)/2 for hook_execution)
	found := false
	for _, hs := range stats.HookStats {
		if hs.HookName == "user-prompt" {
			found = true
			if hs.AvgDurationMs != 15.0 {
				t.Errorf("user-prompt avg = %.1f, want 15.0", hs.AvgDurationMs)
			}
			if hs.Count != 2 {
				t.Errorf("user-prompt count = %d, want 2", hs.Count)
			}
		}
	}
	if !found {
		t.Error("user-prompt not found in HookStats")
	}
	if stats.RetrievalCount != 1 {
		t.Errorf("RetrievalCount = %d, want 1", stats.RetrievalCount)
	}
}

func TestQueryStats_Empty(t *testing.T) {
	t.Parallel()
	db := openTestDB(t)
	defer db.Close()

	stats, err := QueryStats(db)
	if err != nil {
		t.Fatalf("QueryStats: %v", err)
	}
	if stats.TotalEvents != 0 {
		t.Errorf("TotalEvents = %d, want 0", stats.TotalEvents)
	}
}
