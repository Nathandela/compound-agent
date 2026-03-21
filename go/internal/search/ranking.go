package search

import (
	"math"
	"sort"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

const (
	RecencyThresholdDays = 30
	HighSeverityBoost    = 1.5
	MediumSeverityBoost  = 1.0
	LowSeverityBoost     = 0.8
	RecencyBoost         = 1.2
	ConfirmationBoost    = 1.3
	MaxCombinedBoost     = 1.8
)

// RankedItem is a ScoredItem with a final boosted score.
type RankedItem struct {
	ScoredItem
	FinalScore float64
}

// SeverityBoost returns a multiplier based on item severity.
// high -> 1.5, medium -> 1.0, low -> 0.8, nil/unknown -> 1.0.
func SeverityBoost(item memory.MemoryItem) float64 {
	if item.Severity == nil {
		return MediumSeverityBoost
	}
	switch *item.Severity {
	case memory.SeverityHigh:
		return HighSeverityBoost
	case memory.SeverityMedium:
		return MediumSeverityBoost
	case memory.SeverityLow:
		return LowSeverityBoost
	default:
		return MediumSeverityBoost
	}
}

// RecencyBoostFn returns 1.2 for items created within the last 30 days, 1.0 otherwise.
// Returns 1.0 if the created timestamp cannot be parsed.
func RecencyBoostFn(item memory.MemoryItem) float64 {
	created, err := time.Parse(time.RFC3339, item.Created)
	if err != nil {
		return 1.0
	}
	days := time.Since(created).Hours() / 24
	if days <= RecencyThresholdDays {
		return RecencyBoost
	}
	return 1.0
}

// ConfirmationBoostFn returns 1.3 for confirmed items, 1.0 otherwise.
func ConfirmationBoostFn(item memory.MemoryItem) float64 {
	if item.Confirmed {
		return ConfirmationBoost
	}
	return 1.0
}

// CalculateScore computes a boosted score from vector similarity and item metadata.
// boost = min(severity * recency * confirmation, MaxCombinedBoost)
// result = vectorSimilarity * boost
func CalculateScore(item memory.MemoryItem, vectorSimilarity float64) float64 {
	boost := math.Min(
		SeverityBoost(item)*RecencyBoostFn(item)*ConfirmationBoostFn(item),
		MaxCombinedBoost,
	)
	return vectorSimilarity * boost
}

// RankItems applies multi-factor boosting to scored items and returns them
// sorted by FinalScore descending.
func RankItems(items []ScoredItem) []RankedItem {
	if len(items) == 0 {
		return nil
	}
	ranked := make([]RankedItem, len(items))
	for i, si := range items {
		ranked[i] = RankedItem{
			ScoredItem: si,
			FinalScore: CalculateScore(si.Item, si.Score),
		}
	}
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].FinalScore > ranked[j].FinalScore
	})
	return ranked
}
