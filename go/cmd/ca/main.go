package main

import (
	"log/slog"
	"os"

	"github.com/nathandelacretaz/compound-agent/internal/cli"
	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// buildHooksCmd creates the "hooks run" command tree.
func buildHooksCmd() *cobra.Command {
	hooksCmd := &cobra.Command{
		Use:   "hooks",
		Short: "Hook management commands",
	}
	runCmd := &cobra.Command{
		Use:   "run [hook-name]",
		Short: "Run a hook handler",
		Args:  cobra.MaximumNArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			hookName := ""
			if len(args) > 0 {
				hookName = args[0]
			}

			// Open DB for telemetry; fall back to RunHook without telemetry if DB unavailable.
			repoRoot := util.GetRepoRoot()
			db, err := storage.OpenRepoDB(repoRoot)
			if err != nil {
				slog.Debug("telemetry db unavailable", "error", err)
				os.Exit(hook.RunHook(hookName, os.Stdin, os.Stdout))
			}
			defer db.Close()

			exitCode := hook.RunHookWithTelemetry(hookName, os.Stdin, os.Stdout, db)
			os.Exit(exitCode)
		},
	}
	hooksCmd.AddCommand(runCmd)
	return hooksCmd
}

func main() {
	var (
		verbose bool
		quiet   bool
	)

	rootCmd := &cobra.Command{
		Use:   "ca",
		Short: "compound-agent — learning system for Claude Code",
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			if verbose {
				slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
					Level: slog.LevelDebug,
				})))
			} else {
				slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
					Level: slog.LevelWarn,
				})))
			}
		},
	}
	rootCmd.SetOut(os.Stdout)
	rootCmd.SetErr(os.Stderr)

	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "enable verbose (debug-level) logging")
	rootCmd.PersistentFlags().BoolVarP(&quiet, "quiet", "q", false, "suppress non-essential output")

	rootCmd.AddCommand(buildHooksCmd())
	cli.RegisterCommands(rootCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
