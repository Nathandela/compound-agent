# Anti-Patterns

## Inviolable -- Never Do

- **Cargo-cult testing**: Tests that pass regardless of implementation
- **Mocking business logic**: `vi.mock()` on the thing being tested
- **Over-engineering**: Adding features/abstractions not requested
- **Post-hoc tests**: Writing tests after implementation

## Strong Default -- Avoid Unless Justified

- **Utils/helpers modules**: Indicate unclear responsibility
- **Magic numbers**: Use named constants
- **Commented-out code**: Delete it
- **Deep nesting**: Prefer early returns

## Soft Default -- Generally Avoid

- **Long functions**: Prefer < 50 lines
- **Implicit dependencies**: Pass dependencies explicitly
- **Emojis in code/comments**: Keep code professional
