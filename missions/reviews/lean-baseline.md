# WP0 baseline: three historic tasks through the coding domain

Wave 4 of the lean coding domain (`missions/architecture/lean-coding-domain-brief.md` §6, WP0).
Measured 2026-10-02 by coordinator `lean-coord-6`. The same three tasks run through the lean
domain in `missions/reviews/lean-evaluation.md` (WP6), which holds the comparison.

## 1. Task selection

Three real changes from this repository's history, all before the lean domain existed
(`5b774b7c`), none touching `bundled/lean/` or `lib/lean-run/`. Each historic change is one
commit from a single-task slice of the project-health-audit or driver-hardening work. Two of the
three commits (`e55040de`, `e649e356`) carry a `Claude Fable 5.1` co-author trailer; `ac8dbc11`
carries none. Authorship beyond the trailers is not established.

| Task | Kind | Historic change (reference diff) | Base = parent | Historic files | Acceptance checks |
|---|---|---|---|---|---|
| `fix` | direct fix | `e55040de` fallow-provider: record a `warn` audit verdict as a completed non-passing result | `e649e356` | 2: `domains/shared/extensions/project-tools/fallow-provider.ts`, `tests/extensions/project-tools-fallow.test.ts` | the historic `tests/extensions/project-tools-fallow.test.ts` (checked out from `e55040de`) over the agent's provider; five gates |
| `feature` | feature | `e649e356` cli: tab-separate `--plain` listing rows (ROADMAP `plain-listing-pipe-defect`) | `868279c8` | 11: `cli/plans/commands/list.ts`, `cli/shared/output.ts`, `cli/tasks/commands/shared.ts`, 3 skill docs, `ROADMAP.md`, 4 tests | the historic `tests/cli/plans/commands/list.test.ts`, `tests/cli/tasks/commands/list.test.ts`, `tests/cli/tasks/commands/search.test.ts` over the agent's renderers (the historic `tests/cli/shared/output.test.ts` pins a helper name, so it is reported separately); five gates |
| `refactor` | refactor, behaviour preserved | `ac8dbc11` TASK-771 Stage 4: extract extension and harness clones | `e73e6510` | 10: `lib/extensions/{agent-memory,architecture-memory}/index.ts`, `lib/extensions/context-values.ts` (new), `lib/extensions/knowledge-surface/{knowledge-tools,recall-limit}.ts`, `lib/harness-adapters/{durable-file,path-safety,render,sync}.ts`, `scripts/validate-harness-exports.ts` | no test file changed; the eleven named clone groups absent from `bunx fallow dupes --format json --quiet --no-cache`; five gates |

The five gates: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run check:reachability`,
`bun run check:suppressions -- --base <base>`, run by the coordinator in the clone after the run.

### Task statements

Written from the historic commit message, ROADMAP item or task file, without the solution. The
same text goes to both domains. The coding domain's specialists start from a task id, so for
`fix` and `refactor` the statement is the description of a task created in the clone with
`cosmonauts task create` (acceptance criteria below); the `feature` statement is the chain prompt.

**fix**

The task-close `analysis_audit` tool fails with `invalid-output` whenever `fallow audit` returns its documented verdict `warn` (exit code 0, warn-severity findings only). The provider in `domains/shared/extensions/project-tools/fallow-provider.ts` accepts only `pass` and `fail`, so a warn audit can neither pass nor be recorded, and later work self-blocks on it. Make a `warn` audit come back as a completed, non-passing result: it must never count as passing, and exit 0 beside `warn` is Fallow's documented exit-code contract (see docs/fallow.md), so it must not be treated as a contradiction. Keep everything else unchanged: `fail` with exit 0 is still invalid-output, and a `warn` with zero normalized findings is still rejected. Add regression tests in `tests/extensions/project-tools-fallow.test.ts`: a warn audit (exit 0, dead code clean, duplication clone groups present) must be recorded as findings with a non-passing verdict and duplication coverage; a warn on a zero-change audit must still be invalid-output. Do not change thresholds, suppressions or fallow.toml. Do not commit.

**feature**

`plan list`, `task list` and `task search` with `--plain` join their columns with an unescaped ` | `, and plan and task titles may legally contain a pipe, so a caller parsing the output gets silently shifted columns. The ruled contract (Q-003, recorded in TASK-701) is a tab between columns for multi-column row listings. Make the three renderers (`cli/plans/commands/list.ts`, `cli/tasks/commands/shared.ts`) emit tab-separated rows that always split back into exactly their columns, so a field that itself contains a tab or a line break must be made safe as well. Update the CLI tests for the new row format and add tests for a title containing a pipe and a title containing a tab or line break. Correct the three skill documents under `external-skills/cosmonauts/` that describe the `--plain` format so they state the column order and tell callers to split on tabs, never on `|`. Remove the `plain-listing-pipe-defect` item from ROADMAP.md. Do not commit.

**refactor**

`fallow dupes` (run as `bunx fallow dupes --format json --quiet --no-cache`) reports these eleven clone groups; eliminate them with behaviour preserved:

1. `lib/extensions/agent-memory/index.ts:1229-1233` / `lib/extensions/knowledge-surface/knowledge-tools.ts:387-391` (recall-limit normalization)
2. `lib/extensions/agent-memory/index.ts:1265-1274` / `lib/extensions/architecture-memory/index.ts:357-366` (rendering / byte-length helpers)
3. `lib/extensions/agent-memory/index.ts:1282-1296` / `lib/extensions/architecture-memory/index.ts:370-383`
4. `lib/extensions/agent-memory/index.ts:1290-1339` / `lib/extensions/architecture-memory/index.ts:411-428`
5. `lib/harness-adapters/render.ts:525-529` / `lib/harness-adapters/render.ts:542-546` (same-file rendered-node writes)
6. `lib/harness-adapters/render.ts:601-628` / `lib/harness-adapters/sync.ts:889-904` (path containment checks)
7. `lib/harness-adapters/sync.ts:1210-1223` / `lib/harness-adapters/sync.ts:1334-1347` (transaction same-file blocks)
8. `lib/harness-adapters/sync.ts:2287-2306` / `lib/harness-adapters/sync.ts:2333-2353`
9. `lib/harness-adapters/sync.ts:3126-3141` / `scripts/validate-harness-exports.ts:2390-2401` (durable file operations)
10. `lib/harness-adapters/sync.ts:3144-3159` / `scripts/validate-harness-exports.ts:2404-2424`
11. `scripts/validate-harness-exports.ts:2001-2014` / `scripts/validate-harness-exports.ts:2019-2045` (same-file command probes)

The other clone groups fallow reports inside `scripts/validate-harness-exports.ts` (lines 369-1659) and elsewhere are out of scope; leave them. Same-file families become private helpers, same-subsystem sharing stays internal to that subsystem, and cross-file sharing is the smallest identical primitive (a focused helper module under the owning directory is fine). Preserve transaction boundaries, durable-write ordering and file modes, no-follow and containment semantics, caller-owned error messages and every public entry point. No test file changes, no new lint or fallow suppressions, no threshold, ignore, entry or fallow.toml changes. Afterwards `fallow dupes` must list none of the eleven groups and `bun run test`, `bun run lint`, `bun run typecheck` must stay green. Do not commit.

Acceptance criteria on the `fix` task: (1) a warn audit (exit 0, dead code clean, clone groups
present) is recorded as a completed `findings` result with a non-passing verdict and duplication
coverage, never as passing; (2) warn with zero normalized findings and fail with exit 0 are still
invalid-output, exit 0 beside warn is not a contradiction; (3) regression tests for both shapes,
the first failing on the previous provider; (4) test, lint, typecheck exit 0, no threshold,
suppression or fallow.toml changes. On the `refactor` task: (1) none of the eleven groups in
`fallow dupes`, out-of-scope groups untouched; (2) no test file changes, test/lint/typecheck
exit 0; (3) no new suppressions, no fallow.toml changes; (4) behaviour preserved as listed.

### Workflow per task

The coding domain's own routing (`domains/main/skills/dispatch/SKILL.md`, `cody.md`):

| Task | Coding workflow | Why |
|---|---|---|
| `fix` | task file, then chain `worker -> reviewer` | "one atomic task with full acceptance criteria: `coding/worker`"; "focused review: `coding/reviewer`" |
| `feature` | named chain `plan-and-build` | the domain's default design-driven pipeline for a request without a plan |
| `refactor` | task file, then chain `refactorer -> reviewer` | `refactorer` "for structural changes" (cody.md) |

## 2. Setup shared by every run

- Binary: `/Users/cosmos/Projects/cosmonauts-framework-health/bin/cosmonauts` at `feature/lean-eval`
  `37523fc0` (= local `main` `f8ac1318` + the two W4-2 stats commits). Both domains come from this
  checkout; from a clone's cwd `cosmonauts --list-domains` lists `shared`, `coding`, `lean`, `main`.
- Clone per run: `git clone --no-hardlinks <repo> $TMPDIR/lean-eval/<task>-<domain>`,
  `git checkout <base>`, `bun install --frozen-lockfile`. For `fix` and `refactor` on the coding
  side one eval-prep commit adds the task file created with `cosmonauts task create` (TASK-790 in
  `fix-coding` at `c341b3d5`, TASK-785 in `refactor-coding` at `62103cec`); the diff below is
  taken against that commit.
- Models: every agent definition in both domains names `openai-codex/gpt-5.6-sol` (Pi's
  `openai-codex` OAuth login, the work account). Neither print mode nor chain spawns persist Pi
  sessions, so no transcript exists on either side. The model evidence is Pi's cost per stage,
  which equals the stage's tokens priced at the `gpt-5.6-sol` catalog rates ($4 / $20 / $0.40 per
  million input / output / cache read) on all 16 stages measured (gpt-5.5 is $5 / $30 / $0.50),
  plus the requested model `openai-codex/gpt-5.6-sol` in `steps/<step>/step.json` of the fix and
  refactor chain records.
- Wall-time cap 2 h (`timeout 7200`); runs sequential, one at a time, on a shared loaded machine.
- Records: `.shepherd/work/in-progress/lean-coding-domain/eval/<task>-<domain>/` holds
  `run-meta.txt` (binary, command, start/end, exit), `stdout.txt`, `stderr.txt`, `diff.patch`,
  `git-status.txt`, the clone's `missions/sessions/` (chain run record `chain/runs/<id>/` with
  `events.jsonl` and step records for the fix and refactor chains; the failed feature chain left
  no run record, so its numbers come from stdout, stderr and the `--profile` trace) and
  `acceptance.txt`.
- Acceptance is run by the coordinator after the run (`accept.sh <task> <domain>`): the historic
  test files are checked out over the agent's code and run alone, then restored; then the five
  gates run on the agent's tree. The per-stage numbers come from the stderr `Stats:` lines and the
  `chain_end` result (`agent=` is Pi agent time per stage; wall time is the `Completed (…)` line).

## 3. Runs

### 3.1 `fix` — `worker -> reviewer`

```
cd $TMPDIR/lean-eval/fix-coding   # e649e356 + c341b3d5 (TASK-790)
cosmonauts run chain "worker -> reviewer" "Implement TASK-790 in this checkout. Read it with task_view: the description and the acceptance criteria are the whole specification. Leave your changes uncommitted in the working tree." -d coding --profile
```

| Measure | Value |
|---|---|
| Final status | `[chain] Complete`, exit 0 |
| Wall time | 6 m 14 s total (374 s); worker 4 m 14 s, reviewer 1 m 58 s |
| Agent time (`SpawnStats.durationMs`) | worker 254.9 s, reviewer 118.3 s, sum 373.1 s |
| Tokens worker | 97,302 in / 5,562 out / 1,982,592 cache read / 0 cache write (2,085,456 total) |
| Tokens reviewer | 73,241 in / 4,988 out / 417,024 cache read / 0 cache write (495,253 total) |
| Tokens total | 170,543 in / 10,550 out / 2,399,616 cache read (2,580,709 total), cost $1.85 |
| Stages / re-entries | 2 / 0 (1 turn each; 50 + 32 tool calls) |
| Diff | `fallow-provider.ts` +23/−12; `tests/extensions/project-tools-fallow.test.ts` +91/−0; task file `To Do` → `Done` |
| Acceptance | **pass**: historic test file from `e55040de` 34/34 over the agent's provider; typecheck 0, lint 0, test 0 (3,933), reachability 0 (212/212), suppressions 0 |

Defects. Its own reviewer: the review stage completed, but the chain record keeps only the first
~200 characters of the report (`# Review Report base: origin/main … plus unstaged changes…`), and
the stage's Pi session is not persisted, so what the reviewer found is not recoverable — a
defect of the workflow's record, not of the code. Gates: none failed. Against the reference: the
agent accepts `warn` only when `capability === "changed-scope-audit"`, while the reference
accepts it wherever an asserted verdict is checked (`reconcileVerdictEvidence` for every
capability); the historic tests do not exercise another capability with `warn`, so this is
narrower than the reference but not shown wrong. The error message kept the stale text
"expected asserted verdict to be pass or fail" on the audit-aware branch. The agent also folded
the duplication exit-code exception and the new warn exception into one predicate, which is a
behaviour-preserving restructure the task did not ask for.

### 3.2 `feature` — named chain `plan-and-build`

```
cd $TMPDIR/lean-eval/feature-coding   # 868279c8
cosmonauts run chain plan-and-build "<feature statement>" -d coding --profile
```

| Measure | Value |
|---|---|
| Final status | **`[chain] Failed`**, exit 1, after 2 of 7 stages; no source change |
| Wall time | 15 m 38 s (938 s); planner 12 m 41 s, plan-reviewer 2 m 56 s |
| Agent time | planner 761.6 s, plan-reviewer 176.5 s, sum 938.1 s |
| Tokens planner | 350,754 in / 21,750 out / 2,848,384 cache read (3,220,888 total), 3 turns, 103 tool calls |
| Tokens plan-reviewer | 132,473 in / 7,919 out / 1,554,176 cache read (1,694,568 total), 1 turn, 75 tool calls |
| Tokens total | 483,227 in / 29,669 out / 4,402,560 cache read (4,915,456 total), cost $4.29 |
| Stages / re-entries | 2 ran of 7 / 0 |
| Diff | none to source; untracked `missions/plans/plain-listing-pipe-defect/{plan.md,review-1.md,review-2.md,review-3.md}` |
| Acceptance | **fail** (nothing implemented). On the unchanged base the historic tests fail 4/22 (`plans/commands/list`), 5/18 (`tasks/commands/list`), 4/21 (`tasks/commands/search`), 4/12 (`shared/output`, a helper that does not exist yet); base gates typecheck 0, lint 0, test 0 (3,923), reachability 0, suppressions 0 |

What happened. The planner stage wrote the plan and then, inside its own stage, spawned
plan-reviewer twice (`review-1.md` at 00:41:36, plan revised 00:43:24, `review-2.md` at
00:45:39), although `planner.md` step 8 says that as a chain stage the runner routes it to
plan-reviewer. The chain's own plan-reviewer stage then wrote `review-3.md`; the round assessor
(`lib/plans/review-rounds.ts`, `assessPlanReviewRound`) walked the rounds and halted on round 2:
`review-2.md` has the prose line `No new findings.` under `## Findings`, and `parseFindings`
accepts only `- id:` entries or an empty section there. Error as printed:
`Plan review target for plain-listing-pipe-defect round 2 blocked: malformed-review`.

Defects. The round assessor caught a grammar violation in a review written by the planner's own
nested plan-reviewer spawn and stopped the pipeline; nothing reached task-manager, coordinator,
integration-verifier or quality-manager. This is a prompt-versus-parser contract mismatch inside
the coding domain (the plan-reviewer prompt does not say how to write "no findings" in the parsed
grammar). The three review rounds do hold 7 plan findings (`review-1.md` 4 medium + 2 low,
`review-3.md` 1 medium) spanning lifecycle, constraint ownership, behavior-spec, user experience
and quality contract; PR-004 says the line-break class must name U+2028/U+2029 and decide on
NEL, VT and FF, the gap the lean reviewer later found in code (§3.2 of the evaluation). The two
nested plan-reviewer spawns' tokens and cost are not in the planner stage's stats and appear in
no record. Not rerun: one run per task.

### 3.3 `refactor` — `refactorer -> reviewer`

```
cd $TMPDIR/lean-eval/refactor-coding   # e73e6510 + 62103cec (TASK-785)
cosmonauts run chain "refactorer -> reviewer" "Implement TASK-785 in this checkout. Read it with task_view: the description and the acceptance criteria are the whole specification. Leave your changes uncommitted in the working tree." -d coding --profile
```

| Measure | Value |
|---|---|
| Final status | `[chain] Complete`, exit 0 |
| Wall time | 11 m 59 s total (721 s); refactorer 8 m 38 s, reviewer 3 m 21 s |
| Agent time | refactorer 518.2 s, reviewer 201.2 s, sum 719.4 s |
| Tokens refactorer | 129,393 in / 13,803 out / 4,075,008 cache read (4,218,204 total), 1 turn, 90 tool calls |
| Tokens reviewer | 87,507 in / 5,128 out / 547,456 cache read (640,091 total), 1 turn, 44 tool calls |
| Tokens total | 216,900 in / 18,931 out / 4,622,464 cache read (4,858,295 total), cost $3.10 |
| Stages / re-entries | 2 / 0 |
| Diff | 6 source files +97/−226 plus 4 new helpers +84 (`lib/extensions/{recall-limit,runtime-context}.ts`, `lib/harness-adapters/{durable-file,path-containment}.ts`); 0 test files; task file claimed Done |
| Acceptance | **pass**: `fallow dupes` lists none of the 11 in-scope groups (37 groups remain, the 8 owned-path ones are exactly the out-of-scope `validate-harness-exports.ts` set); 0 test files changed; typecheck 0, lint 0, test 1 on the full run (`tests/orchestration/quality-review-run.test.ts` "uses the configured QM settle grace", a timing test unrelated to the change; 158/158 on isolated re-run), reachability 0 (207/207), suppressions 0 |

Defects. Its own reviewer: completed, report truncated to ~200 characters in the run record as in
3.1. Against the reference (`ac8dbc11`): the same decomposition — four helper modules (the reference
spread them over `lib/extensions/context-values.ts`, `lib/extensions/knowledge-surface/recall-limit.ts`,
`lib/harness-adapters/durable-file.ts` and `path-safety.ts`; coding put `recall-limit.ts` directly
in `lib/extensions/` and named the path helper `path-containment.ts`), the same six files edited,
no test changes.

## 4. Summary

| Task | Workflow | Status | Wall | Agent time | Tokens in / out / cache read | Cost | Stages ran / re-entries | Acceptance |
|---|---|---|---|---|---|---|---|---|
| fix | `worker -> reviewer` | complete | 6 m 14 s | 373 s | 170,543 / 10,550 / 2,399,616 | $1.85 | 2 / 0 | pass (34/34 historic, gates green) |
| feature | `plan-and-build` | **failed** at stage 2 of 7 | 15 m 38 s | 938 s | 483,227 / 29,669 / 4,402,560 | $4.29 | 2 / 0 | fail (no code) |
| refactor | `refactorer -> reviewer` | complete | 11 m 59 s | 719 s | 216,900 / 18,931 / 4,622,464 | $3.10 | 2 / 0 | pass (11/11 groups gone, gates green, one timing flake re-run) |

Defects caught by the coding domain's own machinery: the plan review produced 7 findings over
three rounds on the feature, one of them (PR-004) the Unicode line-terminator gap; then the round
assessor stopped the pipeline on a grammar violation in one of those reviews (a correct catch of a
self-inflicted defect that cost the run). Its reviewers' reports for `fix` and `refactor` are not recoverable from the run
records, so what they caught is unknown beyond "stage completed". Gates caught nothing in the
two completed runs. Against the references, the completed runs match the reference's shape; the
fix is narrower in scope than the reference and the refactor is equivalent.

Caveats: three tasks, one model, one run each, all on one shared loaded machine, run order
fix → feature → refactor interleaved with the lean runs and acceptance suites; the `feature`
failure may not recur on a second run; both domains' stage stats are Pi `getSessionStats()` and include any prompt-cache warming
equally (cache write is 0 in every stage, so none is visible here); the planner's two nested
plan-reviewer spawns are not in any total; reviewer reports are truncated by the run record, not by
the reviewer.
