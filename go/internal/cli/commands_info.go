package cli

import (
	"os/exec"
	"runtime"

	"github.com/nathandelacretaz/compound-agent/internal/build"
	"github.com/spf13/cobra"
)

const (
	repoURL        = "https://github.com/Nathandela/compound-agent"
	discussionsURL = repoURL + "/discussions"
)

func aboutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "about",
		Short: "Show version and project info",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Printf("compound-agent v%s (go)\n", build.Version)
			cmd.Println()
			cmd.Printf("Repository:  %s\n", repoURL)
			cmd.Printf("Discussions: %s\n", discussionsURL)
			return nil
		},
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the version",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Println(build.Version)
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
	rootCmd.AddCommand(versionCmd())
	rootCmd.AddCommand(feedbackCmd())
}

// FormatRepoURL returns the repo URL for use by other commands.
func FormatRepoURL() string {
	return repoURL
}
