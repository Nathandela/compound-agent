package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestDownloadModelCommand_JSONFlag(t *testing.T) {
	cmd := downloadModelCmd()

	flag := cmd.Flags().Lookup("json")
	if flag == nil {
		t.Fatal("expected --json flag to exist on download-model command")
	}
	if flag.DefValue != "false" {
		t.Errorf("expected default false, got %s", flag.DefValue)
	}
}

func TestQuietFlag_SuppressesInitOutput(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	// Build root with --quiet flag (as main.go does)
	root := &cobra.Command{Use: "ca"}
	root.PersistentFlags().BoolP("quiet", "q", false, "suppress non-essential output")
	root.AddCommand(initCmd())

	// Run init WITHOUT --quiet
	out, err := executeCommand(root, "init", "--repo-root", dir)
	if err != nil {
		t.Fatalf("init failed: %v", err)
	}
	if !strings.Contains(out, "[ok]") {
		t.Fatalf("expected [ok] in normal output, got: %s", out)
	}

	// Run init WITH --quiet in a fresh dir
	dir2 := t.TempDir()
	os.MkdirAll(filepath.Join(dir2, ".git"), 0755)

	root2 := &cobra.Command{Use: "ca"}
	root2.PersistentFlags().BoolP("quiet", "q", false, "suppress non-essential output")
	root2.AddCommand(initCmd())

	quietOut, err := executeCommand(root2, "init", "--repo-root", dir2, "--quiet")
	if err != nil {
		t.Fatalf("init --quiet failed: %v", err)
	}
	if strings.Contains(quietOut, "[ok]") {
		t.Errorf("expected no [ok] in quiet output, got: %s", quietOut)
	}
}
