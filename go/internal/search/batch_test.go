package search

import (
	"fmt"
	"testing"
)

// trackingEmbedder records each Embed() call's batch size.
type trackingEmbedder struct {
	batchSizes []int
}

func (t *trackingEmbedder) Embed(texts []string) ([][]float64, error) {
	t.batchSizes = append(t.batchSizes, len(texts))
	result := make([][]float64, len(texts))
	for i := range texts {
		result[i] = []float64{float64(i), 0, 0, 0}
	}
	return result, nil
}

func TestEmbedBatched_ChunksLargeBatches(t *testing.T) {
	t.Parallel()
	te := &trackingEmbedder{}

	// 150 texts should produce 3 batches: 64 + 64 + 22
	texts := make([]string, 150)
	for i := range texts {
		texts[i] = fmt.Sprintf("text-%d", i)
	}

	vecs, err := embedBatched(te, texts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vecs) != 150 {
		t.Fatalf("expected 150 vectors, got %d", len(vecs))
	}
	if len(te.batchSizes) != 3 {
		t.Fatalf("expected 3 batches, got %d: %v", len(te.batchSizes), te.batchSizes)
	}
	if te.batchSizes[0] != 64 || te.batchSizes[1] != 64 || te.batchSizes[2] != 22 {
		t.Errorf("expected batch sizes [64, 64, 22], got %v", te.batchSizes)
	}
}

func TestEmbedBatched_SmallBatch(t *testing.T) {
	t.Parallel()
	te := &trackingEmbedder{}

	texts := []string{"a", "b", "c"}
	vecs, err := embedBatched(te, texts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vecs) != 3 {
		t.Fatalf("expected 3 vectors, got %d", len(vecs))
	}
	if len(te.batchSizes) != 1 {
		t.Errorf("expected 1 batch for small input, got %d", len(te.batchSizes))
	}
}

func TestEmbedBatched_Empty(t *testing.T) {
	t.Parallel()
	te := &trackingEmbedder{}

	vecs, err := embedBatched(te, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if vecs != nil {
		t.Errorf("expected nil for empty input, got %v", vecs)
	}
	if len(te.batchSizes) != 0 {
		t.Errorf("expected no embed calls for empty input, got %d", len(te.batchSizes))
	}
}

func TestEmbedBatched_ExactBatchSize(t *testing.T) {
	t.Parallel()
	te := &trackingEmbedder{}

	texts := make([]string, 64)
	for i := range texts {
		texts[i] = fmt.Sprintf("text-%d", i)
	}

	vecs, err := embedBatched(te, texts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vecs) != 64 {
		t.Fatalf("expected 64 vectors, got %d", len(vecs))
	}
	if len(te.batchSizes) != 1 {
		t.Errorf("expected 1 batch for exactly 64 items, got %d", len(te.batchSizes))
	}
}
