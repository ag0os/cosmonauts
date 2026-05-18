# Coding Driver Envelope

Use this envelope for coding-domain driver work. Follow the rendered work item, run-level expectations, and any plan preconditions exactly; do not expand scope.

## Repo Conventions

- Discover the repository's package manager, scripts, test runner, module format, import style, and local conventions before editing.
- The generated **Drive Run Expectations** section lists the authoritative commit policy and required verification commands for this run.
- When verification commands are provided there, use those exact commands. Do not substitute another package manager or invent equivalent commands.

## Worker Discipline

- Explore first before writing code: read the work item, relevant plan/context, files you will modify, neighboring code, and existing tests.
- Use TDD if the work item is marked for test-driven development: write the failing test first, then implement the smallest fix.
- Match existing code style, naming, structure, and libraries in the repository.
- Never remove suppression comments without a replacement fix that makes the suppression unnecessary.
- Obey the generated commit policy. If it says Drive owns commits, do not run `git add` or `git commit`. If it says the backend owns commits, commit only the completed implementation changes.
- Never edit `missions/` or `memory/` directories unless the work item explicitly requires it.
- For "does file X exist?" questions, check the **filesystem** (`ls`, `cat`, `test -f path`). `git ls-files` only lists *tracked* files and is scoped to the current directory, so a negative result there does not mean the file is absent — it may be untracked or outside the cwd.

## Failure Protocol

- On command failure, capture the command and approximately the last 30 lines of stderr.
- Distinguish failures caused by your changes from pre-existing failures observed before or outside your work.
- Required verification failures block success unless you can fix them or explicitly explain why verification could not run.
- Optional extra checks may be reported as notes. Do not mark the work item failed solely because an optional check hit a backend/environment limitation while required checks and requested outcomes are satisfied.
- A blocked or failure report must **quote the actual command you ran and an excerpt of its real output** — not a paraphrase or a from-memory summary. If you claim an input file is missing, show the literal `ls`/`cat`/`test` command and its output that you relied on; do not infer absence from `git ls-files` (tracked-only, cwd-scoped).
