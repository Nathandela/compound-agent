package cli

import (
	"bytes"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func executeCommand(root *cobra.Command, args ...string) (string, error) {
	buf := new(bytes.Buffer)
	root.SetOut(buf)
	root.SetErr(buf)
	root.SetArgs(args)
	err := root.Execute()
	return buf.String(), err
}

func TestAboutCommand(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(aboutCmd())

	out, err := executeCommand(root, "about")
	if err != nil {
		t.Fatalf("about command failed: %v", err)
	}

	if !strings.Contains(out, "compound-agent") {
		t.Error("expected output to contain 'compound-agent'")
	}
	if !strings.Contains(out, "github.com") {
		t.Error("expected output to contain repo URL")
	}
}

func TestFeedbackCommand(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(feedbackCmd())

	out, err := executeCommand(root, "feedback")
	if err != nil {
		t.Fatalf("feedback command failed: %v", err)
	}

	if !strings.Contains(out, "discussions") {
		t.Error("expected output to contain discussions URL")
	}
	if !strings.Contains(out, "github.com") {
		t.Error("expected output to contain repo URL")
	}
	if !strings.Contains(out, "Nathandela/compound-agent") {
		t.Error("expected output to contain repository path")
	}
}

func TestFeedbackCommandOpenHint(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(feedbackCmd())

	out, err := executeCommand(root, "feedback")
	if err != nil {
		t.Fatalf("feedback command failed: %v", err)
	}

	if !strings.Contains(out, "ca feedback --open") {
		t.Error("expected hint to use --open flag")
	}
}
