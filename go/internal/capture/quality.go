package capture

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// DuplicateThreshold is the cosine similarity threshold for near-duplicate detection.
const DuplicateThreshold = 0.98

// minWordCount is the minimum number of words for a specific insight.
const minWordCount = 4

// Embedder provides text embedding functionality.
type Embedder interface {
	Embed(texts []string) ([][]float64, error)
}

// NoveltyResult holds the result of a novelty check.
type NoveltyResult struct {
	Novel      bool
	Reason     string
	ExistingID string
}

// vaguePatterns are case-insensitive patterns that indicate non-specific advice.
var vaguePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bwrite better\b`),
	regexp.MustCompile(`(?i)\bbe careful\b`),
	regexp.MustCompile(`(?i)\bremember to\b`),
	regexp.MustCompile(`(?i)\bmake sure\b`),
	regexp.MustCompile(`(?i)\btry to\b`),
	regexp.MustCompile(`(?i)\bdouble check\b`),
}

// genericImperativePattern matches short "Always X" or "Never X" phrases.
var genericImperativePattern = regexp.MustCompile(`(?i)^(always|never)\s+\w+(\s+\w+){0,2}$`)

// actionPatterns are case-insensitive patterns that indicate actionable guidance.
var actionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\buse\s+.+\s+instead\s+of\b`),
	regexp.MustCompile(`(?i)\bprefer\s+.+\s+(over|to)\b`),
	regexp.MustCompile(`(?i)\balways\s+.+\s+when\b`),
	regexp.MustCompile(`(?i)\bnever\s+.+\s+without\b`),
	regexp.MustCompile(`(?i)\bavoid\s+(using\s+)?\w+`),
	regexp.MustCompile(`(?i)\bcheck\s+.+\s+before\b`),
	regexp.MustCompile(`(?i)^(run|use|add|remove|install|update|configure|set|enable|disable)\s+`),
}

// isSpecific checks if an insight is specific enough to be useful.
func isSpecific(insight string) (specific bool, reason string) {
	words := strings.Fields(strings.TrimSpace(insight))
	if len(words) < minWordCount {
		return false, "Insight is too short to be actionable"
	}

	for _, pat := range vaguePatterns {
		if pat.MatchString(insight) {
			return false, "Insight matches a vague pattern"
		}
	}

	if genericImperativePattern.MatchString(insight) {
		return false, "Insight matches a vague pattern"
	}

	return true, ""
}

// isActionable checks if an insight contains actionable guidance.
func isActionable(insight string) (actionable bool, reason string) {
	for _, pat := range actionPatterns {
		if pat.MatchString(insight) {
			return true, ""
		}
	}
	return false, "Insight lacks clear action guidance"
}

// isNovel checks if an insight is novel using an embedder and DB at repoRoot.
// If embedder is nil, returns novel=true (graceful degradation).
func isNovel(repoRoot string, insight string, embedder Embedder, threshold float64) NoveltyResult {
	if embedder == nil {
		return NoveltyResult{Novel: true}
	}

	// Open DB; if it fails, fall back to novel=true
	db, err := storage.OpenRepoDB(repoRoot)
	if err != nil {
		return NoveltyResult{Novel: true}
	}
	defer db.Close()

	return isNovelWithDB(db, insight, embedder, threshold)
}

// isNovelWithDB checks novelty against an already-opened database.
func isNovelWithDB(db *sql.DB, insight string, embedder Embedder, threshold float64) NoveltyResult {
	similar, err := search.FindSimilarLessons(db, embedder, insight, threshold, "")
	if err != nil {
		return NoveltyResult{Novel: true}
	}

	if len(similar) > 0 {
		top := similar[0]
		truncated := top.Item.Insight
		if len(truncated) > 50 {
			truncated = truncated[:50]
		}
		return NoveltyResult{
			Novel:      false,
			Reason:     fmt.Sprintf("Near-duplicate of existing lesson: \"%s...\"", truncated),
			ExistingID: top.Item.ID,
		}
	}

	return NoveltyResult{Novel: true}
}

// ShouldPropose checks if an insight should be proposed as a new lesson.
// Checks specificity first (fast, no DB), then novelty via embedder.
func ShouldPropose(repoRoot string, insight string, embedder Embedder) (shouldPropose bool, reason string) {
	specific, specificReason := isSpecific(insight)
	if !specific {
		return false, specificReason
	}

	novelty := isNovel(repoRoot, insight, embedder, DuplicateThreshold)
	if !novelty.Novel {
		return false, novelty.Reason
	}

	return true, ""
}
