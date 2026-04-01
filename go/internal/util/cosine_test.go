package util

import (
	"math"
	"testing"
)

func TestCosineSimilarity_IdenticalVectors(t *testing.T) {
	t.Parallel()
	v := []float64{1, 2, 3}
	got, err := CosineSimilarity(v, v)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if math.Abs(got-1.0) > 1e-9 {
		t.Errorf("identical vectors: want 1.0, got %f", got)
	}
}

func TestCosineSimilarity_OrthogonalVectors(t *testing.T) {
	t.Parallel()
	a := []float64{1, 0}
	b := []float64{0, 1}
	got, err := CosineSimilarity(a, b)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if math.Abs(got) > 1e-9 {
		t.Errorf("orthogonal vectors: want 0.0, got %f", got)
	}
}

func TestCosineSimilarity_ZeroVector(t *testing.T) {
	t.Parallel()
	a := []float64{0, 0, 0}
	b := []float64{1, 2, 3}
	got, err := CosineSimilarity(a, b)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 0.0 {
		t.Errorf("zero vector: want 0.0, got %f", got)
	}
}

func TestCosineSimilarity_ReturnsErrorOnLengthMismatch(t *testing.T) {
	t.Parallel()
	_, err := CosineSimilarity([]float64{1, 2}, []float64{1, 2, 3})
	if err == nil {
		t.Error("expected error on length mismatch, got nil")
	}
}

func TestCosineSimilarity_EmptyVectors(t *testing.T) {
	t.Parallel()
	got, err := CosineSimilarity([]float64{}, []float64{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 0.0 {
		t.Errorf("empty vectors: want 0.0, got %f", got)
	}
}
