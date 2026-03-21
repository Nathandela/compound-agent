// Package knowledge provides document chunking, indexing, embedding, and search.
package knowledge

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	DefaultTargetSize  = 1600
	DefaultOverlapSize = 320
)

// SupportedExtensions lists file extensions that can be chunked.
var SupportedExtensions = map[string]bool{
	".md": true, ".txt": true, ".rst": true,
	".ts": true, ".tsx": true, ".js": true, ".jsx": true, ".py": true,
}

// codeExtensions are extensions that use code-style section splitting.
var codeExtensions = map[string]bool{
	".ts": true, ".tsx": true, ".js": true, ".jsx": true, ".py": true,
}

// Chunk represents a piece of a documentation file.
type Chunk struct {
	ID          string
	FilePath    string
	StartLine   int
	EndLine     int
	Text        string
	ContentHash string
}

// ChunkOptions controls chunking behavior.
type ChunkOptions struct {
	TargetSize  int
	OverlapSize int
}

// GenerateChunkID creates a deterministic ID from file path and line range.
func GenerateChunkID(filePath string, startLine, endLine int) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%d", filePath, startLine, endLine)))
	return fmt.Sprintf("%x", h[:8])
}

// ChunkContentHash computes SHA-256 of text content.
func ChunkContentHash(text string) string {
	h := sha256.Sum256([]byte(text))
	return fmt.Sprintf("%x", h)
}

// lineObj tracks a line's number and text.
type lineObj struct {
	lineNumber int
	text       string
}

var headerRegex = regexp.MustCompile(`^#{2,}\s`)

// ChunkFile splits a file into semantic chunks with overlap.
func ChunkFile(filePath, content string, opts *ChunkOptions) []Chunk {
	if strings.TrimSpace(content) == "" {
		return nil
	}
	if strings.Contains(content, "\x00") {
		return nil
	}

	targetSize := DefaultTargetSize
	overlapSize := DefaultOverlapSize
	if opts != nil {
		if opts.TargetSize > 0 {
			targetSize = opts.TargetSize
		}
		if opts.OverlapSize > 0 {
			overlapSize = opts.OverlapSize
		}
	}

	fileLines := strings.Split(content, "\n")
	ext := strings.ToLower(filepath.Ext(filePath))

	sections := splitIntoSections(fileLines, ext)

	var chunks []Chunk
	var accumulated []lineObj
	accumulatedLength := 0
	var overlapLines []lineObj

	for _, section := range sections {
		sectionLen := sectionTextLen(section)

		// Emit if accumulated + section exceeds target and we have content
		if accumulatedLength > 0 && accumulatedLength+sectionLen > targetSize {
			overlapLines = emitChunk(filePath, accumulated, overlapLines, overlapSize, &chunks)
			accumulated = nil
			accumulatedLength = 0
		}

		accumulated = append(accumulated, section...)
		accumulatedLength += sectionLen

		// Emit if single section exceeds target
		if accumulatedLength > targetSize {
			overlapLines = emitChunk(filePath, accumulated, overlapLines, overlapSize, &chunks)
			accumulated = nil
			accumulatedLength = 0
		}
	}

	// Emit remaining
	if len(accumulated) > 0 {
		emitChunk(filePath, accumulated, overlapLines, overlapSize, &chunks)
	}

	return chunks
}

func emitChunk(filePath string, lines, overlapLines []lineObj, overlapSize int, chunks *[]Chunk) []lineObj {
	if len(lines) == 0 {
		return nil
	}

	allLines := append(overlapLines, lines...)
	text := joinLines(allLines)
	startLine := allLines[0].lineNumber
	endLine := allLines[len(allLines)-1].lineNumber

	*chunks = append(*chunks, Chunk{
		ID:          GenerateChunkID(filePath, startLine, endLine),
		FilePath:    filePath,
		StartLine:   startLine,
		EndLine:     endLine,
		Text:        text,
		ContentHash: ChunkContentHash(text),
	})

	// Compute overlap from end of lines (not including previous overlap)
	if overlapSize <= 0 {
		return nil
	}
	var result []lineObj
	overlapLen := 0
	for i := len(lines) - 1; i >= 0; i-- {
		lineLen := len(lines[i].text) + 1 // +1 for newline
		if overlapLen+lineLen > overlapSize && len(result) > 0 {
			break
		}
		result = append([]lineObj{lines[i]}, result...)
		overlapLen += lineLen
	}
	return result
}

func joinLines(lines []lineObj) string {
	parts := make([]string, len(lines))
	for i, l := range lines {
		parts[i] = l.text
	}
	return strings.Join(parts, "\n")
}

func sectionTextLen(section []lineObj) int {
	total := 0
	for i, l := range section {
		total += len(l.text)
		if i > 0 {
			total++ // newline between lines
		}
	}
	return total
}

// splitIntoSections splits file lines into logical sections based on extension.
func splitIntoSections(fileLines []string, ext string) [][]lineObj {
	switch {
	case ext == ".md":
		return splitMarkdown(fileLines)
	case ext == ".rst":
		return splitParagraphs(fileLines)
	case codeExtensions[ext]:
		return splitCode(fileLines)
	default:
		return splitParagraphs(fileLines)
	}
}

func splitMarkdown(fileLines []string) [][]lineObj {
	var sections [][]lineObj
	var current []lineObj
	inCodeBlock := false

	for i, line := range fileLines {
		lo := lineObj{lineNumber: i + 1, text: line}

		// Track fenced code blocks
		if strings.HasPrefix(strings.TrimLeft(line, " \t"), "```") {
			inCodeBlock = !inCodeBlock
			current = append(current, lo)
			continue
		}

		// Split on H2+ headers outside code blocks
		if !inCodeBlock && headerRegex.MatchString(line) && len(current) > 0 {
			sections = append(sections, current)
			current = []lineObj{lo}
			continue
		}

		// Split on blank lines (paragraph boundary) outside code blocks
		if !inCodeBlock && strings.TrimSpace(line) == "" && len(current) > 0 && hasNonBlank(current) {
			current = append(current, lo)
			sections = append(sections, current)
			current = nil
			continue
		}

		current = append(current, lo)
	}

	if len(current) > 0 {
		sections = append(sections, current)
	}
	return sections
}

func splitCode(fileLines []string) [][]lineObj {
	var sections [][]lineObj
	var current []lineObj

	for i, line := range fileLines {
		lo := lineObj{lineNumber: i + 1, text: line}

		if strings.TrimSpace(line) == "" && len(current) > 0 {
			hasNextNonBlank := false
			for j := i + 1; j < len(fileLines); j++ {
				if strings.TrimSpace(fileLines[j]) != "" {
					hasNextNonBlank = true
					break
				}
			}
			if hasNextNonBlank {
				sections = append(sections, current)
				current = []lineObj{lo}
				continue
			}
		}
		current = append(current, lo)
	}

	if len(current) > 0 {
		sections = append(sections, current)
	}
	return sections
}

func splitParagraphs(fileLines []string) [][]lineObj {
	var sections [][]lineObj
	var current []lineObj

	for i, line := range fileLines {
		lo := lineObj{lineNumber: i + 1, text: line}

		if strings.TrimSpace(line) == "" && len(current) > 0 {
			sections = append(sections, current)
			current = []lineObj{lo}
			continue
		}
		current = append(current, lo)
	}

	if len(current) > 0 {
		sections = append(sections, current)
	}
	return sections
}

func hasNonBlank(lines []lineObj) bool {
	for _, l := range lines {
		if strings.TrimSpace(l.text) != "" {
			return true
		}
	}
	return false
}
