package util

import (
	"fmt"
	"math"
)

// CosineSimilarity computes the cosine similarity between two vectors.
// Returns 0 if either vector has zero magnitude.
// Returns an error if vectors have different lengths.
func CosineSimilarity(a, b []float64) (float64, error) {
	if len(a) != len(b) {
		return 0, fmt.Errorf("CosineSimilarity: vectors must have equal length (%d vs %d)", len(a), len(b))
	}

	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	mag := math.Sqrt(normA) * math.Sqrt(normB)
	if mag == 0 {
		return 0, nil
	}
	return dot / mag, nil
}
