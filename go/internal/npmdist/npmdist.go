// Package npmdist provides helpers for the npm binary distribution workflow:
// platform detection, checksum verification, and skip logic.
package npmdist

import (
	"crypto/sha256"
	"fmt"
	"os"
	"strings"
)

var platformMap = map[string]string{
	"darwin": "darwin",
	"linux":  "linux",
}

var archMap = map[string]string{
	"x64":   "amd64",
	"arm64": "arm64",
}

// GetPlatformKey maps Node.js platform/arch names to Go-style "os-arch" keys.
// Returns an error for unsupported combinations.
func GetPlatformKey(platform, arch string) (string, error) {
	p, ok := platformMap[platform]
	if !ok {
		return "", fmt.Errorf("unsupported platform: %s-%s", platform, arch)
	}
	a, ok := archMap[arch]
	if !ok {
		return "", fmt.Errorf("unsupported platform: %s-%s", platform, arch)
	}
	return p + "-" + a, nil
}

// VerifyChecksum reads the file at filePath, computes its SHA256, and compares
// it against the expected hash for artifactName found in the checksums file.
// Returns (true, nil) on match, (false, nil) on mismatch, or an error if the
// artifact is not listed in the checksums file.
func VerifyChecksum(filePath, artifactName, checksumsPath string) (bool, error) {
	checksumsData, err := os.ReadFile(checksumsPath)
	if err != nil {
		return false, fmt.Errorf("reading checksums: %w", err)
	}

	var expectedHash string
	for _, line := range strings.Split(strings.TrimSpace(string(checksumsData)), "\n") {
		parts := strings.Fields(line)
		if len(parts) >= 2 && parts[1] == artifactName {
			expectedHash = parts[0]
			break
		}
	}
	if expectedHash == "" {
		return false, fmt.Errorf("%s not found in checksums", artifactName)
	}

	fileData, err := os.ReadFile(filePath)
	if err != nil {
		return false, fmt.Errorf("reading file: %w", err)
	}
	actualHash := fmt.Sprintf("%x", sha256.Sum256(fileData))
	return actualHash == expectedHash, nil
}
