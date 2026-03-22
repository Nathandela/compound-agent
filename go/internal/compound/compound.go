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
	Clusters [][]memory.MemoryItem
	Noise    []memory.MemoryItem
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

// ClusterBySimilarity clusters items using single-linkage agglomerative clustering with union-find.
func ClusterBySimilarity(items []memory.MemoryItem, embeddings [][]float64, threshold float64) ClusterResult {
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

	var find func(int) int
	find = func(x int) int {
		for parent[x] != x {
			parent[x] = parent[parent[x]] // path compression
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

	// Merge pairs above threshold
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if matrix[i][j] >= threshold {
				union(i, j)
			}
		}
	}

	// Group by root
	groups := make(map[int][]memory.MemoryItem)
	for i := 0; i < n; i++ {
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

// SynthesizePattern creates a CctPattern from a cluster of lessons.
func SynthesizePattern(cluster []memory.MemoryItem, clusterID string) CctPattern {
	id := GenerateCctID(clusterID)
	sourceIDs := make([]string, len(cluster))
	for i, item := range cluster {
		sourceIDs[i] = item.ID
	}

	// Aggregate tags by frequency
	tagCounts := make(map[string]int)
	for _, item := range cluster {
		for _, tag := range item.Tags {
			tagCounts[tag]++
		}
	}

	// Sort tags by frequency descending
	type tagFreq struct {
		tag   string
		count int
	}
	var sortedTags []tagFreq
	for tag, count := range tagCounts {
		sortedTags = append(sortedTags, tagFreq{tag, count})
	}
	sort.Slice(sortedTags, func(i, j int) bool {
		return sortedTags[i].count > sortedTags[j].count
	})

	// Name from top tags or fallback to truncated insight
	var name string
	if len(sortedTags) > 0 {
		top := sortedTags
		if len(top) > MaxNameTags {
			top = top[:MaxNameTags]
		}
		names := make([]string, len(top))
		for i, tf := range top {
			names[i] = tf.tag
		}
		name = strings.Join(names, ", ")
	} else if len(cluster) > 0 {
		name = cluster[0].Insight
		if len(name) > MaxNameLength {
			name = name[:MaxNameLength]
		}
	}

	// Description from all insights
	insights := make([]string, len(cluster))
	for i, item := range cluster {
		insights[i] = item.Insight
	}
	description := strings.Join(insights, "; ")

	// Testability
	testable := false
	for _, item := range cluster {
		if item.Severity != nil && *item.Severity == memory.SeverityHigh {
			testable = true
			break
		}
		if item.Evidence != nil && *item.Evidence != "" {
			testable = true
			break
		}
	}

	var testApproach *string
	if testable {
		s := fmt.Sprintf("Verify pattern: %s. Check %d related lesson(s).", name, len(cluster))
		testApproach = &s
	}

	return CctPattern{
		ID:           id,
		Name:         name,
		Description:  description,
		Frequency:    len(cluster),
		Testable:     testable,
		TestApproach: testApproach,
		SourceIDs:    sourceIDs,
		Created:      time.Now().UTC().Format(time.RFC3339),
	}
}

// WriteCctPatterns writes patterns to cct-patterns.jsonl, deduplicating by ID.
// Existing patterns with the same ID are replaced by new ones.
func WriteCctPatterns(repoRoot string, patterns []CctPattern) error {
	filePath := filepath.Join(repoRoot, ".claude", "lessons", "cct-patterns.jsonl")
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}

	// Read existing patterns
	existing, err := ReadCctPatterns(repoRoot)
	if err != nil {
		return fmt.Errorf("read existing: %w", err)
	}

	// Merge: preserve existing order, replace by ID, append new
	byID := make(map[string]CctPattern)
	for _, p := range patterns {
		byID[p.ID] = p
	}

	var merged []CctPattern
	seen := make(map[string]bool)
	// Existing patterns keep their order; replaced if ID matches
	for _, p := range existing {
		if replacement, ok := byID[p.ID]; ok {
			merged = append(merged, replacement)
		} else {
			merged = append(merged, p)
		}
		seen[p.ID] = true
	}
	// Append truly new patterns in input order
	for _, p := range patterns {
		if !seen[p.ID] {
			merged = append(merged, p)
			seen[p.ID] = true
		}
	}

	// Atomic write: temp file then rename
	tmpPath := filePath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("open temp file: %w", err)
	}

	for _, p := range merged {
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
