package hook

import (
	"bytes"
	"strings"
	"testing"
)

// BenchmarkRunHookDirect benchmarks the RunHook function directly.
// Tests the pre-commit hook path (no stdin parsing needed).
// Target: <10ms per operation.
func BenchmarkRunHookDirect(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader("{}")
		code := RunHook("pre-commit", stdin, &out)
		if code != 0 {
			b.Fatalf("expected exit code 0, got %d", code)
		}
	}
}

// BenchmarkRunHookUserPrompt benchmarks the user-prompt hook with JSON input parsing.
// This exercises the full stdin-read + JSON unmarshal + processing path.
func BenchmarkRunHookUserPrompt(b *testing.B) {
	input := `{"prompt":"actually fix this bug in the handler"}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader(input)
		code := RunHook("user-prompt", stdin, &out)
		if code != 0 {
			b.Fatalf("expected exit code 0, got %d", code)
		}
	}
}

// BenchmarkRunHookUserPromptNoMatch benchmarks the user-prompt hook with a non-matching prompt.
// This tests the fast path where no correction pattern is detected.
func BenchmarkRunHookUserPromptNoMatch(b *testing.B) {
	input := `{"prompt":"hello world"}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out bytes.Buffer
		stdin := strings.NewReader(input)
		code := RunHook("user-prompt", stdin, &out)
		if code != 0 {
			b.Fatalf("expected exit code 0, got %d", code)
		}
	}
}
