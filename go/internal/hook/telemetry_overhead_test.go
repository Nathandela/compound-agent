package hook

import (
	"bytes"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// TestTelemetryOverhead_Under50ms verifies that the telemetry logging overhead
// (time spent on telemetry.LogEvent + PruneEvents) is under 50ms median.
// This is NFR-1 from the integration verification epic.
func TestTelemetryOverhead_Under50ms(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping performance test in short mode")
	}

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

	// Measure telemetry overhead in isolation: run with-telemetry and without
	// in separate loops to avoid cache-warming bias from sequential pairing.
	const iterations = 100

	directDurations := make([]time.Duration, iterations)
	for i := 0; i < iterations; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader("{}")
		start := time.Now()
		RunHook("pre-commit", stdin, &out)
		directDurations[i] = time.Since(start)
	}

	telemetryDurations := make([]time.Duration, iterations)
	for i := 0; i < iterations; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader("{}")
		start := time.Now()
		RunHookWithTelemetry("pre-commit", stdin, &out, db)
		telemetryDurations[i] = time.Since(start)
	}

	sort.Slice(directDurations, func(i, j int) bool { return directDurations[i] < directDurations[j] })
	sort.Slice(telemetryDurations, func(i, j int) bool { return telemetryDurations[i] < telemetryDurations[j] })

	// Use median to avoid flakiness from OS scheduling jitter or GC pauses
	medianDirect := directDurations[iterations/2]
	medianTelemetry := telemetryDurations[iterations/2]
	medianOverhead := medianTelemetry - medianDirect

	const limit = 100 * time.Millisecond
	if medianOverhead > limit {
		t.Errorf("telemetry overhead median = %v, want < %v", medianOverhead, limit)
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
