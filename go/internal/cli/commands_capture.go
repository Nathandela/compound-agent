// Package cli — capture commands: learn, capture, detect.
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/capture"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// registerCaptureCommands registers learn, capture, and detect commands.
func registerCaptureCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(learnCmd())
	rootCmd.AddCommand(captureCmd())
	rootCmd.AddCommand(detectCmd())
}

// DetectInput is the JSON schema for --input files used by capture and detect.
type DetectInput struct {
	Messages    []string             `json:"messages"`
	Context     memory.Context       `json:"context"`
	TestResult  *capture.TestResult  `json:"testResult,omitempty"`
	EditHistory *capture.EditHistory `json:"editHistory,omitempty"`
	Insight     string               `json:"insight,omitempty"`
}

// detectResult holds the outcome of running detection logic.
type detectResult struct {
	Detected bool
	Trigger  string
	Insight  string
	Source   memory.Source
	Type     memory.ItemType
	Reason   string // why detection or quality gate rejected (empty on success)
}

// --- learn command ---

// learnOpts holds the flag values for the learn command.
type learnOpts struct {
	trigger        string
	tags           string
	severity       string
	citation       string
	citationCommit string
	itemType       string
	patternBad     string
	patternGood    string
}

func learnCmd() *cobra.Command {
	var opts learnOpts

	cmd := &cobra.Command{
		Use:   "learn <insight>",
		Short: "Manually capture a lesson",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runLearn(cmd, args, &opts)
		},
	}

	cmd.Flags().StringVarP(&opts.trigger, "trigger", "t", "", "what triggered the insight")
	cmd.Flags().StringVar(&opts.tags, "tags", "", "comma-separated tags")
	cmd.Flags().StringVarP(&opts.severity, "severity", "s", "", "severity level (high, medium, low)")
	cmd.Flags().BoolP("yes", "y", false, "skip confirmation (no-op for learn)")
	cmd.Flags().StringVar(&opts.citation, "citation", "", "source citation (file:line)")
	cmd.Flags().StringVar(&opts.citationCommit, "citation-commit", "", "commit hash for citation")
	cmd.Flags().StringVar(&opts.itemType, "type", "lesson", "item type (lesson, solution, pattern, preference)")
	cmd.Flags().StringVar(&opts.patternBad, "pattern-bad", "", "bad pattern code (required for type=pattern)")
	cmd.Flags().StringVar(&opts.patternGood, "pattern-good", "", "good pattern code (required for type=pattern)")

	return cmd
}

// validateLearnInputs validates type, pattern, severity, and citation flags.
func validateLearnInputs(cmd *cobra.Command, opts *learnOpts) (memory.ItemType, *memory.Citation, error) {
	typ := memory.ItemType(opts.itemType)
	if !typ.Valid() {
		return "", nil, fmt.Errorf("invalid type %q (must be: lesson, solution, pattern, preference)", opts.itemType)
	}

	if typ == memory.TypePattern {
		if opts.patternBad == "" {
			return "", nil, fmt.Errorf("type=pattern requires --pattern-bad")
		}
		if opts.patternGood == "" {
			return "", nil, fmt.Errorf("type=pattern requires --pattern-good")
		}
	}

	if cmd.Flags().Changed("severity") {
		sev := memory.Severity(opts.severity)
		if !sev.Valid() {
			return "", nil, fmt.Errorf("invalid severity %q (must be: high, medium, low)", opts.severity)
		}
	}

	var cit *memory.Citation
	if opts.citation != "" {
		parsed, err := parseCitation(opts.citation, opts.citationCommit)
		if err != nil {
			return "", nil, err
		}
		cit = parsed
	} else if opts.citationCommit != "" {
		return "", nil, fmt.Errorf("--citation-commit requires --citation")
	}

	return typ, cit, nil
}

// runLearn executes the learn command logic.
func runLearn(cmd *cobra.Command, args []string, opts *learnOpts) error {
	insight := strings.Join(args, " ")

	typ, cit, err := validateLearnInputs(cmd, opts)
	if err != nil {
		return err
	}

	id := memory.GenerateID(insight, typ)
	trigger := opts.trigger
	if trigger == "" {
		trigger = "Manual capture"
	}

	item := memory.Item{
		ID:         id,
		Type:       typ,
		Trigger:    trigger,
		Insight:    insight,
		Tags:       parseTags(opts.tags),
		Source:     memory.SourceManual,
		Context:    memory.Context{Tool: "cli", Intent: "manual learning"},
		Created:    time.Now().UTC().Format(time.RFC3339),
		Confirmed:  true,
		Supersedes: []string{},
		Related:    []string{},
	}

	if cmd.Flags().Changed("severity") {
		sev := memory.Severity(opts.severity)
		item.Severity = &sev
	}
	if cit != nil {
		item.Citation = cit
	}
	if typ == memory.TypePattern {
		item.Pattern = &memory.Pattern{Bad: opts.patternBad, Good: opts.patternGood}
	}

	repoRoot := util.GetRepoRoot()
	if err := memory.AppendItem(repoRoot, item); err != nil {
		return fmt.Errorf("write: %w", err)
	}

	cmd.Printf("Learned: %s\n  ID: %s\n", insight, id)
	return nil
}

// --- capture command ---

func captureCmd() *cobra.Command {
	var (
		trigger string
		insight string
		input   string
		jsonOut bool
		yes     bool
	)

	cmd := &cobra.Command{
		Use:   "capture",
		Short: "Programmatic lesson capture",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runCapture(cmd, trigger, insight, input, jsonOut, yes)
		},
	}

	cmd.Flags().StringVarP(&trigger, "trigger", "t", "", "what triggered the insight")
	cmd.Flags().StringVarP(&insight, "insight", "i", "", "the insight text")
	cmd.Flags().StringVar(&input, "input", "", "JSON input file for auto-detection")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	cmd.Flags().BoolVarP(&yes, "yes", "y", false, "save without confirmation")

	return cmd
}

// resolveCapture determines trigger, insight, source, and type from flags or input file.
func resolveCapture(input, trigger, insight, repoRoot string) (detectResult, error) {
	if input != "" {
		dr, err := detectFromFile(input, repoRoot)
		if err != nil {
			return detectResult{}, err
		}
		return dr, nil
	}
	if trigger == "" || insight == "" {
		return detectResult{}, fmt.Errorf("requires either (--trigger and --insight) or --input")
	}
	return detectResult{
		Detected: true,
		Trigger:  trigger,
		Insight:  insight,
		Source:   memory.SourceManual,
		Type:     capture.InferItemType(insight),
	}, nil
}

// runCapture executes the capture command logic.
func runCapture(cmd *cobra.Command, trigger, insight, input string, jsonOut, yes bool) error {
	repoRoot := util.GetRepoRoot()

	dr, err := resolveCapture(input, trigger, insight, repoRoot)
	if err != nil {
		return err
	}

	if !dr.Detected {
		return outputNotDetected(cmd, dr.Reason, jsonOut, true)
	}

	id := memory.GenerateID(dr.Insight, dr.Type)

	if jsonOut {
		saved, err := saveIfConfirmed(repoRoot, id, dr, yes)
		if err != nil {
			return err
		}
		return writeJSON(cmd, map[string]interface{}{
			"id": id, "trigger": dr.Trigger, "insight": dr.Insight,
			"type": string(dr.Type), "saved": saved,
		})
	}

	if yes {
		item := buildCaptureItem(id, dr.Type, dr.Trigger, dr.Insight, dr.Source)
		if err := memory.AppendItem(repoRoot, item); err != nil {
			return fmt.Errorf("write: %w", err)
		}
		cmd.Printf("Learned: %s\n  ID: %s\n", dr.Insight, id)
	} else {
		cmd.Printf("Trigger: %s\nInsight: %s\nType:    %s\nSource:  %s\n\nTo save: run with --yes flag\n",
			dr.Trigger, dr.Insight, dr.Type, dr.Source)
	}
	return nil
}

// saveIfConfirmed saves the item if yes is true and returns whether it was saved.
func saveIfConfirmed(repoRoot, id string, dr detectResult, yes bool) (bool, error) {
	if !yes {
		return false, nil
	}
	item := buildCaptureItem(id, dr.Type, dr.Trigger, dr.Insight, dr.Source)
	if err := memory.AppendItem(repoRoot, item); err != nil {
		return false, fmt.Errorf("write: %w", err)
	}
	return true, nil
}

// outputNotDetected writes the "not detected" output in the appropriate format.
func outputNotDetected(cmd *cobra.Command, reason string, jsonOut, includeSaved bool) error {
	if jsonOut {
		out := map[string]interface{}{"detected": false, "reason": reason}
		if includeSaved {
			out["saved"] = false
		}
		return writeJSON(cmd, out)
	}
	if reason != "" {
		cmd.Printf("Not captured: %s\n", reason)
	} else {
		cmd.Println("No correction detected.")
	}
	return nil
}

// --- detect command ---

func detectCmd() *cobra.Command {
	var (
		input   string
		save    bool
		yes     bool
		jsonOut bool
	)

	cmd := &cobra.Command{
		Use:   "detect",
		Short: "Auto-detect corrections from input",
		RunE: func(cmd *cobra.Command, args []string) error {
			if input == "" {
				return fmt.Errorf("--input is required")
			}
			if save && !yes {
				return fmt.Errorf("--save requires --yes")
			}
			return runDetect(cmd, input, save, yes, jsonOut)
		},
	}

	cmd.Flags().StringVar(&input, "input", "", "JSON input file (required)")
	cmd.Flags().BoolVar(&save, "save", false, "save detected lesson")
	cmd.Flags().BoolVarP(&yes, "yes", "y", false, "confirm save")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")

	return cmd
}

// runDetect executes the detect command logic.
func runDetect(cmd *cobra.Command, input string, save, yes, jsonOut bool) error {
	repoRoot := util.GetRepoRoot()

	dr, err := detectFromFile(input, repoRoot)
	if err != nil {
		return err
	}

	if !dr.Detected {
		return outputNotDetected(cmd, dr.Reason, jsonOut, false)
	}

	id := memory.GenerateID(dr.Insight, dr.Type)

	if save && yes {
		return runDetectSave(cmd, repoRoot, id, dr, jsonOut)
	}

	return outputDetectResult(cmd, id, dr, jsonOut)
}

// runDetectSave saves the detected lesson and outputs the result.
func runDetectSave(cmd *cobra.Command, repoRoot, id string, dr detectResult, jsonOut bool) error {
	item := buildCaptureItem(id, dr.Type, dr.Trigger, dr.Insight, dr.Source)
	if err := memory.AppendItem(repoRoot, item); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if jsonOut {
		return writeJSON(cmd, detectResultJSON(id, dr, true))
	}
	cmd.Printf("Learned: %s\n  ID: %s\n", dr.Insight, id)
	return nil
}

// outputDetectResult writes detection results without saving.
func outputDetectResult(cmd *cobra.Command, id string, dr detectResult, jsonOut bool) error {
	if jsonOut {
		return writeJSON(cmd, detectResultJSON(id, dr, false))
	}
	cmd.Printf("Source:   %s\nTrigger:  %s\nInsight:  %s\nType:     %s\nID:       %s\n",
		dr.Source, dr.Trigger, dr.Insight, dr.Type, id)
	return nil
}

// detectResultJSON builds the JSON output map for a detection result.
func detectResultJSON(id string, dr detectResult, saved bool) map[string]interface{} {
	out := map[string]interface{}{
		"detected": true,
		"source":   string(dr.Source),
		"trigger":  dr.Trigger,
		"insight":  dr.Insight,
		"type":     string(dr.Type),
		"id":       id,
	}
	if saved {
		out["saved"] = true
	}
	return out
}

// --- helpers ---

// parseCitation parses "file:line" format and optional commit.
func parseCitation(raw string, commit string) (*memory.Citation, error) {
	parts := strings.SplitN(raw, ":", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid citation format %q (expected file:line)", raw)
	}
	file := parts[0]
	line, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid citation line number %q in %q (expected file:line)", parts[1], raw)
	}
	if line < 1 {
		return nil, fmt.Errorf("citation line number must be positive, got %d", line)
	}
	cit := &memory.Citation{File: file, Line: &line}
	if commit != "" {
		cit.Commit = &commit
	}
	return cit, nil
}

// parseTags splits comma-separated tags, trims whitespace, deduplicates.
func parseTags(raw string) []string {
	if raw == "" {
		return []string{}
	}
	return dedupTags(raw)
}

// buildCaptureItem constructs a Item for programmatic/detected captures.
func buildCaptureItem(id string, typ memory.ItemType, trigger, insight string, source memory.Source) memory.Item {
	return memory.Item{
		ID:         id,
		Type:       typ,
		Trigger:    trigger,
		Insight:    insight,
		Tags:       []string{},
		Source:     source,
		Context:    memory.Context{Tool: "cli", Intent: "capture"},
		Created:    time.Now().UTC().Format(time.RFC3339),
		Confirmed:  true,
		Supersedes: []string{},
		Related:    []string{},
	}
}

// detectFromFile reads a JSON input file and runs detection logic.
func detectFromFile(path, repoRoot string) (detectResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return detectResult{}, fmt.Errorf("read input file: %w", err)
	}

	var input DetectInput
	if err := json.Unmarshal(data, &input); err != nil {
		return detectResult{}, fmt.Errorf("parse input file: %w", err)
	}

	return detectAndPropose(input, repoRoot), nil
}

// detectAndPropose runs detection in priority order, applies quality filters,
// and proposes an insight. Specificity is always checked; novelty is checked
// when an embedder is available (graceful degradation).
func detectAndPropose(input DetectInput, repoRoot string) detectResult {
	trigger, insight, source := classifySignal(input)
	if trigger == "" {
		return detectResult{Detected: false}
	}

	// Quality gate: check specificity, actionability, and novelty
	embedder, closeEmbedder := getOrStartEmbedder(repoRoot)
	defer closeEmbedder()
	shouldPropose, reason := capture.ShouldPropose(repoRoot, insight, embedder)
	if !shouldPropose {
		return detectResult{Detected: false, Reason: reason}
	}

	typ := capture.InferItemType(insight)
	return detectResult{
		Detected: true,
		Trigger:  trigger,
		Insight:  insight,
		Source:   source,
		Type:     typ,
	}
}

// classifySignal tries each detection strategy in priority order and returns
// the first match's trigger, insight, and source. Returns empty trigger if
// no signal was detected.
func classifySignal(input DetectInput) (trigger, insight string, source memory.Source) {
	// 1. User correction (messages + context)
	if len(input.Messages) >= 2 {
		signal := capture.CorrectionSignal{
			Messages: input.Messages,
			Context:  input.Context,
		}
		if detected := capture.DetectUserCorrection(signal); detected != nil {
			return detected.Trigger, detected.CorrectionMessage, memory.SourceUserCorrection
		}
	}

	// 2. Test failure
	if input.TestResult != nil {
		if detected := capture.DetectTestFailure(*input.TestResult); detected != nil {
			ins := detected.ErrorOutput
			if len(ins) > 200 {
				ins = ins[:200]
			}
			if ins == "" {
				ins = fmt.Sprintf("Test failure in %s", detected.Trigger)
			}
			return detected.Trigger, ins, memory.SourceTestFailure
		}
	}

	// 3. Self correction (edit history)
	if input.EditHistory != nil {
		if detected := capture.DetectSelfCorrection(*input.EditHistory); detected != nil {
			ins := fmt.Sprintf("Self-correction detected on %s", detected.File)
			return detected.Trigger, ins, memory.SourceSelfCorrection
		}
	}

	return "", "", ""
}
