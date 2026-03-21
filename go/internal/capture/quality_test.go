//go:build sqlite_fts5

package capture

import (
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	_ "github.com/mattn/go-sqlite3"
)

// --- mockEmbedder ---

type mockEmbedder struct {
	vectors map[string][]float64
	err     error
}

func (m *mockEmbedder) Embed(texts []string) ([][]float64, error) {
	if m.err != nil {
		return nil, m.err
	}
	result := make([][]float64, len(texts))
	for i, text := range texts {
		if v, ok := m.vectors[text]; ok {
			result[i] = v
		} else {
			// Deterministic fallback: zero vector
			result[i] = []float64{0, 0, 0, 0}
		}
	}
	return result, nil
}

// setupTestDB creates a fresh in-memory DB and inserts test items.
func setupTestDB(t *testing.T, items []memory.MemoryItem) *sql.DB {
	t.Helper()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}

	for _, item := range items {
		tags := strings.Join(item.Tags, ",")
		confirmed := 0
		if item.Confirmed {
			confirmed = 1
		}
		_, err := db.Exec(`INSERT INTO lessons (
			id, type, trigger, insight, evidence, severity,
			tags, source, context, supersedes, related,
			created, confirmed, deleted, retrieval_count, last_retrieved,
			invalidated_at, invalidation_reason,
			citation_file, citation_line, citation_commit,
			compaction_level, compacted_at, pattern_bad, pattern_good
		) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, '{}', '[]', '[]', ?, ?, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL)`,
			item.ID, string(item.Type), item.Trigger, item.Insight,
			tags, string(item.Source), item.Created, confirmed,
		)
		if err != nil {
			t.Fatalf("insert test item %s: %v", item.ID, err)
		}
	}

	return db
}

// --- isSpecific tests ---

func TestIsSpecific_TooShort(t *testing.T) {
	specific, reason := isSpecific("Use pnpm")
	if specific {
		t.Error("expected specific=false for short insight")
	}
	if !strings.Contains(reason, "too short") {
		t.Errorf("expected reason to contain 'too short', got %q", reason)
	}
}

func TestIsSpecific_VagueWriteBetter(t *testing.T) {
	specific, reason := isSpecific("Remember to write better code next time")
	if specific {
		t.Error("expected specific=false for 'write better' pattern")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_VagueBeCareful(t *testing.T) {
	specific, reason := isSpecific("Be careful when making changes to the database")
	if specific {
		t.Error("expected specific=false for 'be careful' pattern")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_VagueRememberTo(t *testing.T) {
	specific, reason := isSpecific("Remember to check your work before committing")
	if specific {
		t.Error("expected specific=false for 'remember to' pattern")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_VagueMakeSure(t *testing.T) {
	specific, reason := isSpecific("Make sure to double check everything before deploying")
	if specific {
		t.Error("expected specific=false for 'make sure' pattern")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_VagueTryTo(t *testing.T) {
	specific, reason := isSpecific("Try to be more careful next time")
	if specific {
		t.Error("expected specific=false for 'try to' pattern")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_VagueDoubleCheck(t *testing.T) {
	specific, reason := isSpecific("Always double check your configuration files")
	if specific {
		t.Error("expected specific=false for 'double check' pattern")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_GenericAlways(t *testing.T) {
	specific, reason := isSpecific("Always test your code")
	if specific {
		t.Error("expected specific=false for generic 'always' imperative")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_GenericNever(t *testing.T) {
	specific, reason := isSpecific("Never forget to review")
	if specific {
		t.Error("expected specific=false for generic 'never' imperative")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason to contain 'vague', got %q", reason)
	}
}

func TestIsSpecific_ValidSpecificInsight(t *testing.T) {
	specific, reason := isSpecific("Use Polars instead of pandas for files over 100MB")
	if !specific {
		t.Errorf("expected specific=true for valid insight, got reason=%q", reason)
	}
	if reason != "" {
		t.Errorf("expected empty reason for specific insight, got %q", reason)
	}
}

func TestIsSpecific_ValidTechnicalGuidance(t *testing.T) {
	specific, reason := isSpecific("In this codebase, run pnpm test before committing")
	if !specific {
		t.Errorf("expected specific=true, got reason=%q", reason)
	}
	if reason != "" {
		t.Errorf("expected empty reason, got %q", reason)
	}
}

func TestIsSpecific_VaguePatternsAreCaseInsensitive(t *testing.T) {
	specific, _ := isSpecific("WRITE BETTER tests when working on critical modules")
	if specific {
		t.Error("expected specific=false for uppercase 'WRITE BETTER' pattern")
	}
}

// --- isActionable tests ---

func TestIsActionable_UseInsteadOf(t *testing.T) {
	actionable, reason := isActionable("Use Polars instead of pandas for large datasets")
	if !actionable {
		t.Errorf("expected actionable=true for 'use X instead of Y', got reason=%q", reason)
	}
	if reason != "" {
		t.Errorf("expected empty reason, got %q", reason)
	}
}

func TestIsActionable_PreferOver(t *testing.T) {
	actionable, _ := isActionable("Prefer async functions over callbacks in this codebase")
	if !actionable {
		t.Error("expected actionable=true for 'prefer X over Y'")
	}
}

func TestIsActionable_PreferTo(t *testing.T) {
	actionable, _ := isActionable("Prefer Polars to pandas for data processing")
	if !actionable {
		t.Error("expected actionable=true for 'prefer X to Y'")
	}
}

func TestIsActionable_AlwaysWhen(t *testing.T) {
	actionable, _ := isActionable("Always validate input when accepting user data")
	if !actionable {
		t.Error("expected actionable=true for 'always X when Y'")
	}
}

func TestIsActionable_NeverWithout(t *testing.T) {
	actionable, _ := isActionable("Never deploy without running the full test suite")
	if !actionable {
		t.Error("expected actionable=true for 'never X without Y'")
	}
}

func TestIsActionable_AvoidUsing(t *testing.T) {
	actionable, _ := isActionable("Avoid using any type in this TypeScript codebase")
	if !actionable {
		t.Error("expected actionable=true for 'avoid using X'")
	}
}

func TestIsActionable_Avoid(t *testing.T) {
	actionable, _ := isActionable("Avoid globals in production code")
	if !actionable {
		t.Error("expected actionable=true for 'avoid X'")
	}
}

func TestIsActionable_CheckBefore(t *testing.T) {
	actionable, _ := isActionable("Check the migration status before running database queries")
	if !actionable {
		t.Error("expected actionable=true for 'check X before Y'")
	}
}

func TestIsActionable_ImperativeRun(t *testing.T) {
	actionable, _ := isActionable("Run pnpm lint before committing to catch style issues")
	if !actionable {
		t.Error("expected actionable=true for imperative 'run'")
	}
}

func TestIsActionable_ImperativeInstall(t *testing.T) {
	actionable, _ := isActionable("Install the pre-commit hook for automatic linting")
	if !actionable {
		t.Error("expected actionable=true for imperative 'install'")
	}
}

func TestIsActionable_PureObservation(t *testing.T) {
	actionable, reason := isActionable("The database connection sometimes fails on cold starts")
	if actionable {
		t.Error("expected actionable=false for pure observation")
	}
	if !strings.Contains(reason, "action") {
		t.Errorf("expected reason to contain 'action', got %q", reason)
	}
}

func TestIsActionable_Question(t *testing.T) {
	actionable, _ := isActionable("Why does this test fail intermittently on CI")
	if actionable {
		t.Error("expected actionable=false for question")
	}
}

func TestIsActionable_StatementWithoutAction(t *testing.T) {
	actionable, _ := isActionable("The configuration file is located in the root directory")
	if actionable {
		t.Error("expected actionable=false for statement without action")
	}
}

// --- isNovel tests ---

func TestIsNovel_NilEmbedder(t *testing.T) {
	result := isNovel("", "Some insight text here", nil, DuplicateThreshold)
	if !result.Novel {
		t.Error("expected novel=true when embedder is nil")
	}
}

func TestIsNovel_EmbedderError(t *testing.T) {
	embedder := &mockEmbedder{err: errors.New("model unavailable")}
	result := isNovel("", "Some insight text here", embedder, DuplicateThreshold)
	if !result.Novel {
		t.Error("expected novel=true on embedder error (graceful degradation)")
	}
}

func TestIsNovel_NoDuplicateFound(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "trigger", Insight: "completely different insight", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	// Use distinct vectors so similarity is low
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"Use Polars for large files":  {1.0, 0.0, 0.0, 0.0},
		"completely different insight": {0.0, 1.0, 0.0, 0.0},
	}}

	result := isNovelWithDB(db, "Use Polars for large files", embedder, DuplicateThreshold)
	if !result.Novel {
		t.Errorf("expected novel=true, got reason=%q", result.Reason)
	}
}

func TestIsNovel_DuplicateAboveThreshold(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "trigger", Insight: "Use Polars for large files", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	// Same vector for both -- similarity = 1.0 which is above 0.98
	sameVec := []float64{1.0, 0.0, 0.0, 0.0}
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"Use Polars for large files": sameVec,
	}}

	result := isNovelWithDB(db, "Use Polars for large files", embedder, DuplicateThreshold)
	if result.Novel {
		t.Error("expected novel=false when near-duplicate exists")
	}
	if !strings.Contains(result.Reason, "Near-duplicate") {
		t.Errorf("expected reason containing 'Near-duplicate', got %q", result.Reason)
	}
	if result.ExistingID != "L001" {
		t.Errorf("expected existingID='L001', got %q", result.ExistingID)
	}
}

func TestIsNovel_EmptyDB(t *testing.T) {
	db := setupTestDB(t, nil)
	defer db.Close()

	embedder := &mockEmbedder{vectors: map[string][]float64{
		"New insight text": {1.0, 0.0, 0.0, 0.0},
	}}

	result := isNovelWithDB(db, "New insight text", embedder, DuplicateThreshold)
	if !result.Novel {
		t.Error("expected novel=true for empty DB")
	}
}

// --- ShouldPropose tests ---

func TestShouldPropose_NonSpecificRejected(t *testing.T) {
	embedder := &mockEmbedder{vectors: map[string][]float64{}}
	shouldPropose, reason := ShouldPropose("", "Be careful with the database connections", embedder)
	if shouldPropose {
		t.Error("expected shouldPropose=false for non-specific insight")
	}
	if !strings.Contains(reason, "vague") {
		t.Errorf("expected reason containing 'vague', got %q", reason)
	}
}

func TestShouldPropose_TooShortRejected(t *testing.T) {
	embedder := &mockEmbedder{vectors: map[string][]float64{}}
	shouldPropose, reason := ShouldPropose("", "Use pnpm", embedder)
	if shouldPropose {
		t.Error("expected shouldPropose=false for too-short insight")
	}
	if !strings.Contains(reason, "too short") {
		t.Errorf("expected reason containing 'too short', got %q", reason)
	}
}

func TestShouldPropose_NilEmbedderPasses(t *testing.T) {
	// Specific + nil embedder (novel=true by default)
	shouldPropose, reason := ShouldPropose("", "Use Polars instead of pandas for files over 100MB", nil)
	if !shouldPropose {
		t.Errorf("expected shouldPropose=true with nil embedder, got reason=%q", reason)
	}
}

func TestShouldPropose_BothPassAccepted(t *testing.T) {
	// No DB items, so novel=true. Specific insight.
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"Use Polars instead of pandas for files over 100MB": {1.0, 0.0, 0.0, 0.0},
	}}
	shouldPropose, reason := ShouldPropose("", "Use Polars instead of pandas for files over 100MB", embedder)
	if !shouldPropose {
		t.Errorf("expected shouldPropose=true, got reason=%q", reason)
	}
}
