package cli

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/telemetry"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// healthCmd creates the "health" command. If dbPath is non-empty, it opens that
// path directly (used in tests); otherwise it opens the standard repo DB.
func healthCmd(dbPath string) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "health",
		Short: "Show telemetry health stats (avg hook latency, retrieval counts)",
		RunE: func(cmd *cobra.Command, args []string) error {
			path := dbPath
			if path == "" {
				path = util.GetRepoRoot()
			}

			db, err := openHealthDB(path, dbPath != "")
			if err != nil {
				return fmt.Errorf("open database: %w", err)
			}
			defer db.Close()

			stats, err := telemetry.QueryStats(db)
			if err != nil {
				return fmt.Errorf("query stats: %w", err)
			}

			if jsonOut {
				return printHealthJSON(cmd, stats)
			}
			cmd.Print(formatHealthHuman(stats))
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

func openHealthDB(path string, isDirect bool) (*sql.DB, error) {
	if isDirect {
		return storage.OpenDB(path)
	}
	return storage.OpenRepoDB(path)
}

func formatHealthHuman(stats *telemetry.Stats) string {
	if stats.TotalEvents == 0 {
		return "No telemetry data recorded yet.\nRun hooks to start collecting data.\n"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "## Telemetry Health\n\n")
	fmt.Fprintf(&b, "Total events: %d\n", stats.TotalEvents)
	fmt.Fprintf(&b, "Lesson retrievals: %d\n\n", stats.RetrievalCount)

	if len(stats.HookStats) > 0 {
		fmt.Fprintf(&b, "### Hook Latency\n\n")
		fmt.Fprintf(&b, "%-25s %8s %10s %8s %8s\n", "Hook", "Count", "Avg (ms)", "OK", "Errors")
		fmt.Fprintf(&b, "%s\n", strings.Repeat("-", 63))
		for _, hs := range stats.HookStats {
			fmt.Fprintf(&b, "%-25s %8d %10.1f %8d %8d\n",
				hs.HookName, hs.Count, hs.AvgDurationMs, hs.SuccessCount, hs.ErrorCount)
		}
	}

	return b.String()
}

func printHealthJSON(cmd *cobra.Command, stats *telemetry.Stats) error {
	type hookStatJSON struct {
		HookName      string  `json:"hookName"`
		Count         int64   `json:"count"`
		AvgDurationMs float64 `json:"avgDurationMs"`
		SuccessCount  int64   `json:"successCount"`
		ErrorCount    int64   `json:"errorCount"`
	}

	hookStats := make([]hookStatJSON, len(stats.HookStats))
	for i, hs := range stats.HookStats {
		hookStats[i] = hookStatJSON{
			HookName:      hs.HookName,
			Count:         hs.Count,
			AvgDurationMs: hs.AvgDurationMs,
			SuccessCount:  hs.SuccessCount,
			ErrorCount:    hs.ErrorCount,
		}
	}

	data := struct {
		TotalEvents    int64          `json:"totalEvents"`
		RetrievalCount int64          `json:"retrievalCount"`
		HookStats      []hookStatJSON `json:"hookStats"`
	}{
		TotalEvents:    stats.TotalEvents,
		RetrievalCount: stats.RetrievalCount,
		HookStats:      hookStats,
	}

	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal health JSON: %w", err)
	}
	cmd.Println(string(out))
	return nil
}

func registerHealthCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(healthCmd(""))
}
