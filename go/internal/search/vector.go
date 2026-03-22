package search

import (
	"database/sql"
	"sort"

	"github.com/nathandelacretaz/compound-agent/internal/compound"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
)

// DefaultSimilarityThreshold is the default cosine similarity threshold
// for FindSimilarLessons.
const DefaultSimilarityThreshold = 0.80

// maxEmbedBatch is the maximum texts per Embed() call, matching the Rust
// daemon's CA_EMBED_MAX_BATCH default. Larger batches are chunked automatically.
const maxEmbedBatch = 64

// Embedder provides text embedding functionality.
// Implemented by the embed daemon client.
type Embedder interface {
	Embed(texts []string) ([][]float64, error)
}

// embedBatched embeds texts in chunks of maxEmbedBatch to stay within daemon limits.
func embedBatched(embedder Embedder, texts []string) ([][]float64, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	result := make([][]float64, 0, len(texts))
	for i := 0; i < len(texts); i += maxEmbedBatch {
		end := i + maxEmbedBatch
		if end > len(texts) {
			end = len(texts)
		}
		vecs, err := embedder.Embed(texts[i:end])
		if err != nil {
			return nil, err
		}
		result = append(result, vecs...)
	}
	return result, nil
}

// CosineSimilarity computes the cosine similarity between two vectors.
// Delegates to util.CosineSimilarity (canonical implementation).
func CosineSimilarity(a, b []float64) (float64, error) {
	return util.CosineSimilarity(a, b)
}

// cctToMemoryItem converts a CCT pattern to a MemoryItem for unified scoring.
// Uses SourceManual because no "synthesized" source exists; Context.Intent
// disambiguates these from genuinely manual entries.
func cctToMemoryItem(p compound.CctPattern) memory.MemoryItem {
	return memory.MemoryItem{
		ID:         p.ID,
		Type:       memory.TypeLesson,
		Trigger:    p.Name,
		Insight:    p.Description,
		Tags:       []string{},
		Source:      memory.SourceManual,
		Context:    memory.Context{Tool: "compound", Intent: "synthesis"},
		Created:    p.Created,
		Confirmed:  true,
		Supersedes: []string{},
		Related:    p.SourceIDs,
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

	// Separate cached from uncached items for batched embedding
	type uncachedEntry struct {
		idx  int
		text string
		hash string
	}
	itemVecs := make([][]float64, len(items))
	var uncached []uncachedEntry

	for i, item := range items {
		hash := storage.ContentHash(item.Trigger, item.Insight)
		if cached, ok := cache[item.ID]; ok && cached.Hash == hash {
			itemVecs[i] = cached.Vector
		} else {
			uncached = append(uncached, uncachedEntry{idx: i, text: item.Trigger + " " + item.Insight, hash: hash})
		}
	}

	// Batch embed all uncached items (chunked to respect daemon limits)
	if len(uncached) > 0 {
		texts := make([]string, len(uncached))
		for i, u := range uncached {
			texts[i] = u.text
		}
		vecs, err := embedBatched(embedder, texts)
		if err != nil {
			return nil, err
		}
		for i, u := range uncached {
			itemVecs[u.idx] = vecs[i]
			_ = storage.SetCachedEmbedding(db, items[u.idx].ID, vecs[i], u.hash) // cache write failure is non-fatal; search proceeds with in-memory result
		}
	}

	var results []ScoredItem
	for i, item := range items {
		score, err := CosineSimilarity(queryVec, itemVecs[i])
		if err != nil {
			continue
		}
		results = append(results, ScoredItem{Item: item, Score: score})
	}

	// Score CCT patterns — batched with chunking for daemon limits
	if len(cctPatterns) > 0 {
		cctTexts := make([]string, len(cctPatterns))
		for i, p := range cctPatterns {
			cctTexts[i] = p.Name + " " + p.Description
		}
		cctVecs, cctErr := embedBatched(embedder, cctTexts)
		if cctErr == nil && len(cctVecs) == len(cctPatterns) {
			for i, pattern := range cctPatterns {
				score, err := CosineSimilarity(queryVec, cctVecs[i])
				if err != nil {
					continue
				}
				results = append(results, ScoredItem{Item: cctToMemoryItem(pattern), Score: score})
			}
		}
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

	cache := storage.GetCachedInsightEmbeddingsBulk(db)

	// Separate cached from uncached items for batched embedding
	type uncachedEntry struct {
		idx  int
		hash string
	}
	// Filter out excluded item and collect cache status
	type candidate struct {
		item memory.MemoryItem
		hash string
	}
	var candidates []candidate
	for _, item := range items {
		if item.ID == excludeID {
			continue
		}
		candidates = append(candidates, candidate{item: item, hash: storage.ContentHash(item.Insight, "")})
	}

	itemVecs := make([][]float64, len(candidates))
	var uncached []uncachedEntry

	for i, c := range candidates {
		if cached, ok := cache[c.item.ID]; ok && cached.Hash == c.hash {
			itemVecs[i] = cached.Vector
		} else {
			uncached = append(uncached, uncachedEntry{idx: i, hash: c.hash})
		}
	}

	// Batch embed all uncached items (chunked to respect daemon limits)
	if len(uncached) > 0 {
		texts := make([]string, len(uncached))
		for i, u := range uncached {
			texts[i] = candidates[u.idx].item.Insight
		}
		vecs, err := embedBatched(embedder, texts)
		if err != nil {
			return nil, err
		}
		for i, u := range uncached {
			itemVecs[u.idx] = vecs[i]
			_ = storage.SetCachedInsightEmbedding(db, candidates[u.idx].item.ID, vecs[i], u.hash) // cache write failure is non-fatal; search proceeds with in-memory result
		}
	}

	var results []ScoredItem
	for i, c := range candidates {
		score, err := CosineSimilarity(queryVec, itemVecs[i])
		if err != nil {
			continue
		}
		if score >= threshold {
			results = append(results, ScoredItem{Item: c.item, Score: score})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	return results, nil
}
