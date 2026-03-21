// Package compound provides CCT (Compound Correction Tracker) pattern synthesis.
// It clusters lessons by embedding similarity and synthesizes cross-cutting patterns.
package compound

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
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
			sim := cosineSimilarity(embeddings[i], embeddings[j])
			matrix[i][j] = sim
			matrix[j][i] = sim
		}
	}
	return matrix
}

func cosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	mag := math.Sqrt(normA) * math.Sqrt(normB)
	if mag == 0 {
		return 0
	}
	return dot / mag
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

// WriteCctPatterns appends patterns to cct-patterns.jsonl.
func WriteCctPatterns(repoRoot string, patterns []CctPattern) error {
	filePath := filepath.Join(repoRoot, ".claude", "lessons", "cct-patterns.jsonl")
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}

	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	for _, p := range patterns {
		data, err := json.Marshal(p)
		if err != nil {
			return fmt.Errorf("marshal pattern: %w", err)
		}
		if _, err := f.Write(append(data, '\n')); err != nil {
			return fmt.Errorf("write pattern: %w", err)
		}
	}
	return nil
}

// ReadCctPatterns reads patterns from cct-patterns.jsonl.
func ReadCctPatterns(repoRoot string) ([]CctPattern, error) {
	filePath := filepath.Join(repoRoot, ".claude", "lessons", "cct-patterns.jsonl")
	data, err := os.ReadFile(filePath)
	if os.IsNotExist(err) {
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
