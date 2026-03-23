package hook

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

const phaseStateMaxAge = 72 * time.Hour

// PhaseState represents the cook-it phase state persisted in .ca-phase-state.json.
type PhaseState struct {
	CookitActive bool     `json:"cookit_active"`
	EpicID       string   `json:"epic_id"`
	CurrentPhase string   `json:"current_phase"`
	PhaseIndex   int      `json:"phase_index"`
	SkillsRead   []string `json:"skills_read"`
	GatesPassed  []string `json:"gates_passed"`
	StartedAt    string   `json:"started_at"`
}

// Phases is the ordered list of cook-it phase names.
var Phases = []string{"spec-dev", "plan", "work", "review", "compound"}

// Gates is the ordered list of cook-it gate names.
var Gates = []string{"post-plan", "gate-3", "gate-4", "final"}

// phaseIndex maps phase name to 1-based index.
var phaseIndexMap = map[string]int{
	"spec-dev": 1, "plan": 2, "work": 3, "review": 4, "compound": 5,
}

// PhaseStatePath returns the filesystem path for the phase state file.
func PhaseStatePath(repoRoot string) string {
	return filepath.Join(repoRoot, ".claude", ".ca-phase-state.json")
}

// GetPhaseState reads and validates the phase state from disk.
// Returns nil if file is missing, corrupted, or stale (>72h).
func GetPhaseState(repoRoot string) *PhaseState {
	data, err := os.ReadFile(PhaseStatePath(repoRoot))
	if err != nil {
		return nil
	}

	// First unmarshal into a raw map to handle legacy fields
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil
	}

	migratePhaseState(raw)

	// Re-marshal and unmarshal into struct
	migrated, err := json.Marshal(raw)
	if err != nil {
		return nil
	}

	var state PhaseState
	if err := json.Unmarshal(migrated, &state); err != nil {
		return nil
	}

	if !validatePhaseState(&state, repoRoot) {
		return nil
	}

	return &state
}

// migratePhaseState applies legacy field migrations to the raw JSON map.
// Renames lfg_active to cookit_active if the new field is not already present.
func migratePhaseState(raw map[string]interface{}) {
	if _, ok := raw["cookit_active"]; !ok {
		if lfg, ok := raw["lfg_active"]; ok {
			raw["cookit_active"] = lfg
			delete(raw, "lfg_active")
		}
	}
}

// validatePhaseState checks required fields, initializes nil slices, and enforces TTL.
// Returns false if the state is invalid or stale, cleaning up stale files as a side effect.
func validatePhaseState(state *PhaseState, repoRoot string) bool {
	if state.PhaseIndex < 1 || state.PhaseIndex > 5 {
		return false
	}
	if state.StartedAt == "" {
		return false
	}
	if state.SkillsRead == nil {
		state.SkillsRead = []string{}
	}
	if state.GatesPassed == nil {
		state.GatesPassed = []string{}
	}

	// TTL check
	startedAt, err := time.Parse(time.RFC3339, state.StartedAt)
	if err != nil {
		startedAt, err = time.Parse(time.RFC3339Nano, state.StartedAt)
		if err != nil {
			return false
		}
	}
	if time.Since(startedAt) > phaseStateMaxAge {
		os.Remove(PhaseStatePath(repoRoot))
		return false
	}

	return true
}

// UpdatePhaseState reads the current state, applies partial updates, and writes back.
func UpdatePhaseState(repoRoot string, partial map[string]interface{}) error {
	state := GetPhaseState(repoRoot)
	if state == nil {
		return nil
	}

	// Apply partial updates
	if sr, ok := partial["skills_read"]; ok {
		if skills, ok := sr.([]string); ok {
			state.SkillsRead = skills
		}
	}
	if gp, ok := partial["gates_passed"]; ok {
		if gates, ok := gp.([]string); ok {
			state.GatesPassed = gates
		}
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(PhaseStatePath(repoRoot), data, 0o644)
}

// WritePhaseState writes the phase state to disk.
func WritePhaseState(repoRoot string, state *PhaseState) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(PhaseStatePath(repoRoot), data, 0o644)
}

// IsValidPhase returns true if s is a recognized phase name.
func IsValidPhase(s string) bool {
	for _, p := range Phases {
		if p == s {
			return true
		}
	}
	return false
}

// IsValidGate returns true if s is a recognized gate name.
func IsValidGate(s string) bool {
	for _, g := range Gates {
		if g == s {
			return true
		}
	}
	return false
}

// PhaseIndexOf returns the 1-based index for a phase name, or 0 if not found.
func PhaseIndexOf(phase string) int {
	return phaseIndexMap[phase]
}

// CleanPhaseStateIfFinal removes the phase state file if the "final" gate has been recorded.
func CleanPhaseStateIfFinal(repoRoot string) {
	state := GetPhaseState(repoRoot)
	if state == nil || !state.CookitActive {
		return
	}
	for _, g := range state.GatesPassed {
		if g == "final" {
			if err := os.Remove(PhaseStatePath(repoRoot)); err != nil && !os.IsNotExist(err) {
				slog.Warn("clean phase state failed", "error", err)
			}
			return
		}
	}
}

// ExpectedGateForPhase returns the required gate name for a phase index, or "" for none.
func ExpectedGateForPhase(phaseIndex int) string {
	switch phaseIndex {
	case 2:
		return "post-plan"
	case 3:
		return "gate-3"
	case 4:
		return "gate-4"
	case 5:
		return "final"
	default:
		return ""
	}
}
