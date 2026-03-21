package memory

import (
	"encoding/json"
	"testing"
)

func TestMemoryItemType_Valid(t *testing.T) {
	for _, typ := range []MemoryItemType{TypeLesson, TypeSolution, TypePattern, TypePreference} {
		if !typ.Valid() {
			t.Errorf("expected %q to be valid", typ)
		}
	}
}

func TestMemoryItemType_Invalid(t *testing.T) {
	invalid := MemoryItemType("unknown")
	if invalid.Valid() {
		t.Error("expected unknown type to be invalid")
	}
}

func TestSource_Valid(t *testing.T) {
	for _, s := range []Source{SourceUserCorrection, SourceSelfCorrection, SourceTestFailure, SourceManual} {
		if !s.Valid() {
			t.Errorf("expected %q to be valid", s)
		}
	}
}

func TestSeverity_Valid(t *testing.T) {
	for _, s := range []Severity{SeverityHigh, SeverityMedium, SeverityLow} {
		if !s.Valid() {
			t.Errorf("expected %q to be valid", s)
		}
	}
}

func TestGenerateID(t *testing.T) {
	tests := []struct {
		insight string
		typ     MemoryItemType
		prefix  string
	}{
		{"test insight", TypeLesson, "L"},
		{"test insight", TypeSolution, "S"},
		{"test insight", TypePattern, "P"},
		{"test insight", TypePreference, "R"},
	}

	for _, tt := range tests {
		id := GenerateID(tt.insight, tt.typ)
		if len(id) != 17 { // 1 prefix + 16 hex chars
			t.Errorf("GenerateID(%q, %q) = %q, want 17 chars", tt.insight, tt.typ, id)
		}
		if id[0:1] != tt.prefix {
			t.Errorf("GenerateID(%q, %q) prefix = %q, want %q", tt.insight, tt.typ, id[0:1], tt.prefix)
		}
	}
}

func TestGenerateID_Deterministic(t *testing.T) {
	id1 := GenerateID("same insight", TypeLesson)
	id2 := GenerateID("same insight", TypeLesson)
	if id1 != id2 {
		t.Errorf("GenerateID not deterministic: %q != %q", id1, id2)
	}
}

func TestGenerateID_DifferentInsights(t *testing.T) {
	id1 := GenerateID("insight one", TypeLesson)
	id2 := GenerateID("insight two", TypeLesson)
	if id1 == id2 {
		t.Errorf("different insights should produce different IDs: both = %q", id1)
	}
}

func TestMemoryItem_JSONRoundTrip(t *testing.T) {
	item := MemoryItem{
		ID:        "L1234567890abcdef",
		Type:      TypeLesson,
		Trigger:   "test trigger",
		Insight:   "test insight",
		Tags:      []string{"tag1", "tag2"},
		Source:    SourceManual,
		Context:   Context{Tool: "bash", Intent: "testing"},
		Created:   "2026-03-21T00:00:00Z",
		Confirmed: true,
		Supersedes: []string{},
		Related:    []string{},
	}

	data, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got MemoryItem
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if got.ID != item.ID {
		t.Errorf("ID: got %q, want %q", got.ID, item.ID)
	}
	if got.Type != item.Type {
		t.Errorf("Type: got %q, want %q", got.Type, item.Type)
	}
	if got.Trigger != item.Trigger {
		t.Errorf("Trigger: got %q, want %q", got.Trigger, item.Trigger)
	}
	if len(got.Tags) != 2 {
		t.Errorf("Tags: got %d, want 2", len(got.Tags))
	}
	if !got.Confirmed {
		t.Error("Confirmed: got false, want true")
	}
}

func TestMemoryItem_JSONFieldNames(t *testing.T) {
	// Verify JSON tags match TypeScript field names
	item := MemoryItem{
		ID:                 "L1234567890abcdef",
		Type:               TypeLesson,
		Trigger:            "trigger",
		Insight:            "insight",
		Tags:               []string{},
		Source:             SourceManual,
		Context:            Context{Tool: "t", Intent: "i"},
		Created:            "2026-01-01T00:00:00Z",
		Confirmed:          false,
		Supersedes:         []string{"old1"},
		Related:            []string{"rel1"},
		Evidence:           strPtr("evidence text"),
		Severity:           sevPtr(SeverityHigh),
		RetrievalCount:     intPtr(5),
		LastRetrieved:      strPtr("2026-03-21T00:00:00Z"),
		InvalidatedAt:      strPtr("2026-03-21T00:00:00Z"),
		InvalidationReason: strPtr("outdated"),
		CompactionLevel:    intPtr(1),
		CompactedAt:        strPtr("2026-03-21T00:00:00Z"),
		Citation:           &Citation{File: "test.go", Line: intPtr(42), Commit: strPtr("abc123")},
		Pattern:            &Pattern{Bad: "old way", Good: "new way"},
		Deleted:            boolPtr(true),
		DeletedAt:          strPtr("2026-03-21T00:00:00Z"),
	}

	data, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}

	// Check camelCase field names matching TypeScript
	expectedKeys := []string{
		"id", "type", "trigger", "insight", "tags", "source", "context",
		"created", "confirmed", "supersedes", "related", "evidence",
		"severity", "retrievalCount", "lastRetrieved", "invalidatedAt",
		"invalidationReason", "compactionLevel", "compactedAt",
		"citation", "pattern", "deleted", "deletedAt",
	}

	for _, key := range expectedKeys {
		if _, ok := raw[key]; !ok {
			t.Errorf("missing JSON key %q", key)
		}
	}
}

func TestMemoryItem_OmitEmpty(t *testing.T) {
	// Optional fields should be omitted when nil
	item := MemoryItem{
		ID:         "L1234567890abcdef",
		Type:       TypeLesson,
		Trigger:    "trigger",
		Insight:    "insight",
		Tags:       []string{},
		Source:     SourceManual,
		Context:    Context{Tool: "t", Intent: "i"},
		Created:    "2026-01-01T00:00:00Z",
		Confirmed:  false,
		Supersedes: []string{},
		Related:    []string{},
	}

	data, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// These optional fields should NOT be present
	optionalFields := []string{
		"evidence", "severity", "deleted", "deletedAt",
		"retrievalCount", "lastRetrieved", "invalidatedAt",
		"invalidationReason", "compactionLevel", "compactedAt",
		"citation", "pattern",
	}

	for _, key := range optionalFields {
		if _, ok := raw[key]; ok {
			t.Errorf("optional field %q should be omitted when nil", key)
		}
	}
}

func TestValidateMemoryItem(t *testing.T) {
	valid := MemoryItem{
		ID:         "L1234567890abcdef",
		Type:       TypeLesson,
		Trigger:    "trigger",
		Insight:    "insight",
		Tags:       []string{"tag1"},
		Source:     SourceManual,
		Context:    Context{Tool: "bash", Intent: "test"},
		Created:    "2026-01-01T00:00:00Z",
		Confirmed:  true,
		Supersedes: []string{},
		Related:    []string{},
	}

	if err := ValidateMemoryItem(&valid); err != nil {
		t.Errorf("expected valid, got error: %v", err)
	}
}

func TestValidateMemoryItem_MissingFields(t *testing.T) {
	tests := []struct {
		name string
		item MemoryItem
	}{
		{"missing ID", MemoryItem{Type: TypeLesson, Trigger: "t", Insight: "i", Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: "2026-01-01T00:00:00Z"}},
		{"missing Type", MemoryItem{ID: "L123", Trigger: "t", Insight: "i", Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: "2026-01-01T00:00:00Z"}},
		{"missing Trigger", MemoryItem{ID: "L123", Type: TypeLesson, Insight: "i", Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: "2026-01-01T00:00:00Z"}},
		{"missing Insight", MemoryItem{ID: "L123", Type: TypeLesson, Trigger: "t", Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: "2026-01-01T00:00:00Z"}},
		{"missing Source", MemoryItem{ID: "L123", Type: TypeLesson, Trigger: "t", Insight: "i", Context: Context{Tool: "t", Intent: "i"}, Created: "2026-01-01T00:00:00Z"}},
		{"missing Created", MemoryItem{ID: "L123", Type: TypeLesson, Trigger: "t", Insight: "i", Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}}},
	}

	for _, tt := range tests {
		if err := ValidateMemoryItem(&tt.item); err == nil {
			t.Errorf("%s: expected error, got nil", tt.name)
		}
	}
}

func TestValidateMemoryItem_InvalidEnums(t *testing.T) {
	base := MemoryItem{
		ID: "L123", Type: TypeLesson, Trigger: "t", Insight: "i",
		Source: SourceManual, Context: Context{Tool: "t", Intent: "i"},
		Created: "2026-01-01T00:00:00Z",
	}

	// Invalid type
	bad := base
	bad.Type = "invalid"
	if err := ValidateMemoryItem(&bad); err == nil {
		t.Error("expected error for invalid type")
	}

	// Invalid source
	bad = base
	bad.Source = "invalid"
	if err := ValidateMemoryItem(&bad); err == nil {
		t.Error("expected error for invalid source")
	}

	// Invalid severity
	bad = base
	bad.Severity = sevPtr("critical")
	if err := ValidateMemoryItem(&bad); err == nil {
		t.Error("expected error for invalid severity")
	}
}

func TestValidateMemoryItem_PatternRequired(t *testing.T) {
	// Pattern type requires pattern field
	item := MemoryItem{
		ID: "P123", Type: TypePattern, Trigger: "t", Insight: "i",
		Source: SourceManual, Context: Context{Tool: "t", Intent: "i"},
		Created: "2026-01-01T00:00:00Z",
	}

	if err := ValidateMemoryItem(&item); err == nil {
		t.Error("expected error: pattern type requires pattern field")
	}

	item.Pattern = &Pattern{Bad: "old", Good: "new"}
	if err := ValidateMemoryItem(&item); err != nil {
		t.Errorf("expected valid with pattern, got: %v", err)
	}
}

// Helpers
func strPtr(s string) *string       { return &s }
func intPtr(i int) *int             { return &i }
func boolPtr(b bool) *bool          { return &b }
func sevPtr(s Severity) *Severity   { return &s }
