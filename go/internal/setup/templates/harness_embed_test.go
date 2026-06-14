package templates

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"testing"
)

// preToolUseMatcher decodes the goose hooks.json and returns the matcher string
// of the first PreToolUse hook group. Goose treats a matcher containing only
// letters, digits, underscores and pipes as a JavaScript regex; the plain
// alternation used here is valid under Go RE2 too, so we compile it with the
// stdlib regexp package and assert tool-name matching.
func preToolUseMatcher(t *testing.T, hooks string) string {
	t.Helper()
	var manifest struct {
		Hooks struct {
			PreToolUse []struct {
				Matcher string `json:"matcher"`
			} `json:"PreToolUse"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal([]byte(hooks), &manifest); err != nil {
		t.Fatalf("goose hooks.json is not valid JSON: %v", err)
	}
	if len(manifest.Hooks.PreToolUse) == 0 {
		t.Fatal("goose hooks.json has no PreToolUse matcher")
	}
	return manifest.Hooks.PreToolUse[0].Matcher
}

// TestGooseHooksJSON_PreToolUseMatcherFiresOnGooseTools compiles the embedded
// PreToolUse matcher as a regex and asserts it fires on the real Goose edit tool
// name (developer__text_editor) as well as the Claude names Edit and Write. An
// anchored matcher like ^(...text_editor)$ fails this because Goose sends the
// developer__-prefixed name; the fix is an unanchored alternation that matches
// by substring.
func TestGooseHooksJSON_PreToolUseMatcherFiresOnGooseTools(t *testing.T) {
	matcher := preToolUseMatcher(t, GooseHooksJSON())
	re, err := regexp.Compile(matcher)
	if err != nil {
		t.Fatalf("PreToolUse matcher %q is not a valid regex: %v", matcher, err)
	}
	// developer__text_editor / Edit / Write are the namespaced + Claude-style
	// names; write / edit are Goose toolshim's collapsed local-model names; and
	// str_replace_editor closes the audit symmetry gap (it is in the Go map but
	// was missing from this matcher).
	for _, tool := range []string{
		"developer__text_editor", "Edit", "Write",
		"write", "edit", "str_replace_editor",
	} {
		if !re.MatchString(tool) {
			t.Errorf("PreToolUse matcher %q does not fire on tool %q", matcher, tool)
		}
	}
}

// postToolUseMatcher decodes the goose hooks.json and returns the matcher string
// of the first PostToolUse hook group.
func postToolUseMatcher(t *testing.T, hooks string) string {
	t.Helper()
	var manifest struct {
		Hooks struct {
			PostToolUse []struct {
				Matcher string `json:"matcher"`
			} `json:"PostToolUse"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal([]byte(hooks), &manifest); err != nil {
		t.Fatalf("goose hooks.json is not valid JSON: %v", err)
	}
	if len(manifest.Hooks.PostToolUse) == 0 {
		t.Fatal("goose hooks.json has no PostToolUse matcher")
	}
	return manifest.Hooks.PostToolUse[0].Matcher
}

// TestGooseHooksJSON_NamespacedToolMatcher is the regression guard for the
// verified tool-name bug: Goose's built-in tools are namespaced
// (developer__text_editor, developer__shell), not Claude's bare Edit/Write/Bash.
// The PreToolUse matcher must target developer__text_editor (file edits) and the
// PostToolUse matcher must target developer__shell so the phase-gate and
// post-tool-success hooks actually fire under real Goose.
func TestGooseHooksJSON_NamespacedToolMatcher(t *testing.T) {
	hooks := GooseHooksJSON()
	pre := preToolUseMatcher(t, hooks)
	if !strings.Contains(pre, "developer__text_editor") {
		t.Errorf("PreToolUse matcher must target Goose's namespaced edit tool developer__text_editor, got %q", pre)
	}
	post := postToolUseMatcher(t, hooks)
	if !strings.Contains(post, "developer__shell") {
		t.Errorf("PostToolUse matcher must target Goose's namespaced shell tool developer__shell, got %q", post)
	}
	// Keep the permissive Claude-style alternates so the gate still fires across
	// extension configs and custom MCPs that expose bare tool names.
	for _, name := range []string{"Edit", "Write"} {
		if !strings.Contains(pre, name) {
			t.Errorf("PreToolUse matcher should keep Claude-style alternate %q for custom MCPs, got %q", name, pre)
		}
	}
}

// preToolUseCommand decodes the goose hooks.json and returns the (JSON-decoded)
// shell command string of the first PreToolUse hook. Asserting against the
// decoded command is robust: it matches the shell that actually runs, not the
// doubly-escaped raw JSON bytes.
func preToolUseCommand(t *testing.T, hooks string) string {
	t.Helper()
	var manifest struct {
		Hooks struct {
			PreToolUse []struct {
				Hooks []struct {
					Command string `json:"command"`
				} `json:"hooks"`
			} `json:"PreToolUse"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal([]byte(hooks), &manifest); err != nil {
		t.Fatalf("goose hooks.json is not valid JSON: %v", err)
	}
	if len(manifest.Hooks.PreToolUse) == 0 || len(manifest.Hooks.PreToolUse[0].Hooks) == 0 {
		t.Fatal("goose hooks.json has no PreToolUse command")
	}
	return manifest.Hooks.PreToolUse[0].Hooks[0].Command
}

// TestGooseHooksJSON_BlockingPhaseGate verifies the embedded Goose hooks
// manifest exists, carries the BIN placeholder for substitution, declares the
// four lifecycle events, and blocks out-of-phase edits via exit 2 or a
// decision:block payload (R5).
func TestGooseHooksJSON_BlockingPhaseGate(t *testing.T) {
	hooks := GooseHooksJSON()
	if hooks == "" {
		t.Fatal("Goose hooks.json template is empty")
	}
	if !strings.Contains(hooks, "{{BIN}}") {
		t.Error("Goose hooks.json missing {{BIN}} placeholder")
	}
	for _, event := range []string{"SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"} {
		if !strings.Contains(hooks, event) {
			t.Errorf("Goose hooks.json missing %s event", event)
		}
	}
	// PreToolUse must be a real blocking phase-gate, not a warning.
	if !strings.Contains(hooks, "exit 2") && !strings.Contains(hooks, `"decision":"block"`) {
		t.Error("Goose PreToolUse hook must block via exit 2 or decision:block")
	}
	// R5: the PreToolUse matcher must target Goose's namespaced edit tool
	// developer__text_editor (the old Claude-only matcher would never fire under
	// real Goose). The matcher stays an unanchored alternation so it also fires on
	// custom-MCP edit tools.
	if !strings.Contains(hooks, `"matcher": "developer__text_editor|Edit|Write|str_replace|create_file|text_editor|str_replace_editor|write|edit"`) {
		t.Error("Goose PreToolUse matcher must target developer__text_editor (namespaced) plus Claude-style and toolshim alternates")
	}
	// FIX-2: the extracted reason must be JSON-escaped before being printf'd into
	// the {"decision":"block","reason":"..."} payload (backslash + quote escaping,
	// then control chars stripped). Assert against the decoded shell command.
	cmd := preToolUseCommand(t, hooks)
	if !strings.Contains(cmd, `s/\\/\\\\/g`) || !strings.Contains(cmd, `s/"/\\"/g`) {
		t.Errorf("Goose PreToolUse must JSON-escape the reason (backslash and quote escaping) before printf, got: %s", cmd)
	}
	if !strings.Contains(cmd, `tr -d '\n\r\t'`) {
		t.Errorf("Goose PreToolUse must strip control chars from the reason, got: %s", cmd)
	}
}

// TestGooseHints verifies the .goosehints memory file mirrors the compound
// integration and carries the completion markers plus a commit/push reminder.
func TestGooseHints(t *testing.T) {
	hints := GooseHints()
	if hints == "" {
		t.Fatal("Goose .goosehints template is empty")
	}
	for _, marker := range []string{"EPIC_COMPLETE", "HUMAN_REQUIRED", "EPIC_FAILED"} {
		if !strings.Contains(hints, marker) {
			t.Errorf(".goosehints missing %s marker", marker)
		}
	}
	if !strings.Contains(hints, "Compound Agent") {
		t.Error(".goosehints missing Compound Agent section")
	}
	if !strings.Contains(strings.ToLower(hints), "commit") || !strings.Contains(strings.ToLower(hints), "push") {
		t.Error(".goosehints missing commit and push reminder")
	}
	// Recall + capture primitives must be referenced by name so the loop agent
	// actually exercises them (mirrors the Claude mandatory-recall protocol).
	for _, prim := range []string{"ca search", "ca knowledge", "ca learn"} {
		if !strings.Contains(hints, prim) {
			t.Errorf(".goosehints must reference recall/capture primitive %q", prim)
		}
	}
	// Phase-gate concept and the ca phase-check gate sequence.
	if !strings.Contains(strings.ToLower(hints), "phase") {
		t.Error(".goosehints must reference the phase-gate concept")
	}
	if !strings.Contains(hints, "ca phase-check") {
		t.Error(".goosehints must reference ca phase-check")
	}
	// The Verification Contract is the epic-local proof of done.
	if !strings.Contains(hints, "Verification Contract") {
		t.Error(".goosehints must reference the Verification Contract")
	}
}

// TestGooseRecipe verifies the compound-cook-it recipe encodes the FULL workflow
// primitives, not just phase words: the four phases in cook-it order, the recall
// and capture primitives, the ca phase-check gate sequence, the Verification
// Contract / acceptance criteria, and the completion marker (R3).
func TestGooseRecipe(t *testing.T) {
	recipe := GooseRecipe()
	if recipe == "" {
		t.Fatal("Goose compound-cook-it recipe is empty")
	}
	for _, phase := range []string{"plan", "work", "review", "compound"} {
		if !strings.Contains(strings.ToLower(recipe), phase) {
			t.Errorf("recipe missing %s phase", phase)
		}
	}
	// cook-it phase order plan -> work -> review -> compound, asserted against the
	// numbered phase headings (1. plan ... 4. compound) so prose mentions of a
	// phase word elsewhere do not perturb the check.
	lower := strings.ToLower(recipe)
	last := -1
	for i, phase := range []string{"plan", "work", "review", "compound"} {
		marker := fmt.Sprintf("%d. %s", i+1, phase)
		idx := strings.Index(lower, marker)
		if idx < 0 {
			t.Errorf("recipe missing numbered phase heading %q", marker)
			continue
		}
		if idx < last {
			t.Errorf("recipe phases out of cook-it order: %q appears before a prior phase", marker)
		}
		last = idx
	}
	// Recall + capture primitives wired into the phases.
	for _, prim := range []string{"ca search", "ca knowledge", "ca learn"} {
		if !strings.Contains(recipe, prim) {
			t.Errorf("recipe must reference workflow primitive %q", prim)
		}
	}
	// Phase gating via the same ca phase-check commands the Claude skill uses.
	if !strings.Contains(recipe, "ca phase-check") {
		t.Error("recipe must reference ca phase-check gating")
	}
	// The AC / Verification Contract gate.
	if !strings.Contains(recipe, "Verification Contract") {
		t.Error("recipe must reference the Verification Contract gate")
	}
	if !strings.Contains(recipe, "EPIC_COMPLETE") {
		t.Error("recipe must require EPIC_COMPLETE")
	}
}

// TestGooseReviewSubrecipe verifies the compound-review parent recipe exists,
// carries per-recipe model settings (so a reviewer can run on a different open
// model), and references the core reviewer categories plus the ca search recall
// primitive (mirrors review/SKILL.md).
func TestGooseReviewSubrecipe(t *testing.T) {
	recipe := GooseReviewRecipe()
	if recipe == "" {
		t.Fatal("Goose compound-review recipe is empty")
	}
	for _, key := range []string{"goose_provider", "goose_model"} {
		if !strings.Contains(recipe, key) {
			t.Errorf("compound-review recipe must carry settings.%s for a heterogeneous review fleet", key)
		}
	}
	for _, cat := range []string{"security", "test-coverage", "simplicity", "architecture"} {
		if !strings.Contains(recipe, cat) {
			t.Errorf("compound-review recipe must reference reviewer category %q", cat)
		}
	}
	if !strings.Contains(recipe, "ca search") {
		t.Error("compound-review recipe must run ca search for per-category calibration")
	}
}

// TestGooseReviewParentHasSubRecipes verifies the parent compound-review recipe
// fans out to the three reviewer subrecipes via a sub_recipes block, threading
// the epic and a scoped diff_range to each child.
func TestGooseReviewParentHasSubRecipes(t *testing.T) {
	recipe := GooseReviewRecipe()
	if !strings.Contains(recipe, "sub_recipes:") {
		t.Error("parent compound-review recipe must declare a sub_recipes block")
	}
	for _, child := range []string{"review-security.yaml", "review-correctness.yaml", "review-quality.yaml"} {
		if !strings.Contains(recipe, child) {
			t.Errorf("parent compound-review recipe must reference subrecipe %q", child)
		}
	}
	// The diff_range parameter must be threaded into the children so reviews are
	// scoped to the same range the loop measures.
	if !strings.Contains(recipe, "diff_range") {
		t.Error("parent compound-review recipe must thread diff_range to subrecipes")
	}
}

// TestGooseReviewSubrecipes verifies each reviewer subrecipe pins its own
// provider/model via settings, declares a response.json_schema verdict (so weak
// models still emit a structured, detectable result), accepts a diff_range, and
// requires the REVIEW markers.
func TestGooseReviewSubrecipes(t *testing.T) {
	subs := GooseReviewSubrecipes()
	for _, name := range []string{"review-security.yaml", "review-correctness.yaml", "review-quality.yaml"} {
		body, ok := subs[name]
		if !ok || body == "" {
			t.Errorf("missing reviewer subrecipe %q", name)
			continue
		}
		// Model pin via settings so the reviewer can run on a different open model.
		for _, key := range []string{"goose_provider", "goose_model"} {
			if !strings.Contains(body, key) {
				t.Errorf("%s must carry settings.%s model pin", name, key)
			}
		}
		// Placeholders for install-time substitution.
		for _, ph := range []string{"{{REVIEW_PROVIDER}}", "{{REVIEW_MODEL}}"} {
			if !strings.Contains(body, ph) {
				t.Errorf("%s must carry placeholder %s for install-time substitution", name, ph)
			}
		}
		// Structured verdict schema.
		if !strings.Contains(body, "response:") || !strings.Contains(body, "json_schema:") {
			t.Errorf("%s must declare a response.json_schema for a structured verdict", name)
		}
		if !strings.Contains(body, "verdict") {
			t.Errorf("%s json_schema must require a verdict field", name)
		}
		// Diff-range scoping.
		if !strings.Contains(body, "diff_range") {
			t.Errorf("%s must accept a diff_range parameter", name)
		}
		// REVIEW markers so the aggregator can detect the result.
		for _, marker := range []string{"REVIEW_APPROVED", "REVIEW_CHANGES_REQUESTED"} {
			if !strings.Contains(body, marker) {
				t.Errorf("%s must emit the %s marker", name, marker)
			}
		}
		// Per-category calibration primitive.
		if !strings.Contains(body, "ca search") {
			t.Errorf("%s must run ca search for calibration", name)
		}
	}
}

// assertDeveloperExtension verifies a goose recipe declares an `extensions:`
// block that registers the builtin `developer` extension, matching the canonical
// goose recipe schema:
//
//	extensions:
//	  - type: builtin
//	    name: developer
//
// Without this block the review subrecipes silently depend on the user's global
// goose profile having the developer extension enabled; declaring it makes the
// recipes self-contained for their shell/file tool use (git diff, ca search,
// file reads).
func assertDeveloperExtension(t *testing.T, name, recipe string) {
	t.Helper()
	if !strings.Contains(recipe, "extensions:") {
		t.Errorf("%s must declare an extensions: block", name)
		return
	}
	// The block must register the builtin developer extension. Assert the schema
	// keys (type: builtin, name: developer) appear so a typo in either is caught.
	if !strings.Contains(recipe, "type: builtin") {
		t.Errorf("%s extensions block must declare a builtin extension (type: builtin)", name)
	}
	if !strings.Contains(recipe, "name: developer") {
		t.Errorf("%s extensions block must register the developer extension (name: developer)", name)
	}
}

// TestGooseRecipesDeclareDeveloperExtension verifies every runtime-invoked goose
// recipe (the three reviewer subrecipes, the parent compound-review, and the
// compound-cook-it driver) declares the builtin developer extension so they are
// self-contained and do not depend on ambient global goose config.
func TestGooseRecipesDeclareDeveloperExtension(t *testing.T) {
	subs := GooseReviewSubrecipes()
	for _, name := range []string{"review-security.yaml", "review-correctness.yaml", "review-quality.yaml"} {
		body, ok := subs[name]
		if !ok || body == "" {
			t.Errorf("missing reviewer subrecipe %q", name)
			continue
		}
		assertDeveloperExtension(t, name, body)
	}
	assertDeveloperExtension(t, "compound-review.yaml", GooseReviewRecipe())
	assertDeveloperExtension(t, "compound-cook-it.yaml", GooseRecipe())
}

// TestCodexConfig verifies the embedded codex config exists for the codex
// install target.
func TestCodexConfig(t *testing.T) {
	cfg := CodexConfig()
	if cfg == "" {
		t.Fatal("Codex config.toml template is empty")
	}
}

// TestAgyMemory verifies the embedded agy AGENTS.md protocol section exists,
// mirrors the compound integration, and carries the idempotency markers and
// section header used for the append-only install.
func TestAgyMemory(t *testing.T) {
	mem := AgyMemory()
	if mem == "" {
		t.Fatal("agy AGENTS.md template is empty")
	}
	if !strings.Contains(mem, "Compound Agent") {
		t.Error("agy AGENTS.md missing Compound Agent section")
	}
	if !strings.Contains(mem, AntigravitySectionHeader) {
		t.Error("agy AGENTS.md missing the section header used for idempotent append")
	}
	for _, marker := range []string{AntigravityStartMarker, AntigravityEndMarker} {
		if !strings.Contains(mem, marker) {
			t.Errorf("agy AGENTS.md missing idempotency marker %q", marker)
		}
	}
}
