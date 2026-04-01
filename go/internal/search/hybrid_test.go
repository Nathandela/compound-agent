package search

import (
	"math"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// helper to build a minimal Item with a given ID.
func makeHybridItem(id string) memory.Item {
	return memory.Item{
		ID:      id,
		Type:    memory.TypeLesson,
		Trigger: "trigger",
		Insight: "insight",
		Tags:    []string{"go"},
		Source:  memory.SourceManual,
		Created: "2025-01-01T00:00:00Z",
	}
}

func approxEqual(a, b, eps float64) bool {
	return math.Abs(a-b) < eps
}

func floatPtr(f float64) *float64 { return &f }

func TestMergeHybridScores_EmptyInputs(t *testing.T) {
	t.Parallel()
	result := MergeHybridScores(nil, nil, nil)
	if result != nil {
		t.Fatalf("expected nil, got %v", result)
	}

	result = MergeHybridScores([]ScoredItem{}, []ScoredItem{}, nil)
	if result != nil {
		t.Fatalf("expected nil, got %v", result)
	}
}

func TestMergeHybridScores_VectorOnly(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.9},
		{Item: makeHybridItem("L002"), Score: 0.6},
	}
	result := MergeHybridScores(vec, nil, nil)

	if len(result) != 2 {
		t.Fatalf("expected 2 results, got %d", len(result))
	}
	// Default weights: vec=0.7, txt=0.3
	// L001: 0.7*0.9 + 0.3*0 = 0.63
	// L002: 0.7*0.6 + 0.3*0 = 0.42
	if !approxEqual(result[0].Score, 0.63, 0.001) {
		t.Errorf("L001 score: want ~0.63, got %f", result[0].Score)
	}
	if result[0].Item.ID != "L001" {
		t.Errorf("first result ID: want L001, got %s", result[0].Item.ID)
	}
	if !approxEqual(result[1].Score, 0.42, 0.001) {
		t.Errorf("L002 score: want ~0.42, got %f", result[1].Score)
	}
}

func TestMergeHybridScores_KeywordOnly(t *testing.T) {
	t.Parallel()
	kw := []ScoredItem{
		{Item: makeHybridItem("L010"), Score: 0.8},
		{Item: makeHybridItem("L011"), Score: 0.5},
	}
	result := MergeHybridScores(nil, kw, nil)

	if len(result) != 2 {
		t.Fatalf("expected 2 results, got %d", len(result))
	}
	// L010: 0.7*0 + 0.3*0.8 = 0.24
	// L011: 0.7*0 + 0.3*0.5 = 0.15
	if !approxEqual(result[0].Score, 0.24, 0.001) {
		t.Errorf("L010 score: want ~0.24, got %f", result[0].Score)
	}
	if !approxEqual(result[1].Score, 0.15, 0.001) {
		t.Errorf("L011 score: want ~0.15, got %f", result[1].Score)
	}
}

func TestMergeHybridScores_OverlappingItems(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.9},
		{Item: makeHybridItem("L002"), Score: 0.4},
	}
	kw := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.8},
		{Item: makeHybridItem("L003"), Score: 0.7},
	}
	result := MergeHybridScores(vec, kw, nil)

	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}

	// Build a map for easier lookup
	scores := map[string]float64{}
	for _, r := range result {
		scores[r.Item.ID] = r.Score
	}

	// L001: 0.7*0.9 + 0.3*0.8 = 0.63 + 0.24 = 0.87
	if !approxEqual(scores["L001"], 0.87, 0.001) {
		t.Errorf("L001 score: want ~0.87, got %f", scores["L001"])
	}
	// L002: 0.7*0.4 + 0.3*0 = 0.28
	if !approxEqual(scores["L002"], 0.28, 0.001) {
		t.Errorf("L002 score: want ~0.28, got %f", scores["L002"])
	}
	// L003: 0.7*0 + 0.3*0.7 = 0.21
	if !approxEqual(scores["L003"], 0.21, 0.001) {
		t.Errorf("L003 score: want ~0.21, got %f", scores["L003"])
	}
}

func TestMergeHybridScores_MinScoreFilters(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.9},
		{Item: makeHybridItem("L002"), Score: 0.3},
	}
	kw := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.8},
	}
	opts := &HybridMergeOptions{MinScore: 0.5}
	result := MergeHybridScores(vec, kw, opts)

	// L001: 0.7*0.9 + 0.3*0.8 = 0.87 (passes)
	// L002: 0.7*0.3 + 0.3*0   = 0.21 (filtered)
	if len(result) != 1 {
		t.Fatalf("expected 1 result after minScore filter, got %d", len(result))
	}
	if result[0].Item.ID != "L001" {
		t.Errorf("expected L001, got %s", result[0].Item.ID)
	}
}

func TestMergeHybridScores_LimitTruncates(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.9},
		{Item: makeHybridItem("L002"), Score: 0.7},
		{Item: makeHybridItem("L003"), Score: 0.5},
	}
	opts := &HybridMergeOptions{Limit: 2}
	result := MergeHybridScores(vec, nil, opts)

	if len(result) != 2 {
		t.Fatalf("expected 2 results after limit, got %d", len(result))
	}
	if result[0].Item.ID != "L001" {
		t.Errorf("first result: want L001, got %s", result[0].Item.ID)
	}
	if result[1].Item.ID != "L002" {
		t.Errorf("second result: want L002, got %s", result[1].Item.ID)
	}
}

func TestMergeHybridScores_CustomWeights(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.8},
	}
	kw := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.6},
	}
	opts := &HybridMergeOptions{
		VectorWeight: floatPtr(0.5),
		TextWeight:   floatPtr(0.5),
	}
	result := MergeHybridScores(vec, kw, opts)

	if len(result) != 1 {
		t.Fatalf("expected 1 result, got %d", len(result))
	}
	// normalized: 0.5/1.0=0.5 each
	// 0.5*0.8 + 0.5*0.6 = 0.7
	if !approxEqual(result[0].Score, 0.7, 0.001) {
		t.Errorf("L001 score: want ~0.7, got %f", result[0].Score)
	}
}

func TestMergeHybridScores_SortedDescending(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.3},
		{Item: makeHybridItem("L002"), Score: 0.9},
		{Item: makeHybridItem("L003"), Score: 0.6},
	}
	result := MergeHybridScores(vec, nil, nil)

	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}
	if result[0].Item.ID != "L002" {
		t.Errorf("first: want L002, got %s", result[0].Item.ID)
	}
	if result[1].Item.ID != "L003" {
		t.Errorf("second: want L003, got %s", result[1].Item.ID)
	}
	if result[2].Item.ID != "L001" {
		t.Errorf("third: want L001, got %s", result[2].Item.ID)
	}
	// Verify strictly descending
	for i := 1; i < len(result); i++ {
		if result[i].Score > result[i-1].Score {
			t.Errorf("result[%d].Score (%f) > result[%d].Score (%f): not descending",
				i, result[i].Score, i-1, result[i-1].Score)
		}
	}
}

func TestMergeHybridScores_ZeroTotalWeight(t *testing.T) {
	t.Parallel()
	vec := []ScoredItem{
		{Item: makeHybridItem("L001"), Score: 0.9},
	}
	opts := &HybridMergeOptions{
		VectorWeight: floatPtr(0),
		TextWeight:   floatPtr(0),
	}
	result := MergeHybridScores(vec, nil, opts)
	if result != nil {
		t.Fatalf("expected nil for zero total weight, got %v", result)
	}
}
