// Package cli — CRUD and invalidation commands: show, update, delete, wrong, validate.
package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// registerCrudCommands registers show, update, delete, wrong, and validate commands.
func registerCrudCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(showCmd())
	rootCmd.AddCommand(updateCmd())
	rootCmd.AddCommand(deleteCmd())
	rootCmd.AddCommand(wrongCmd())
	rootCmd.AddCommand(validateCmd())
}

// --- show command ---

func showCmd() *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "show <id>",
		Short: "Show details of a specific lesson",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			id := args[0]
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			item := findItem(result.Items, id)
			if item == nil {
				wasDeleted := result.DeletedIDs[id]
				msg := fmt.Sprintf("Lesson %s not found", id)
				if wasDeleted {
					msg = fmt.Sprintf("Lesson %s not found (deleted)", id)
				}
				if jsonOut {
					writeJSON(cmd, map[string]string{"error": msg})
				} else {
					cmd.PrintErrln(msg)
				}
				return errors.New(msg)
			}

			if jsonOut {
				data, _ := json.MarshalIndent(item, "", "  ")
				cmd.Println(string(data))
			} else {
				cmd.Print(formatLessonDetailed(item))
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

// --- update command ---

func updateCmd() *cobra.Command {
	var (
		insight   string
		trigger   string
		evidence  string
		severity  string
		tags      string
		confirmed string
		jsonOut   bool
	)
	cmd := &cobra.Command{
		Use:   "update <id>",
		Short: "Update a lesson",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			id := args[0]

			hasInsight := cmd.Flags().Changed("insight")
			hasTrigger := cmd.Flags().Changed("trigger")
			hasEvidence := cmd.Flags().Changed("evidence")
			hasSeverity := cmd.Flags().Changed("severity")
			hasTags := cmd.Flags().Changed("tags")
			hasConfirmed := cmd.Flags().Changed("confirmed")

			if !hasInsight && !hasTrigger && !hasEvidence && !hasSeverity && !hasTags && !hasConfirmed {
				msg := "No fields to update (specify at least one: --insight, --tags, --severity, ...)"
				if jsonOut {
					writeJSON(cmd, map[string]string{"error": msg})
				} else {
					cmd.PrintErrln(msg)
				}
				return errors.New(msg)
			}

			// Validate severity early
			if hasSeverity {
				sev := memory.Severity(severity)
				if !sev.Valid() {
					msg := fmt.Sprintf("Invalid severity %q (must be: high, medium, low)", severity)
					if jsonOut {
						writeJSON(cmd, map[string]string{"error": msg})
					} else {
						cmd.PrintErrln(msg)
					}
					return errors.New(msg)
				}
			}

			repoRoot := util.GetRepoRoot()
			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			item := findItem(result.Items, id)
			if item == nil {
				wasDeleted := result.DeletedIDs[id]
				msg := fmt.Sprintf("Lesson %s not found", id)
				if wasDeleted {
					msg = fmt.Sprintf("Lesson %s is deleted", id)
				}
				if jsonOut {
					writeJSON(cmd, map[string]string{"error": msg})
				} else {
					cmd.PrintErrln(msg)
				}
				return errors.New(msg)
			}

			updated := *item
			if hasInsight {
				updated.Insight = insight
			}
			if hasTrigger {
				updated.Trigger = trigger
			}
			if hasEvidence {
				updated.Evidence = &evidence
			}
			if hasSeverity {
				sev := memory.Severity(severity)
				updated.Severity = &sev
			}
			if hasTags {
				updated.Tags = dedupTags(tags)
			}
			if hasConfirmed {
				updated.Confirmed = confirmed == "true"
			}

			if err := memory.AppendMemoryItem(repoRoot, updated); err != nil {
				return fmt.Errorf("write: %w", err)
			}

			if jsonOut {
				data, _ := json.MarshalIndent(updated, "", "  ")
				cmd.Println(string(data))
			} else {
				cmd.Printf("Updated lesson %s\n", id)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&insight, "insight", "", "update insight")
	cmd.Flags().StringVar(&trigger, "trigger", "", "update trigger")
	cmd.Flags().StringVar(&evidence, "evidence", "", "update evidence")
	cmd.Flags().StringVar(&severity, "severity", "", "update severity (low/medium/high)")
	cmd.Flags().StringVar(&tags, "tags", "", "update tags (comma-separated)")
	cmd.Flags().StringVar(&confirmed, "confirmed", "", "update confirmed status (true/false)")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

// --- delete command ---

func deleteCmd() *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "delete <ids...>",
		Short: "Soft delete lessons (creates tombstone)",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			itemMap := make(map[string]*memory.MemoryItem, len(result.Items))
			for i := range result.Items {
				itemMap[result.Items[i].ID] = &result.Items[i]
			}

			var deleted []string
			var warnings []deleteWarning

			now := time.Now().UTC().Format(time.RFC3339)

			for _, id := range args {
				item, exists := itemMap[id]
				if !exists {
					msg := "not found"
					if result.DeletedIDs[id] {
						msg = "already deleted"
					}
					warnings = append(warnings, deleteWarning{ID: id, Message: msg})
					continue
				}

				tombstone := *item
				deletedFlag := true
				tombstone.Deleted = &deletedFlag
				tombstone.DeletedAt = &now

				if err := memory.AppendMemoryItem(repoRoot, tombstone); err != nil {
					return fmt.Errorf("write tombstone for %s: %w", id, err)
				}
				deleted = append(deleted, id)
			}

			if jsonOut {
				out := deleteResult{Deleted: deleted, Warnings: warnings}
				if out.Deleted == nil {
					out.Deleted = []string{}
				}
				if out.Warnings == nil {
					out.Warnings = []deleteWarning{}
				}
				writeJSON(cmd, out)
			} else {
				if len(deleted) > 0 {
					cmd.Printf("Deleted %d lesson(s): %s\n", len(deleted), strings.Join(deleted, ", "))
				}
				for _, w := range warnings {
					cmd.Printf("[warn] %s: %s\n", w.ID, w.Message)
				}
				if len(deleted) == 0 && len(warnings) > 0 {
					return fmt.Errorf("no lessons deleted")
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

// --- wrong command ---

func wrongCmd() *cobra.Command {
	var reason string
	cmd := &cobra.Command{
		Use:   "wrong <id>",
		Short: "Mark a lesson as invalid/wrong",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			id := args[0]
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			item := findItem(result.Items, id)
			if item == nil {
				msg := fmt.Sprintf("Lesson not found: %s", id)
				cmd.PrintErrln(msg)
				return errors.New(msg)
			}

			if item.InvalidatedAt != nil {
				cmd.Printf("Lesson %s is already marked as invalid.\n", id)
				return nil
			}

			updated := *item
			now := time.Now().UTC().Format(time.RFC3339)
			updated.InvalidatedAt = &now
			if cmd.Flags().Changed("reason") {
				updated.InvalidationReason = &reason
			}

			if err := memory.AppendMemoryItem(repoRoot, updated); err != nil {
				return fmt.Errorf("write: %w", err)
			}

			cmd.Printf("Lesson %s marked as invalid.\n", id)
			if cmd.Flags().Changed("reason") {
				cmd.Printf("  Reason: %s\n", reason)
			}
			return nil
		},
	}
	cmd.Flags().StringVarP(&reason, "reason", "r", "", "reason for invalidation")
	return cmd
}

// --- validate command ---

func validateCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "validate <id>",
		Short: "Re-enable a previously invalidated lesson",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			id := args[0]
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			item := findItem(result.Items, id)
			if item == nil {
				msg := fmt.Sprintf("Lesson not found: %s", id)
				cmd.PrintErrln(msg)
				return errors.New(msg)
			}

			if item.InvalidatedAt == nil {
				cmd.Printf("Lesson %s is not invalidated.\n", id)
				return nil
			}

			updated := *item
			updated.InvalidatedAt = nil
			updated.InvalidationReason = nil

			if err := memory.AppendMemoryItem(repoRoot, updated); err != nil {
				return fmt.Errorf("write: %w", err)
			}

			cmd.Printf("Lesson %s re-enabled (validated).\n", id)
			return nil
		},
	}
	return cmd
}

// --- helpers ---

func findItem(items []memory.MemoryItem, id string) *memory.MemoryItem {
	for i := range items {
		if items[i].ID == id {
			return &items[i]
		}
	}
	return nil
}

func dedupTags(raw string) []string {
	parts := strings.Split(raw, ",")
	seen := make(map[string]bool, len(parts))
	var result []string
	for _, p := range parts {
		tag := strings.TrimSpace(p)
		if tag != "" && !seen[tag] {
			seen[tag] = true
			result = append(result, tag)
		}
	}
	return result
}

func writeJSON(cmd *cobra.Command, v interface{}) {
	data, _ := json.Marshal(v)
	cmd.Println(string(data))
}

func formatLessonDetailed(item *memory.MemoryItem) string {
	var b strings.Builder
	fmt.Fprintf(&b, "ID:        %s\n", item.ID)
	fmt.Fprintf(&b, "Type:      %s\n", item.Type)
	fmt.Fprintf(&b, "Insight:   %s\n", item.Insight)
	fmt.Fprintf(&b, "Trigger:   %s\n", item.Trigger)
	if item.Evidence != nil {
		fmt.Fprintf(&b, "Evidence:  %s\n", *item.Evidence)
	}
	if item.Severity != nil {
		fmt.Fprintf(&b, "Severity:  %s\n", *item.Severity)
	}
	fmt.Fprintf(&b, "Source:    %s\n", formatSource(item.Source))
	if len(item.Tags) > 0 {
		fmt.Fprintf(&b, "Tags:      %s\n", strings.Join(item.Tags, ", "))
	}
	fmt.Fprintf(&b, "Confirmed: %t\n", item.Confirmed)
	fmt.Fprintf(&b, "Created:   %s\n", item.Created)
	if item.InvalidatedAt != nil {
		fmt.Fprintf(&b, "Invalidated: %s\n", *item.InvalidatedAt)
		if item.InvalidationReason != nil {
			fmt.Fprintf(&b, "Reason:    %s\n", *item.InvalidationReason)
		}
	}
	return b.String()
}

type deleteWarning struct {
	ID      string `json:"id"`
	Message string `json:"message"`
}

type deleteResult struct {
	Deleted  []string        `json:"deleted"`
	Warnings []deleteWarning `json:"warnings"`
}
