package util

import "strings"

// ShellEscape wraps a string in single quotes with proper escaping,
// making it safe for interpolation into bash scripts.
// This prevents shell injection by ensuring the value is treated as a literal string.
// Example: don't → 'don'\”t'
func ShellEscape(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
