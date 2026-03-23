package memory

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// LessonsPath is the relative path to the JSONL file from repo root.
const LessonsPath = ".claude/lessons/index.jsonl"

// ReadItemsResult holds the output of ReadItems.
type ReadItemsResult struct {
	Items        []Item
	DeletedIDs   map[string]bool
	SkippedCount int
}

// AppendItem appends a single memory item to the JSONL file.
// Creates the directory structure if it doesn't exist.
// Ensures array fields are never nil to produce valid JSONL.
func AppendItem(repoRoot string, item Item) error {
	EnsureArrayFields(&item)

	path := filepath.Join(repoRoot, LessonsPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}

	data, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}

// ReadItems reads all non-deleted memory items from the JSONL file.
// Applies last-write-wins deduplication by ID.
// Converts legacy type:'quick'/'full' to type:'lesson'.
func ReadItems(repoRoot string) (ReadItemsResult, error) {
	path := filepath.Join(repoRoot, LessonsPath)
	result := ReadItemsResult{
		DeletedIDs: make(map[string]bool),
	}

	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return result, nil
		}
		return result, fmt.Errorf("open: %w", err)
	}
	defer f.Close()

	items := make(map[string]Item)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		item, isTombstone, ok := parseLine(line)
		if !ok {
			result.SkippedCount++
			continue
		}

		if isTombstone {
			delete(items, item.ID)
			result.DeletedIDs[item.ID] = true
		} else {
			items[item.ID] = item
		}
	}

	if err := scanner.Err(); err != nil {
		return result, fmt.Errorf("scan: %w", err)
	}

	result.Items = deduplicateAndSort(items)
	return result, nil
}

// deduplicateAndSort collects map values into a slice sorted by Created then ID.
func deduplicateAndSort(items map[string]Item) []Item {
	sorted := make([]Item, 0, len(items))
	for _, item := range items {
		sorted = append(sorted, item)
	}
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Created != sorted[j].Created {
			return sorted[i].Created < sorted[j].Created
		}
		return sorted[i].ID < sorted[j].ID
	})
	return sorted
}

// parseLine parses a single JSONL line.
// Returns (item, isTombstone, ok).
// Handles: new types, legacy quick/full, canonical tombstones, legacy tombstones.
func parseLine(line string) (Item, bool, bool) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return Item{}, false, false
	}

	if item, ok := parseTombstone(raw); ok {
		return item, true, true
	}

	// Parse as full memory item
	var item Item
	if err := json.Unmarshal([]byte(line), &item); err != nil {
		return Item{}, false, false
	}

	// Legacy type conversion: quick/full -> lesson
	if item.Type == "quick" || item.Type == "full" {
		item.Type = TypeLesson
	}

	// Normalize nil arrays from legacy records
	EnsureArrayFields(&item)

	// Full validation: match TS Zod schema strictness
	if err := ValidateItem(&item); err != nil {
		return Item{}, false, false
	}

	return item, false, true
}

// parseTombstone checks if the raw JSON map represents a tombstone record.
// Returns the tombstone Item and true if detected, or zero Item and false otherwise.
// A record with no ID is treated as invalid (returns false).
func parseTombstone(raw map[string]json.RawMessage) (Item, bool) {
	deletedRaw, ok := raw["deleted"]
	if !ok {
		return Item{}, false
	}
	var deleted bool
	if err := json.Unmarshal(deletedRaw, &deleted); err != nil || !deleted {
		return Item{}, false
	}
	var id string
	if idRaw, ok := raw["id"]; ok {
		_ = json.Unmarshal(idRaw, &id)
	}
	if id == "" {
		return Item{}, false
	}
	return Item{ID: id}, true
}
