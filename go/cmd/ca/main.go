package main

import (
	"log/slog"
	"os"

	"github.com/nathandelacretaz/compound-agent/internal/cli"
	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/spf13/cobra"
)

func main() {
	var verbose bool

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

	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "enable verbose (debug-level) logging")

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
			exitCode := hook.RunHook(hookName, os.Stdin, os.Stdout)
			os.Exit(exitCode)
		},
	}

	hooksCmd.AddCommand(runCmd)
	rootCmd.AddCommand(hooksCmd)
	cli.RegisterCommands(rootCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
