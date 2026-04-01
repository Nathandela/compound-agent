package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/build"
	"github.com/nathandelacretaz/compound-agent/internal/hook"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/setup"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/telemetry"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

const (
	repoURL        = "https://github.com/Nathandela/compound-agent"
	discussionsURL = repoURL + "/discussions"
)

func aboutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "about",
		Short: "Show version and project info",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Printf("compound-agent v%s (go)\n", build.Version)
			cmd.Println()
			cmd.Printf("Repository:  %s\n", repoURL)
			cmd.Printf("Discussions: %s\n", discussionsURL)
			return nil
		},
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the version",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Println(build.Version)
			return nil
		},
	}
}

func feedbackCmd() *cobra.Command {
	var openFlag bool
	cmd := &cobra.Command{
		Use:   "feedback",
		Short: "Open GitHub Discussions to share feedback or report issues",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Printf("Feedback & discussions: %s\n", discussionsURL)
			cmd.Printf("Repository:             %s\n", repoURL)

			if openFlag {
				openURL(discussionsURL)
				cmd.Println("Opening in browser...")
			} else {
				cmd.Println()
				cmd.Println("Run `ca feedback --open` to open in your browser.")
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&openFlag, "open", false, "Open the Discussions page in your browser")
	return cmd
}

func openURL(url string) {
	var cmd string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
	case "windows":
		cmd = "start"
	default:
		cmd = "xdg-open"
	}
	_ = exec.Command(cmd, url).Start()
}

// infoCmd creates the "info" command. If testRepoRoot is non-empty, it uses that
// path directly (used in tests); otherwise it detects the repo root.
func infoCmd(testRepoRoot string) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:     "info",
		Aliases: []string{"explain"},
		Short:   "Show a structured overview of hooks, skills, phases, telemetry, and lessons",
		RunE: func(cmd *cobra.Command, args []string) error {
			root := testRepoRoot
			if root == "" {
				root = util.GetRepoRoot()
			}
			if jsonOut {
				return writeJSON(cmd, buildInfoJSON(root))
			}
			cmd.Print(buildInfoOutput(root))
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

// buildInfoJSON assembles the structured JSON representation of all info sections.
func buildInfoJSON(repoRoot string) map[string]any {
	result := map[string]any{
		"version":   build.Version,
		"commit":    build.Commit,
		"hooks":     buildInfoHooksJSON(repoRoot),
		"skills":    buildInfoSkillsJSON(repoRoot),
		"phase":     buildInfoPhaseJSON(repoRoot),
		"telemetry": buildInfoTelemetryJSON(repoRoot),
		"lessons":   buildInfoLessonsJSON(repoRoot),
	}
	return result
}

func buildInfoHooksJSON(repoRoot string) map[string]any {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil {
		return map[string]any{"installed": false, "error": err.Error()}
	}
	return map[string]any{"installed": setup.HasAllHooks(settings)}
}

func buildInfoSkillsJSON(repoRoot string) map[string]any {
	indexPath := filepath.Join(repoRoot, ".claude", "skills", "compound", "skills_index.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		return map[string]any{"count": 0, "skills": []any{}}
	}
	var index setup.SkillsIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return map[string]any{"count": 0, "error": err.Error()}
	}
	return map[string]any{"count": len(index.Skills), "skills": index.Skills}
}

func buildInfoPhaseJSON(repoRoot string) map[string]any {
	state := hook.GetPhaseState(repoRoot)
	if state == nil {
		return map[string]any{"active": false}
	}
	return map[string]any{
		"active":       true,
		"currentPhase": state.CurrentPhase,
		"phaseIndex":   state.PhaseIndex,
		"epicId":       state.EpicID,
	}
}

func buildInfoTelemetryJSON(repoRoot string) map[string]any {
	dbPath := filepath.Join(repoRoot, storage.DBPath)
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return map[string]any{"totalEvents": 0}
	}
	db, err := storage.OpenRepoDB(repoRoot)
	if err != nil {
		return map[string]any{"totalEvents": 0}
	}
	defer db.Close()
	stats, err := telemetry.QueryStats(db)
	if err != nil || stats.TotalEvents == 0 {
		return map[string]any{"totalEvents": 0}
	}
	return map[string]any{
		"totalEvents":    stats.TotalEvents,
		"retrievalCount": stats.RetrievalCount,
	}
}

func buildInfoLessonsJSON(repoRoot string) map[string]any {
	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return map[string]any{"count": 0}
	}
	typeCounts := make(map[string]int)
	for _, item := range result.Items {
		typeCounts[string(item.Type)]++
	}
	return map[string]any{
		"count": len(result.Items),
		"types": typeCounts,
	}
}

// buildInfoOutput assembles all 6 sections of the info output.
func buildInfoOutput(repoRoot string) string {
	var b strings.Builder

	// Section 1: Version + build info
	fmt.Fprintf(&b, "## Version\n\n")
	fmt.Fprintf(&b, "compound-agent v%s (commit: %s)\n\n", build.Version, build.Commit)

	// Section 2: Installed hooks
	fmt.Fprintf(&b, "## Hooks\n\n")
	b.WriteString(formatInfoHooks(repoRoot))
	b.WriteString("\n")

	// Section 3: Installed skills
	fmt.Fprintf(&b, "## Skills\n\n")
	b.WriteString(formatInfoSkills(repoRoot))
	b.WriteString("\n")

	// Section 4: Phase state
	fmt.Fprintf(&b, "## Phase\n\n")
	b.WriteString(formatInfoPhase(repoRoot))
	b.WriteString("\n")

	// Section 5: Telemetry summary
	fmt.Fprintf(&b, "## Telemetry\n\n")
	b.WriteString(formatInfoTelemetry(repoRoot))
	b.WriteString("\n")

	// Section 6: Lesson corpus stats
	fmt.Fprintf(&b, "## Lessons\n\n")
	b.WriteString(formatInfoLessons(repoRoot))

	return b.String()
}

// formatInfoHooks returns the hooks section content.
func formatInfoHooks(repoRoot string) string {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil {
		return "Could not read settings: " + err.Error() + "\n"
	}

	if setup.HasAllHooks(settings) {
		return "All hooks installed.\n"
	}
	return "Hooks not installed. Run `ca setup claude` to install.\n"
}

// formatInfoSkills returns the skills section content.
func formatInfoSkills(repoRoot string) string {
	indexPath := filepath.Join(repoRoot, ".claude", "skills", "compound", "skills_index.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		return "Skills index not found. Run `ca setup` to generate.\n"
	}

	var index setup.SkillsIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return "Could not parse skills index: " + err.Error() + "\n"
	}

	if len(index.Skills) == 0 {
		return "No skills found. Run `ca setup` to install skills.\n"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%d skill(s) installed:\n", len(index.Skills))
	for _, s := range index.Skills {
		phase := s.Phase
		if phase == "" {
			phase = "-"
		}
		fmt.Fprintf(&b, "  %-20s [%s] %s\n", s.Name, phase, s.Description)
	}
	return b.String()
}

// formatInfoPhase returns the phase state section content.
func formatInfoPhase(repoRoot string) string {
	state := hook.GetPhaseState(repoRoot)
	if state == nil {
		return "No active workflow.\n"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Active workflow: %s (phase %d/%d)\n", state.CurrentPhase, state.PhaseIndex, len(hook.Phases))
	fmt.Fprintf(&b, "  Epic: %s\n", state.EpicID)
	if len(state.SkillsRead) > 0 {
		fmt.Fprintf(&b, "  Skills read: %s\n", strings.Join(state.SkillsRead, ", "))
	}
	if len(state.GatesPassed) > 0 {
		fmt.Fprintf(&b, "  Gates passed: %s\n", strings.Join(state.GatesPassed, ", "))
	}
	return b.String()
}

// formatInfoTelemetry returns the telemetry section content.
func formatInfoTelemetry(repoRoot string) string {
	dbPath := filepath.Join(repoRoot, storage.DBPath)
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return "Telemetry: no data yet. Run `ca setup claude` to install hooks that collect telemetry.\n"
	}

	db, err := storage.OpenRepoDB(repoRoot)
	if err != nil {
		return "Telemetry: no data yet. Run `ca setup claude` to install hooks that collect telemetry.\n"
	}
	defer db.Close()

	stats, err := telemetry.QueryStats(db)
	if err != nil || stats.TotalEvents == 0 {
		return "Telemetry: no data yet. Run `ca setup claude` to install hooks that collect telemetry.\n"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Total events: %d\n", stats.TotalEvents)
	fmt.Fprintf(&b, "Retrievals: %d\n", stats.RetrievalCount)
	if len(stats.HookStats) > 0 {
		b.WriteString("\n")
		fmt.Fprintf(&b, "%-25s %8s %10s\n", "Hook", "Count", "Avg (ms)")
		fmt.Fprintf(&b, "%s\n", strings.Repeat("-", 47))
		for _, hs := range stats.HookStats {
			fmt.Fprintf(&b, "%-25s %8d %10.1f\n", hs.HookName, hs.Count, hs.AvgDurationMs)
		}
	}
	return b.String()
}

// formatInfoLessons returns the lesson corpus stats section content.
func formatInfoLessons(repoRoot string) string {
	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return "Lessons: 0 (no corpus found). Run `ca init` to set up the lesson index.\n"
	}

	total := len(result.Items)
	if total == 0 {
		return "Lessons: 0. Get started with: `ca learn \"<insight>\"`\n"
	}

	// Count by type
	typeCounts := make(map[memory.ItemType]int)
	lastCreated := ""
	for _, item := range result.Items {
		typeCounts[item.Type]++
		if item.Created > lastCreated {
			lastCreated = item.Created
		}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Lessons: %d\n", total)

	if len(typeCounts) > 0 {
		parts := make([]string, 0, len(typeCounts))
		for typ, count := range typeCounts {
			parts = append(parts, fmt.Sprintf("%s: %d", typ, count))
		}
		sort.Strings(parts)
		fmt.Fprintf(&b, "  Types: %s\n", strings.Join(parts, ", "))
	}

	if lastCreated != "" {
		fmt.Fprintf(&b, "  Last captured: %s\n", datePrefix(lastCreated))
	}

	return b.String()
}

func registerInfoCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(aboutCmd())
	rootCmd.AddCommand(versionCmd())
	rootCmd.AddCommand(feedbackCmd())
	rootCmd.AddCommand(infoCmd(""))
}

// FormatRepoURL returns the repo URL for use by other commands.
func FormatRepoURL() string {
	return repoURL
}
