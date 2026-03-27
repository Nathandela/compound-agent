# Polish Audit Prompt Design

The polish audit prompt differs fundamentally from the infinity loop's review fleet prompt.

## Key Difference

| Aspect | Review Fleet (infinity loop) | Polish Audit |
|--------|------------------------------|--------------|
| Scope | Recent commits / single epic | Full implementation |
| Lens | Correctness, security, edge cases | Craft quality (BGT checklist) |
| Question | "Are these changes correct?" | "Does this meet world-class quality?" |
| Context | git diff, epic description | Full codebase + spec + BGT checklist |

## BGT Checklist Coverage

The audit prompt embeds the complete build-great-things pre-ship checklist:

### Quantified Items (34)
- **States** (5): loading, empty, error, offline, partial data
- **Interaction** (5): hover/active/focus/disabled, focus visibility, press feedback, validation, transitions
- **Visual Craft** (9): hierarchy, de-emphasis, geometric spacing, no-border-first, elevation, semantic color, scroll animations, images, icons
- **Responsiveness** (4): mobile-first, 44x44px touch, fluid typography, no horizontal scroll
- **Performance** (3): Core Web Vitals (LCP/INP/CLS), font loading, above-fold without JS
- **Accessibility** (5): semantic HTML, minimal ARIA, contrast (4.5:1), reduced-motion, live regions
- **Completeness** (3): 404 page, favicon/OG, print styles

### Anti-Pattern Items (12)
The 12 Common AI Laziness Patterns from build-great-things SKILL.md, each framed as a negative check ("NOT shallow component design", "NOT generic UI", etc.).

## Report Format

Reviewers produce structured output:
- **P0 — Must Fix**: Blocks quality (e.g., missing loading states, no error handling)
- **P1 — Should Fix**: Significant gap (e.g., arbitrary spacing, no hover states)
- **P2 — Nice to Fix**: Polish opportunity (e.g., scroll animations, print styles)
- **Summary**: Overall assessment + top 3 improvements

## Prompt Construction

The `build_audit_prompt()` function in the generated script:
1. Emits the full BGT checklist as a heredoc
2. Appends the spec file contents for domain context
3. Includes the current cycle number for reviewer awareness

The prompt instructs reviewers to evaluate the entire codebase holistically, not just recent diffs. This is the key difference from the review fleet.
