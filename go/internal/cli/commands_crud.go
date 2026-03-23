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

			result, err := memory.ReadItems(repoRoot)
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
					_ = writeJSON(cmd, map[string]string{"error": msg})
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

// updateFlags holds the flag values bound to the update command.
type updateFlags struct {
	insight   string
	trigger   string
	evidence  string
	severity  string
	tags      string
	confirmed string
	jsonOut   bool
}

func updateCmd() *cobra.Command {
	var f updateFlags
	cmd := &cobra.Command{
		Use:   "update <id>",
		Short: "Update a lesson",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUpdate(cmd, args[0], &f)
		},
	}
	cmd.Flags().StringVar(&f.insight, "insight", "", "update insight")
	cmd.Flags().StringVar(&f.trigger, "trigger", "", "update trigger")
	cmd.Flags().StringVar(&f.evidence, "evidence", "", "update evidence")
	cmd.Flags().StringVar(&f.severity, "severity", "", "update severity (low/medium/high)")
	cmd.Flags().StringVar(&f.tags, "tags", "", "update tags (comma-separated)")
	cmd.Flags().StringVar(&f.confirmed, "confirmed", "", "update confirmed status (true/false)")
	cmd.Flags().BoolVar(&f.jsonOut, "json", false, "output as JSON")
	return cmd
}

// reportError prints an error as JSON or stderr, then returns it.
func reportError(cmd *cobra.Command, msg string, jsonOut bool) error {
	if jsonOut {
		_ = writeJSON(cmd, map[string]string{"error": msg})
	} else {
		cmd.PrintErrln(msg)
	}
	return errors.New(msg)
}

// hasAnyUpdateFlag returns true if at least one update flag was provided.
func hasAnyUpdateFlag(cmd *cobra.Command) bool {
	flags := []string{"insight", "trigger", "evidence", "severity", "tags", "confirmed"}
	for _, name := range flags {
		if cmd.Flags().Changed(name) {
			return true
		}
	}
	return false
}

// validateUpdateFlags checks that at least one flag is set and that
// the severity value (if provided) is valid.
func validateUpdateFlags(cmd *cobra.Command, f *updateFlags) error {
	if !hasAnyUpdateFlag(cmd) {
		return reportError(cmd,
			"No fields to update (specify at least one: --insight, --tags, --severity, ...)",
			f.jsonOut)
	}
	if cmd.Flags().Changed("severity") {
		if sev := memory.Severity(f.severity); !sev.Valid() {
			return reportError(cmd,
				fmt.Sprintf("Invalid severity %q (must be: high, medium, low)", f.severity),
				f.jsonOut)
		}
	}
	return nil
}

// applyUpdateFlags copies changed flag values onto the item.
func applyUpdateFlags(updated *memory.Item, cmd *cobra.Command, f *updateFlags) {
	if cmd.Flags().Changed("insight") {
		updated.Insight = f.insight
	}
	if cmd.Flags().Changed("trigger") {
		updated.Trigger = f.trigger
	}
	if cmd.Flags().Changed("evidence") {
		updated.Evidence = &f.evidence
	}
	if cmd.Flags().Changed("severity") {
		sev := memory.Severity(f.severity)
		updated.Severity = &sev
	}
	if cmd.Flags().Changed("tags") {
		updated.Tags = dedupTags(f.tags)
	}
	if cmd.Flags().Changed("confirmed") {
		updated.Confirmed = f.confirmed == "true"
	}
}

// runUpdate implements the update command logic.
func runUpdate(cmd *cobra.Command, id string, f *updateFlags) error {
	if err := validateUpdateFlags(cmd, f); err != nil {
		return err
	}

	repoRoot := util.GetRepoRoot()
	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return fmt.Errorf("read lessons: %w", err)
	}

	item := findItem(result.Items, id)
	if item == nil {
		msg := fmt.Sprintf("Lesson %s not found", id)
		if result.DeletedIDs[id] {
			msg = fmt.Sprintf("Lesson %s is deleted", id)
		}
		return reportError(cmd, msg, f.jsonOut)
	}

	updated := *item
	applyUpdateFlags(&updated, cmd, f)

	if err := memory.AppendItem(repoRoot, updated); err != nil {
		return fmt.Errorf("write: %w", err)
	}

	if f.jsonOut {
		data, _ := json.MarshalIndent(updated, "", "  ")
		cmd.Println(string(data))
	} else {
		cmd.Printf("Updated lesson %s\n", id)
	}
	return nil
}

// --- delete command ---

func deleteCmd() *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "delete <ids...>",
		Short: "Soft delete lessons (creates tombstone)",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDelete(cmd, args, jsonOut)
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

// processDeleteIDs iterates over the requested IDs, writes tombstones for
// existing items, and collects warnings for missing/already-deleted ones.
func processDeleteIDs(repoRoot string, ids []string, result memory.ReadItemsResult) ([]string, []deleteWarning, error) {
	itemMap := make(map[string]*memory.Item, len(result.Items))
	for i := range result.Items {
		itemMap[result.Items[i].ID] = &result.Items[i]
	}

	now := time.Now().UTC().Format(time.RFC3339)
	var deleted []string
	var warnings []deleteWarning

	for _, id := range ids {
		item, exists := itemMap[id]
		if !exists {
			msg := "not found"
			if result.DeletedIDs[id] {
				msg = "already deleted"
			}
			warnings = append(warnings, deleteWarning{ID: id, Message: msg})
			continue
		}

		if err := writeDeleteTombstone(repoRoot, item, now); err != nil {
			return nil, nil, fmt.Errorf("write tombstone for %s: %w", id, err)
		}
		deleted = append(deleted, id)
	}
	return deleted, warnings, nil
}

// writeDeleteTombstone marks an item as deleted and appends it.
func writeDeleteTombstone(repoRoot string, item *memory.Item, now string) error {
	tombstone := *item
	deletedFlag := true
	tombstone.Deleted = &deletedFlag
	tombstone.DeletedAt = &now
	return memory.AppendItem(repoRoot, tombstone)
}

// reportDeleteResults outputs the deletion summary as JSON or text.
func reportDeleteResults(cmd *cobra.Command, deleted []string, warnings []deleteWarning, jsonOut bool) error {
	if jsonOut {
		return reportDeleteJSON(cmd, deleted, warnings)
	}
	return reportDeleteText(cmd, deleted, warnings)
}

// reportDeleteJSON writes the delete result as JSON.
func reportDeleteJSON(cmd *cobra.Command, deleted []string, warnings []deleteWarning) error {
	out := deleteResult{Deleted: deleted, Warnings: warnings}
	if out.Deleted == nil {
		out.Deleted = []string{}
	}
	if out.Warnings == nil {
		out.Warnings = []deleteWarning{}
	}
	return writeJSON(cmd, out)
}

// reportDeleteText writes the delete result as human-readable text.
func reportDeleteText(cmd *cobra.Command, deleted []string, warnings []deleteWarning) error {
	if len(deleted) > 0 {
		cmd.Printf("Deleted %d lesson(s): %s\n", len(deleted), strings.Join(deleted, ", "))
	}
	for _, w := range warnings {
		cmd.Printf("[warn] %s: %s\n", w.ID, w.Message)
	}
	if len(deleted) == 0 && len(warnings) > 0 {
		return fmt.Errorf("no lessons deleted")
	}
	return nil
}

// runDelete implements the delete command logic.
func runDelete(cmd *cobra.Command, args []string, jsonOut bool) error {
	repoRoot := util.GetRepoRoot()

	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return fmt.Errorf("read lessons: %w", err)
	}

	deleted, warnings, err := processDeleteIDs(repoRoot, args, result)
	if err != nil {
		return err
	}

	return reportDeleteResults(cmd, deleted, warnings, jsonOut)
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

			result, err := memory.ReadItems(repoRoot)
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

			if err := memory.AppendItem(repoRoot, updated); err != nil {
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

			result, err := memory.ReadItems(repoRoot)
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

			if err := memory.AppendItem(repoRoot, updated); err != nil {
				return fmt.Errorf("write: %w", err)
			}

			cmd.Printf("Lesson %s re-enabled (validated).\n", id)
			return nil
		},
	}
	return cmd
}

// --- helpers ---

func findItem(items []memory.Item, id string) *memory.Item {
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

func writeJSON(cmd *cobra.Command, v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("marshal JSON: %w", err)
	}
	cmd.Println(string(data))
	return nil
}

func formatLessonDetailed(item *memory.Item) string {
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
