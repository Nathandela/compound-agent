package telemetry

import (
	"sync"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// TestConcurrentTelemetryLogging verifies that 10 parallel goroutines can log
// telemetry events simultaneously without SQLITE_LOCKED errors.
func TestConcurrentTelemetryLogging(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/lessons.sqlite"

	db, err := storage.OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	const goroutines = 10
	const eventsPerGoroutine = 50

	var wg sync.WaitGroup
	errs := make(chan error, goroutines*eventsPerGoroutine)

	wg.Add(goroutines)
	for g := 0; g < goroutines; g++ {
		go func(id int) {
			defer wg.Done()
			for i := 0; i < eventsPerGoroutine; i++ {
				ev := Event{
					EventType:  EventHookExecution,
					HookName:   "user-prompt",
					DurationMs: int64(i),
					Outcome:    OutcomeSuccess,
				}
				if err := LogEvent(db, ev); err != nil {
					errs <- err
				}
			}
		}(g)
	}

	wg.Wait()
	close(errs)

	var lockErrors []error
	for err := range errs {
		lockErrors = append(lockErrors, err)
	}

	if len(lockErrors) > 0 {
		t.Errorf("got %d errors during concurrent writes, want 0. First: %v", len(lockErrors), lockErrors[0])
	}

	// Verify all events were written
	var count int64
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry").Scan(&count); err != nil {
		t.Fatal(err)
	}
	expected := int64(goroutines * eventsPerGoroutine)
	if count != expected {
		t.Errorf("telemetry count = %d, want %d", count, expected)
	}
}

// TestConcurrentTelemetryLogging_MixedEventTypes verifies concurrent writes
// with different event types don't cause lock errors.
func TestConcurrentTelemetryLogging_MixedEventTypes(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/lessons.sqlite"

	db, err := storage.OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	const goroutines = 10

	var wg sync.WaitGroup
	errs := make(chan error, goroutines*20)

	wg.Add(goroutines)
	for g := 0; g < goroutines; g++ {
		go func(id int) {
			defer wg.Done()
			// Mix hook execution and lesson retrieval events
			for i := 0; i < 10; i++ {
				ev := Event{
					EventType:  EventHookExecution,
					HookName:   "post-tool-failure",
					DurationMs: 10,
					Outcome:    OutcomeSuccess,
				}
				if err := LogEvent(db, ev); err != nil {
					errs <- err
				}

				rev := Event{
					EventType: EventLessonRetrieval,
					HookName:  "user-prompt",
					QueryHash: HashQuery("test query"),
					Outcome:   OutcomeSuccess,
					Metadata:  map[string]interface{}{"lesson_id": "L001", "score": 0.85},
				}
				if err := LogEvent(db, rev); err != nil {
					errs <- err
				}
			}
		}(g)
	}

	wg.Wait()
	close(errs)

	var lockErrors []error
	for err := range errs {
		lockErrors = append(lockErrors, err)
	}

	if len(lockErrors) > 0 {
		t.Errorf("got %d errors during concurrent mixed writes, want 0. First: %v", len(lockErrors), lockErrors[0])
	}

	// Verify all events
	stats, err := QueryStats(db)
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalEvents != int64(goroutines*20) {
		t.Errorf("total events = %d, want %d", stats.TotalEvents, goroutines*20)
	}
}
