package hook

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// TestTelemetryOverhead_Under50ms verifies that the telemetry logging overhead
// (time spent on telemetry.LogEvent + PruneEvents) is under 50ms.
// This is NFR-1 from the integration verification epic.
func TestTelemetryOverhead_Under50ms(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/lessons.sqlite"

	db, err := storage.OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Warm up the DB connection
	var warmBuf bytes.Buffer
	RunHookWithTelemetry("pre-commit", strings.NewReader("{}"), &warmBuf, db)

	// Run the hook multiple times and measure overhead
	const iterations = 100
	var maxOverhead time.Duration

	for i := 0; i < iterations; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader("{}")

		// Measure hook without telemetry
		startDirect := time.Now()
		RunHook("pre-commit", stdin, &out)
		directDuration := time.Since(startDirect)

		// Measure hook with telemetry
		out.Reset()
		stdin = strings.NewReader("{}")
		startTelemetry := time.Now()
		RunHookWithTelemetry("pre-commit", stdin, &out, db)
		telemetryDuration := time.Since(startTelemetry)

		overhead := telemetryDuration - directDuration
		if overhead > maxOverhead {
			maxOverhead = overhead
		}
	}

	const limit = 50 * time.Millisecond
	if maxOverhead > limit {
		t.Errorf("telemetry overhead p99 = %v, want < %v", maxOverhead, limit)
	}
}

// BenchmarkRunHookWithTelemetry benchmarks the full hook+telemetry path.
func BenchmarkRunHookWithTelemetry(b *testing.B) {
	dir := b.TempDir()
	dbPath := dir + "/lessons.sqlite"

	db, err := storage.OpenDB(dbPath)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader("{}")
		RunHookWithTelemetry("pre-commit", stdin, &out, db)
	}
}

// BenchmarkTelemetryOverhead isolates the telemetry overhead by comparing
// RunHook vs RunHookWithTelemetry.
func BenchmarkTelemetryOverhead(b *testing.B) {
	dir := b.TempDir()
	dbPath := dir + "/lessons.sqlite"

	db, err := storage.OpenDB(dbPath)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()

	b.Run("WithoutTelemetry", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			var out bytes.Buffer
			stdin := strings.NewReader("{}")
			RunHook("pre-commit", stdin, &out)
		}
	})

	b.Run("WithTelemetry", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			var out bytes.Buffer
			stdin := strings.NewReader("{}")
			RunHookWithTelemetry("pre-commit", stdin, &out, db)
		}
	})
}
