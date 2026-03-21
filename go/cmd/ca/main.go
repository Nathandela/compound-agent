package main

import (
	"os"

	"github.com/nathandelacretaz/compound-agent/internal/cli"
	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/spf13/cobra"
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "ca",
		Short: "compound-agent — learning system for Claude Code",
	}

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
