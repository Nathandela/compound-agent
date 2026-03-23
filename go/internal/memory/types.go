package memory

import (
	"crypto/sha256"
	"fmt"
)

// ItemType discriminates the union of memory item types.
type ItemType string

// Valid returns true if the type is one of the known memory item types.
func (t ItemType) Valid() bool { return validTypes[t] }

const (
	TypeLesson     ItemType = "lesson"
	TypeSolution   ItemType = "solution"
	TypePattern    ItemType = "pattern"
	TypePreference ItemType = "preference"
)

var validTypes = map[ItemType]bool{ //nolint:gochecknoglobals
	TypeLesson: true, TypeSolution: true,
	TypePattern: true, TypePreference: true,
}

// Source identifies how a lesson was captured.
type Source string

// Valid returns true if the source is a known value.
func (s Source) Valid() bool { return validSources[s] }

const (
	SourceUserCorrection Source = "user_correction"
	SourceSelfCorrection Source = "self_correction"
	SourceTestFailure    Source = "test_failure"
	SourceManual         Source = "manual"
)

var validSources = map[Source]bool{
	SourceUserCorrection: true, SourceSelfCorrection: true,
	SourceTestFailure: true, SourceManual: true,
}

// Severity levels for lessons.
type Severity string

// Valid returns true if the severity is a known value.
func (s Severity) Valid() bool { return validSeverities[s] }

const (
	SeverityHigh   Severity = "high"
	SeverityMedium Severity = "medium"
	SeverityLow    Severity = "low"
)

var validSeverities = map[Severity]bool{
	SeverityHigh: true, SeverityMedium: true, SeverityLow: true,
}

// Context records when/how a lesson was learned.
type Context struct {
	Tool   string `json:"tool"`
	Intent string `json:"intent"`
}

// Pattern captures a bad-to-good code transformation.
type Pattern struct {
	Bad  string `json:"bad"`
	Good string `json:"good"`
}

// Citation tracks the provenance of a lesson.
type Citation struct {
	File   string  `json:"file"`
	Line   *int    `json:"line,omitempty"`
	Commit *string `json:"commit,omitempty"`
}

// Item is the unified type for all memory items.
// JSON tags match the TypeScript field names exactly.
type Item struct {
	// Required fields
	ID         string   `json:"id"`
	Type       ItemType `json:"type"`
	Trigger    string   `json:"trigger"`
	Insight    string   `json:"insight"`
	Tags       []string `json:"tags"`
	Source     Source   `json:"source"`
	Context    Context  `json:"context"`
	Created    string   `json:"created"`
	Confirmed  bool     `json:"confirmed"`
	Supersedes []string `json:"supersedes"`
	Related    []string `json:"related"`

	// Optional fields
	Evidence           *string   `json:"evidence,omitempty"`
	Severity           *Severity `json:"severity,omitempty"`
	Deleted            *bool     `json:"deleted,omitempty"`
	DeletedAt          *string   `json:"deletedAt,omitempty"`
	RetrievalCount     *int      `json:"retrievalCount,omitempty"`
	LastRetrieved      *string   `json:"lastRetrieved,omitempty"`
	InvalidatedAt      *string   `json:"invalidatedAt,omitempty"`
	InvalidationReason *string   `json:"invalidationReason,omitempty"`
	CompactionLevel    *int      `json:"compactionLevel,omitempty"`
	CompactedAt        *string   `json:"compactedAt,omitempty"`
	Citation           *Citation `json:"citation,omitempty"`
	Pattern            *Pattern  `json:"pattern,omitempty"`
}

// TypePrefix maps memory item types to ID prefixes.
var TypePrefix = map[ItemType]string{
	TypeLesson:     "L",
	TypeSolution:   "S",
	TypePattern:    "P",
	TypePreference: "R",
}

// GenerateID produces a deterministic ID from insight text.
// Format: {prefix}{first 16 hex chars of SHA-256(insight)}.
func GenerateID(insight string, typ ItemType) string {
	prefix := TypePrefix[typ]
	hash := sha256.Sum256([]byte(insight))
	return fmt.Sprintf("%s%x", prefix, hash[:8])
}

// EnsureArrayFields initializes nil slice fields to empty slices so that
// JSON serialization produces [] instead of null (matching the TypeScript schema).
func EnsureArrayFields(item *Item) {
	if item.Tags == nil {
		item.Tags = []string{}
	}
	if item.Supersedes == nil {
		item.Supersedes = []string{}
	}
	if item.Related == nil {
		item.Related = []string{}
	}
}

// ValidateItem checks required fields and enum constraints.
// Rejects nil array fields that the shared schema requires to be arrays.
func ValidateItem(item *Item) error {
	if err := validateRequiredFields(item); err != nil {
		return err
	}
	if item.Severity != nil && !validSeverities[*item.Severity] {
		return fmt.Errorf("invalid severity: %q", *item.Severity)
	}
	if item.Type == TypePattern && item.Pattern == nil {
		return fmt.Errorf("pattern type requires pattern field")
	}
	return nil
}

// validateRequiredFields checks that all required scalar and array fields are present
// and that enum-typed fields hold valid values.
func validateRequiredFields(item *Item) error {
	if item.ID == "" {
		return fmt.Errorf("id is required")
	}
	if !validTypes[item.Type] {
		return fmt.Errorf("invalid type: %q", item.Type)
	}
	if item.Trigger == "" {
		return fmt.Errorf("trigger is required")
	}
	if item.Insight == "" {
		return fmt.Errorf("insight is required")
	}
	if !validSources[item.Source] {
		return fmt.Errorf("invalid source: %q", item.Source)
	}
	if item.Created == "" {
		return fmt.Errorf("created is required")
	}
	if item.Tags == nil {
		return fmt.Errorf("tags must be an array, not null")
	}
	if item.Supersedes == nil {
		return fmt.Errorf("supersedes must be an array, not null")
	}
	if item.Related == nil {
		return fmt.Errorf("related must be an array, not null")
	}
	return nil
}
