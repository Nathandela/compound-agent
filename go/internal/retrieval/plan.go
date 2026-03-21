package retrieval

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// PlanRetrievalResult holds the result of plan-time retrieval.
type PlanRetrievalResult struct {
	Lessons []search.RankedItem
	Message string
}

// RetrieveForPlan retrieves relevant lessons for a plan using hybrid search.
// Falls back to keyword-only when embedder is nil or vector search fails.
func RetrieveForPlan(db *sql.DB, repoRoot string, embedder search.Embedder, planText string, limit int) (PlanRetrievalResult, error) {
	if limit < 1 {
		limit = 5
	}
	candidateLimit := limit * search.CandidateMultiplier

	// Keyword search
	sdb := storage.NewSearchDB(db)
	kwResults, err := sdb.SearchKeywordScored(planText, candidateLimit, "")
	if err != nil {
		return PlanRetrievalResult{}, fmt.Errorf("keyword search: %w", err)
	}

	kwItems := make([]search.ScoredItem, len(kwResults))
	for i, r := range kwResults {
		kwItems[i] = search.ScoredItem{Item: r.MemoryItem, Score: r.Score}
	}

	// Vector search (optional)
	var vecItems []search.ScoredItem
	vectorFailed := false

	if embedder != nil {
		vecItems, err = search.SearchVector(db, embedder, planText, candidateLimit)
		if err != nil {
			vectorFailed = true
		}
	}

	// Merge
	var merged []search.ScoredItem
	if embedder == nil || vectorFailed {
		// Keyword-only fallback: no minScore threshold
		zero := 0.0
		txtW := 0.3
		merged = search.MergeHybridScores(nil, kwItems, &search.HybridMergeOptions{
			VectorWeight: &zero,
			TextWeight:   &txtW,
		})
	} else {
		merged = search.MergeHybridScores(vecItems, kwItems, &search.HybridMergeOptions{
			MinScore: search.MinHybridScore,
		})
	}

	// Rank
	ranked := search.RankItems(merged)

	// Limit
	if len(ranked) > limit {
		ranked = ranked[:limit]
	}

	// Extract ScoredItems for formatting
	topScored := make([]search.ScoredItem, len(ranked))
	for i, r := range ranked {
		topScored[i] = r.ScoredItem
	}

	return PlanRetrievalResult{
		Lessons: ranked,
		Message: FormatLessonsCheck(topScored),
	}, nil
}

// FormatLessonsCheck formats lessons as a numbered list with a header.
func FormatLessonsCheck(lessons []search.ScoredItem) string {
	if len(lessons) == 0 {
		return "No relevant lessons found for this plan."
	}

	var b strings.Builder
	b.WriteString("Lessons Check\n")
	b.WriteString(strings.Repeat("\u2500", 40))
	b.WriteByte('\n')
	for i, l := range lessons {
		fmt.Fprintf(&b, "%d. %s\n", i+1, l.Item.Insight)
	}
	return b.String()
}
