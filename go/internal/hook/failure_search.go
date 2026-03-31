package hook

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	searchTimeout    = 500 * time.Millisecond
	maxSearchResults = 3
	maxQueryLen      = 200
)

// LessonMatch represents a single lesson returned by search.
type LessonMatch struct {
	Trigger string
	Insight string
	Score   float64
}

// LessonSearchFunc searches for lessons matching query tokens.
// Tokens are joined with OR for broad matching.
// Returns up to limit results with scores above the relevance floor.
type LessonSearchFunc func(ctx context.Context, tokens []string, limit int) ([]LessonMatch, error)

// stopWords are common words to filter from FTS5 queries.
var stopWords = map[string]bool{
	"a": true, "an": true, "the": true, "is": true, "are": true,
	"was": true, "were": true, "be": true, "been": true, "being": true,
	"have": true, "has": true, "had": true, "do": true, "does": true,
	"did": true, "will": true, "would": true, "could": true, "should": true,
	"may": true, "might": true, "can": true, "shall": true,
	"to": true, "of": true, "in": true, "for": true, "on": true,
	"with": true, "at": true, "by": true, "from": true, "as": true,
	"into": true, "through": true, "during": true, "before": true,
	"after": true, "above": true, "below": true, "between": true,
	"no": true, "not": true, "but": true, "if": true, "or": true,
	"and": true, "so": true, "than": true, "too": true, "very": true,
	"just": true, "that": true, "this": true, "it": true, "its": true,
	"such": true, "which": true, "what": true, "when": true, "where": true,
}

// maxQueryTokens limits the number of FTS5 query terms to prevent overly
// restrictive implicit-AND matching.
const maxQueryTokens = 5

// BuildSearchTokens constructs search tokens from failure context.
// Uses target and error output keywords (not tool name, which rarely appears in lessons).
// Tokens are used with OR-based search for broad FTS5 matching.
func BuildSearchTokens(toolName, target, toolOutput string) []string {
	var tokens []string

	// Target is usually the most distinctive signal (e.g., "npm", "/foo.go")
	if target != "" {
		tokens = append(tokens, target)
	}

	// Extract distinctive keywords from error output
	if toolOutput != "" {
		trimmed := strings.TrimSpace(toolOutput)
		// Truncate on rune boundary to avoid splitting multi-byte UTF-8 characters
		if runes := []rune(trimmed); len(runes) > maxQueryLen {
			trimmed = string(runes[:maxQueryLen])
		}
		for _, word := range strings.Fields(trimmed) {
			// Strip punctuation from word boundaries
			cleaned := strings.Trim(word, ".,;:!?()[]{}\"'`")
			lower := strings.ToLower(cleaned)
			if len(cleaned) < 2 || stopWords[lower] {
				continue
			}
			tokens = append(tokens, cleaned)
			if len(tokens) >= maxQueryTokens {
				break
			}
		}
	}

	// If no tokens from target/error, fall back to tool name
	if len(tokens) == 0 && toolName != "" {
		tokens = append(tokens, toolName)
	}

	return tokens
}

// confidenceThreshold is the minimum score for a match to be considered high confidence.
// Matches below this threshold are prefixed with "(possible match)".
const confidenceThreshold = 0.5

// FormatLessonResults formats matched lessons for injection into hook output.
// Lessons with scores below the confidence threshold are prefixed with
// "(possible match)" to signal lower relevance.
func FormatLessonResults(matches []LessonMatch) string {
	if len(matches) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("Relevant lessons from past sessions:\n")
	for i, m := range matches {
		prefix := ""
		if m.Score < confidenceThreshold {
			prefix = "(possible match) "
		}
		fmt.Fprintf(&sb, "\n%d. %s**%s**\n   %s", i+1, prefix, m.Trigger, m.Insight)
	}
	return sb.String()
}

// searchLessonsWithTimeout runs the search function with a timeout.
func searchLessonsWithTimeout(searchFn LessonSearchFunc, tokens []string) ([]LessonMatch, error) {
	ctx, cancel := context.WithTimeout(context.Background(), searchTimeout)
	defer cancel()

	matches, err := searchFn(ctx, tokens, maxSearchResults)
	if err != nil {
		return nil, err
	}

	// FTS5 MATCH already ensures basic keyword relevance.
	// BM25 scores vary widely with corpus size, so we only filter
	// out zero-score results rather than applying a fixed threshold.
	var filtered []LessonMatch
	for _, m := range matches {
		if m.Score > 0 {
			filtered = append(filtered, m)
		}
	}
	return filtered, nil
}
