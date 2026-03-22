package npmdist

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

func TestGetPlatformKey_DarwinArm64(t *testing.T) {
	got, err := GetPlatformKey("darwin", "arm64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "darwin-arm64" {
		t.Errorf("got %q, want %q", got, "darwin-arm64")
	}
}

func TestGetPlatformKey_DarwinX64(t *testing.T) {
	got, err := GetPlatformKey("darwin", "x64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "darwin-amd64" {
		t.Errorf("got %q, want %q", got, "darwin-amd64")
	}
}

func TestGetPlatformKey_LinuxArm64(t *testing.T) {
	got, err := GetPlatformKey("linux", "arm64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "linux-arm64" {
		t.Errorf("got %q, want %q", got, "linux-arm64")
	}
}

func TestGetPlatformKey_LinuxX64(t *testing.T) {
	got, err := GetPlatformKey("linux", "x64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "linux-amd64" {
		t.Errorf("got %q, want %q", got, "linux-amd64")
	}
}

func TestGetPlatformKey_UnsupportedPlatformWin32(t *testing.T) {
	_, err := GetPlatformKey("win32", "x64")
	if err == nil {
		t.Fatal("expected error for win32, got nil")
	}
}

func TestGetPlatformKey_UnsupportedArchIA32(t *testing.T) {
	_, err := GetPlatformKey("linux", "ia32")
	if err == nil {
		t.Fatal("expected error for ia32, got nil")
	}
}

// ---------------------------------------------------------------------------
// Checksum verification
// ---------------------------------------------------------------------------

func writeTemp(t *testing.T, dir, name string, content []byte) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, content, 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h[:])
}

func TestVerifyChecksum_Matching(t *testing.T) {
	dir := t.TempDir()
	content := []byte("hello binary content")
	filePath := writeTemp(t, dir, "ca-binary", content)

	hash := sha256Hex(content)
	checksumsPath := writeTemp(t, dir, "checksums.txt",
		[]byte(hash+"  ca-binary\n"))

	ok, err := VerifyChecksum(filePath, "ca-binary", checksumsPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("expected checksum to match")
	}
}

func TestVerifyChecksum_Mismatching(t *testing.T) {
	dir := t.TempDir()
	content := []byte("hello binary content")
	filePath := writeTemp(t, dir, "ca-binary", content)

	checksumsPath := writeTemp(t, dir, "checksums.txt",
		[]byte("0000000000000000000000000000000000000000000000000000000000000000  ca-binary\n"))

	ok, err := VerifyChecksum(filePath, "ca-binary", checksumsPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected checksum NOT to match")
	}
}

func TestVerifyChecksum_ArtifactNotFound(t *testing.T) {
	dir := t.TempDir()
	content := []byte("some content")
	filePath := writeTemp(t, dir, "ca-binary", content)

	checksumsPath := writeTemp(t, dir, "checksums.txt",
		[]byte("deadbeef  some-other-file\n"))

	_, err := VerifyChecksum(filePath, "ca-binary", checksumsPath)
	if err == nil {
		t.Fatal("expected error when artifact not found in checksums")
	}
}

func TestVerifyChecksum_GoReleaserMultiLine(t *testing.T) {
	dir := t.TempDir()
	content := []byte("go binary bytes")
	filePath := writeTemp(t, dir, "ca-darwin-arm64", content)

	hash := sha256Hex(content)
	checksums := fmt.Sprintf(
		"aaaa  ca-darwin-amd64\n%s  ca-darwin-arm64\nbbbb  ca-linux-amd64\ncccc  ca-embed-darwin-arm64\n",
		hash,
	)
	checksumsPath := writeTemp(t, dir, "checksums.txt", []byte(checksums))

	ok, err := VerifyChecksum(filePath, "ca-darwin-arm64", checksumsPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("expected checksum to match in GoReleaser multi-line format")
	}
}

// ---------------------------------------------------------------------------
// package.json validation (reads the real file in the repo)
// ---------------------------------------------------------------------------

// packageJSON is a minimal struct for the fields we care about.
type packageJSON struct {
	Version              string            `json:"version"`
	Type                 string            `json:"type"`
	Bin                  map[string]string `json:"bin"`
	OS                   []string          `json:"os"`
	CPU                  []string          `json:"cpu"`
	Scripts              map[string]string `json:"scripts"`
	Files                []string          `json:"files"`
	OptionalDependencies map[string]string `json:"optionalDependencies"`
}

func loadPackageJSON(t *testing.T) packageJSON {
	t.Helper()
	// Walk up from this test file to find the repo root package.json.
	// go/internal/npmdist -> go -> repo root
	pkgPath := filepath.Join("..", "..", "..", "package.json")
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		t.Fatalf("cannot read package.json: %v", err)
	}
	var pkg packageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatalf("cannot parse package.json: %v", err)
	}
	return pkg
}

func TestPackageJSON_HasBinEntries(t *testing.T) {
	pkg := loadPackageJSON(t)
	if _, ok := pkg.Bin["ca"]; !ok {
		t.Error("package.json missing bin.ca")
	}
	if _, ok := pkg.Bin["compound-agent"]; !ok {
		t.Error("package.json missing bin[\"compound-agent\"]")
	}
}

func TestPackageJSON_OSRestrictions(t *testing.T) {
	pkg := loadPackageJSON(t)
	want := map[string]bool{"darwin": true, "linux": true}
	if len(pkg.OS) != 2 {
		t.Errorf("os field has %d entries, want 2", len(pkg.OS))
	}
	for _, o := range pkg.OS {
		if !want[o] {
			t.Errorf("unexpected os entry %q", o)
		}
	}
}

func TestPackageJSON_CPURestrictions(t *testing.T) {
	pkg := loadPackageJSON(t)
	want := map[string]bool{"x64": true, "arm64": true}
	if len(pkg.CPU) != 2 {
		t.Errorf("cpu field has %d entries, want 2", len(pkg.CPU))
	}
	for _, c := range pkg.CPU {
		if !want[c] {
			t.Errorf("unexpected cpu entry %q", c)
		}
	}
}

func TestPackageJSON_PostinstallScript(t *testing.T) {
	pkg := loadPackageJSON(t)
	if pkg.Scripts["postinstall"] != "node scripts/postinstall.cjs" {
		t.Errorf("postinstall script = %q, want %q",
			pkg.Scripts["postinstall"], "node scripts/postinstall.cjs")
	}
}

func TestPackageJSON_FilesIncludesBinAndPostinstall(t *testing.T) {
	pkg := loadPackageJSON(t)
	hasBin := false
	hasPostinstall := false
	for _, f := range pkg.Files {
		if f == "bin/" {
			hasBin = true
		}
		if f == "scripts/postinstall.cjs" {
			hasPostinstall = true
		}
	}
	if !hasBin {
		t.Error("files list missing \"bin/\"")
	}
	if !hasPostinstall {
		t.Error("files list missing \"scripts/postinstall.cjs\"")
	}
}

func TestPackageJSON_HasOptionalDependencies(t *testing.T) {
	pkg := loadPackageJSON(t)
	expected := []string{
		"@syottos/darwin-arm64",
		"@syottos/darwin-x64",
		"@syottos/linux-arm64",
		"@syottos/linux-x64",
	}
	for _, name := range expected {
		v, ok := pkg.OptionalDependencies[name]
		if !ok {
			t.Errorf("missing optionalDependency: %s", name)
			continue
		}
		if v == "" {
			t.Errorf("optionalDependency %s has empty version", name)
		}
	}
}

func TestPackageJSON_OptionalDepsVersionMatchesPkgVersion(t *testing.T) {
	pkg := loadPackageJSON(t)
	if pkg.Version == "" {
		t.Fatal("package.json has no version field")
	}
	for name, v := range pkg.OptionalDependencies {
		if v != pkg.Version {
			t.Errorf("optionalDependency %s version %q != package version %q", name, v, pkg.Version)
		}
	}
}

func TestPackageJSON_HasTypeModule(t *testing.T) {
	pkg := loadPackageJSON(t)
	if pkg.Type != "module" {
		t.Errorf("package.json type = %q, want %q (required for ESM bin wrapper)", pkg.Type, "module")
	}
}

// ---------------------------------------------------------------------------
// Wrapper / artifact existence checks
// ---------------------------------------------------------------------------

func TestBinCaWrapperExists(t *testing.T) {
	wrapperPath := filepath.Join("..", "..", "..", "bin", "ca")
	if _, err := os.Stat(wrapperPath); os.IsNotExist(err) {
		t.Error("bin/ca wrapper does not exist")
	}
}

func TestPostinstallScriptExists(t *testing.T) {
	scriptPath := filepath.Join("..", "..", "..", "scripts", "postinstall.cjs")
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		t.Error("scripts/postinstall.cjs does not exist")
	}
}

func TestPublishPlatformsScriptExists(t *testing.T) {
	scriptPath := filepath.Join("..", "..", "..", "scripts", "publish-platforms.cjs")
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		t.Error("scripts/publish-platforms.cjs does not exist")
	}
}
