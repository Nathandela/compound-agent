package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/build"
	"github.com/nathandelacretaz/compound-agent/internal/setup/templates"
	"github.com/nathandelacretaz/compound-agent/internal/util"
)

// HarnessTarget names an install target for `ca setup --harness`.
type HarnessTarget string

const (
	HarnessClaude HarnessTarget = "claude"
	HarnessCodex  HarnessTarget = "codex"
	HarnessGemini HarnessTarget = "gemini"
	HarnessGoose  HarnessTarget = "goose"
)

// validHarnessTargets lists the accepted --harness values in stable order.
var validHarnessTargets = []HarnessTarget{HarnessClaude, HarnessCodex, HarnessGemini, HarnessGoose}

// ParseHarnessTargets parses comma-separated and/or repeated --harness values
// into a deduped, order-preserving slice of targets. Empty input returns no
// targets (the caller then performs the default Claude install). Unknown values
// produce an error that names the bad value and lists the valid set, before any
// filesystem writes occur.
func ParseHarnessTargets(raw []string) ([]HarnessTarget, error) {
	var out []HarnessTarget
	seen := make(map[HarnessTarget]bool)
	for _, item := range raw {
		for _, part := range strings.Split(item, ",") {
			name := strings.TrimSpace(part)
			if name == "" {
				continue
			}
			target := HarnessTarget(strings.ToLower(name))
			if !isValidHarness(target) {
				return nil, fmt.Errorf(
					"unknown --harness target %q (valid: %s)",
					name, harnessTargetList())
			}
			if !seen[target] {
				seen[target] = true
				out = append(out, target)
			}
		}
	}
	return out, nil
}

// isValidHarness reports whether target is a known install target.
func isValidHarness(target HarnessTarget) bool {
	for _, v := range validHarnessTargets {
		if v == target {
			return true
		}
	}
	return false
}

// harnessTargetList returns a comma-separated list of valid target names.
func harnessTargetList() string {
	names := make([]string, len(validHarnessTargets))
	for i, v := range validHarnessTargets {
		names[i] = string(v)
	}
	return strings.Join(names, ", ")
}

// installGoose installs compound's primitives into a Goose target: the hooks
// manifest at ~/.agents/plugins/compound/hooks/hooks.json (BIN substituted), the
// .goosehints memory file, and the compound-cook-it recipe. Idempotent.
func installGoose(repoRoot, binaryPath string, result *InitResult) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home dir: %w", err)
	}

	hooksDir := filepath.Join(home, ".agents", "plugins", "compound", "hooks")
	if err := os.MkdirAll(hooksDir, 0755); err != nil {
		return fmt.Errorf("mkdir goose hooks dir: %w", err)
	}
	bin := binaryPath
	if bin == "" {
		bin = "npx ca"
	} else {
		bin = util.ShellEscape(bin)
	}
	hooks := strings.ReplaceAll(templates.GooseHooksJSON(), "{{BIN}}", bin)
	if err := reconcileHarnessFile(filepath.Join(hooksDir, "hooks.json"), hooks, result); err != nil {
		return err
	}

	if err := reconcileHarnessFile(filepath.Join(repoRoot, ".goosehints"), templates.GooseHints(), result); err != nil {
		return err
	}

	recipeDir := filepath.Join(repoRoot, ".goose", "recipes")
	if err := os.MkdirAll(recipeDir, 0755); err != nil {
		return fmt.Errorf("mkdir goose recipes dir: %w", err)
	}
	return reconcileHarnessFile(filepath.Join(recipeDir, "compound-cook-it.yaml"), templates.GooseRecipe(), result)
}

// installCodex installs the Codex target: AGENTS.md (shared lesson-capture
// interface) plus a Codex config.toml. Idempotent.
func installCodex(repoRoot string, result *InitResult) error {
	if _, err := UpdateAgentsMd(repoRoot); err != nil {
		return fmt.Errorf("update AGENTS.md: %w", err)
	}

	codexDir := filepath.Join(repoRoot, ".codex")
	if err := os.MkdirAll(codexDir, 0755); err != nil {
		return fmt.Errorf("mkdir .codex: %w", err)
	}
	cfg := strings.ReplaceAll(templates.CodexConfig(), "{{VERSION}}", build.Version)
	return reconcileHarnessFile(filepath.Join(codexDir, "config.toml"), cfg, result)
}

// installGemini installs the Gemini target: GEMINI.md memory file plus a
// .gemini mirror so Gemini is a real install target. Idempotent.
func installGemini(repoRoot string, result *InitResult) error {
	mem := templates.GeminiMemory()
	if err := reconcileHarnessFile(filepath.Join(repoRoot, "GEMINI.md"), mem, result); err != nil {
		return err
	}
	geminiDir := filepath.Join(repoRoot, ".gemini")
	if err := os.MkdirAll(geminiDir, 0755); err != nil {
		return fmt.Errorf("mkdir .gemini: %w", err)
	}
	return reconcileHarnessFile(filepath.Join(geminiDir, "GEMINI.md"), mem, result)
}

// reconcileHarnessFile writes content to path (creating or updating) and records
// a created file in result. Idempotent via reconcileFile.
func reconcileHarnessFile(path, content string, result *InitResult) error {
	created, _, err := reconcileFile(path, content)
	if err != nil {
		return err
	}
	if created {
		result.FilesCreated = append(result.FilesCreated, path)
	}
	return nil
}
