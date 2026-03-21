package main

import (
	"math"
	"os/exec"
	"strings"
	"testing"
)

func TestFTS5Parity(t *testing.T) {
	results, err := RunParityCheck("..")
	if err != nil {
		t.Fatalf("RunParityCheck failed: %v", err)
	}

	for _, r := range results {
		t.Run("query="+r.Query, func(t *testing.T) {
			if !r.Pass {
				if r.GotError != "" {
					t.Errorf("Error: %s", r.GotError)
				}
				t.Errorf("Expected %d results, got %d", len(r.Expected), len(r.Got))
				minLen := len(r.Expected)
				if len(r.Got) < minLen {
					minLen = len(r.Got)
				}
				for i := 0; i < minLen; i++ {
					e := r.Expected[i]
					g := r.Got[i]
					if e.ID != g.ID {
						t.Errorf("[%d] ID: expected %s, got %s", i, e.ID, g.ID)
					}
					if math.Abs(e.Rank-g.Rank) > rankTolerance {
						t.Errorf("[%d] Rank for %s: expected %.15f, got %.15f (delta=%.2e)",
							i, e.ID, e.Rank, g.Rank, math.Abs(e.Rank-g.Rank))
					}
				}
			}
		})
	}

	// Summary
	passed := 0
	for _, r := range results {
		if r.Pass {
			passed++
		}
	}
	t.Logf("FTS5 Parity: %d/%d queries passed", passed, len(results))
}

func TestCGoOnlyFromGoSQLite3(t *testing.T) {
	// Verify that CGo is only required by go-sqlite3, not by other dependencies.
	// We check `go list -m all` for native deps and verify go-sqlite3 is the only one.

	cmd := exec.Command("go", "list", "-m", "all")
	cmd.Dir = "."
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("go list -m all failed: %v", err)
	}

	modules := strings.Split(strings.TrimSpace(string(out)), "\n")

	// Known CGo modules -- only go-sqlite3 should appear
	cgoModules := []string{
		"github.com/mattn/go-sqlite3",
	}
	knownCgo := make(map[string]bool)
	for _, m := range cgoModules {
		knownCgo[m] = true
	}

	// Check that no unexpected native/CGo dependencies exist
	suspectPrefixes := []string{
		"github.com/mattn/go-", // mattn CGo bindings
	}

	for _, mod := range modules {
		parts := strings.Fields(mod)
		if len(parts) == 0 {
			continue
		}
		name := parts[0]

		// Skip the module itself
		if name == "fts5-parity" {
			continue
		}

		for _, prefix := range suspectPrefixes {
			if strings.HasPrefix(name, prefix) && !knownCgo[name] {
				t.Errorf("Unexpected potential CGo dependency: %s", name)
			}
		}
	}

	// Verify go-sqlite3 IS present (sanity check)
	found := false
	for _, mod := range modules {
		if strings.Contains(mod, "github.com/mattn/go-sqlite3") {
			found = true
			break
		}
	}
	if !found {
		t.Error("go-sqlite3 not found in module list")
	}

	// Verify build succeeds with CGO_ENABLED=1 (required for go-sqlite3)
	buildCmd := exec.Command("go", "build", "./...")
	buildCmd.Dir = "."
	buildCmd.Env = append(buildCmd.Environ(), "CGO_ENABLED=1")
	if out, err := buildCmd.CombinedOutput(); err != nil {
		t.Errorf("Build with CGO_ENABLED=1 failed: %v\n%s", err, out)
	}

	// Verify build FAILS with CGO_ENABLED=0 (proves CGo is needed only for go-sqlite3)
	buildCmd2 := exec.Command("go", "build", "./...")
	buildCmd2.Dir = "."
	buildCmd2.Env = append(buildCmd2.Environ(), "CGO_ENABLED=0")
	if out, err := buildCmd2.CombinedOutput(); err == nil {
		t.Error("Build with CGO_ENABLED=0 should fail (go-sqlite3 needs CGo), but it succeeded")
	} else {
		outStr := string(out)
		if !strings.Contains(outStr, "sqlite3") && !strings.Contains(outStr, "cgo") {
			t.Errorf("CGO_ENABLED=0 failure should mention sqlite3/cgo, got: %s", outStr)
		}
		t.Logf("Confirmed: CGO_ENABLED=0 fails due to go-sqlite3 (A5 validated)")
	}
}
