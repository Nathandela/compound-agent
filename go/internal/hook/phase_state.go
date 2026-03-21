package hook

import (
	"encoding/json"
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

func phaseStatePath(repoRoot string) string {
	return filepath.Join(repoRoot, ".claude", ".ca-phase-state.json")
}

// GetPhaseState reads and validates the phase state from disk.
// Returns nil if file is missing, corrupted, or stale (>72h).
func GetPhaseState(repoRoot string) *PhaseState {
	data, err := os.ReadFile(phaseStatePath(repoRoot))
	if err != nil {
		return nil
	}

	// First unmarshal into a raw map to handle legacy fields
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil
	}

	// Migrate legacy lfg_active -> cookit_active
	if _, ok := raw["cookit_active"]; !ok {
		if lfg, ok := raw["lfg_active"]; ok {
			raw["cookit_active"] = lfg
			delete(raw, "lfg_active")
		}
	}

	// Re-marshal and unmarshal into struct
	migrated, err := json.Marshal(raw)
	if err != nil {
		return nil
	}

	var state PhaseState
	if err := json.Unmarshal(migrated, &state); err != nil {
		return nil
	}

	// Validate required fields
	if state.PhaseIndex < 1 || state.PhaseIndex > 5 {
		return nil
	}
	if state.StartedAt == "" {
		return nil
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
		// Try RFC3339Nano (ISO 8601 with sub-second precision)
		startedAt, err = time.Parse(time.RFC3339Nano, state.StartedAt)
		if err != nil {
			return nil
		}
	}
	if time.Since(startedAt) > phaseStateMaxAge {
		// Clean up stale file
		os.Remove(phaseStatePath(repoRoot))
		return nil
	}

	return &state
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
	return os.WriteFile(phaseStatePath(repoRoot), data, 0o644)
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
