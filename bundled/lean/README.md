# Lean domain

A lead, a builder, a code reviewer and a checker, driven by the `lean_build`
and `lean_review` tools (`extensions/lean-run/`). After each builder attempt
the host runs its own checks over the builder's clone and hands the
results to the reviewer as facts. The runner is `lib/lean-run/`.

## Builder isolation

The builder never works in your checkout. Each `lean_build` run clones the
repository into a temp directory (`git clone --no-hardlinks`), detached at
the run's snapshot of your tree, so uncommitted work is there as it was.
The clone has its own refs, stash and config, and its remotes are removed:
branches it deletes, config it sets and a `git push origin` stay in the
clone. It carries copies of your branches, tags and remote-tracking refs
(not notes or the stash), taken when the clone opened, so a check that
reads `main`, `origin/main` or a tag sees them as they were in your
checkout then; they are names only, with no configured remote behind
them, so `git push origin` still fails in the clone. A push that names a
repository by path or URL still lands (see the residuals below). A
`claude-cli` builder is also started with `--disallowedTools` for the git
verbs that write history or move refs (`push`, `commit`, `merge`, `rebase`,
`cherry-pick`, `revert`, `am`, `update-ref`, `branch -d/-D`, `tag -d`,
`stash`) and `gh pr`; `run.json` records the list as `deniedTools`.

Only a `done` run applies the builder's patch, to your working tree and
never the index. A run during which your branch or HEAD moved ends
`blocked` with nothing applied. So does a run in which one of your
branches or tags was added or moved to an object the builder made: one
that exists in the builder's clone and that none of your refs, HEAD or
reflogs reached when the clone opened. The reason names those refs and
the `git update-ref` command that restores each; a blocked run does not
undo the change itself. Any other branch or tag drift, such as a commit
in a sibling worktree, a fetched tag, a deleted ref or a ref moved to an
object you already had, is a warning and does not stop the run, and so is
a stash moved in another worktree: every worktree of the repository
shares `refs/stash`. A `git stash` in this checkout during a builder
stage changes this working tree, and blocks like any other change to it
(below).
`run.json` records every drifted branch or tag with its old and new
object as `callerRefDrift`, each `blocked` or `warned`.

The checks need files git does not carry, so the clone also gets:

- **Gitignored files**, copied at the same paths: `.env*`, generated code,
  build outputs, a gitignored `.cosmonauts/config.json`. `node_modules`,
  `.git` and `.stryker-tmp` are never copied, at any depth, nor are
  session transcripts (`missions/sessions/`, `missions/archive/sessions/`,
  at the top level and in the project directory).
  Ignored files and directories are copied smallest first, and one that
  would take the total past `lean.ignoredInputsCapBytes` (default 50 MB) is skipped
  whole; git's separate entries inside a skipped directory then get their
  own turn. A symlink is copied only when it leads inside the checkout, and
  its target is rewritten as the shortest relative path, so it points at
  the clone's file, not yours. The
  copies stay out of the builder's patch. `run.json` lists what was copied
  (`builderInputs.carried`) and what was skipped and why
  (`builderInputs.skipped`).
- **`node_modules`**, linked, not copied: the one at each level from the
  top level down to the project root, and every gitignored one (up to 200).

There is no filesystem sandbox: the builder runs with your filesystem
rights, and the clone keeps it out of your checkout only while it writes
inside the clone. Two checks cover the known ways out. A symlink in the
run's snapshot, tracked or untracked, whose target (through directory
links and chains) is inside your checkout or its git directory blocks the
run before the builder starts; other links that leave the clone (a system
path, a relative link climbing out of the repository) are a warning.
`run.json` records them as `builderInputs.links`. And your working tree,
tracked and untracked files that are not ignored, is compared before and
after each builder stage: any change ends the run `blocked` with nothing
applied, names the paths (`callerTreeChange`), and leaves the changed
files as they are. That includes your own edits during the run. Writes
through a linked `node_modules`, to gitignored files, into the session
directories (`missions/sessions/`, `missions/archive/sessions/`) even when
they are not gitignored, and to paths outside the repository are **not
detected**, and neither are mode-only changes when `core.fileMode` is
`false`. When your checkout is a linked worktree, the link check covers
this worktree and the repository's git directory: a link into the main
checkout or a sibling worktree is only a warning, and writes through it
are not detected.

Two residuals remain. `run.json` records them as
`builderInputs.residuals`.

- **Push by path or URL.** The clone has no configured remote, but a
  builder that names a repository by path or URL, yours or your remote's,
  can still push to it, and the `claude-cli` deny list matches only
  commands that start with `git push`. A push that points one of your
  branches or tags at an object the builder made ends the run `blocked`.
  A builder that deletes one of your branches or tags, or moves one to an
  object you already had, is reported in `run.json` and the warnings, not blocked:
  the threat model is accidental damage, and the check cannot tell that
  drift from your own work in another worktree. An object you had only
  unreferenced (reached by no ref, HEAD or reflog) counts as the
  builder's. A builder push into `refs/remotes/*`, `refs/notes/*` or
  `refs/cosmonauts/*` of your repository is neither blocked nor reported:
  the check covers branches and tags. A push to a remote is not detected.
- **The dependency tree is writable through the link.** What the builder
  writes or deletes under a linked `node_modules` lands in yours. A run
  whose builder removed entries from one ends `blocked`; other writes (an
  edited installed package) are not detected.

Submodules are not populated in the builder clone, so a check that needs
one ends `blocked`. A check that itself runs `git pull` or
`git fetch <remote>` fails in the clone, which has no remote. A plain
`git fetch` (also with `--all` or `--prune`) exits 0 and does nothing
there, so remote-tracking refs stay as they were when the clone opened.
Git LFS is not handled: in a
repository that sets `filter.lfs.required`, the clone may fail to open
(not verified).

The clone is deleted when the run ends. When the last builder patch could
not be written, its work exists only in the clone, which is kept; the
warning names it, and `rm -rf` of the named directory removes it.

## Run lock and leftover processes

One run at a time holds a repository's run lock (`.git/lean-run/lock`);
`lean_build` and `lean_review` both take it. The run owns every process the
host's child runner starts for it (external builder and reviewer sessions,
host-check providers, mutation testing, code health, and the project tools
of an in-process session) and every process it finds in their trees, until
it sees them gone. When the
run ends it waits up to 30 s for all of them to exit, with no wait when
they already have. If some still run, `run.json` lists them as
`cleanupUnconfirmed`, the reason says so, and the lock stays, rewritten as
`{"runId", "pid", "createdAt", "state": "unconfirmed", "unconfirmedPids"}`.
Its age never frees it. The next run in the repository:

- proceeds, with a warning, when none of those pids is running any more;
- ends `blocked: previous run cleanup unconfirmed (pids …)` otherwise;
- proceeds anyway, with a warning naming the cleared pids, when
  `lean_build` or `lean_review` is called with `clearStaleLock: true`. Only an
  `unconfirmed` lock is cleared this way, never a running run's.

A pid is gone when signal 0 finds no such process, or a `ps` listing lacks
it or shows it as a zombie; a reused pid counts as running. On Windows
there is no listing: a pid that still exists counts as running, and the
descendants of an exited child cannot be enumerated, so they are never
owned. Whenever a child's descendants could not be enumerated (any natural
exit on Windows, a failed `ps`), `run.json` has a warning naming the child's
pid and the stage that started it: its descendants are not confirmed gone.

Not owned, and so never waited for: processes started by the built-in
tools (bash and the like) of an in-process Pi session, the default `pi`
backend, and a process that left a child's tree before any listing found
it (a daemon that forked and called `setsid`). For the second, best effort,
the end of a build lists running processes whose command line names the
builder clone as `detachedCandidates` in `run.json`, with a warning, and the
summary names them; they are reported, never counted, and never claimed
gone. A process working in
the clone without naming it is not found: working directories are not
read, since no portable lookup of them is cheap.

## Host checks and what they need

| Signal kind      | Tool                                                      | Without the tool                    |
| ---------------- | --------------------------------------------------------- | ----------------------------------- |
| `verify`         | `qualityReview.checks` in `.cosmonauts/config.json`, else `bun run typecheck`, `lint` and `test` when `package.json` has them | unavailable                         |
| `health`         | fallow                                                    | unavailable                         |
| `dupes`          | fallow, and `.fallow-baselines/dupes.json` committed at the base | unavailable                   |
| `blast-radius`   | `graph.json` from `cosmonauts architecture generate --file-graph` | unavailable                 |
| `blast-tests`    | the `blast-radius` signal with a current graph, a `test` script in `package.json`, and a runner that prints a vitest or jest run summary and names each file it ran (not vitest's `dot` reporter) | unavailable whenever no listed test ran: no graph, a stale graph, no test script, no tests in the radius, or a run that executed none |
| `plan-vs-actual` | nothing                                                   | always runs                         |
| `mutation`       | fallow (to find the changed functions), Stryker with its vitest runner, vitest in the project, and the graph to select tests | unavailable                         |

A check that cannot run reports `info` with `data.unavailable: true` and
`data.reason`. A check that ran and found nothing to do (no changed
functions, no mutants, no test covering the change) is plain `info`.
`mutation` with no test to select is unavailable when the `blast-radius`
signal found no readable graph, and plain `info` when the graph exists.

`blast-tests` counts only the test files the runner's own output reports
running: the run summary (`Test Files  2 passed (2)`, `Tests  5 passed
(5)`, or jest's `Test Suites:` and `Tests:`) and its per-file result lines
(read past a vitest `|project|` label). An exit 0 with no summary, a
summary that counts no test passed or failed, or `No test files found` (as
`passWithNoTests` prints) ran nothing. Listed files the runner left out,
for example ones its config excludes, are recorded under `notRun` and keep
the signal from a clean `pass`; when no listed test ran at all the signal
is unavailable. A runner that names only other files (vitest's substring
filter matching a different path, or a script that ignores its arguments)
ran none of the listed ones. Lines a test prints that mimic the runner's
result lines are ignored inside the runner's console-capture blocks
(vitest's `stdout |` and `stderr |` blocks, jest's `console.log` blocks),
which are read up to the first empty line the test prints; a mimic line
after one still counts, since attribution trusts the runner's console.
A reporter that names no file (for example
`--reporter=dot`) reports no listed file as run, whatever its summary
counts: the run is `not-run`, with the reason "the test runner named no
files", the signal is unavailable, and it is a gap when required.
`blast-tests` needs a reporter that names files: vitest's default or
`verbose` (not `dot`), or jest's default.

## Installing from npm

Stryker (`@stryker-mutator/core`), its vitest runner
(`@stryker-mutator/vitest-runner`) and fallow are devDependencies of
cosmonauts, so an npm installation does not get them. The package ships
`stryker.config.mjs` and `patches/`; the project provides the rest:

- **Stryker**: add `@stryker-mutator/core@10.0.0` and
  `@stryker-mutator/vitest-runner@10.0.0` to the project. Stryker is
  resolved from the cosmonauts package, so a project-level install is found
  only when cosmonauts is installed in the project too. A global cosmonauts
  cannot see the project's Stryker, and `mutation` is unavailable there.
  Stryker runs the project's own vitest.
- **The vitest-runner patch**: `patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch`
  lets tests that call `process.chdir()` run under Stryker (see
  `patches/README.md`). It patches only the runner's branch for vitest
  older than 4.1; with vitest 4.1 or later the patch changes nothing.
  cosmonauts' own `patchedDependencies` applies only when cosmonauts is the
  root project, and a package manager cannot read a patch from inside
  `node_modules`. Copy the patch into the project, commit it, and copy it
  again when cosmonauts is upgraded:
  - bun: copy it to `patches/` and add
    `"patchedDependencies": { "@stryker-mutator/vitest-runner@10.0.0": "patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch" }`
    to `package.json`.
  - pnpm: copy it to `patches/` and add the same entry under
    `patchedDependencies` in `pnpm-workspace.yaml`. pnpm 11 ignores a
    top-level `patchedDependencies` in `package.json`.
  - npm: patch-package expects paths from the project root, so rewrite them
    while copying:
    `sed 's#\([ab]\)/dist/#\1/node_modules/@stryker-mutator/vitest-runner/dist/#g' "node_modules/cosmonauts/patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch" > "patches/@stryker-mutator+vitest-runner+10.0.0.patch"`,
    then add `patch-package` as a devDependency and
    `"postinstall": "patch-package"` to the scripts.

  Without the patch, a selected test that changes directory fails Stryker's
  dry run and the mutation signal is unavailable.
- **fallow** (`fallow@2.54.2`, exact): health, dupes and mutation run the
  fallow that Node resolution finds from the cosmonauts package: its own
  `node_modules`, then each enclosing one, so `bun add -d fallow@2.54.2` or
  `npm install -D fallow@2.54.2` in the project is enough for a local
  install. Only the pinned version is accepted; a fallow of any other version
  is named in the signal's reason and never run (the binary's identity is its
  exact version, not where it lives). PATH is never consulted; a copy in
  any `node_modules` enclosing the cosmonauts package is on the search
  path, which for a globally installed cosmonauts means the global
  `node_modules` (follow-up: a dependency entry, which is a human call).
  pnpm layouts work: the platform binary is resolved from fallow's own
  real directory, so `.pnpm/` stores are found.
- **bun**: the default `verify` commands run through `bun run`.

## Required signals

A run is `done` only when every required kind ran and was available in the
last provider pass. Otherwise it ends `blocked` with
`unverified (<kind> unavailable: <reason>)`, or `never ran` as the reason
for a kind no provider produced. A signal that skipped its check
(`data.skipped`, such as `mutation` while verification fails) counts as
unavailable too, with `skipped: <reason>`. Optional kinds that cannot run
stay `info` for the reviewer.

The project owns the required kinds, not the lead: `lean.requiredSignals`
in `.cosmonauts/config.json`, for example
`{ "lean": { "requiredSignals": ["verify", "mutation"] } }`, else the
default, `verify` alone.

`run.json` records the list a run used. `[]` requires nothing beyond the
rule that `verify` must pass. `lean_review` applies the same list, but only
to the kinds of the providers it ran (by default, `verify` alone).

## Token budget

Each session's input and output tokens count against the run's token
budget; cache reads and writes do not. The tool result returns the run's
per-stage usage, including cache reads and writes, so it counts in the lead's
session totals; this is separate from `tokensUsed`, which is the budget's input
plus output count. Claude Code's usage is its final result object. Codex's is
the sum of its `turn.completed` events, read from stdout as it streams, so a
turn in the part of a long session's log
that the output cap drops is still counted. Usage is incomplete when
stdout ended inside a JSON line, a usage line was too long to read, a
`turn.completed` event's usage could not be read, or stdout bytes reached
the log without reaching the counter (for Claude, a result object lost to
the cap).

An explicit budget (the `lean_build` parameter or `lean.budget.tokens`)
ends the run `blocked` with `budget unenforceable (<backend> reported no
token usage)` or `budget unenforceable (<backend> usage incomplete:
<why>)`, unless the usage that was read already overran it, which fails
the run; the reason then says the count is a lower bound, and `run.json`
warns that the budget was not fully enforced. Under the default budget the
run goes on, and `run.json` warns that the budget was not (fully)
enforced.

## Models

Each role's agent definition (`agents/*.ts`) names a model and a thinking
level: `openai-codex/gpt-5.6-sol` for every role, at `medium` for the builder and
`high` for the code reviewer, the checker and the lead. For
`codex-cli`, a role with an `openai-codex/` model gets `--model <id>` and
`-c model_reasoning_effort=<level>`; `off` and `minimal` ask for `low`,
`max` for `xhigh`, and a role with no thinking level gets no effort flag.
A model from another provider is not passed, so Codex uses its own
configuration. `claude-cli` gets no model flag. Custom arguments that set
a model (`--model`, `-m`, `-c model=`) or an effort
(`-c model_reasoning_effort=`) win, and neither is added twice; so do
arguments that pick the model through a profile or another provider
(`--profile`, `-p`, `--oss`, `--local-provider`, `-c model_provider=`),
which get neither `--model` nor the role's effort (that effort was mapped
for the role's own model, and a profile carries its own) and are recorded
as `caller: <argument>`, with an effort only when the caller set one. Codex
takes the last of repeated `-c` flags, and custom arguments come after
the ones lean adds, so a custom effort wins even in a form lean does not
recognise.

`run.json` records, per role, what the harness was asked for, as
`models`, for example `{ "builder": { "model": "gpt-5.6-sol", "effort":
"medium" }, "code-reviewer": { "model": "harness default" } }`. `harness
default` means no model was asked for. A Pi run records no `models`.
