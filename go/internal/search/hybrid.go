// Package search provides hybrid search merging for vector and keyword results.
package search

import (
	"sort"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

const (
	DefaultVectorWeight = 0.7
	DefaultTextWeight   = 0.3
	CandidateMultiplier = 4
	MinHybridScore      = 0.35
)

// ScoredItem pairs a memory item with a relevance score.
type ScoredItem struct {
	Item  memory.MemoryItem
	Score float64
}

// HybridMergeOptions controls hybrid score merging behavior.
// Pointer fields distinguish "not set" (nil) from "explicitly set to 0".
type HybridMergeOptions struct {
	VectorWeight *float64
	TextWeight   *float64
	Limit        int
	MinScore     float64
}

// MergeHybridScores combines vector and keyword search results into a single
// ranked list using weighted score blending.
//
// Algorithm:
//  1. If both inputs are empty, return nil.
//  2. Normalize weights to sum to 1.0.
//  3. Union both result sets by item ID.
//  4. Blend: score = vecW*vecScore + txtW*txtScore (missing source = 0).
//  5. Filter by minScore if set.
//  6. Sort descending by blended score.
//  7. Apply limit if > 0.
func MergeHybridScores(vectorResults, keywordResults []ScoredItem, opts *HybridMergeOptions) []ScoredItem {
	if len(vectorResults) == 0 && len(keywordResults) == 0 {
		return nil
	}

	rawVecW := DefaultVectorWeight
	rawTxtW := DefaultTextWeight
	var limit int
	var minScore float64

	if opts != nil {
		if opts.VectorWeight != nil {
			rawVecW = *opts.VectorWeight
		}
		if opts.TextWeight != nil {
			rawTxtW = *opts.TextWeight
		}
		limit = opts.Limit
		minScore = opts.MinScore
	}

	total := rawVecW + rawTxtW
	if total <= 0 {
		return nil
	}

	vecW := rawVecW / total
	txtW := rawTxtW / total

	// Union by item ID.
	type entry struct {
		item     memory.MemoryItem
		vecScore float64
		txtScore float64
	}
	merged := make(map[string]*entry)

	for _, v := range vectorResults {
		merged[v.Item.ID] = &entry{item: v.Item, vecScore: v.Score}
	}
	for _, k := range keywordResults {
		id := k.Item.ID
		if e, ok := merged[id]; ok {
			e.txtScore = k.Score
		} else {
			merged[id] = &entry{item: k.Item, txtScore: k.Score}
		}
	}

	// Blend scores.
	results := make([]ScoredItem, 0, len(merged))
	for _, e := range merged {
		blended := vecW*e.vecScore + txtW*e.txtScore
		if minScore > 0 && blended < minScore {
			continue
		}
		results = append(results, ScoredItem{Item: e.item, Score: blended})
	}

	// Sort descending by score.
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	// Apply limit.
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	return results
}
