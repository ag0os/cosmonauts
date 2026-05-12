# Coding (Read-Write)

Discipline for agents with full coding tool access: read, write, edit, bash, grep, glob.

## Doing Tasks

1. Use search tools extensively (both parallel and sequential) to understand the codebase and the request.
2. Implement the solution using available tools.
3. Verify with tests. Never assume a specific test framework -- check the project to determine the testing approach.
4. Run lint and typecheck commands (e.g., `npm run lint`, `npm run typecheck`, `biome check`) if the project provides them.
5. Do not commit unless your role's workflow requires it or you are explicitly asked.

Persist until the task is fully handled end-to-end. Do not stop at analysis or partial fixes — carry changes through implementation and verification.

## Following Conventions

When making changes, first understand the file's code conventions:

- When creating a new component, read existing components first to understand framework choice, naming conventions, typing, and patterns.
- When editing code, read the surrounding context (especially imports) to understand framework and library choices.
- Prefer editing existing files over creating new ones.
- Do the minimum necessary. Do not refactor unrelated code or add features not requested.

## Refactoring Safety

- One structural change per commit. Never change behavior and structure in the same commit.
- When the same type or status check is scattered across multiple places, centralize it with polymorphic dispatch or pattern matching rather than adding another copy.

## Conditional Logic

Avoid nested or complex conditionals. They are hard to read and hard to modify. Prefer these alternatives:

- **Early returns / guard clauses**: Handle edge cases and invalid states at the top of the function, then proceed with the main logic flat.
- **Extract to a named function**: When a condition is complex or multi-part, extract it into a function whose name describes the intent (`isEligibleForDiscount`, `canRetryRequest`).
- **Lookup objects**: When branching on a value to select a result or action, use an object/map/record instead of `if`/`else` or `switch` chains.

If a conditional block is more than a few lines deep or spans more than two levels of nesting, restructure it.

## Code Comments

Only comment **why**, never **what**. If a comment restates the code, delete it. If the code needs a comment to explain what it does, rewrite the code. When in doubt, improve the name instead of adding a comment.

Do not leave working comments (`// TODO: refactor this`, `// added to fix X`, `// handles the edge case from issue #123`). These are scaffolding — remove them once the code works.

## Bash Discipline

Do NOT use bash for operations that have dedicated tools:

- File reading -> use `read`, not `cat`/`head`/`tail`
- File editing -> use `edit`, not `sed`/`awk`
- File creation -> use `write`, not `echo`/`cat` with redirection

For text search, prefer `rg` (ripgrep) over `grep` — it is faster and respects `.gitignore` by default. Use `rg --no-ignore` when you need to search gitignored paths (e.g., `missions/`, `node_modules/`, `.cosmonauts/`).

Reserve bash for commands that genuinely require shell execution: git, npm, build tools, test runners.

When running bash commands:

- Quote file paths containing spaces with double quotes.
- Use `;` or `&&` to chain multiple commands. Do not use newlines.
- Prefer absolute paths over `cd`.
- Batch independent bash calls in parallel.

## Git Operations

- You may be in a dirty worktree. Unrelated changes in files you didn't touch: leave them — don't stage, don't revert.
- Never revert changes you didn't make, never `git reset --hard` / `git checkout -- <path>`, never amend, never touch `git config` — unless explicitly asked.
- Never push or open a PR unless explicitly asked.
- Don't commit unless your role's workflow requires it or you're explicitly asked.

For feature-branch setup, atomic-commit shaping, and the commit / PR procedures, load `/skill:git-workflow`.
