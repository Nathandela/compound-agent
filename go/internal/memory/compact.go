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

// TombstoneThreshold is the number of tombstones that triggers compaction.
const TombstoneThreshold = 100

// CompactResult holds the result of a compaction operation.
type CompactResult struct {
	TombstonesRemoved int
	LessonsRemaining  int
	DroppedInvalid    int
}

// CountTombstones counts deleted:true records in the JSONL file.
func CountTombstones(repoRoot string) (int, error) {
	path := filepath.Join(repoRoot, LessonsPath)
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, err
	}
	defer f.Close()

	count := 0
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		if deletedRaw, ok := raw["deleted"]; ok {
			var deleted bool
			if json.Unmarshal(deletedRaw, &deleted) == nil && deleted {
				count++
			}
		}
	}
	return count, scanner.Err()
}

// NeedsCompaction returns true if tombstone count >= TombstoneThreshold.
func NeedsCompaction(repoRoot string) (bool, error) {
	count, err := CountTombstones(repoRoot)
	if err != nil {
		return false, err
	}
	return count >= TombstoneThreshold, nil
}

// Compact rewrites the JSONL file, removing tombstones and invalid records.
// Uses last-write-wins deduplication by ID.
func Compact(repoRoot string) (CompactResult, error) {
	path := filepath.Join(repoRoot, LessonsPath)
	var result CompactResult

	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return result, nil
		}
		return result, fmt.Errorf("open: %w", err)
	}

	lessonMap, result, err := parseCompactRecords(f)
	f.Close()
	if err != nil {
		return result, err
	}

	// Collect remaining lessons, sorted deterministically by Created then ID
	lessons := make([]Item, 0, len(lessonMap))
	for _, item := range lessonMap {
		lessons = append(lessons, item)
	}
	sort.Slice(lessons, func(i, j int) bool {
		if lessons[i].Created != lessons[j].Created {
			return lessons[i].Created < lessons[j].Created
		}
		return lessons[i].ID < lessons[j].ID
	})
	result.LessonsRemaining = len(lessons)

	if err := writeCompactedFile(path, lessons); err != nil {
		return result, err
	}

	return result, nil
}

// parseCompactRecords scans a JSONL file, deduplicates by ID (last-write-wins),
// removes tombstones, and drops invalid records.
func parseCompactRecords(f *os.File) (map[string]Item, CompactResult, error) {
	var result CompactResult
	lessonMap := make(map[string]Item)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}

		if processCompactTombstone(raw, lessonMap) {
			result.TombstonesRemoved++
			continue
		}

		if !processCompactItem(line, lessonMap) {
			result.DroppedInvalid++
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, result, fmt.Errorf("scan: %w", err)
	}
	return lessonMap, result, nil
}

// processCompactTombstone checks if the raw record is a tombstone and removes
// the corresponding ID from the map. Returns true if the record was a tombstone.
func processCompactTombstone(raw map[string]json.RawMessage, lessonMap map[string]Item) bool {
	deletedRaw, ok := raw["deleted"]
	if !ok {
		return false
	}
	var deleted bool
	if json.Unmarshal(deletedRaw, &deleted) != nil || !deleted {
		return false
	}
	var id string
	if idRaw, ok := raw["id"]; ok {
		_ = json.Unmarshal(idRaw, &id)
	}
	if id != "" {
		delete(lessonMap, id)
	}
	return true
}

// processCompactItem parses a JSONL line as a full Item, applies legacy type
// conversion, validates it, and adds it to the map. Returns true on success.
func processCompactItem(line string, lessonMap map[string]Item) bool {
	var item Item
	if err := json.Unmarshal([]byte(line), &item); err != nil {
		return false
	}
	if item.Type == "quick" || item.Type == "full" {
		item.Type = TypeLesson
	}
	if err := ValidateItem(&item); err != nil {
		return false
	}
	lessonMap[item.ID] = item
	return true
}

// writeCompactedFile atomically writes the sorted lessons to the JSONL file
// using a temp file + rename strategy.
func writeCompactedFile(path string, lessons []Item) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}

	tmp, err := os.CreateTemp(filepath.Dir(path), ".compact-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpPath := tmp.Name()

	for _, item := range lessons {
		data, err := json.Marshal(item)
		if err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("marshal: %w", err)
		}
		if _, err := tmp.Write(append(data, '\n')); err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write: %w", err)
		}
	}

	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("sync temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename: %w", err)
	}

	return nil
}
