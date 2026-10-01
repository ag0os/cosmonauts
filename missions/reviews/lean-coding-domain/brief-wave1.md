# Coordinator brief — lean coding domain, wave 1

You are the coordinator for building the lean coding domain. You run in the git worktree
`/Users/cosmos/Projects/cosmonauts-framework-health` on branch `feature/lean-domain`. Shepherd
(a separate session) verifies your claims, runs the merge gates, and talks to the human. You do not
talk to the human; you write status to the file named below.

## North star and sources, in precedence order
1. `missions/architecture/lean-coding-domain-brief.md` — the human-ratified brief. It governs scope,
   principles (§3), roles (§4.2), the envelope (§4.5), the context pack (§4.6), verification (§4.7),
   non-goals (§7), repository rules (§8). Re-read the section you implement before you start it.
2. `missions/architecture/spikes/lean-coding-domain/README.md` — verified facts about the code and
   the corrections to the brief (Drive has no worktrees; the map is module-level; a second
   `reviewer` breaks coding unless internal + qualified ids). It governs *how*.
3. Ratified decisions (human, 2026-09-30): every row of README §7 at its listed default, plus:
   R-2 runner in `lib/lean-run/` (additive); R-4 `spec.md`/`plan.md` tracked under
   `missions/lean/<slug>/`; P-1 `projectContext: false` for builder/reviewer/verifier, `true` for
   lead; P-2 accept the bash-write gap in v1.

If a package cannot be done as the brief says, do not improvise around it: record it under
"Open decisions" in the status file with the brief section, what blocks it, and the options.
Silent drift from the brief is the one failure Shepherd will reject a package for.

## How to work
- Delegate each work package to a subagent (Agent tool, `isolation: "worktree"`), one per package,
  in parallel when independent. Give each subagent only: the brief sections it implements, the
  README sections that apply, the ratified decisions that apply, the repository rules (brief §8,
  `AGENTS.md`, `docs/testing.md`), and the acceptance below. Subagents commit in their worktree;
  you merge their branch into `feature/lean-domain` (one commit per package, imperative subject
  under 72 chars, body says what and why; end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- Before merging a package: run `bun run typecheck`, `bun run lint`, `bun run test` (capture the
  exit code; known flakes `cross-plan-commit-lock`, `plans/archive.test.ts`,
  `extensions/project-tools.test.ts` pass on re-run in isolation), `bun run check:reachability`,
  `bun run check:suppressions -- --base main`. Report the real results; a failing gate is a
  finding, not something to explain away.
- Review loop per package, exactly this and no more: one fresh subagent reviewer (read-only, framed
  as correctness and liveness, never "attack"), one remediation by a fresh subagent, one re-review.
  Findings still open after that go to "Open decisions". Reviewers write their report to
  `.shepherd/work/in-progress/lean-coding-domain/reviews/<package>-<n>.md` (absolute path under
  `/Users/cosmos/Projects/cosmonauts/.shepherd/`).
- Do not touch: `bundled/coding/`, `lib/orchestration/quality-review-*.ts`, existing report
  parsers, `missions/` `memory/` `knowledge/` content (except `missions/lean/` and the spikes dir),
  `.fallow-baselines/`, `.cosmonauts/suppression-exceptions.json`, `biome.json`, Pi versions.
  No tasks or plans under `missions/`. Never push. Never merge to `main`.
- No model calls are needed in this wave; every acceptance is a test.
- Status file: `/Users/cosmos/Projects/cosmonauts/.shepherd/work/in-progress/lean-coding-domain/COORD-STATUS.md`.
  Keep it current: per package — state, subagent, branch/commit, gate results, review round,
  open decisions. Shepherd reads only this file.
- Watch your context. At about 45% usage, finish the package in flight, update the status file
  with what the next coordinator must know, and write "ROTATE" at the top of it. Shepherd will
  start your successor from the status file.

## Wave 1 packages (all independent; start all four)

**WP2 — Envelope** (brief §4.5). `lib/envelope/`: typebox schema (object root), parser (last
non-empty JSON line; tolerant of code fences and trailing prose), human renderer. Tests in
`tests/envelope/`. Acceptance: parses every example shape in §4.5; rejects malformed input with a
reason; 100% branch coverage on the module (`bun run test:coverage` scoped to it is fine).

**WP1 — Domain skeleton** (brief §4.1–4.4, README §1.3, §3). `bundled/lean/`: `domain.ts`
(id `lean`, lead `lead`, `internal.agents: ["reviewer","verifier"]`), `cosmonauts.json`, `chains.ts`
(`build: lean/builder -> lean/reviewer`, `review: lean/reviewer`, qualified ids), four agent
definitions (models/thinking copied from the matching `bundled/coding/agents/*.ts`; tool sets per
§4.2; `projectContext` per P-1; skills by name: `tdd`, `git-workflow`, `contract`, language skills
as coding does), four prompts each ≤400 words (persona, what done looks like, what to hand back,
three mottos; no rules sections; `lead` = `bundled/coding/prompts/cody.md` trimmed), `capabilities/`
only if a prompt cannot say it in one line, `skills/contract/` with the two templates of §4.4
verbatim. Add `git-workflow` and `contract` to the `skills` allowlist in `.cosmonauts/config.json`.
Tests `tests/domains/lean-*.test.ts`: loader discovers `lean`; every agent validates; every prompt
under 400 words; chains resolve; **and `coding/cody` still resolves bare `reviewer` and `verifier`
with lean present** (the regression the spike found). Acceptance: gates green; the domain lists in
the CLI beside `coding`.

**WP4r — Changed-function resolver + health check CLI** (brief §4.7A, §4.7B.2, README §4).
`lib/analysis/changed-functions.ts` (or the existing analysis module if one fits): given a base
revision, run `fallow health --complexity --max-cyclomatic 0 --max-cognitive 0 --changed-since
<base> --format json` (see `check.md` §3 for the verified shape) and intersect with
`git diff -U0 <base>` hunks → `{file, name, startLine, endLine, cyclomatic, cognitive, crap}` per
changed function, plus the per-function regression against the same metrics at the base. One CLI
entry following `cli/` patterns (e.g. `cosmonauts analysis changed-functions --base <rev> [--file
<path>] --format json|text`) so the Pi hook and external post-tool hooks call the same code.
Tests with fixtures (a temp git repo with two commits), not the live repo. Acceptance: on the
fixture, reports exactly the changed functions and their ranges; a function whose complexity rose
over the base is flagged, an unchanged legacy function over the absolute threshold is not.

**WP3g — File graph** (brief §4.6.2, §4.8, README §4, `graph-data.md`). New pass in
`lib/architecture-map/` (e.g. `file-graph.ts`): nodes = every source file and every test file;
edges file→file weighted by imported-name count with a type-only flag; per-file exports with
signatures, interface/type bodies elided to headers. Emitted as canonical `graph.json` in the same
bundle and covered by the same project hash as the existing output; a loader for it. Do not change
the existing module-level output or its tests. Tests use fixtures. Acceptance: on a fixture
mirroring the probe, the file `lib/driver/run-one-task.ts`-style target lists its direct
dependencies and dependents including test files; generation of the real repo still completes in a
few seconds (report the measured time and RSS).

When all four are merged and reviewed, stop and mark the status file "WAVE 1 DONE". Wave 2 is
briefed separately.
