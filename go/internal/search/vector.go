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

// cctToItem converts a CCT pattern to a Item for unified scoring.
// Uses SourceManual because no "synthesized" source exists; Context.Intent
// disambiguates these from genuinely manual entries.
func cctToItem(p compound.CctPattern) memory.Item {
	return memory.Item{
		ID:         p.ID,
		Type:       memory.TypeLesson,
		Trigger:    p.Name,
		Insight:    p.Description,
		Tags:       []string{},
		Source:     memory.SourceManual,
		Context:    memory.Context{Tool: "compound", Intent: "synthesis"},
		Created:    p.Created,
		Confirmed:  true,
		Supersedes: []string{},
		Related:    p.SourceIDs,
	}
}

// resolveItemEmbeddings returns embedding vectors for all items, using the cache
// where possible and batch-embedding uncached items.
func resolveItemEmbeddings(db *sql.DB, embedder Embedder, items []memory.Item) ([][]float64, error) {
	cache := storage.GetCachedEmbeddingsBulk(db)

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
			_ = storage.SetCachedEmbedding(db, items[u.idx].ID, vecs[i], u.hash) // cache write failure is non-fatal
		}
	}

	return itemVecs, nil
}

// scoreItems computes cosine similarity between queryVec and each item's embedding.
func scoreItems(queryVec []float64, items []memory.Item, itemVecs [][]float64) []ScoredItem {
	var results []ScoredItem
	for i, item := range items {
		score, err := util.CosineSimilarity(queryVec, itemVecs[i])
		if err != nil {
			continue
		}
		results = append(results, ScoredItem{Item: item, Score: score})
	}
	return results
}

// scoreCctPatterns embeds and scores CCT patterns against the query vector.
func scoreCctPatterns(embedder Embedder, queryVec []float64, cctPatterns []compound.CctPattern) []ScoredItem {
	if len(cctPatterns) == 0 {
		return nil
	}
	cctTexts := make([]string, len(cctPatterns))
	for i, p := range cctPatterns {
		cctTexts[i] = p.Name + " " + p.Description
	}
	cctVecs, err := embedBatched(embedder, cctTexts)
	if err != nil || len(cctVecs) != len(cctPatterns) {
		return nil
	}
	var results []ScoredItem
	for i, pattern := range cctPatterns {
		score, err := util.CosineSimilarity(queryVec, cctVecs[i])
		if err != nil {
			continue
		}
		results = append(results, ScoredItem{Item: cctToItem(pattern), Score: score})
	}
	return results
}

// Vector performs vector similarity search over all items in the database
// and CCT patterns from cct-patterns.jsonl.
//
// Algorithm:
//  1. Read all non-invalidated items + CCT patterns.
//  2. Embed the query text.
//  3. For each item, use cached embedding if hash matches, otherwise embed and cache.
//  4. Compute cosine similarity, sort descending, return top `limit`.
func Vector(db *sql.DB, embedder Embedder, query string, limit int, repoRoot string) ([]ScoredItem, error) {
	sdb := storage.NewSearchDB(db)
	items, err := sdb.ReadAll()
	if err != nil {
		return nil, err
	}

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

	itemVecs, err := resolveItemEmbeddings(db, embedder, items)
	if err != nil {
		return nil, err
	}

	results := scoreItems(queryVec, items, itemVecs)
	results = append(results, scoreCctPatterns(embedder, queryVec, cctPatterns)...)

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// insightCandidate pairs an item with its precomputed content hash.
type insightCandidate struct {
	item memory.Item
	hash string
}

// uncachedInsightEntry tracks an item index that needs embedding.
type uncachedInsightEntry struct {
	idx  int
	hash string
}

// FindSimilarLessons finds items whose insight text is similar to the given text.
// Only items with similarity >= threshold are returned. The item with excludeID
// is skipped (useful to avoid matching an item against itself).
//
// If preloaded is non-nil, it is used instead of reading from the database,
// avoiding redundant I/O when the caller already has the item list.
//
// Uses insight-only embeddings (not trigger+insight like Vector).
func FindSimilarLessons(db *sql.DB, embedder Embedder, text string, threshold float64, excludeID string, preloaded []memory.Item) ([]ScoredItem, error) {
	items := preloaded
	if items == nil {
		sdb := storage.NewSearchDB(db)
		var err error
		items, err = sdb.ReadAll()
		if err != nil {
			return nil, err
		}
	}
	if len(items) == 0 {
		return nil, nil
	}

	queryVecs, err := embedder.Embed([]string{text})
	if err != nil {
		return nil, err
	}

	candidates := filterInsightCandidates(items, excludeID)
	itemVecs, err := resolveInsightEmbeddings(db, embedder, candidates)
	if err != nil {
		return nil, err
	}

	return scoreInsightCandidates(queryVecs[0], candidates, itemVecs, threshold), nil
}

// filterInsightCandidates builds candidates from items, excluding excludeID.
func filterInsightCandidates(items []memory.Item, excludeID string) []insightCandidate {
	var candidates []insightCandidate
	for _, item := range items {
		if item.ID == excludeID {
			continue
		}
		candidates = append(candidates, insightCandidate{
			item: item,
			hash: storage.ContentHash(item.Insight, ""),
		})
	}
	return candidates
}

// resolveInsightEmbeddings returns a vector for each candidate, using cached
// embeddings where available and batch-embedding the rest.
func resolveInsightEmbeddings(db *sql.DB, embedder Embedder, candidates []insightCandidate) ([][]float64, error) {
	cache := storage.GetCachedInsightEmbeddingsBulk(db)
	itemVecs := make([][]float64, len(candidates))
	var uncached []uncachedInsightEntry

	for i, c := range candidates {
		if cached, ok := cache[c.item.ID]; ok && cached.Hash == c.hash {
			itemVecs[i] = cached.Vector
		} else {
			uncached = append(uncached, uncachedInsightEntry{idx: i, hash: c.hash})
		}
	}

	if len(uncached) == 0 {
		return itemVecs, nil
	}

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
		// cache write failure is non-fatal; search proceeds with in-memory result
		_ = storage.SetCachedInsightEmbedding(db, candidates[u.idx].item.ID, vecs[i], u.hash)
	}
	return itemVecs, nil
}

// scoreInsightCandidates computes similarity and filters by threshold.
func scoreInsightCandidates(queryVec []float64, candidates []insightCandidate, itemVecs [][]float64, threshold float64) []ScoredItem {
	var results []ScoredItem
	for i, c := range candidates {
		score, err := util.CosineSimilarity(queryVec, itemVecs[i])
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
	return results
}
