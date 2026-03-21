package search

import (
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// helper to create a *memory.Severity
func sevPtr(s memory.Severity) *memory.Severity { return &s }

// helper to create a minimal MemoryItem with ranking-relevant fields.
func makeRankItem(severity *memory.Severity, confirmed bool, created string) memory.MemoryItem {
	return memory.MemoryItem{
		ID:        "L0000000000000001",
		Type:      memory.TypeLesson,
		Trigger:   "test trigger",
		Insight:   "test insight",
		Tags:      []string{"test"},
		Source:    memory.SourceManual,
		Context:   memory.Context{Tool: "test", Intent: "test"},
		Created:   created,
		Confirmed: confirmed,
		Severity:  severity,
	}
}

func TestSeverityBoost(t *testing.T) {
	now := time.Now().UTC().Format(time.RFC3339)

	tests := []struct {
		name     string
		severity *memory.Severity
		want     float64
	}{
		{"high severity", sevPtr(memory.SeverityHigh), 1.5},
		{"medium severity", sevPtr(memory.SeverityMedium), 1.0},
		{"low severity", sevPtr(memory.SeverityLow), 0.8},
		{"nil severity defaults to 1.0", nil, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := makeRankItem(tt.severity, false, now)
			got := SeverityBoost(item)
			if got != tt.want {
				t.Errorf("SeverityBoost() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRecencyBoostFn(t *testing.T) {
	recent := time.Now().UTC().Format(time.RFC3339)
	old := time.Now().UTC().AddDate(0, 0, -60).Format(time.RFC3339)

	tests := []struct {
		name    string
		created string
		want    float64
	}{
		{"recent item (today) gets 1.2", recent, 1.2},
		{"old item (60 days ago) gets 1.0", old, 1.0},
		{"unparseable date gets 1.0", "not-a-date", 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := makeRankItem(nil, false, tt.created)
			got := RecencyBoostFn(item)
			if got != tt.want {
				t.Errorf("RecencyBoostFn() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestConfirmationBoostFn(t *testing.T) {
	now := time.Now().UTC().Format(time.RFC3339)

	tests := []struct {
		name      string
		confirmed bool
		want      float64
	}{
		{"confirmed item gets 1.3", true, 1.3},
		{"unconfirmed item gets 1.0", false, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := makeRankItem(nil, tt.confirmed, now)
			got := ConfirmationBoostFn(item)
			if got != tt.want {
				t.Errorf("ConfirmationBoostFn() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalculateScore_CappedBoost(t *testing.T) {
	// high severity (1.5) * recent (1.2) * confirmed (1.3) = 2.34
	// capped at 1.8, so score = 0.9 * 1.8 = 1.62
	recent := time.Now().UTC().Format(time.RFC3339)
	item := makeRankItem(sevPtr(memory.SeverityHigh), true, recent)
	got := CalculateScore(item, 0.9)
	want := 0.9 * MaxCombinedBoost // 1.62
	if !floatEqual(got, want) {
		t.Errorf("CalculateScore() = %v, want %v", got, want)
	}
}

func TestCalculateScore_NoBoosts(t *testing.T) {
	// nil severity (1.0) * old (1.0) * unconfirmed (1.0) = 1.0
	// score unchanged
	old := time.Now().UTC().AddDate(0, 0, -60).Format(time.RFC3339)
	item := makeRankItem(nil, false, old)
	got := CalculateScore(item, 0.85)
	want := 0.85
	if !floatEqual(got, want) {
		t.Errorf("CalculateScore() = %v, want %v", got, want)
	}
}

func TestRankItems_SortedDescending(t *testing.T) {
	now := time.Now().UTC().Format(time.RFC3339)
	old := time.Now().UTC().AddDate(0, 0, -60).Format(time.RFC3339)

	items := []ScoredItem{
		{Item: makeRankItem(nil, false, old), Score: 0.5},            // no boosts: 0.5
		{Item: makeRankItem(sevPtr(memory.SeverityHigh), true, now), Score: 0.8}, // high+recent+confirmed (capped 1.8): 1.44
		{Item: makeRankItem(sevPtr(memory.SeverityLow), false, now), Score: 0.9}, // low+recent: 0.9*0.8*1.2 = 0.864
	}

	ranked := RankItems(items)

	if len(ranked) != 3 {
		t.Fatalf("RankItems() returned %d items, want 3", len(ranked))
	}

	for i := 1; i < len(ranked); i++ {
		if ranked[i].FinalScore > ranked[i-1].FinalScore {
			t.Errorf("RankItems() not sorted descending: index %d (%.4f) > index %d (%.4f)",
				i, ranked[i].FinalScore, i-1, ranked[i-1].FinalScore)
		}
	}

	// Verify the highest scored item is the boosted one
	if ranked[0].Item.Severity == nil || *ranked[0].Item.Severity != memory.SeverityHigh {
		t.Errorf("expected highest-ranked item to be high-severity, got %v", ranked[0].Item.Severity)
	}
}

func TestRankItems_Empty(t *testing.T) {
	ranked := RankItems(nil)
	if len(ranked) != 0 {
		t.Errorf("RankItems(nil) returned %d items, want 0", len(ranked))
	}

	ranked = RankItems([]ScoredItem{})
	if len(ranked) != 0 {
		t.Errorf("RankItems([]) returned %d items, want 0", len(ranked))
	}
}

// floatEqual compares floats with a small tolerance.
func floatEqual(a, b float64) bool {
	const eps = 1e-9
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < eps
}
