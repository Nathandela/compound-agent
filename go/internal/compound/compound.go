// Package compound provides CCT (Compound Correction Tracker) pattern synthesis.
// It clusters lessons by embedding similarity and synthesizes cross-cutting patterns.
package compound

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/util"
)

const (
	DefaultThreshold = 0.75
	MaxNameTags      = 3
	MaxNameLength    = 50
)

// CctPattern is a synthesized cross-cutting pattern from clustered lessons.
type CctPattern struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Frequency    int      `json:"frequency"`
	Testable     bool     `json:"testable"`
	TestApproach *string  `json:"testApproach,omitempty"`
	SourceIDs    []string `json:"sourceIds"`
	Created      string   `json:"created"`
}

// ClusterResult holds the output of clustering.
type ClusterResult struct {
	Clusters [][]memory.Item
	Noise    []memory.Item
}

// GenerateCctID generates a deterministic ID from input.
func GenerateCctID(input string) string {
	hash := sha256.Sum256([]byte(input))
	return fmt.Sprintf("CCT-%x", hash[:4])
}

// BuildSimilarityMatrix computes pairwise cosine similarity.
func BuildSimilarityMatrix(embeddings [][]float64) [][]float64 {
	n := len(embeddings)
	matrix := make([][]float64, n)
	for i := range matrix {
		matrix[i] = make([]float64, n)
		matrix[i][i] = 1.0
	}

	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			sim, err := util.CosineSimilarity(embeddings[i], embeddings[j])
			if err != nil {
				continue // skip pair with mismatched dimensions
			}
			matrix[i][j] = sim
			matrix[j][i] = sim
		}
	}
	return matrix
}

// buildClusters groups items by their union-find root and separates single-item groups as noise.
func buildClusters(items []memory.Item, parent []int, find func(int) int) ClusterResult {
	groups := make(map[int][]memory.Item)
	for i := 0; i < len(items); i++ {
		root := find(i)
		groups[root] = append(groups[root], items[i])
	}

	var result ClusterResult
	for _, group := range groups {
		if len(group) == 1 {
			result.Noise = append(result.Noise, group[0])
		} else {
			result.Clusters = append(result.Clusters, group)
		}
	}
	return result
}

// ClusterBySimilarity clusters items using single-linkage agglomerative clustering with union-find.
func ClusterBySimilarity(items []memory.Item, embeddings [][]float64, threshold float64) ClusterResult {
	n := len(items)
	if n == 0 {
		return ClusterResult{}
	}

	matrix := BuildSimilarityMatrix(embeddings)

	// Union-Find
	parent := make([]int, n)
	for i := range parent {
		parent[i] = i
	}

	var find func(int) int //nolint:staticcheck // recursive closure requires separate declaration
	find = func(x int) int {
		for parent[x] != x {
			parent[x] = parent[parent[x]]
			x = parent[x]
		}
		return x
	}

	union := func(a, b int) {
		rootA := find(a)
		rootB := find(b)
		if rootA != rootB {
			parent[rootA] = rootB
		}
	}

	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if matrix[i][j] >= threshold {
				union(i, j)
			}
		}
	}

	return buildClusters(items, parent, find)
}

// aggregateTags returns the top tags from a cluster sorted by frequency descending.
func aggregateTags(cluster []memory.Item) []string {
	tagCounts := make(map[string]int)
	for _, item := range cluster {
		for _, tag := range item.Tags {
			tagCounts[tag]++
		}
	}

	type tagFreq struct {
		tag   string
		count int
	}
	sorted := make([]tagFreq, 0, len(tagCounts))
	for tag, count := range tagCounts {
		sorted = append(sorted, tagFreq{tag, count})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})

	top := sorted
	if len(top) > MaxNameTags {
		top = top[:MaxNameTags]
	}
	names := make([]string, len(top))
	for i, tf := range top {
		names[i] = tf.tag
	}
	return names
}

// buildPatternName derives a pattern name from tags or the first insight.
func buildPatternName(cluster []memory.Item) string {
	tags := aggregateTags(cluster)
	if len(tags) > 0 {
		return strings.Join(tags, ", ")
	}
	if len(cluster) > 0 {
		name := cluster[0].Insight
		if len(name) > MaxNameLength {
			name = name[:MaxNameLength]
		}
		return name
	}
	return ""
}

// buildInsightSummary concatenates all insights from a cluster into a semicolon-separated string.
func buildInsightSummary(cluster []memory.Item) string {
	insights := make([]string, len(cluster))
	for i, item := range cluster {
		insights[i] = item.Insight
	}
	return strings.Join(insights, "; ")
}

// isClusterTestable returns true if any item in the cluster is high-severity or has evidence.
func isClusterTestable(cluster []memory.Item) bool {
	for _, item := range cluster {
		if item.Severity != nil && *item.Severity == memory.SeverityHigh {
			return true
		}
		if item.Evidence != nil && *item.Evidence != "" {
			return true
		}
	}
	return false
}

// SynthesizePattern creates a CctPattern from a cluster of lessons.
func SynthesizePattern(cluster []memory.Item, clusterID string) CctPattern {
	id := GenerateCctID(clusterID)
	sourceIDs := make([]string, len(cluster))
	for i, item := range cluster {
		sourceIDs[i] = item.ID
	}

	name := buildPatternName(cluster)
	testable := isClusterTestable(cluster)

	var testApproach *string
	if testable {
		s := fmt.Sprintf("Verify pattern: %s. Check %d related lesson(s).", name, len(cluster))
		testApproach = &s
	}

	return CctPattern{
		ID:           id,
		Name:         name,
		Description:  buildInsightSummary(cluster),
		Frequency:    len(cluster),
		Testable:     testable,
		TestApproach: testApproach,
		SourceIDs:    sourceIDs,
		Created:      time.Now().UTC().Format(time.RFC3339),
	}
}

// mergePatterns deduplicates patterns by ID, preserving existing order and replacing
// matching IDs with new versions.
func mergePatterns(existing, newPatterns []CctPattern) []CctPattern {
	byID := make(map[string]CctPattern)
	for _, p := range newPatterns {
		byID[p.ID] = p
	}

	var merged []CctPattern
	seen := make(map[string]bool)
	for _, p := range existing {
		if replacement, ok := byID[p.ID]; ok {
			merged = append(merged, replacement)
		} else {
			merged = append(merged, p)
		}
		seen[p.ID] = true
	}
	for _, p := range newPatterns {
		if !seen[p.ID] {
			merged = append(merged, p)
			seen[p.ID] = true
		}
	}
	return merged
}

// writePatternFile atomically writes patterns to a JSONL file via temp+rename.
func writePatternFile(filePath string, patterns []CctPattern) error {
	tmpPath := filePath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("open temp file: %w", err)
	}

	for _, p := range patterns {
		data, err := json.Marshal(p)
		if err != nil {
			f.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("marshal pattern: %w", err)
		}
		if _, err := f.Write(append(data, '\n')); err != nil {
			f.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("write pattern: %w", err)
		}
	}

	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("sync temp file: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp file: %w", err)
	}

	if err := os.Rename(tmpPath, filePath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename temp file: %w", err)
	}
	return nil
}

// WriteCctPatterns writes patterns to cct-patterns.jsonl, deduplicating by ID.
// Existing patterns with the same ID are replaced by new ones.
func WriteCctPatterns(repoRoot string, patterns []CctPattern) error {
	filePath := filepath.Join(repoRoot, ".claude", "lessons", "cct-patterns.jsonl")
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}

	existing, err := ReadCctPatterns(repoRoot)
	if err != nil {
		return fmt.Errorf("read existing: %w", err)
	}

	merged := mergePatterns(existing, patterns)
	return writePatternFile(filePath, merged)
}

// ReadCctPatterns reads patterns from cct-patterns.jsonl.
func ReadCctPatterns(repoRoot string) ([]CctPattern, error) {
	filePath := filepath.Join(repoRoot, ".claude", "lessons", "cct-patterns.jsonl")
	data, err := os.ReadFile(filePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	var patterns []CctPattern
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var p CctPattern
		if err := json.Unmarshal([]byte(line), &p); err != nil {
			continue // Skip malformed lines
		}
		patterns = append(patterns, p)
	}
	return patterns, nil
}
