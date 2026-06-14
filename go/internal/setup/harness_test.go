package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newHarnessRepo creates a tempdir repo with a .git marker and returns its path.
func newHarnessRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	return dir
}

func TestParseHarnessTargets_CommaRepeatDedupeUnknownEmpty(t *testing.T) {
	t.Parallel()

	// Empty input => no targets (caller defaults to claude full install).
	got, err := ParseHarnessTargets(nil)
	if err != nil {
		t.Fatalf("empty input errored: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("empty input expected no targets, got %v", got)
	}

	// Comma-separated single arg.
	got, err = ParseHarnessTargets([]string{"claude,gemini"})
	if err != nil {
		t.Fatalf("comma input errored: %v", err)
	}
	if len(got) != 2 || got[0] != HarnessClaude || got[1] != HarnessGemini {
		t.Errorf("comma input expected [claude gemini], got %v", got)
	}

	// Repeated flags plus dedupe (claude appears twice).
	got, err = ParseHarnessTargets([]string{"goose", "claude", "claude"})
	if err != nil {
		t.Fatalf("repeat input errored: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("repeat input expected dedup to 2 targets, got %v", got)
	}

	// Whitespace tolerance.
	got, err = ParseHarnessTargets([]string{" codex , gemini "})
	if err != nil {
		t.Fatalf("whitespace input errored: %v", err)
	}
	if len(got) != 2 || got[0] != HarnessCodex || got[1] != HarnessGemini {
		t.Errorf("whitespace input expected [codex gemini], got %v", got)
	}

	// Unknown target rejected with a clear, value-naming error.
	_, err = ParseHarnessTargets([]string{"claude,bogus"})
	if err == nil {
		t.Fatal("unknown target should error")
	}
	if !strings.Contains(err.Error(), "bogus") {
		t.Errorf("error should name the bad value, got: %v", err)
	}
	for _, valid := range []string{"claude", "codex", "gemini", "goose"} {
		if !strings.Contains(err.Error(), valid) {
			t.Errorf("error should list valid value %q, got: %v", valid, err)
		}
	}
}

func TestSetup_NoHarnessFlag_ByteIdenticalToDefault(t *testing.T) {
	// Two repos: one with default install, one with explicit empty Targets.
	// The .claude tree must be byte-identical.
	a := newHarnessRepo(t)
	b := newHarnessRepo(t)

	opts := InitOptions{SkipHooks: true}
	if _, err := InitRepo(a, opts); err != nil {
		t.Fatalf("default InitRepo: %v", err)
	}
	optsEmpty := InitOptions{SkipHooks: true, Targets: nil}
	if _, err := InitRepo(b, optsEmpty); err != nil {
		t.Fatalf("empty-targets InitRepo: %v", err)
	}

	if diff := compareDirTrees(t, filepath.Join(a, ".claude"), filepath.Join(b, ".claude")); diff != "" {
		t.Errorf(".claude trees differ between default and empty Targets:\n%s", diff)
	}
}

func TestSetup_HarnessClaude_EqualsDefault(t *testing.T) {
	a := newHarnessRepo(t)
	b := newHarnessRepo(t)

	if _, err := InitRepo(a, InitOptions{SkipHooks: true}); err != nil {
		t.Fatalf("default InitRepo: %v", err)
	}
	if _, err := InitRepo(b, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessClaude}}); err != nil {
		t.Fatalf("--harness claude InitRepo: %v", err)
	}

	if diff := compareDirTrees(t, filepath.Join(a, ".claude"), filepath.Join(b, ".claude")); diff != "" {
		t.Errorf("--harness claude differs from default:\n%s", diff)
	}
}

func TestSetup_HarnessGoose_InstallsGooseOnly(t *testing.T) {
	dir := newHarnessRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	res, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGoose}})
	if err != nil {
		t.Fatalf("--harness goose InitRepo: %v", err)
	}

	// Goose assets installed under HOME/.agents/plugins/compound/.
	hooksPath := filepath.Join(home, ".agents", "plugins", "compound", "hooks", "hooks.json")
	if _, err := os.Stat(hooksPath); err != nil {
		t.Errorf("expected goose hooks.json at %s: %v", hooksPath, err)
	}
	hintsPath := filepath.Join(dir, ".goosehints")
	if _, err := os.Stat(hintsPath); err != nil {
		t.Errorf("expected .goosehints in repo: %v", err)
	}
	recipePath := filepath.Join(dir, ".goose", "recipes", "compound-cook-it.yaml")
	if _, err := os.Stat(recipePath); err != nil {
		t.Errorf("expected compound-cook-it recipe: %v", err)
	}
	reviewPath := filepath.Join(dir, ".goose", "recipes", "compound-review.yaml")
	if _, err := os.Stat(reviewPath); err != nil {
		t.Errorf("expected compound-review subrecipe: %v", err)
	}

	// The installed (post-substitution) files must still reference the workflow
	// primitives so the wiring cannot silently regress end-to-end.
	hints, err := os.ReadFile(hintsPath)
	if err != nil {
		t.Fatalf("read installed .goosehints: %v", err)
	}
	for _, prim := range []string{"ca search", "ca phase-check", "EPIC_COMPLETE"} {
		if !strings.Contains(string(hints), prim) {
			t.Errorf("installed .goosehints missing primitive reference %q", prim)
		}
	}
	recipe, err := os.ReadFile(recipePath)
	if err != nil {
		t.Fatalf("read installed compound-cook-it.yaml: %v", err)
	}
	for _, prim := range []string{"ca search", "ca phase-check", "EPIC_COMPLETE"} {
		if !strings.Contains(string(recipe), prim) {
			t.Errorf("installed compound-cook-it.yaml missing primitive reference %q", prim)
		}
	}

	// .claude must NOT be installed when claude is not a target.
	if _, err := os.Stat(filepath.Join(dir, ".claude", "agents", "compound")); err == nil {
		t.Error(".claude templates should not be installed for goose-only target")
	}

	if len(res.Targets) != 1 || res.Targets[0] != HarnessGoose {
		t.Errorf("result Targets expected [goose], got %v", res.Targets)
	}
}

func TestSetup_HarnessGoose_InstallsReviewFleetSubrecipes(t *testing.T) {
	dir := newHarnessRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGoose}}); err != nil {
		t.Fatalf("--harness goose InitRepo: %v", err)
	}

	recipeDir := filepath.Join(dir, ".goose", "recipes")
	// Parent plus three reviewer subrecipes must be installed.
	for _, name := range []string{
		"compound-review.yaml",
		"review-security.yaml",
		"review-correctness.yaml",
		"review-quality.yaml",
	} {
		p := filepath.Join(recipeDir, name)
		data, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("expected installed recipe %s: %v", name, err)
		}
		// Install-time placeholders must be fully substituted.
		for _, ph := range []string{"{{REVIEW_PROVIDER}}", "{{REVIEW_MODEL}}"} {
			if strings.Contains(string(data), ph) {
				t.Errorf("installed %s still has unsubstituted placeholder %s", name, ph)
			}
		}
	}

	// Subrecipes must retain their structured verdict and REVIEW markers post-install.
	sec, err := os.ReadFile(filepath.Join(recipeDir, "review-security.yaml"))
	if err != nil {
		t.Fatalf("read installed review-security.yaml: %v", err)
	}
	for _, want := range []string{"json_schema", "REVIEW_APPROVED", "REVIEW_CHANGES_REQUESTED", "diff_range"} {
		if !strings.Contains(string(sec), want) {
			t.Errorf("installed review-security.yaml missing %q", want)
		}
	}
}

func TestSetup_HarnessGoose_ReviewFleetIdempotent(t *testing.T) {
	dir := newHarnessRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	opts := InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGoose}}
	if _, err := InitRepo(dir, opts); err != nil {
		t.Fatalf("first goose InitRepo: %v", err)
	}
	secPath := filepath.Join(dir, ".goose", "recipes", "review-security.yaml")
	first, err := os.ReadFile(secPath)
	if err != nil {
		t.Fatalf("read review-security.yaml: %v", err)
	}
	if _, err := InitRepo(dir, opts); err != nil {
		t.Fatalf("second goose InitRepo: %v", err)
	}
	second, err := os.ReadFile(secPath)
	if err != nil {
		t.Fatalf("read review-security.yaml (2nd): %v", err)
	}
	if string(first) != string(second) {
		t.Error("goose review-fleet install is not idempotent: review-security.yaml changed on second run")
	}
}

func TestSetup_HarnessGooseHooksJson_BlockingPhaseGate(t *testing.T) {
	dir := newHarnessRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGoose}}); err != nil {
		t.Fatalf("--harness goose InitRepo: %v", err)
	}

	hooksPath := filepath.Join(home, ".agents", "plugins", "compound", "hooks", "hooks.json")
	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatalf("read goose hooks.json: %v", err)
	}
	content := string(data)
	// BIN must be substituted away (no raw placeholder left).
	if strings.Contains(content, "{{BIN}}") {
		t.Error("goose hooks.json still has unsubstituted {{BIN}} placeholder")
	}
	if !strings.Contains(content, "PreToolUse") {
		t.Error("goose hooks.json missing PreToolUse phase-gate")
	}
	if !strings.Contains(content, "exit 2") && !strings.Contains(content, `"decision":"block"`) {
		t.Error("goose PreToolUse must block via exit 2 or decision:block")
	}
	// R5: the matcher must target Goose's namespaced edit tool
	// developer__text_editor (the old Claude-only matcher would never fire under
	// real Goose), staying an unanchored alternation for custom-MCP edit tools.
	if !strings.Contains(content, `"matcher": "developer__text_editor|Edit|Write|str_replace|create_file|text_editor"`) {
		t.Error("goose PreToolUse matcher must target developer__text_editor (namespaced) plus Claude-style alternates")
	}
	// FIX-2: the reason must be JSON-escaped before being printf'd into the payload.
	// Decode the JSON so we assert against the shell that actually runs (the
	// installed file substitutes {{BIN}} but the PreToolUse command is unchanged).
	var manifest struct {
		Hooks struct {
			PreToolUse []struct {
				Hooks []struct {
					Command string `json:"command"`
				} `json:"hooks"`
			} `json:"PreToolUse"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("installed goose hooks.json is not valid JSON: %v", err)
	}
	if len(manifest.Hooks.PreToolUse) == 0 || len(manifest.Hooks.PreToolUse[0].Hooks) == 0 {
		t.Fatal("installed goose hooks.json has no PreToolUse command")
	}
	cmd := manifest.Hooks.PreToolUse[0].Hooks[0].Command
	if !strings.Contains(cmd, `s/\\/\\\\/g`) || !strings.Contains(cmd, `s/"/\\"/g`) {
		t.Errorf("goose PreToolUse must JSON-escape the reason before printf, got: %s", cmd)
	}
}

func TestSetup_HarnessGoose_WarnsNpxOnPathWhenNoBinary(t *testing.T) {
	// Empty BinaryPath => goose hooks fall back to literal `npx ca`, which
	// requires `ca` to be resolvable on PATH at hook time. That must surface a
	// warning so the user is not silently left with a broken hook command.
	dir := newHarnessRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	res, err := InitRepo(dir, InitOptions{
		SkipHooks: true,
		Targets:   []HarnessTarget{HarnessGoose},
	})
	if err != nil {
		t.Fatalf("--harness goose InitRepo (no binary): %v", err)
	}
	if len(res.Warnings) == 0 {
		t.Fatal("expected a warning when goose installs with an empty BinaryPath")
	}
	joined := strings.Join(res.Warnings, "\n")
	if !strings.Contains(joined, "npx") || !strings.Contains(joined, "PATH") {
		t.Errorf("warning should mention the npx/PATH fallback, got: %v", res.Warnings)
	}

	// A resolved binary path must NOT warn.
	dir2 := newHarnessRepo(t)
	home2 := t.TempDir()
	t.Setenv("HOME", home2)
	res2, err := InitRepo(dir2, InitOptions{
		SkipHooks:  true,
		BinaryPath: "/usr/local/bin/ca",
		Targets:    []HarnessTarget{HarnessGoose},
	})
	if err != nil {
		t.Fatalf("--harness goose InitRepo (with binary): %v", err)
	}
	if len(res2.Warnings) != 0 {
		t.Errorf("resolved BinaryPath must not warn, got: %v", res2.Warnings)
	}
}

func TestSetup_HarnessCodex_InstallsCodexOnly(t *testing.T) {
	dir := newHarnessRepo(t)

	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessCodex}}); err != nil {
		t.Fatalf("--harness codex InitRepo: %v", err)
	}

	// Codex reuses AGENTS.md plus a codex config.
	if _, err := os.Stat(filepath.Join(dir, "AGENTS.md")); err != nil {
		t.Errorf("expected AGENTS.md for codex target: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".codex", "config.toml")); err != nil {
		t.Errorf("expected .codex/config.toml: %v", err)
	}
	// No .claude templates for codex-only.
	if _, err := os.Stat(filepath.Join(dir, ".claude", "agents", "compound")); err == nil {
		t.Error(".claude templates should not be installed for codex-only target")
	}
}

func TestSetup_HarnessGemini_InstallsGeminiOnly(t *testing.T) {
	dir := newHarnessRepo(t)

	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGemini}}); err != nil {
		t.Fatalf("--harness gemini InitRepo: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "GEMINI.md")); err != nil {
		t.Errorf("expected GEMINI.md for gemini target: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".claude", "agents", "compound")); err == nil {
		t.Error(".claude templates should not be installed for gemini-only target")
	}
}

func TestSetup_HarnessGemini_WritesSingleFile(t *testing.T) {
	// FIX-4: Gemini reads GEMINI.md from the repo root, so the redundant
	// .gemini/GEMINI.md mirror is dropped. Only the single GEMINI.md is written.
	dir := newHarnessRepo(t)

	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGemini}}); err != nil {
		t.Fatalf("--harness gemini InitRepo: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "GEMINI.md")); err != nil {
		t.Errorf("expected GEMINI.md at repo root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".gemini", "GEMINI.md")); err == nil {
		t.Error("redundant .gemini/GEMINI.md mirror must not be written")
	}
}

func TestSetup_HarnessMultiple_CommaSeparated(t *testing.T) {
	dir := newHarnessRepo(t)

	targets, err := ParseHarnessTargets([]string{"claude,gemini"})
	if err != nil {
		t.Fatalf("parse targets: %v", err)
	}
	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Targets: targets}); err != nil {
		t.Fatalf("--harness claude,gemini InitRepo: %v", err)
	}

	// Both claude and gemini installed.
	if _, err := os.Stat(filepath.Join(dir, ".claude", "agents", "compound")); err != nil {
		t.Errorf("expected .claude templates: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "GEMINI.md")); err != nil {
		t.Errorf("expected GEMINI.md: %v", err)
	}
	// goose and codex NOT installed.
	if _, err := os.Stat(filepath.Join(dir, ".codex", "config.toml")); err == nil {
		t.Error("codex should not be installed")
	}
	if _, err := os.Stat(filepath.Join(dir, ".goosehints")); err == nil {
		t.Error("goose should not be installed")
	}
}

func TestSetup_HarnessGoose_Idempotent(t *testing.T) {
	dir := newHarnessRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	opts := InitOptions{SkipHooks: true, Targets: []HarnessTarget{HarnessGoose}}
	if _, err := InitRepo(dir, opts); err != nil {
		t.Fatalf("first goose InitRepo: %v", err)
	}
	hooksPath := filepath.Join(home, ".agents", "plugins", "compound", "hooks", "hooks.json")
	first, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatalf("read hooks.json: %v", err)
	}

	if _, err := InitRepo(dir, opts); err != nil {
		t.Fatalf("second goose InitRepo: %v", err)
	}
	second, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatalf("read hooks.json (2nd): %v", err)
	}
	if string(first) != string(second) {
		t.Error("goose install is not idempotent: hooks.json changed on second run")
	}
}

func TestSetup_HarnessUnknown_RejectedBeforeWrites(t *testing.T) {
	_, err := ParseHarnessTargets([]string{"frobnicate"})
	if err == nil {
		t.Fatal("unknown harness target should be rejected")
	}
}

// compareDirTrees walks two directory trees and returns a non-empty diff
// description if they differ in structure or file content.
func compareDirTrees(t *testing.T, a, b string) string {
	t.Helper()
	af := readTree(t, a)
	bf := readTree(t, b)
	var diffs []string
	for rel, ac := range af {
		bc, ok := bf[rel]
		if !ok {
			diffs = append(diffs, "only in A: "+rel)
			continue
		}
		if ac != bc {
			diffs = append(diffs, "content differs: "+rel)
		}
	}
	for rel := range bf {
		if _, ok := af[rel]; !ok {
			diffs = append(diffs, "only in B: "+rel)
		}
	}
	return strings.Join(diffs, "\n")
}

// readTree returns a map of relative-path -> content for all files under root.
func readTree(t *testing.T, root string) map[string]string {
	t.Helper()
	out := make(map[string]string)
	_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		data, rErr := os.ReadFile(p)
		if rErr == nil {
			out[rel] = string(data)
		}
		return nil
	})
	return out
}
