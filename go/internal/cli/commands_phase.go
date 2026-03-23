package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// phaseState is a type alias for hook.PhaseState, kept for internal compatibility.
type phaseState = hook.PhaseState

func phaseCheckCmd() *cobra.Command {
	var repoRoot string

	cmd := &cobra.Command{
		Use:   "phase-check",
		Short: "Manage cook-it phase state",
	}
	cmd.PersistentFlags().StringVar(&repoRoot, "repo-root", "", "Repository root")

	getRoot := func() string {
		if repoRoot != "" {
			return repoRoot
		}
		return util.GetRepoRoot()
	}

	// init <epic-id>
	var forceInit bool
	initSubCmd := &cobra.Command{
		Use:   "init <epic-id>",
		Short: "Initialize phase state for an epic",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			epicID := args[0]
			root := getRoot()
			if err := os.MkdirAll(filepath.Join(root, ".claude"), 0755); err != nil {
				return fmt.Errorf("create .claude dir: %w", err)
			}

			// Guard against overwriting active state
			if !forceInit {
				if existing := hook.GetPhaseState(root); existing != nil {
					return fmt.Errorf("active phase state exists for epic %q (phase: %s). Use --force to overwrite", existing.EpicID, existing.CurrentPhase)
				}
			}

			state := &hook.PhaseState{
				CookitActive: true,
				EpicID:       epicID,
				CurrentPhase: "spec-dev",
				PhaseIndex:   1,
				SkillsRead:   []string{},
				GatesPassed:  []string{},
				StartedAt:    time.Now().UTC().Format(time.RFC3339),
			}
			if err := hook.WritePhaseState(root, state); err != nil {
				return fmt.Errorf("write state: %w", err)
			}
			cmd.Printf("Phase state initialized for %s. Current phase: spec-dev (1/5).\n", epicID)
			return nil
		},
	}
	initSubCmd.Flags().BoolVar(&forceInit, "force", false, "Overwrite existing phase state")

	// start <phase>
	startSubCmd := &cobra.Command{
		Use:   "start <phase>",
		Short: "Start or resume a phase",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			phase := args[0]
			if !hook.IsValidPhase(phase) {
				return fmt.Errorf("invalid phase: %q. Valid phases: %v", phase, hook.Phases)
			}
			root := getRoot()
			state := hook.GetPhaseState(root)
			if state == nil {
				return fmt.Errorf("no active phase state. Run: ca phase-check init <epic-id>")
			}
			state.CurrentPhase = phase
			state.PhaseIndex = hook.PhaseIndexOf(phase)
			state.GatesPassed = []string{}
			state.SkillsRead = []string{}
			if err := hook.WritePhaseState(root, state); err != nil {
				return fmt.Errorf("write state: %w", err)
			}
			cmd.Printf("Phase updated: %s (%d/5).\n", state.CurrentPhase, state.PhaseIndex)
			return nil
		},
	}

	// gate <gate-name>
	gateSubCmd := &cobra.Command{
		Use:   "gate <gate-name>",
		Short: "Record a phase gate as passed",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			gate := args[0]
			if !hook.IsValidGate(gate) {
				return fmt.Errorf("invalid gate: %q. Valid gates: %v", gate, hook.Gates)
			}
			root := getRoot()
			state := hook.GetPhaseState(root)
			if state == nil {
				return fmt.Errorf("no active phase state. Run: ca phase-check init <epic-id>")
			}

			// Add gate if not already present
			found := false
			for _, g := range state.GatesPassed {
				if g == gate {
					found = true
					break
				}
			}
			if !found {
				state.GatesPassed = append(state.GatesPassed, gate)
			}

			// Final gate signals epic completion: clean up state file rather than
			// persisting the gate, since no further phases will read it.
			if gate == "final" {
				if err := os.Remove(hook.PhaseStatePath(root)); err != nil && !os.IsNotExist(err) {
					return fmt.Errorf("remove phase state: %w", err)
				}
				cmd.Println("Final gate recorded. Phase state cleaned.")
				return nil
			}

			if err := hook.WritePhaseState(root, state); err != nil {
				return fmt.Errorf("write state: %w", err)
			}
			cmd.Printf("Gate recorded: %s.\n", gate)
			return nil
		},
	}

	// status
	var jsonOut bool
	statusSubCmd := &cobra.Command{
		Use:   "status",
		Short: "Show current phase state",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := getRoot()
			state := hook.GetPhaseState(root)
			if jsonOut {
				if state == nil {
					cmd.Println(`{"cookit_active":false}`)
					return nil
				}
				data, _ := json.Marshal(state)
				cmd.Println(string(data))
				return nil
			}

			if state == nil {
				cmd.Println("No active cook-it session.")
				return nil
			}

			cmd.Println("Active cook-it Session")
			cmd.Printf("  Epic: %s\n", state.EpicID)
			cmd.Printf("  Phase: %s (%d/5)\n", state.CurrentPhase, state.PhaseIndex)
			skills := "(none)"
			if len(state.SkillsRead) > 0 {
				skills = fmt.Sprintf("%v", state.SkillsRead)
			}
			cmd.Printf("  Skills read: %s\n", skills)
			gates := "(none)"
			if len(state.GatesPassed) > 0 {
				gates = fmt.Sprintf("%v", state.GatesPassed)
			}
			cmd.Printf("  Gates passed: %s\n", gates)
			cmd.Printf("  Started: %s\n", state.StartedAt)
			return nil
		},
	}
	statusSubCmd.Flags().BoolVar(&jsonOut, "json", false, "Output raw JSON")

	// clean
	cleanSubCmd := &cobra.Command{
		Use:   "clean",
		Short: "Remove phase state file",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := getRoot()
			if err := os.Remove(hook.PhaseStatePath(root)); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove phase state: %w", err)
			}
			cmd.Println("Phase state cleaned.")
			return nil
		},
	}

	cmd.AddCommand(initSubCmd, startSubCmd, gateSubCmd, statusSubCmd, cleanSubCmd)
	return cmd
}

// installBeadsCmd outputs the install command for the beads CLI.
func installBeadsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "install-beads",
		Short: "Install the beads CLI via the official install script",
		RunE: func(cmd *cobra.Command, args []string) error {
			installURL := "https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh"
			installCmd := fmt.Sprintf("curl -sSL %s | bash", installURL)

			// Check if bd is already available
			if _, err := exec.LookPath("bd"); err == nil {
				cmd.Println("Beads CLI (bd) is already installed.")
				return nil
			}

			cmd.Printf("Install script: %s\n", installURL)
			cmd.Printf("Run: %s\n", installCmd)
			return nil
		},
	}
}

// rulesCmd is a stub for the rules command.
func rulesCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "rules",
		Short: "Check codebase against project rules",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Println("[info] Rules checking is not yet implemented in the Go binary.")
			cmd.Println("Use: ca rules check")
			return nil
		},
	}
}

func registerPhaseCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(phaseCheckCmd())
	rootCmd.AddCommand(verifyGatesCmd())
	rootCmd.AddCommand(installBeadsCmd())
	rootCmd.AddCommand(rulesCmd())
}
