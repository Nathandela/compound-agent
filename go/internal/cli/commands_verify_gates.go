package cli

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"regexp"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// epicIDPattern validates epic IDs: must start with alphanumeric, then alphanumeric with hyphens, underscores, and dots.
var epicIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)

// bdDep represents a dependency returned by bd show --json.
type bdDep struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

// gateCheckResult represents the outcome of a single gate check.
type gateCheckResult struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "pass" or "fail"
	Detail string `json:"detail,omitempty"`
}

// validateEpicID checks that an epic ID contains only safe characters.
func validateEpicID(epicID string) error {
	if !epicIDPattern.MatchString(epicID) {
		return fmt.Errorf("invalid epic ID %q: must be alphanumeric with hyphens, underscores, or dots", epicID)
	}
	return nil
}

// parseBdShowDeps parses the JSON output of `bd show <id> --json` into dependencies.
func parseBdShowDeps(raw string) ([]bdDep, error) {
	// bd show --json may return an array or a single object
	var issues []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &issues); err != nil {
		// Try single object
		var single map[string]interface{}
		if err2 := json.Unmarshal([]byte(raw), &single); err2 != nil {
			return nil, fmt.Errorf("parse bd show output (array: %v, object: %w)", err, err2)
		}
		issues = []map[string]interface{}{single}
	}

	if len(issues) == 0 {
		return []bdDep{}, nil
	}

	issue := issues[0]

	// Try depends_on, then dependencies
	var depsRaw interface{}
	if d, ok := issue["depends_on"]; ok {
		depsRaw = d
	} else if d, ok := issue["dependencies"]; ok {
		depsRaw = d
	}

	if depsRaw == nil {
		return []bdDep{}, nil
	}

	// Re-marshal and unmarshal the deps array into []bdDep
	data, err := json.Marshal(depsRaw)
	if err != nil {
		return nil, fmt.Errorf("marshal deps: %w", err)
	}

	var deps []bdDep
	if err := json.Unmarshal(data, &deps); err != nil {
		return nil, fmt.Errorf("unmarshal deps: %w", err)
	}

	return deps, nil
}

// depsTextPattern matches lines like: → ✓ task-1: Review: Code review ● closed
var depsTextPattern = regexp.MustCompile(`^\s+→\s+(✓|○)\s+\S+:\s+(.+?)\s+●`)

// parseBdShowDepsText parses the plain text output of `bd show <id>` into dependencies.
func parseBdShowDepsText(output string) []bdDep {
	var deps []bdDep
	lines := strings.Split(output, "\n")
	inDeps := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "DEPENDS ON" {
			inDeps = true
			continue
		}
		if inDeps {
			m := depsTextPattern.FindStringSubmatch(line)
			if m != nil {
				status := "open"
				if m[1] == "✓" {
					status = "closed"
				}
				deps = append(deps, bdDep{Title: m[2], Status: status})
			} else if trimmed != "" && !strings.HasPrefix(line, "  ") {
				break
			}
		}
	}

	if deps == nil {
		return []bdDep{}
	}
	return deps
}

// checkGate checks whether a dependency with the given title prefix exists and is closed.
func checkGate(deps []bdDep, prefix, gateName string) gateCheckResult {
	for _, d := range deps {
		if strings.HasPrefix(d.Title, prefix) {
			if d.Status == "closed" {
				return gateCheckResult{Name: gateName, Status: "pass"}
			}
			return gateCheckResult{
				Name:   gateName,
				Status: "fail",
				Detail: fmt.Sprintf("%s exists but is not closed", gateName),
			}
		}
	}
	return gateCheckResult{
		Name:   gateName,
		Status: "fail",
		Detail: fmt.Sprintf("No %s found (missing)", strings.ToLower(gateName)),
	}
}

func verifyGatesCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "verify-gates <epic-id>",
		Short: "Verify workflow gates are satisfied before epic closure",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			epicID := args[0]
			if err := validateEpicID(epicID); err != nil {
				return err
			}
			repoRoot := util.GetRepoRoot()

			deps, err := fetchDeps(epicID)
			if err != nil {
				return fmt.Errorf("fetch dependencies for %q: %w", epicID, err)
			}

			checks := []gateCheckResult{
				checkGate(deps, "Review:", "Review task"),
				checkGate(deps, "Compound:", "Compound task"),
			}

			cmd.Printf("Gate checks for epic %s:\n\n", epicID)
			failures := 0
			for _, c := range checks {
				label := strings.ToUpper(c.Status)
				cmd.Printf("  [%s] %s\n", label, c.Name)
				if c.Detail != "" {
					cmd.Printf("          %s\n", c.Detail)
				}
				if c.Status == "fail" {
					failures++
				}
			}

			cmd.Println()
			if failures == 0 {
				cmd.Println("All gates passed.")
				// Clean up phase state if final gate was already recorded
				hook.CleanPhaseStateIfFinal(repoRoot)
			} else {
				cmd.Printf("%d gate(s) failed.\n", failures)
				return fmt.Errorf("%d gate(s) failed", failures)
			}

			return nil
		},
	}
}

// fetchDeps runs `bd show <epic-id> --json` and parses the dependencies.
// Falls back to plain text parsing if JSON fails.
func fetchDeps(epicID string) ([]bdDep, error) {
	if _, err := exec.LookPath("bd"); err != nil {
		return nil, fmt.Errorf("bd CLI not found; install with: ca install-beads")
	}

	// Use "--" to prevent epicID from being interpreted as a flag
	out, err := exec.Command("bd", "show", "--", epicID, "--json").Output()
	if err == nil {
		deps, parseErr := parseBdShowDeps(string(out))
		if parseErr == nil {
			return deps, nil
		}
		// JSON parse failed — fall through to plain text
		slog.Debug("bd show --json parse failed, trying plain text", "error", parseErr)
	}

	// Fallback: try plain text
	out, err = exec.Command("bd", "show", "--", epicID).Output()
	if err != nil {
		return nil, fmt.Errorf("bd show %s: %w", epicID, err)
	}

	return parseBdShowDepsText(string(out)), nil
}
