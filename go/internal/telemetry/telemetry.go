// Package telemetry provides event logging and statistics for hook execution.
package telemetry

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// EventType classifies what kind of telemetry event was recorded.
type EventType string

const (
	EventHookExecution   EventType = "hook_execution"
	EventLessonRetrieval EventType = "lesson_retrieval"
)

// Outcome describes the result of a hook execution.
type Outcome string

const (
	OutcomeSuccess Outcome = "success"
	OutcomeError   Outcome = "error"
	OutcomeTimeout Outcome = "timeout"
	OutcomeEmpty   Outcome = "empty"
)

// MaxRows is the default telemetry row limit before pruning.
const MaxRows = 100_000

// Event represents a single telemetry event to be logged.
type Event struct {
	EventType  EventType
	HookName   string
	Phase      string
	DurationMs int64
	Outcome    Outcome
	QueryHash  string
	Metadata   map[string]interface{}
}

// HookStat holds aggregate statistics for a single hook type.
type HookStat struct {
	HookName      string
	Count         int64
	AvgDurationMs float64
	SuccessCount  int64
	ErrorCount    int64
}

// Stats holds aggregate telemetry statistics.
type Stats struct {
	TotalEvents    int64
	HookStats      []HookStat
	RetrievalCount int64
}

// HashQuery returns a truncated SHA-256 hash of the query string.
// Returns empty string for empty input.
func HashQuery(query string) string {
	if query == "" {
		return ""
	}
	h := sha256.Sum256([]byte(query))
	return fmt.Sprintf("%x", h[:8])
}

// outcomeToSuccess maps an Outcome to the success boolean column value.
func outcomeToSuccess(o Outcome) int {
	switch o {
	case OutcomeError, OutcomeTimeout:
		return 0
	default:
		return 1
	}
}

// LogEvent inserts a telemetry event into the database.
func LogEvent(db *sql.DB, ev Event) error {
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	success := outcomeToSuccess(ev.Outcome)

	metadataJSON := "{}"
	if ev.Metadata != nil {
		b, err := json.Marshal(ev.Metadata)
		if err != nil {
			slog.Debug("telemetry metadata marshal failed", "hook", ev.HookName, "error", err)
		} else {
			metadataJSON = string(b)
		}
	}

	_, err := db.Exec(
		`INSERT INTO telemetry (timestamp, event_type, hook_name, phase, duration_ms, success, query_hash, metadata)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		ts, string(ev.EventType), ev.HookName, ev.Phase, ev.DurationMs, success, ev.QueryHash, metadataJSON,
	)
	return err
}

// PruneEvents deletes the oldest rows when total count exceeds maxRows.
// Uses a single atomic DELETE to avoid count-delete race under concurrency.
// Returns the number of rows deleted.
func PruneEvents(db *sql.DB, maxRows int64) (int64, error) {
	res, err := db.Exec(
		`DELETE FROM telemetry WHERE id NOT IN (SELECT id FROM telemetry ORDER BY id DESC LIMIT ?)`,
		maxRows,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// QueryStats returns aggregate telemetry statistics.
func QueryStats(db *sql.DB) (*Stats, error) {
	stats := &Stats{}

	// Total events
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry").Scan(&stats.TotalEvents); err != nil {
		return nil, err
	}

	// Per-hook stats (only for hook_execution events)
	rows, err := db.Query(`
		SELECT hook_name, COUNT(*), AVG(duration_ms),
		       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),
		       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)
		FROM telemetry
		WHERE event_type = ?
		GROUP BY hook_name
		ORDER BY COUNT(*) DESC`,
		string(EventHookExecution),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var hs HookStat
		if err := rows.Scan(&hs.HookName, &hs.Count, &hs.AvgDurationMs, &hs.SuccessCount, &hs.ErrorCount); err != nil {
			return nil, err
		}
		stats.HookStats = append(stats.HookStats, hs)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Retrieval count
	if err := db.QueryRow(
		"SELECT COUNT(*) FROM telemetry WHERE event_type = ?",
		string(EventLessonRetrieval),
	).Scan(&stats.RetrievalCount); err != nil {
		return nil, err
	}

	return stats, nil
}
