package build

// Version is injected at build time via -ldflags "-X ...build.Version=...".
var Version = "dev"

// Commit is injected at build time via -ldflags "-X ...build.Commit=...".
var Commit = "unknown"

// Platforms returns the list of supported cross-compilation targets
// in "os-arch" format matching Node.js platform detection conventions.
func Platforms() []string {
	return []string{
		"darwin-arm64",
		"darwin-amd64",
		"linux-arm64",
		"linux-amd64",
		"windows-amd64",
		"windows-arm64",
	}
}
