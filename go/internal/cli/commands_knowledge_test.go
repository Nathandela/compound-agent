package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKnowledgeCmd_BasicSearch(t *testing.T) {
	// Set up a temp repo with docs
	dir := t.TempDir()
	docsDir := filepath.Join(dir, "docs")
	os.MkdirAll(docsDir, 0o755)
	os.WriteFile(filepath.Join(docsDir, "test.md"), []byte("# Go Programming\n\nGo is a statically typed language."), 0o644)

	// Create the .claude/.cache directory for the DB
	os.MkdirAll(filepath.Join(dir, ".claude", ".cache"), 0o755)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	cmd := knowledgeCmd()
	var out strings.Builder
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs([]string{"programming"})

	err := cmd.Execute()
	if err != nil {
		t.Fatalf("knowledge cmd: %v", err)
	}

	output := out.String()
	if !strings.Contains(output, "test.md") || !strings.Contains(output, "Go") {
		t.Errorf("expected search results mentioning test.md, got: %s", output)
	}
}

func TestKnowledgeCmd_NoArgs(t *testing.T) {
	cmd := knowledgeCmd()
	cmd.SetArgs([]string{})
	err := cmd.Execute()
	if err == nil {
		t.Error("expected error with no args")
	}
}

func TestIndexDocsCmd_BasicIndex(t *testing.T) {
	dir := t.TempDir()
	docsDir := filepath.Join(dir, "docs")
	os.MkdirAll(docsDir, 0o755)
	os.WriteFile(filepath.Join(docsDir, "readme.md"), []byte("# README\n\nProject docs."), 0o644)
	os.MkdirAll(filepath.Join(dir, ".claude", ".cache"), 0o755)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	cmd := indexDocsCmd()
	var out strings.Builder
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs([]string{})

	err := cmd.Execute()
	if err != nil {
		t.Fatalf("index-docs cmd: %v", err)
	}

	output := out.String()
	if !strings.Contains(output, "1 file") {
		t.Errorf("expected '1 file' in output, got: %s", output)
	}
}

func TestIndexDocsCmd_EmptyDocs(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", ".cache"), 0o755)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	cmd := indexDocsCmd()
	var out strings.Builder
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs([]string{})

	err := cmd.Execute()
	if err != nil {
		t.Fatalf("index-docs cmd: %v", err)
	}

	output := out.String()
	if !strings.Contains(output, "0 file") {
		t.Errorf("expected '0 file' in output, got: %s", output)
	}
}

func TestFormatKnowledgeResults_Empty(t *testing.T) {
	output := formatKnowledgeResults(nil)
	if !strings.Contains(output, "No knowledge") {
		t.Errorf("expected empty message, got: %s", output)
	}
}
