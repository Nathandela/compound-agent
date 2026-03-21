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
	defer f.Close()

	// Parse all records with last-write-wins dedup
	lessonMap := make(map[string]MemoryItem)
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

		// Check for tombstone
		if deletedRaw, ok := raw["deleted"]; ok {
			var deleted bool
			if json.Unmarshal(deletedRaw, &deleted) == nil && deleted {
				var id string
				if idRaw, ok := raw["id"]; ok {
					json.Unmarshal(idRaw, &id)
				}
				if id != "" {
					delete(lessonMap, id)
				}
				result.TombstonesRemoved++
				continue
			}
		}

		// Parse as full item
		var item MemoryItem
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			result.DroppedInvalid++
			continue
		}

		// Legacy type conversion
		if item.Type == "quick" || item.Type == "full" {
			item.Type = TypeLesson
		}

		if err := ValidateMemoryItem(&item); err != nil {
			result.DroppedInvalid++
			continue
		}

		lessonMap[item.ID] = item
	}

	if err := scanner.Err(); err != nil {
		return result, fmt.Errorf("scan: %w", err)
	}
	f.Close()

	// Collect remaining lessons, sorted deterministically by Created then ID
	lessons := make([]MemoryItem, 0, len(lessonMap))
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

	// Atomic write: temp file then rename
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return result, fmt.Errorf("mkdir: %w", err)
	}

	tmpPath := path + ".tmp"
	tmp, err := os.Create(tmpPath)
	if err != nil {
		return result, fmt.Errorf("create temp: %w", err)
	}

	for _, item := range lessons {
		data, err := json.Marshal(item)
		if err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return result, fmt.Errorf("marshal: %w", err)
		}
		if _, err := tmp.Write(append(data, '\n')); err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return result, fmt.Errorf("write: %w", err)
		}
	}

	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return result, fmt.Errorf("sync temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return result, fmt.Errorf("close temp: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return result, fmt.Errorf("rename: %w", err)
	}

	return result, nil
}
