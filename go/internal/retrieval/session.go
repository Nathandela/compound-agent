package retrieval

import (
	"sort"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// DefaultSessionLimit is the default number of session lessons to return.
const DefaultSessionLimit = 5

// filterHighSeverity returns confirmed, non-invalidated items with high severity.
func filterHighSeverity(items []memory.Item) []memory.Item {
	var filtered []memory.Item
	for _, item := range items {
		if item.Severity == nil || *item.Severity != memory.SeverityHigh {
			continue
		}
		if !item.Confirmed || item.InvalidatedAt != nil {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

// LoadSessionLessons returns high-severity, confirmed, non-invalidated lessons
// sorted by recency (most recent first), limited to `limit`.
func LoadSessionLessons(repoRoot string, limit int) ([]memory.Item, error) {
	if limit <= 0 {
		limit = DefaultSessionLimit
	}

	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return nil, err
	}

	filtered := filterHighSeverity(result.Items)

	// Sort by Created descending (most recent first)
	sort.Slice(filtered, func(i, j int) bool {
		ti, errI := time.Parse(time.RFC3339, filtered[i].Created)
		tj, errJ := time.Parse(time.RFC3339, filtered[j].Created)
		if errI != nil || errJ != nil {
			return filtered[i].Created > filtered[j].Created
		}
		return ti.After(tj)
	})

	if len(filtered) > limit {
		filtered = filtered[:limit]
	}

	return filtered, nil
}
