package cli

import (
	"fmt"
	"os/exec"
	"runtime"

	"github.com/spf13/cobra"
)

const (
	version        = "1.8.0"
	repoURL        = "https://github.com/Nathandela/compound-agent"
	discussionsURL = repoURL + "/discussions"
)

func aboutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "about",
		Short: "Show version and project info",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Printf("compound-agent v%s (go)\n", version)
			cmd.Println()
			cmd.Printf("Repository:  %s\n", repoURL)
			cmd.Printf("Discussions: %s\n", discussionsURL)
			return nil
		},
	}
}

func feedbackCmd() *cobra.Command {
	var openFlag bool
	cmd := &cobra.Command{
		Use:   "feedback",
		Short: "Open GitHub Discussions to share feedback or report issues",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Printf("Feedback & discussions: %s\n", discussionsURL)
			cmd.Printf("Repository:             %s\n", repoURL)

			if openFlag {
				openURL(discussionsURL)
				cmd.Println("Opening in browser...")
			} else {
				cmd.Println()
				cmd.Println("Run `ca feedback --open` to open in your browser.")
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&openFlag, "open", false, "Open the Discussions page in your browser")
	return cmd
}

func openURL(url string) {
	var cmd string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
	case "windows":
		cmd = "start"
	default:
		cmd = "xdg-open"
	}
	_ = exec.Command(cmd, url).Start()
}

func registerInfoCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(aboutCmd())
	rootCmd.AddCommand(feedbackCmd())
}

// formatVersion returns the version string for use in other commands.
func formatVersion() string {
	return fmt.Sprintf("compound-agent v%s (go)", version)
}

// versionString is used by other packages that need the bare version.
func versionString() string {
	return version
}

// FormatRepoURL returns the repo URL for use by other commands.
func FormatRepoURL() string {
	return repoURL
}
