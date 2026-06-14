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
	HarnessGoose  HarnessTarget = "goose"
	HarnessAgy    HarnessTarget = "agy"
)

// validHarnessTargets lists the canonical accepted --harness values in stable
// order. The legacy gemini and antigravity names are accepted as deprecated
// aliases (see ParseHarnessTargets) but are not part of the canonical set.
var validHarnessTargets = []HarnessTarget{HarnessClaude, HarnessCodex, HarnessAgy, HarnessGoose}

// deprecatedHarnessAliases maps legacy --harness names to their canonical
// replacement. The standalone gemini CLI has been removed and the antigravity
// groundwork target folded into agy, so both normalize to agy.
var deprecatedHarnessAliases = map[HarnessTarget]HarnessTarget{
	"gemini":      HarnessAgy,
	"antigravity": HarnessAgy,
}

// ParseHarnessTargets parses comma-separated and/or repeated --harness values
// into a deduped, order-preserving slice of targets. Empty input returns no
// targets (the caller then performs the default Claude install). Unknown values
// produce an error that names the bad value and lists the valid set, before any
// filesystem writes occur.
//
// The legacy gemini and antigravity names are still accepted: they normalize to
// agy and each surfaces a deprecation warning in the returned warnings slice so
// the caller can thread it into the install result.
func ParseHarnessTargets(raw []string) ([]HarnessTarget, []string, error) {
	var out []HarnessTarget
	var warnings []string
	seen := make(map[HarnessTarget]bool)
	for _, item := range raw {
		for _, part := range strings.Split(item, ",") {
			name := strings.TrimSpace(part)
			if name == "" {
				continue
			}
			target := HarnessTarget(strings.ToLower(name))
			if canonical, deprecated := deprecatedHarnessAliases[target]; deprecated {
				warnings = append(warnings, fmt.Sprintf(
					"--harness %q is deprecated; using %q instead", name, canonical))
				target = canonical
			} else if !isValidHarness(target) {
				return nil, nil, fmt.Errorf(
					"unknown --harness target %q (valid: %s)",
					name, harnessTargetList())
			}
			if !seen[target] {
				seen[target] = true
				out = append(out, target)
			}
		}
	}
	return out, warnings, nil
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
		result.Warnings = append(result.Warnings,
			"goose hooks wired to 'npx ca' because no ca binary path was resolved; "+
				"the hooks require 'ca' to be on PATH at hook time. Re-run after installing the ca binary to pin the absolute path.")
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
	if err := reconcileHarnessFile(filepath.Join(recipeDir, "compound-cook-it.yaml"), templates.GooseRecipe(), result); err != nil {
		return err
	}
	if err := reconcileHarnessFile(filepath.Join(recipeDir, "compound-review.yaml"), templates.GooseReviewRecipe(), result); err != nil {
		return err
	}
	// Reviewer subrecipes for the open-model review fleet. The per-recipe model
	// pin placeholders default to empty at install (inherit from the parent
	// recipe / env); the loop substitutes a concrete review model when wiring
	// `--reviewers` for `--implementer goose`.
	for name, body := range templates.GooseReviewSubrecipes() {
		sub := substituteReviewModel(body, "", "")
		if err := reconcileHarnessFile(filepath.Join(recipeDir, name), sub, result); err != nil {
			return err
		}
	}
	return nil
}

// substituteReviewModel replaces the reviewer subrecipe model-pin placeholders
// with the given provider and model. Empty values mean "inherit" (the recipe
// settings default to empty, like the parent's goose_provider/goose_model).
func substituteReviewModel(body, provider, model string) string {
	body = strings.ReplaceAll(body, "{{REVIEW_PROVIDER}}", provider)
	return strings.ReplaceAll(body, "{{REVIEW_MODEL}}", model)
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

// installAgy installs the agy (Antigravity CLI) target: it appends the compound
// protocol section to AGENTS.md (agy's native memory file). The section uses its
// own header so it coexists with the shared lesson section that codex/claude
// write to AGENTS.md, and re-runs are idempotent via the header guard. agy is
// the functional loop engine that replaces the removed standalone gemini CLI.
func installAgy(repoRoot string, result *InitResult) error {
	agentsPath := filepath.Join(repoRoot, "AGENTS.md")
	section := templates.AgyMemory()

	existing, err := os.ReadFile(agentsPath)
	if err == nil {
		if strings.Contains(string(existing), templates.AntigravitySectionHeader) {
			return nil // Already installed.
		}
		content := strings.TrimRight(string(existing), "\n") + "\n\n" + section
		return os.WriteFile(agentsPath, []byte(content), 0644)
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("read AGENTS.md: %w", err)
	}
	result.FilesCreated = append(result.FilesCreated, agentsPath)
	return os.WriteFile(agentsPath, []byte(section), 0644)
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
