package memory

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// LessonsPath is the relative path to the JSONL file from repo root.
const LessonsPath = ".claude/lessons/index.jsonl"

// ReadMemoryItemsResult holds the output of ReadMemoryItems.
type ReadMemoryItemsResult struct {
	Items        []MemoryItem
	DeletedIDs   map[string]bool
	SkippedCount int
}

// AppendMemoryItem appends a single memory item to the JSONL file.
// Creates the directory structure if it doesn't exist.
func AppendMemoryItem(repoRoot string, item MemoryItem) error {
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

// ReadMemoryItems reads all non-deleted memory items from the JSONL file.
// Applies last-write-wins deduplication by ID.
// Converts legacy type:'quick'/'full' to type:'lesson'.
func ReadMemoryItems(repoRoot string) (ReadMemoryItemsResult, error) {
	path := filepath.Join(repoRoot, LessonsPath)
	result := ReadMemoryItemsResult{
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

	items := make(map[string]MemoryItem)
	scanner := bufio.NewScanner(f)

	// Increase buffer for long lines
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

	result.Items = make([]MemoryItem, 0, len(items))
	for _, item := range items {
		result.Items = append(result.Items, item)
	}

	return result, nil
}

// parseLine parses a single JSONL line.
// Returns (item, isTombstone, ok).
// Handles: new types, legacy quick/full, canonical tombstones, legacy tombstones.
func parseLine(line string) (MemoryItem, bool, bool) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return MemoryItem{}, false, false
	}

	// Check for tombstone: has "deleted" field set to true
	if deletedRaw, ok := raw["deleted"]; ok {
		var deleted bool
		if err := json.Unmarshal(deletedRaw, &deleted); err == nil && deleted {
			// Extract ID
			var id string
			if idRaw, ok := raw["id"]; ok {
				json.Unmarshal(idRaw, &id)
			}
			if id == "" {
				return MemoryItem{}, false, false
			}
			return MemoryItem{ID: id}, true, true
		}
	}

	// Parse as full memory item
	var item MemoryItem
	if err := json.Unmarshal([]byte(line), &item); err != nil {
		return MemoryItem{}, false, false
	}

	// Legacy type conversion: quick/full -> lesson
	if item.Type == "quick" || item.Type == "full" {
		item.Type = TypeLesson
	}

	// Basic validation: must have id and type
	if item.ID == "" || item.Type == "" {
		return MemoryItem{}, false, false
	}

	return item, false, true
}
