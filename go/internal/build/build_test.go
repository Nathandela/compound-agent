package build

import (
	"testing"
)

func TestPlatformsContainsAllTargets(t *testing.T) {
	required := []string{
		"darwin-arm64",
		"darwin-amd64",
		"linux-arm64",
		"linux-amd64",
	}

	platforms := Platforms()

	for _, want := range required {
		found := false
		for _, p := range platforms {
			if p == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Platforms() missing required target %q", want)
		}
	}
}

func TestPlatformsLength(t *testing.T) {
	platforms := Platforms()
	if len(platforms) < 4 {
		t.Errorf("Platforms() returned %d entries, want at least 4", len(platforms))
	}
}

func TestVersionVarExists(t *testing.T) {
	// Version is set via ldflags at build time.
	// When not injected, it defaults to "dev".
	if Version == "" {
		t.Error("Version must not be empty (should default to \"dev\")")
	}
}

func TestCommitVarExists(t *testing.T) {
	// Commit is set via ldflags at build time.
	// When not injected, it defaults to "unknown".
	if Commit == "" {
		t.Error("Commit must not be empty (should default to \"unknown\")")
	}
}

func TestVersionInjection(t *testing.T) {
	// When built with -ldflags "-X ...build.Version=v1.2.3",
	// Version should reflect the injected value.
	// Here we just verify the default is sensible.
	if Version == "" {
		t.Error("Version should have a non-empty default")
	}
}

func TestPlatformFormat(t *testing.T) {
	for _, p := range Platforms() {
		// Each platform should be "os-arch" format.
		parts := 0
		for _, c := range p {
			if c == '-' {
				parts++
			}
		}
		if parts != 1 {
			t.Errorf("platform %q should have exactly one dash (os-arch format)", p)
		}
	}
}
