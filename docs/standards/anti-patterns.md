# Anti-Patterns

## Inviolable -- Never Do

- **Cargo-cult testing**: Tests that pass regardless of implementation
- **Mocking business logic**: Mocking the module/function under test instead of its dependencies
- **Over-engineering**: Adding features/abstractions not requested
- **Post-hoc tests**: Writing tests after implementation
- **Ignoring errors**: Discarding error returns without explicit justification (Go: `_ = doThing()` without comment)

## Strong Default -- Avoid Unless Justified

- **Utils/helpers packages**: Indicate unclear responsibility
- **Magic numbers**: Use named constants
- **Commented-out code**: Delete it
- **Deep nesting**: Prefer early returns
- **Exported symbols without documentation**: All exported Go identifiers need doc comments
- **`panic()` in library code**: Return errors instead; reserve `panic` for truly unrecoverable programmer bugs

## Soft Default -- Generally Avoid

- **Long functions**: Prefer < 50 lines
- **Implicit dependencies**: Pass dependencies explicitly
- **Emojis in code/comments**: Keep code professional
- **Package-level `init()` functions**: Prefer explicit initialization; `init()` hides side effects

---

Inviolable and strong-default anti-patterns have corresponding lint rules for mechanical enforcement. See [linting-for-agents.md](linting-for-agents.md) for the tier-to-enforcement mapping.
