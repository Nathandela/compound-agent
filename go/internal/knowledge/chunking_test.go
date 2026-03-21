package knowledge

import (
	"strings"
	"testing"
)

func TestChunkFile_EmptyContent(t *testing.T) {
	chunks := ChunkFile("docs/empty.md", "", nil)
	if len(chunks) != 0 {
		t.Errorf("expected 0 chunks for empty content, got %d", len(chunks))
	}
}

func TestChunkFile_WhitespaceOnly(t *testing.T) {
	chunks := ChunkFile("docs/ws.md", "   \n\n  \t  ", nil)
	if len(chunks) != 0 {
		t.Errorf("expected 0 chunks for whitespace, got %d", len(chunks))
	}
}

func TestChunkFile_BinaryContent(t *testing.T) {
	chunks := ChunkFile("docs/bin.md", "hello\x00world", nil)
	if len(chunks) != 0 {
		t.Errorf("expected 0 chunks for binary content, got %d", len(chunks))
	}
}

func TestChunkFile_SmallFile(t *testing.T) {
	content := "# Title\n\nSome short content."
	chunks := ChunkFile("docs/small.md", content, nil)
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk for small file, got %d", len(chunks))
	}
	if chunks[0].FilePath != "docs/small.md" {
		t.Errorf("filePath = %q", chunks[0].FilePath)
	}
	if chunks[0].StartLine != 1 {
		t.Errorf("startLine = %d, want 1", chunks[0].StartLine)
	}
}

func TestChunkFile_ChunkIDFormat(t *testing.T) {
	content := "Hello world"
	chunks := ChunkFile("docs/id.md", content, nil)
	if len(chunks) != 1 {
		t.Fatal("expected 1 chunk")
	}
	// ID should be 16 hex chars (SHA-256 truncated)
	if len(chunks[0].ID) != 16 {
		t.Errorf("chunk ID length = %d, want 16", len(chunks[0].ID))
	}
}

func TestChunkFile_ContentHashIsSHA256(t *testing.T) {
	content := "Hello world"
	chunks := ChunkFile("docs/hash.md", content, nil)
	if len(chunks) != 1 {
		t.Fatal("expected 1 chunk")
	}
	// Content hash should be full 64-char hex SHA-256
	if len(chunks[0].ContentHash) != 64 {
		t.Errorf("content hash length = %d, want 64", len(chunks[0].ContentHash))
	}
}

func TestChunkFile_Markdown_SplitsOnHeaders(t *testing.T) {
	// Create content large enough to force chunking
	content := "# Title\n\n" + strings.Repeat("word ", 400) + "\n\n## Section Two\n\n" + strings.Repeat("more ", 400)

	chunks := ChunkFile("docs/headers.md", content, &ChunkOptions{TargetSize: 1600, OverlapSize: 320})
	if len(chunks) < 2 {
		t.Errorf("expected at least 2 chunks for large markdown, got %d", len(chunks))
	}
}

func TestChunkFile_Code_SplitsOnBlankLines(t *testing.T) {
	// Build a large Python file with multiple functions
	var b strings.Builder
	for i := 0; i < 10; i++ {
		b.WriteString("def function_" + string(rune('a'+i)) + "():\n")
		for j := 0; j < 30; j++ {
			b.WriteString("    x = " + string(rune('0'+j%10)) + "\n")
		}
		b.WriteString("\n")
	}

	chunks := ChunkFile("src/main.py", b.String(), &ChunkOptions{TargetSize: 500, OverlapSize: 100})
	if len(chunks) < 2 {
		t.Errorf("expected multiple chunks for large code file, got %d", len(chunks))
	}
}

func TestChunkFile_Overlap(t *testing.T) {
	// Create content that will produce multiple chunks with overlap
	var sections []string
	for i := 0; i < 5; i++ {
		sections = append(sections, strings.Repeat("section content here. ", 50))
	}
	content := strings.Join(sections, "\n\n")

	chunks := ChunkFile("docs/overlap.md", content, &ChunkOptions{TargetSize: 500, OverlapSize: 100})

	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}

	// At least one consecutive pair should share overlapping text
	hasOverlap := false
	for i := 1; i < len(chunks); i++ {
		if chunks[i].StartLine <= chunks[i-1].EndLine {
			hasOverlap = true
			break
		}
	}
	if !hasOverlap {
		t.Error("expected at least one consecutive chunk pair with overlapping lines")
	}
}

func TestChunkFile_LineNumbers(t *testing.T) {
	content := "line1\nline2\nline3\nline4\nline5"
	chunks := ChunkFile("docs/lines.txt", content, nil)
	if len(chunks) != 1 {
		t.Fatal("expected 1 chunk")
	}
	if chunks[0].StartLine != 1 {
		t.Errorf("startLine = %d, want 1", chunks[0].StartLine)
	}
	if chunks[0].EndLine != 5 {
		t.Errorf("endLine = %d, want 5", chunks[0].EndLine)
	}
}

func TestChunkFile_DeterministicIDs(t *testing.T) {
	content := "Hello world"
	c1 := ChunkFile("docs/a.md", content, nil)
	c2 := ChunkFile("docs/a.md", content, nil)
	if c1[0].ID != c2[0].ID {
		t.Errorf("chunk IDs not deterministic: %s != %s", c1[0].ID, c2[0].ID)
	}

	// Different file path = different ID
	c3 := ChunkFile("docs/b.md", content, nil)
	if c1[0].ID == c3[0].ID {
		t.Error("different file paths should produce different IDs")
	}
}

func TestChunkFile_SupportedExtensions(t *testing.T) {
	// .go files are not in SUPPORTED_EXTENSIONS but should still chunk
	// (chunking is file-type agnostic, it just changes section splitting)
	content := strings.Repeat("package main\n\nfunc foo() {}\n\n", 50)
	chunks := ChunkFile("main.go", content, &ChunkOptions{TargetSize: 500})
	if len(chunks) == 0 {
		t.Error("expected chunks for .go file")
	}
}

func TestGenerateChunkID(t *testing.T) {
	id := GenerateChunkID("docs/a.md", 1, 10)
	if len(id) != 16 {
		t.Errorf("id length = %d, want 16", len(id))
	}

	// Deterministic
	id2 := GenerateChunkID("docs/a.md", 1, 10)
	if id != id2 {
		t.Error("IDs not deterministic")
	}

	// Different inputs = different IDs
	id3 := GenerateChunkID("docs/b.md", 1, 10)
	if id == id3 {
		t.Error("different inputs should produce different IDs")
	}
}

func TestChunkContentHash(t *testing.T) {
	hash := ChunkContentHash("hello")
	if len(hash) != 64 {
		t.Errorf("hash length = %d, want 64", len(hash))
	}

	// Deterministic
	hash2 := ChunkContentHash("hello")
	if hash != hash2 {
		t.Error("hashes not deterministic")
	}

	// Different content = different hash
	hash3 := ChunkContentHash("world")
	if hash == hash3 {
		t.Error("different content should produce different hashes")
	}
}

func TestChunkFile_MarkdownCodeBlock(t *testing.T) {
	// Code blocks with ## inside should NOT cause a split
	content := "# Title\n\nSome text\n\n```\n## Not a header\ncode here\n```\n\nMore text"
	chunks := ChunkFile("docs/codeblock.md", content, nil)
	if len(chunks) != 1 {
		t.Errorf("expected 1 chunk (code block ## not a header), got %d", len(chunks))
	}
}
