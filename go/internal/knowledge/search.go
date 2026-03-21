package knowledge

import (
	"sort"

	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

const (
	DefaultKnowledgeLimit = 6
	candidateMultiplier   = 4
	minHybridScore        = 0.35
	defaultVectorWeight   = 0.7
	defaultTextWeight     = 0.3
)

// KnowledgeSearchOptions controls knowledge search behavior.
type KnowledgeSearchOptions struct {
	Limit int
}

// ScoredChunkResult pairs a knowledge chunk with a relevance score.
type ScoredChunkResult struct {
	Chunk storage.KnowledgeChunk
	Score float64
}

// SearchKnowledge performs hybrid search over the knowledge database.
// If embedder is nil or no embeddings exist, falls back to FTS5-only.
func SearchKnowledge(kdb *storage.KnowledgeDB, embedder search.Embedder, query string, opts *KnowledgeSearchOptions) ([]ScoredChunkResult, error) {
	limit := DefaultKnowledgeLimit
	if opts != nil && opts.Limit > 0 {
		limit = opts.Limit
	}

	candidateLimit := limit * candidateMultiplier

	if embedder != nil {
		// Hybrid: vector + keyword
		vectorResults, vecErr := SearchKnowledgeVector(kdb, embedder, query, candidateLimit)
		keywordResults := kdb.SearchChunksKeywordScored(query, candidateLimit)

		// If vector search failed or returned nothing, fall back to keyword-only
		if vecErr != nil || len(vectorResults) == 0 {
			kwResults := toScoredChunkResults(keywordResults)
			if len(kwResults) > limit {
				kwResults = kwResults[:limit]
			}
			return kwResults, nil
		}

		// Merge hybrid scores
		merged := mergeKnowledgeScores(vectorResults, keywordResults, limit)
		return merged, nil
	}

	// FTS-only fallback
	keywordResults := kdb.SearchChunksKeywordScored(query, limit)
	return toScoredChunkResults(keywordResults), nil
}

// SearchKnowledgeVector performs two-phase vector search over knowledge chunks.
// Phase 1: Load only IDs + embeddings, compute similarity, select top-k.
// Phase 2: Hydrate full chunk data for top-k results only.
func SearchKnowledgeVector(kdb *storage.KnowledgeDB, embedder search.Embedder, query string, limit int) ([]ScoredChunkResult, error) {
	// Phase 1: get all embeddings (lightweight)
	entries := kdb.GetAllEmbeddings()
	if len(entries) == 0 {
		return nil, nil
	}

	queryVecs, err := embedder.Embed([]string{query})
	if err != nil {
		return nil, err
	}
	queryVec := queryVecs[0]

	type scored struct {
		id    string
		score float64
	}
	var results []scored
	for id, entry := range entries {
		score := search.CosineSimilarity(queryVec, entry.Vector)
		results = append(results, scored{id: id, score: score})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].score > results[j].score
	})

	if len(results) > limit {
		results = results[:limit]
	}
	if len(results) == 0 {
		return nil, nil
	}

	// Phase 2: hydrate top-k
	ids := make([]string, len(results))
	for i, r := range results {
		ids[i] = r.id
	}

	hydrated := kdb.HydrateChunks(ids)
	dataMap := make(map[string]storage.KnowledgeChunk, len(hydrated))
	for _, c := range hydrated {
		dataMap[c.ID] = c
	}

	var final []ScoredChunkResult
	for _, r := range results {
		chunk, ok := dataMap[r.id]
		if !ok {
			continue
		}
		final = append(final, ScoredChunkResult{Chunk: chunk, Score: r.score})
	}

	return final, nil
}

// mergeKnowledgeScores blends vector and keyword results for knowledge chunks.
func mergeKnowledgeScores(vectorResults []ScoredChunkResult, keywordResults []storage.ScoredKnowledgeChunk, limit int) []ScoredChunkResult {
	vecW := defaultVectorWeight
	txtW := defaultTextWeight

	type entry struct {
		chunk    storage.KnowledgeChunk
		vecScore float64
		txtScore float64
	}
	merged := make(map[string]*entry)

	for _, v := range vectorResults {
		merged[v.Chunk.ID] = &entry{chunk: v.Chunk, vecScore: v.Score}
	}
	for _, k := range keywordResults {
		id := k.Chunk.ID
		if e, ok := merged[id]; ok {
			e.txtScore = k.Score
		} else {
			merged[id] = &entry{chunk: k.Chunk, txtScore: k.Score}
		}
	}

	var results []ScoredChunkResult
	for _, e := range merged {
		blended := vecW*e.vecScore + txtW*e.txtScore
		if blended < minHybridScore {
			continue
		}
		results = append(results, ScoredChunkResult{Chunk: e.chunk, Score: blended})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}
	return results
}

func toScoredChunkResults(scored []storage.ScoredKnowledgeChunk) []ScoredChunkResult {
	results := make([]ScoredChunkResult, len(scored))
	for i, s := range scored {
		results[i] = ScoredChunkResult{Chunk: s.Chunk, Score: s.Score}
	}
	return results
}
