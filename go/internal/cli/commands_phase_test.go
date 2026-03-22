package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPhaseCheckInit(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	cmd := phaseCheckCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"init", "test-epic-123", "--repo-root", dir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}

	// Verify state file was created
	statePath := filepath.Join(dir, ".claude", ".ca-phase-state.json")
	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read state: %v", err)
	}

	var state map[string]interface{}
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatalf("parse state: %v", err)
	}

	if state["epic_id"] != "test-epic-123" {
		t.Errorf("epic_id = %v, want test-epic-123", state["epic_id"])
	}
	if state["current_phase"] != "spec-dev" {
		t.Errorf("current_phase = %v, want spec-dev", state["current_phase"])
	}
	if state["cookit_active"] != true {
		t.Errorf("cookit_active = %v, want true", state["cookit_active"])
	}
}

func TestPhaseCheckStatus(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	// Init first
	initCmd := phaseCheckCmd()
	initCmd.SetArgs([]string{"init", "epic-abc", "--repo-root", dir})
	initCmd.SetOut(new(strings.Builder))
	initCmd.Execute()

	// Now check status
	cmd := phaseCheckCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"status", "--repo-root", dir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}

	output := out.String()
	if !strings.Contains(output, "epic-abc") {
		t.Errorf("expected epic-abc in output, got: %s", output)
	}
	if !strings.Contains(output, "spec-dev") {
		t.Errorf("expected spec-dev in output, got: %s", output)
	}
}

func TestPhaseCheckStatusJSON(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	// Init first
	initCmd := phaseCheckCmd()
	initCmd.SetArgs([]string{"init", "epic-xyz", "--repo-root", dir})
	initCmd.SetOut(new(strings.Builder))
	initCmd.Execute()

	// JSON status
	cmd := phaseCheckCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"status", "--json", "--repo-root", dir})
	cmd.Execute()

	var state map[string]interface{}
	if err := json.Unmarshal([]byte(strings.TrimSpace(out.String())), &state); err != nil {
		t.Fatalf("parse JSON: %v (output: %q)", err, out.String())
	}
	if state["epic_id"] != "epic-xyz" {
		t.Errorf("epic_id = %v, want epic-xyz", state["epic_id"])
	}
}

func TestPhaseCheckStart(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	// Init
	initCmd := phaseCheckCmd()
	initCmd.SetArgs([]string{"init", "epic-1", "--repo-root", dir})
	initCmd.SetOut(new(strings.Builder))
	initCmd.Execute()

	// Start plan phase
	cmd := phaseCheckCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"start", "plan", "--repo-root", dir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if !strings.Contains(out.String(), "plan") {
		t.Errorf("expected plan in output, got: %s", out.String())
	}

	// Verify state updated
	data, _ := os.ReadFile(filepath.Join(dir, ".claude", ".ca-phase-state.json"))
	var state map[string]interface{}
	json.Unmarshal(data, &state)
	if state["current_phase"] != "plan" {
		t.Errorf("current_phase = %v, want plan", state["current_phase"])
	}
}

func TestPhaseCheckGate(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	// Init
	initCmd := phaseCheckCmd()
	initCmd.SetArgs([]string{"init", "epic-2", "--repo-root", dir})
	initCmd.SetOut(new(strings.Builder))
	initCmd.Execute()

	// Record gate
	cmd := phaseCheckCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"gate", "post-plan", "--repo-root", dir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if !strings.Contains(out.String(), "post-plan") {
		t.Errorf("expected post-plan in output, got: %s", out.String())
	}
}

func TestPhaseCheckClean(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	// Init
	initCmd := phaseCheckCmd()
	initCmd.SetArgs([]string{"init", "epic-3", "--repo-root", dir})
	initCmd.SetOut(new(strings.Builder))
	initCmd.Execute()

	// Verify state exists
	statePath := filepath.Join(dir, ".claude", ".ca-phase-state.json")
	if _, err := os.Stat(statePath); err != nil {
		t.Fatal("state file should exist after init")
	}

	// Clean
	cmd := phaseCheckCmd()
	cmd.SetOut(new(strings.Builder))
	cmd.SetArgs([]string{"clean", "--repo-root", dir})
	cmd.Execute()

	// Verify state removed
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Error("state file should be removed after clean")
	}
}

func TestPhaseCheckInvalidPhase(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	initCmd := phaseCheckCmd()
	initCmd.SetArgs([]string{"init", "epic-4", "--repo-root", dir})
	initCmd.SetOut(new(strings.Builder))
	initCmd.Execute()

	cmd := phaseCheckCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"start", "invalid-phase", "--repo-root", dir})
	err := cmd.Execute()
	if err == nil {
		t.Error("expected error for invalid phase")
	}
}

func TestInstallBeadsCmd(t *testing.T) {
	cmd := installBeadsCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}

	output := out.String()
	// Either bd is already installed (and we get that message) or we get install instructions
	if !strings.Contains(output, "beads") && !strings.Contains(output, "Beads") {
		t.Errorf("expected beads-related output, got: %s", output)
	}
}

func TestRulesCmd(t *testing.T) {
	cmd := rulesCmd()
	out := new(strings.Builder)
	cmd.SetOut(out)
	cmd.SetArgs([]string{})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute: %v", err)
	}
}
