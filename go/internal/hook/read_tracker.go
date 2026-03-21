package hook

import (
	"fmt"
	"regexp"
	"strings"
)

var skillPathPattern = regexp.MustCompile(`(?:^|/)\.claude/skills/compound/([^/]+)/SKILL\.md$`)

// ProcessReadTracker tracks skill file reads and updates phase state.
func ProcessReadTracker(repoRoot, toolName string, toolInput map[string]interface{}) {
	if toolName != "Read" {
		return
	}

	state := GetPhaseState(repoRoot)
	if state == nil || !state.CookitActive {
		return
	}

	filePath, ok := toolInput["file_path"].(string)
	if !ok {
		return
	}

	// Normalize backslashes
	normalized := strings.ReplaceAll(filePath, "\\", "/")

	match := skillPathPattern.FindStringSubmatch(normalized)
	if match == nil {
		return
	}

	canonicalPath := fmt.Sprintf(".claude/skills/compound/%s/SKILL.md", match[1])

	// Deduplicate
	for _, s := range state.SkillsRead {
		if s == canonicalPath {
			return
		}
	}

	_ = UpdatePhaseState(repoRoot, map[string]interface{}{
		"skills_read": append(state.SkillsRead, canonicalPath),
	})
}
