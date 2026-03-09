# ascii-align Development Rules

## TDD Required

All bug fixes and features MUST follow test-driven development:
1. Write failing test(s) first that demonstrate the bug or specify the feature
2. Run tests to confirm they fail
3. Implement the fix/feature
4. Run tests to confirm they pass
5. Never skip this workflow

## Git Workflow

- Never push directly to `main` — always use feature branches and PRs
- Branch naming: `fix/<issue-description>` for bugs, `feat/<description>` for features
- Reference GitHub issues in commits with `Fixes #N` or `Closes #N`
- CI must pass before merging

## No AI Attribution

- Never include "Co-Authored-By", "Claude", "anthropic", or "Generated with" in commits, PRs, or issues
- The `.claude/settings.json` disables attribution and a hook blocks it as a safety net

## Code Style

- TypeScript strict mode
- ESM modules (`.js` extensions in imports)
- Tests use Vitest
- Keep the CLI version in sync with package.json (read dynamically, don't hardcode)
