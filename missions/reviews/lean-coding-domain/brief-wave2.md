# Coordinator brief — lean coding domain, wave 2

Same rules, sources and precedence as `coordinator-brief.md` (wave 1). Re-read its "North star"
and "How to work" sections; they apply unchanged. Wave 1 is merged on `feature/lean-domain`:
`lib/envelope/` (WP2), `bundled/lean/` with roles `lead`, `builder`, `code-reviewer`, `checker`
(WP1), `lib/code-health/` changed-function resolver + `cosmonauts analysis changed-functions`
(WP4r), and the file-graph pass writing `memory/architecture/graph.json` behind `fileGraph: true`
(WP3g). Read each module's index and tests before briefing a package that consumes it.

Additional ratified rulings (human → Shepherd, 2026-10-01): OD-5 = roles renamed (above), no
framework change; OD-4 = the decorated-last-line envelope fix ships with the runner; the
`memory/architecture/` bundle stays untracked — never `git add -A`, explicit paths only.

## Step 0 — shared contract first (do this yourself, one commit, before fanning out)

Create `lib/lean-run/types.ts` with the shapes every wave-2 package codes against, so the five
packages can run in parallel against stubs:

- `Signal` — one verification fact: `{kind: "verify" | "health" | "dupes" | "blast-radius" |
  "plan-vs-actual" | "mutation", status: "pass" | "fail" | "info", summary, data: unknown,
  reenter: boolean}` (D-4: only `verify` failures and surviving mutants in changed functions set
  `reenter`).
- `SignalProvider` — `{kind, run(ctx: SignalContext): Promise<Signal>}` where `SignalContext`
  carries worktree path, base SHA, plan (parsed `Touches`/`Reuses`/`Behaviors`), the builder
  envelope, the diff file list, and a token/time budget.
- `RunRecord` (R-3: lives in `missions/sessions/lean/runs/<id>/`, gitignored path): `run.json`
  (base SHA, spec/plan paths, backend, `reentries`, snapshot refs), `envelopes/*.json`,
  `facts.json` (`Signal[]` per pass), `stats.json` per stage.
- `BuilderBackend` — `{run(input: {prompt, worktree, role}): Promise<{text, stats?}>}` with two
  implementations expected: Pi (`createPiSpawner`, pass domain `lean` explicitly — see
  `reviews/od5-check.md`: the spawner re-resolves by name and needs the domain) and external via
  `lib/agent-packages/{claude-cli,codex-cli}.ts` (not Drive's `Backend` adapters).

Commit as `lean-run: add shared types for the wave-2 packages`. Then start all five.

## Packages

**WP-R — Runner** (brief §3.2–3.6, §4.3, §4.5, §4.7B.6; README §2, §6). `lib/lean-run/`:
`runBuild({spec?, plan, backend, providers, reviewerBackend})` executes builder → providers →
(re-enter builder once with the failing signals as structured text) → reviewer, writing the
`RunRecord` as it goes. Uses `snapshotWorktree` + `runtimeContext.parentRole: "driver"` for the git
guard, `createPrivateReviewWorkspace` (`lib/orchestration/quality-review-workspace.ts`) to give
the `readonly` reviewer `full.diff`/`changed-files.txt` as text, `lib/envelope` to parse every
stage (apply OD-4: reject a candidate when a later line contains `"outcome"` without starting
with `{`), one re-entry maximum, then stop. A `bundled/lean/extensions/lean-run/` extension
registers a `lean_build` tool for `lead` (plan path in, run id + summary out) — the brief's lead
"starts chains". Tests with a stub backend and stub providers: clean output → done, silent; a
provider with `reenter: true` → exactly one re-entry, then reviewer; a second failure → `blocked`
to the human with the record intact; envelope missing → `failed` with reason. Acceptance: gates
green; a dry run with the stub backend writes a complete `RunRecord`.

**WP3 — Repo-map slice and context pack** (brief §4.6, §4.8; `graph-data.md`). `repoMapSlice`
over `graph.json`: personalized PageRank biased toward the touch set, elided signatures, hard
token budget (chars/4, G-4), deterministic ordering; `cosmonauts architecture slice --touch
<paths> --budget <tokens>` following `cli/` patterns; `buildContextPack({planSection, touches,
reuses, budget})` = plan section + slice + `AGENTS.md` + the verification commands, verbatim text.
Fixture tests; one live assertion that `lib/driver/run-one-task.ts` under 1,500 tokens lists its
10 direct dependencies and its dependents with signatures (regenerate `graph.json` in a temp copy
if needed; never commit `memory/architecture/`).

**WP5 — Graph functions and delivery** (brief §4.7B.3–4, §4.8, §4.9). `blastRadius(diff)` =
changed functions (from `lib/code-health`) → changed files → dependents (transitive over
`graph.json`, stop at the first test, G-2; cap and report hub explosion) → test files;
`planVersusActual(plan, diff)` = `{planned, unplanned, untouched}`; Mermaid renderer with
`added | modified | removed | impacted` classes over the plan diagram; PR-body generator
(diagram + verification summary + findings with disposition). Both functions double as
`SignalProvider`s (`blast-radius`, `plan-vs-actual`, both `info`). Acceptance: deterministic
Mermaid for a fixture diff, validated with a Mermaid parser or CLI; providers unit-tested.

**WP4m — Scoped mutation** (brief §4.7B.5, D-2; `mutation.md`, `mutation-setup/`). Add
`@stryker-mutator/core` + `vitest-runner` as devDependencies with the forks-pool patch via
`bun patch` (pin the vitest major; note in the patch why); `stryker.config.mjs` (exclude
`StringLiteral`, `.stryker-tmp/**` in vitest `exclude` and `.gitignore`); a `mutation`
`SignalProvider`: changed ranges from `lib/code-health` → `--mutate`, test list from the
blast-radius signal in tiers (touched + direct unit tests first, importers if budget allows),
deny-list for sandbox-unsafe tests, JSON report → surviving mutants per changed function,
timeouts counted as killed, NoCoverage reported separately; `reenter: true` only on survivors
inside changed functions. Acceptance: on the `f2d6242c` sample (tests may check out a fixture
repo in a temp dir, not the live tree) the provider reports the 8 survivors and `reenter: true`;
on a function whose tests kill every mutant, `pass`.

**WP4b — Post-edit health hook** (brief §4.7A; `domain-packaging.md` §6). Pi extension
`bundled/lean/extensions/health-hook/`: on `tool_result` for edit/write by `builder`, run the
`lib/code-health` check for that file against the run's base SHA and inject one finding only when
a *changed* function regressed (cyclomatic/cognitive/CRAP) relative to the base; silent otherwise.
Also a `health` `SignalProvider` (whole diff, `info`) and a `verify` provider that runs the
project's verification commands (`fail` → `reenter`). Acceptance: fixture tests prove the hook
stays silent on a clean edit and injects on a regression; P-2 bash-write gap accepted.

Parallelism: all five after Step 0. Each package merges on its own loop; WP-R's acceptance uses
stubs, so it does not wait for the providers. When all are merged, run `runBuild` once end to end
with the stub backend and the *real* providers on a fixture change, record the resulting
`RunRecord` paths in COORD-STATUS, and mark "WAVE 2 DONE". Wave 3 (live runs, WP0 baseline,
WP6 evaluation) needs model providers and is briefed separately.
