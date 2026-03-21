package search

import (
	"database/sql"
	"math"
	"sort"

	"github.com/nathandelacretaz/compound-agent/internal/compound"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// DefaultSimilarityThreshold is the default cosine similarity threshold
// for FindSimilarLessons.
const DefaultSimilarityThreshold = 0.80

// Embedder provides text embedding functionality.
// Implemented by the embed daemon client.
type Embedder interface {
	Embed(texts []string) ([][]float64, error)
}

// CosineSimilarity computes the cosine similarity between two vectors.
// Returns 0 if either vector has zero magnitude.
// Panics if len(a) != len(b).
func CosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) {
		panic("CosineSimilarity: vectors must have equal length")
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

// cctToMemoryItem converts a CCT pattern to a MemoryItem for unified scoring.
func cctToMemoryItem(p compound.CctPattern) memory.MemoryItem {
	return memory.MemoryItem{
		ID:        p.ID,
		Type:      memory.TypeLesson,
		Trigger:   p.Name,
		Insight:   p.Description,
		Tags:      []string{},
		Source:     memory.SourceManual,
		Context:   memory.Context{Tool: "compound", Intent: "synthesis"},
		Created:   p.Created,
		Confirmed: true,
		Related:   p.SourceIDs,
	}
}

// SearchVector performs vector similarity search over all items in the database
// and CCT patterns from cct-patterns.jsonl.
//
// Algorithm:
//  1. Read all non-invalidated items + CCT patterns.
//  2. Embed the query text.
//  3. For each item, use cached embedding if hash matches, otherwise embed and cache.
//  4. Compute cosine similarity, sort descending, return top `limit`.
func SearchVector(db *sql.DB, embedder Embedder, query string, limit int, repoRoot string) ([]ScoredItem, error) {
	sdb := storage.NewSearchDB(db)
	items, err := sdb.ReadAll()
	if err != nil {
		return nil, err
	}

	// Read CCT patterns if available
	var cctPatterns []compound.CctPattern
	if repoRoot != "" {
		cctPatterns, _ = compound.ReadCctPatterns(repoRoot)
	}

	if len(items) == 0 && len(cctPatterns) == 0 {
		return nil, nil
	}

	queryVecs, err := embedder.Embed([]string{query})
	if err != nil {
		return nil, err
	}
	queryVec := queryVecs[0]

	cache := storage.GetCachedEmbeddingsBulk(db)

	var results []ScoredItem
	for _, item := range items {
		hash := storage.ContentHash(item.Trigger, item.Insight)

		var itemVec []float64
		if cached, ok := cache[item.ID]; ok && cached.Hash == hash {
			itemVec = cached.Vector
		} else {
			text := item.Trigger + " " + item.Insight
			vecs, err := embedder.Embed([]string{text})
			if err != nil {
				return nil, err
			}
			itemVec = vecs[0]
			storage.SetCachedEmbedding(db, item.ID, itemVec, hash)
		}

		score := CosineSimilarity(queryVec, itemVec)
		results = append(results, ScoredItem{Item: item, Score: score})
	}

	// Score CCT patterns
	for _, pattern := range cctPatterns {
		text := pattern.Name + " " + pattern.Description
		vecs, err := embedder.Embed([]string{text})
		if err != nil {
			continue // Skip patterns that fail embedding
		}
		score := CosineSimilarity(queryVec, vecs[0])
		results = append(results, ScoredItem{Item: cctToMemoryItem(pattern), Score: score})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// FindSimilarLessons finds items whose insight text is similar to the given text.
// Only items with similarity >= threshold are returned. The item with excludeID
// is skipped (useful to avoid matching an item against itself).
//
// Uses insight-only embeddings (not trigger+insight like SearchVector).
func FindSimilarLessons(db *sql.DB, embedder Embedder, text string, threshold float64, excludeID string) ([]ScoredItem, error) {
	sdb := storage.NewSearchDB(db)
	items, err := sdb.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}

	queryVecs, err := embedder.Embed([]string{text})
	if err != nil {
		return nil, err
	}
	queryVec := queryVecs[0]

	var results []ScoredItem
	for _, item := range items {
		if item.ID == excludeID {
			continue
		}

		hash := storage.ContentHash(item.Insight, "")

		var itemVec []float64
		if cached := storage.GetCachedInsightEmbedding(db, item.ID, hash); cached != nil {
			itemVec = cached
		} else {
			vecs, err := embedder.Embed([]string{item.Insight})
			if err != nil {
				return nil, err
			}
			itemVec = vecs[0]
			storage.SetCachedInsightEmbedding(db, item.ID, itemVec, hash)
		}

		score := CosineSimilarity(queryVec, itemVec)
		if score >= threshold {
			results = append(results, ScoredItem{Item: item, Score: score})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	return results, nil
}
