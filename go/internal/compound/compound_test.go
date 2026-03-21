package compound

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

func TestGenerateCctID(t *testing.T) {
	id := GenerateCctID("test-input")
	if len(id) != 12 { // "CCT-" + 8 hex chars
		t.Errorf("expected length 12, got %d: %s", len(id), id)
	}
	if id[:4] != "CCT-" {
		t.Errorf("expected prefix CCT-, got %s", id[:4])
	}

	// Deterministic
	id2 := GenerateCctID("test-input")
	if id != id2 {
		t.Errorf("expected deterministic: %s != %s", id, id2)
	}

	// Different input = different ID
	id3 := GenerateCctID("other-input")
	if id == id3 {
		t.Error("expected different IDs for different inputs")
	}
}

func TestBuildSimilarityMatrix(t *testing.T) {
	// Two identical vectors and one different
	embeddings := [][]float64{
		{1, 0, 0},
		{1, 0, 0},
		{0, 1, 0},
	}

	matrix := BuildSimilarityMatrix(embeddings)

	if len(matrix) != 3 {
		t.Fatalf("expected 3x3 matrix, got %d rows", len(matrix))
	}

	// Identical vectors should have similarity ~1.0
	if matrix[0][1] < 0.99 {
		t.Errorf("expected high similarity for identical vectors, got %f", matrix[0][1])
	}

	// Orthogonal vectors should have similarity ~0.0
	if matrix[0][2] > 0.01 {
		t.Errorf("expected low similarity for orthogonal vectors, got %f", matrix[0][2])
	}

	// Symmetric
	if matrix[0][1] != matrix[1][0] {
		t.Error("expected symmetric matrix")
	}
}

func TestClusterBySimilarity(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L1", Insight: "A", Tags: []string{"a"}},
		{ID: "L2", Insight: "B", Tags: []string{"a"}},
		{ID: "L3", Insight: "C", Tags: []string{"b"}},
	}

	// Two similar embeddings and one different
	embeddings := [][]float64{
		{1, 0, 0},
		{0.9, 0.1, 0},
		{0, 0, 1},
	}

	result := ClusterBySimilarity(items, embeddings, 0.75)

	// L1 and L2 should cluster together, L3 should be noise
	if len(result.Clusters) != 1 {
		t.Errorf("expected 1 cluster, got %d", len(result.Clusters))
	}
	if len(result.Noise) != 1 {
		t.Errorf("expected 1 noise item, got %d", len(result.Noise))
	}
	if result.Noise[0].ID != "L3" {
		t.Errorf("expected L3 as noise, got %s", result.Noise[0].ID)
	}
}

func TestClusterBySimilarity_Empty(t *testing.T) {
	result := ClusterBySimilarity(nil, nil, 0.75)
	if len(result.Clusters) != 0 {
		t.Error("expected no clusters for empty input")
	}
}

func TestSynthesizePattern(t *testing.T) {
	cluster := []memory.MemoryItem{
		{ID: "L1", Insight: "Insight one", Trigger: "trigger1", Tags: []string{"tag1", "tag2"}, Severity: sevPtr(memory.SeverityHigh)},
		{ID: "L2", Insight: "Insight two", Trigger: "trigger2", Tags: []string{"tag1", "tag3"}},
	}

	pattern := SynthesizePattern(cluster, "L1-L2")

	if pattern.ID == "" {
		t.Error("expected non-empty ID")
	}
	if pattern.Frequency != 2 {
		t.Errorf("expected frequency 2, got %d", pattern.Frequency)
	}
	if len(pattern.SourceIDs) != 2 {
		t.Errorf("expected 2 source IDs, got %d", len(pattern.SourceIDs))
	}
	if !pattern.Testable {
		t.Error("expected testable=true (high severity in cluster)")
	}
	if pattern.Name == "" {
		t.Error("expected non-empty name")
	}
}

func TestSynthesizePattern_NoTags(t *testing.T) {
	cluster := []memory.MemoryItem{
		{ID: "L1", Insight: "Some long insight text here for naming", Trigger: "t1"},
		{ID: "L2", Insight: "Another insight", Trigger: "t2"},
	}

	pattern := SynthesizePattern(cluster, "L1-L2")

	// Name should fall back to truncated insight
	if pattern.Name == "" {
		t.Error("expected non-empty name even without tags")
	}
}

func TestWriteAndReadCctPatterns(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)

	patterns := []CctPattern{
		{
			ID:          "CCT-12345678",
			Name:        "test pattern",
			Description: "desc",
			Frequency:   2,
			Testable:    true,
			SourceIDs:   []string{"L1", "L2"},
			Created:     "2026-01-01T00:00:00Z",
		},
	}

	if err := WriteCctPatterns(dir, patterns); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	read, err := ReadCctPatterns(dir)
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}

	if len(read) != 1 {
		t.Fatalf("expected 1 pattern, got %d", len(read))
	}
	if read[0].ID != "CCT-12345678" {
		t.Errorf("expected CCT-12345678, got %s", read[0].ID)
	}
}

func TestReadCctPatterns_NonExistent(t *testing.T) {
	patterns, err := ReadCctPatterns("/nonexistent/path")
	if err != nil {
		t.Fatalf("expected no error for missing file, got: %v", err)
	}
	if len(patterns) != 0 {
		t.Error("expected empty patterns for missing file")
	}
}

func TestWriteCctPatterns_Deduplication(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)

	original := []CctPattern{
		{ID: "CCT-aaa", Name: "original", Description: "first", Frequency: 2, SourceIDs: []string{"L1"}, Created: "2026-01-01T00:00:00Z"},
		{ID: "CCT-bbb", Name: "keep", Description: "untouched", Frequency: 1, SourceIDs: []string{"L2"}, Created: "2026-01-01T00:00:00Z"},
	}
	if err := WriteCctPatterns(dir, original); err != nil {
		t.Fatalf("first write failed: %v", err)
	}

	// Write again with same ID — should replace, not duplicate
	updated := []CctPattern{
		{ID: "CCT-aaa", Name: "updated", Description: "second", Frequency: 3, SourceIDs: []string{"L1", "L3"}, Created: "2026-01-02T00:00:00Z"},
	}
	if err := WriteCctPatterns(dir, updated); err != nil {
		t.Fatalf("second write failed: %v", err)
	}

	read, err := ReadCctPatterns(dir)
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}

	if len(read) != 2 {
		t.Fatalf("expected 2 patterns (deduped), got %d", len(read))
	}

	// Order must be deterministic: existing order preserved
	if read[0].ID != "CCT-aaa" || read[1].ID != "CCT-bbb" {
		t.Errorf("expected order [CCT-aaa, CCT-bbb], got [%s, %s]", read[0].ID, read[1].ID)
	}

	// Replaced pattern has updated values
	if read[0].Name != "updated" {
		t.Errorf("expected name 'updated', got '%s'", read[0].Name)
	}
	if read[0].Frequency != 3 {
		t.Errorf("expected frequency 3, got %d", read[0].Frequency)
	}
}

func sevPtr(s memory.Severity) *memory.Severity {
	return &s
}
