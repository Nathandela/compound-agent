package build

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// goreleaserPath returns the path to .goreleaser.yml relative to this test's
// package directory (go/internal/build/ -> repo root).
func goreleaserPath() string {
	return filepath.Join("..", "..", "..", ".goreleaser.yml")
}

func TestGoreleaserConfigExists(t *testing.T) {
	path := goreleaserPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatalf(".goreleaser.yml not found at %s", path)
	}
}

func TestGoreleaserPlatformsMatchBuild(t *testing.T) {
	data, err := os.ReadFile(goreleaserPath())
	if err != nil {
		t.Fatalf("failed to read .goreleaser.yml: %v", err)
	}
	content := string(data)

	// Extract goos values from the YAML (expects a line like: goos: [darwin, linux])
	goosValues := extractBracketList(t, content, "goos")
	goarchValues := extractBracketList(t, content, "goarch")

	if len(goosValues) == 0 {
		t.Fatal("no goos values found in .goreleaser.yml")
	}
	if len(goarchValues) == 0 {
		t.Fatal("no goarch values found in .goreleaser.yml")
	}

	// Build cross-product of goos x goarch -> "os-arch" format.
	var configPlatforms []string
	for _, os := range goosValues {
		for _, arch := range goarchValues {
			configPlatforms = append(configPlatforms, os+"-"+arch)
		}
	}
	sort.Strings(configPlatforms)

	buildPlatforms := make([]string, len(Platforms()))
	copy(buildPlatforms, Platforms())
	sort.Strings(buildPlatforms)

	if len(configPlatforms) != len(buildPlatforms) {
		t.Fatalf("platform count mismatch: goreleaser has %d, Platforms() has %d\ngoreleaser: %v\nPlatforms(): %v",
			len(configPlatforms), len(buildPlatforms), configPlatforms, buildPlatforms)
	}

	for i := range configPlatforms {
		if configPlatforms[i] != buildPlatforms[i] {
			t.Errorf("platform mismatch at index %d: goreleaser has %q, Platforms() has %q",
				i, configPlatforms[i], buildPlatforms[i])
		}
	}
}

func TestGoreleaserLdflagsReferenceVersion(t *testing.T) {
	data, err := os.ReadFile(goreleaserPath())
	if err != nil {
		t.Fatalf("failed to read .goreleaser.yml: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "build.Version") {
		t.Error(".goreleaser.yml ldflags must reference build.Version")
	}
	if !strings.Contains(content, "build.Commit") {
		t.Error(".goreleaser.yml ldflags must reference build.Commit")
	}
}

func TestGoreleaserChecksumConfig(t *testing.T) {
	data, err := os.ReadFile(goreleaserPath())
	if err != nil {
		t.Fatalf("failed to read .goreleaser.yml: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "checksum") {
		t.Fatal(".goreleaser.yml must contain a checksum section")
	}
	if !strings.Contains(content, "sha256") {
		t.Error(".goreleaser.yml checksum algorithm must be sha256")
	}
}

func TestGoreleaserBinaryName(t *testing.T) {
	data, err := os.ReadFile(goreleaserPath())
	if err != nil {
		t.Fatalf("failed to read .goreleaser.yml: %v", err)
	}
	content := string(data)

	// Look for binary: ca (with possible quoting).
	if !strings.Contains(content, "binary: ca") && !strings.Contains(content, "binary: \"ca\"") {
		t.Error(".goreleaser.yml must set binary name to \"ca\"")
	}
}

// extractBracketList finds a YAML line like "key: [val1, val2]" and returns
// the values as a trimmed string slice.
func extractBracketList(t *testing.T, content, key string) []string {
	t.Helper()
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, key+":") {
			continue
		}
		// Extract content between [ and ].
		openIdx := strings.Index(trimmed, "[")
		closeIdx := strings.Index(trimmed, "]")
		if openIdx == -1 || closeIdx == -1 || closeIdx <= openIdx {
			continue
		}
		inner := trimmed[openIdx+1 : closeIdx]
		parts := strings.Split(inner, ",")
		var result []string
		for _, p := range parts {
			v := strings.TrimSpace(p)
			if v != "" {
				result = append(result, v)
			}
		}
		return result
	}
	return nil
}
