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
	Messages    []string           `json:"messages"`
	Context     memory.Context     `json:"context"`
	TestResult  *capture.TestResult  `json:"testResult,omitempty"`
	EditHistory *capture.EditHistory `json:"editHistory,omitempty"`
	Insight     string             `json:"insight,omitempty"`
}

// detectResult holds the outcome of running detection logic.
type detectResult struct {
	Detected bool
	Trigger  string
	Insight  string
	Source   memory.Source
	Type     memory.MemoryItemType
}

// --- learn command ---

func learnCmd() *cobra.Command {
	var (
		trigger        string
		tags           string
		severity       string
		citation       string
		citationCommit string
		itemType       string
		patternBad     string
		patternGood    string
	)

	cmd := &cobra.Command{
		Use:   "learn <insight>",
		Short: "Manually capture a lesson",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			insight := strings.Join(args, " ")

			// Validate type
			typ := memory.MemoryItemType(itemType)
			if !typ.Valid() {
				return fmt.Errorf("invalid type %q (must be: lesson, solution, pattern, preference)", itemType)
			}

			// Pattern type requires both --pattern-bad and --pattern-good
			if typ == memory.TypePattern {
				if patternBad == "" {
					return fmt.Errorf("type=pattern requires --pattern-bad")
				}
				if patternGood == "" {
					return fmt.Errorf("type=pattern requires --pattern-good")
				}
			}

			// Validate severity if provided
			if cmd.Flags().Changed("severity") {
				sev := memory.Severity(severity)
				if !sev.Valid() {
					return fmt.Errorf("invalid severity %q (must be: high, medium, low)", severity)
				}
			}

			// Parse citation
			var cit *memory.Citation
			if citation != "" {
				parsed, err := parseCitation(citation, citationCommit)
				if err != nil {
					return err
				}
				cit = parsed
			} else if citationCommit != "" {
				// citation-commit without citation is allowed but needs a file
				return fmt.Errorf("--citation-commit requires --citation")
			}

			// Build item
			id := memory.GenerateID(insight, typ)
			if trigger == "" {
				trigger = "Manual capture"
			}

			item := memory.MemoryItem{
				ID:        id,
				Type:      typ,
				Trigger:   trigger,
				Insight:   insight,
				Tags:      parseTags(tags),
				Source:    memory.SourceManual,
				Context:   memory.Context{Tool: "cli", Intent: "manual learning"},
				Created:   time.Now().UTC().Format(time.RFC3339),
				Confirmed: true,
			}

			if cmd.Flags().Changed("severity") {
				sev := memory.Severity(severity)
				item.Severity = &sev
			}

			if cit != nil {
				item.Citation = cit
			}

			if typ == memory.TypePattern {
				item.Pattern = &memory.Pattern{Bad: patternBad, Good: patternGood}
			}

			repoRoot := util.GetRepoRoot()
			if err := memory.AppendMemoryItem(repoRoot, item); err != nil {
				return fmt.Errorf("write: %w", err)
			}

			cmd.Printf("Learned: %s\n  ID: %s\n", insight, id)
			return nil
		},
	}

	cmd.Flags().StringVarP(&trigger, "trigger", "t", "", "what triggered the insight")
	cmd.Flags().StringVar(&tags, "tags", "", "comma-separated tags")
	cmd.Flags().StringVarP(&severity, "severity", "s", "", "severity level (high, medium, low)")
	cmd.Flags().BoolP("yes", "y", false, "skip confirmation (no-op for learn)")
	cmd.Flags().StringVar(&citation, "citation", "", "source citation (file:line)")
	cmd.Flags().StringVar(&citationCommit, "citation-commit", "", "commit hash for citation")
	cmd.Flags().StringVar(&itemType, "type", "lesson", "item type (lesson, solution, pattern, preference)")
	cmd.Flags().StringVar(&patternBad, "pattern-bad", "", "bad pattern code (required for type=pattern)")
	cmd.Flags().StringVar(&patternGood, "pattern-good", "", "good pattern code (required for type=pattern)")

	return cmd
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
			repoRoot := util.GetRepoRoot()

			var finalTrigger, finalInsight string
			var source memory.Source
			var itemType memory.MemoryItemType

			if input != "" {
				// Read and detect from input file
				dr, err := detectFromFile(input)
				if err != nil {
					return err
				}
				if !dr.Detected {
					if jsonOut {
						writeJSON(cmd, map[string]interface{}{
							"detected": false,
							"saved":    false,
						})
						return nil
					}
					cmd.Println("No correction detected from input.")
					return nil
				}
				finalTrigger = dr.Trigger
				finalInsight = dr.Insight
				source = dr.Source
				itemType = dr.Type
			} else {
				// Require trigger + insight
				if trigger == "" || insight == "" {
					return fmt.Errorf("requires either (--trigger and --insight) or --input")
				}
				finalTrigger = trigger
				finalInsight = insight
				source = memory.SourceManual
				itemType = capture.InferMemoryItemType(insight)
			}

			id := memory.GenerateID(finalInsight, itemType)

			if jsonOut {
				saved := false
				if yes {
					item := buildCaptureItem(id, itemType, finalTrigger, finalInsight, source)
					if err := memory.AppendMemoryItem(repoRoot, item); err != nil {
						return fmt.Errorf("write: %w", err)
					}
					saved = true
				}
				writeJSON(cmd, map[string]interface{}{
					"id":      id,
					"trigger": finalTrigger,
					"insight": finalInsight,
					"type":    string(itemType),
					"saved":   saved,
				})
				return nil
			}

			if yes {
				item := buildCaptureItem(id, itemType, finalTrigger, finalInsight, source)
				if err := memory.AppendMemoryItem(repoRoot, item); err != nil {
					return fmt.Errorf("write: %w", err)
				}
				cmd.Printf("Learned: %s\n  ID: %s\n", finalInsight, id)
			} else {
				cmd.Printf("Trigger: %s\nInsight: %s\nType:    %s\nSource:  %s\n\nTo save: run with --yes flag\n",
					finalTrigger, finalInsight, itemType, source)
			}
			return nil
		},
	}

	cmd.Flags().StringVarP(&trigger, "trigger", "t", "", "what triggered the insight")
	cmd.Flags().StringVarP(&insight, "insight", "i", "", "the insight text")
	cmd.Flags().StringVar(&input, "input", "", "JSON input file for auto-detection")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	cmd.Flags().BoolVarP(&yes, "yes", "y", false, "save without confirmation")

	return cmd
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

			repoRoot := util.GetRepoRoot()

			dr, err := detectFromFile(input)
			if err != nil {
				return err
			}

			if !dr.Detected {
				if jsonOut {
					writeJSON(cmd, map[string]interface{}{
						"detected": false,
					})
				} else {
					cmd.Println("No correction detected.")
				}
				return nil
			}

			id := memory.GenerateID(dr.Insight, dr.Type)

			if save && yes {
				item := buildCaptureItem(id, dr.Type, dr.Trigger, dr.Insight, dr.Source)
				if err := memory.AppendMemoryItem(repoRoot, item); err != nil {
					return fmt.Errorf("write: %w", err)
				}
				if jsonOut {
					writeJSON(cmd, map[string]interface{}{
						"detected": true,
						"source":   string(dr.Source),
						"trigger":  dr.Trigger,
						"insight":  dr.Insight,
						"type":     string(dr.Type),
						"id":       id,
						"saved":    true,
					})
				} else {
					cmd.Printf("Learned: %s\n  ID: %s\n", dr.Insight, id)
				}
				return nil
			}

			if jsonOut {
				writeJSON(cmd, map[string]interface{}{
					"detected": true,
					"source":   string(dr.Source),
					"trigger":  dr.Trigger,
					"insight":  dr.Insight,
					"type":     string(dr.Type),
					"id":       id,
				})
			} else {
				cmd.Printf("Detected: %s\nSource:   %s\nTrigger:  %s\nInsight:  %s\nType:     %s\nID:       %s\n",
					dr.Source, dr.Source, dr.Trigger, dr.Insight, dr.Type, id)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&input, "input", "", "JSON input file (required)")
	cmd.Flags().BoolVar(&save, "save", false, "save detected lesson")
	cmd.Flags().BoolVarP(&yes, "yes", "y", false, "confirm save")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")

	return cmd
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

// buildCaptureItem constructs a MemoryItem for programmatic/detected captures.
func buildCaptureItem(id string, typ memory.MemoryItemType, trigger, insight string, source memory.Source) memory.MemoryItem {
	return memory.MemoryItem{
		ID:        id,
		Type:      typ,
		Trigger:   trigger,
		Insight:   insight,
		Tags:      []string{},
		Source:    source,
		Context:   memory.Context{Tool: "cli", Intent: "capture"},
		Created:   time.Now().UTC().Format(time.RFC3339),
		Confirmed: true,
	}
}

// detectFromFile reads a JSON input file and runs detection logic.
func detectFromFile(path string) (detectResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return detectResult{}, fmt.Errorf("read input file: %w", err)
	}

	var input DetectInput
	if err := json.Unmarshal(data, &input); err != nil {
		return detectResult{}, fmt.Errorf("parse input file: %w", err)
	}

	return detectAndPropose(input), nil
}

// detectAndPropose runs detection in priority order and proposes an insight.
func detectAndPropose(input DetectInput) detectResult {
	// 1. User correction (messages + context)
	if len(input.Messages) >= 2 {
		signal := capture.CorrectionSignal{
			Messages: input.Messages,
			Context:  input.Context,
		}
		if detected := capture.DetectUserCorrection(signal); detected != nil {
			insight := detected.CorrectionMessage
			typ := capture.InferMemoryItemType(insight)
			return detectResult{
				Detected: true,
				Trigger:  detected.Trigger,
				Insight:  insight,
				Source:   memory.SourceUserCorrection,
				Type:     typ,
			}
		}
	}

	// 2. Test failure
	if input.TestResult != nil {
		if detected := capture.DetectTestFailure(*input.TestResult); detected != nil {
			insight := detected.ErrorOutput
			if len(insight) > 200 {
				insight = insight[:200]
			}
			typ := capture.InferMemoryItemType(insight)
			return detectResult{
				Detected: true,
				Trigger:  detected.Trigger,
				Insight:  insight,
				Source:   memory.SourceTestFailure,
				Type:     typ,
			}
		}
	}

	// 3. Self correction (edit history)
	if input.EditHistory != nil {
		if detected := capture.DetectSelfCorrection(*input.EditHistory); detected != nil {
			insight := fmt.Sprintf("Self-correction detected on %s", detected.File)
			typ := capture.InferMemoryItemType(insight)
			return detectResult{
				Detected: true,
				Trigger:  detected.Trigger,
				Insight:  insight,
				Source:   memory.SourceSelfCorrection,
				Type:     typ,
			}
		}
	}

	return detectResult{Detected: false}
}
