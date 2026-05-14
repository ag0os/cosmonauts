# Coding Driver Envelope

Use this envelope for coding-domain driver tasks. Follow the task body and any plan preconditions exactly; do not expand scope.

## Repo Conventions

- Package manager/runtime: Bun.
- Module format: ESM.
- Import style: include `.ts` extensions in relative TypeScript import paths.
- Verification commands:
  - `bun run test`
  - `bun run lint`
  - `bun run typecheck`

## Worker Discipline

- Explore first before writing code: read the task, relevant plan, files you will modify, neighboring code, and existing tests.
- Use TDD if the task is marked for test-driven development: write the failing test first, then implement the smallest fix.
- Target pattern: match existing code style, naming, structure, and libraries in the repository.
- Never remove suppression comments without a replacement fix that makes the suppression unnecessary.
- Never commit and never run `git add`; the driver owns staging and commits.
- Never edit `missions/` or `memory/` directories.
- For "does file X exist?" questions, check the **filesystem** (`ls`, `cat`, `test -f path`). `git ls-files` only lists *tracked* files and is scoped to the current directory, so a negative result there does not mean the file is absent — it may be untracked or outside the cwd.

## Failure Protocol

- On command failure, capture the command and approximately the last 30 lines of stderr.
- Distinguish failures caused by your changes from pre-existing failures observed before or outside your work.
- Report pre-existing failures separately, with the command and stderr excerpt, and do not treat them as completed work.
- A blocked or failure report must **quote the actual command you ran and an excerpt of its real output** — not a paraphrase or a from-memory summary. If you claim an input file is missing, show the literal `ls`/`cat`/`test` command and its output that you relied on; do not infer absence from `git ls-files` (tracked-only, cwd-scoped).

## Final Report Format

End with a fenced JSON report whenever possible, followed by an exact `OUTCOME:` line as the final line:

```json
{
  "outcome": "success",
  "files": [
    { "path": "path/to/file.ts", "change": "created" }
  ],
  "verification": [
    { "command": "bun run test", "status": "pass" }
  ],
  "notes": "Optional concise context.",
  "progress": { "phase": 1, "of": 1, "remaining": "Optional for partial outcomes." }
}
```

Required fields:
- `outcome`: `success`, `failure`, or `partial`.
- `files`: array of changed files with `path` and `change` (`created`, `modified`, or `deleted`).
- `verification`: array of commands with `status` (`pass`, `fail`, or `not_run`).

Then end with the matching final line:

`OUTCOME: success`

Allowed values are `success`, `failure`, and `partial`. Use `success` only when the task is complete and verification either passed or the report explains why verification was not run.
