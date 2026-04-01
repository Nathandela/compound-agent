package util

import "testing"

func TestShellEscape(t *testing.T) {
	t.Parallel()
	tests := []struct {
		input string
		want  string
	}{
		{"claude-sonnet-4-6", "'claude-sonnet-4-6'"},
		{"simple", "'simple'"},
		{"", "''"},
		{`"; rm -rf /; #`, `'"; rm -rf /; #'`},
		{"it's", `'it'\''s'`},
		{"$(whoami)", "'$(whoami)'"},
		{"`id`", "'`id`'"},
		{"a b c", "'a b c'"},
		{"topic1,topic2", "'topic1,topic2'"},
	}

	for _, tt := range tests {
		got := ShellEscape(tt.input)
		if got != tt.want {
			t.Errorf("ShellEscape(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
