# WP6 evaluation: the same three tasks through the lean domain, compared with coding

Wave 4 of the lean coding domain (`missions/architecture/lean-coding-domain-brief.md` §6, WP6).
Measured 2026-10-02 by coordinator `lean-coord-6`. The coding-side numbers, the task statements,
the acceptance method and the shared setup are in `missions/reviews/lean-baseline.md` (WP0) and
are not repeated here except in the comparison tables. Contract counts come from
`missions/reviews/lean-contracts.md` and its counting method, refreshed for current `main` in §5.

## 1. How the lean domain ran against the old base commits

The lean code does not exist at the three base commits. Both domains therefore run from the
worktree binary at `feature/lean-eval` `37523fc0` (local `main` `f8ac1318` plus the two W4-2
stats commits), with the task clone as cwd:

```
cd $TMPDIR/lean-eval/<task>-lean          # fresh clone at the base commit, bun install --frozen-lockfile
/Users/cosmos/Projects/cosmonauts-framework-health/bin/cosmonauts -p -d lean -a lead "<task statement>"
```

The lead runs in print mode on `openai-codex/gpt-5.6-sol`, picks the tier itself, and drives
`lean_build`; the builder works in a private clone of the task clone, the host runs its checks
there, and a `done` run applies the patch to the task clone's working tree. Run records land in
the clone under `missions/sessions/lean/runs/<id>/` (`run.json`, `stats.json`, `facts.json`,
`envelopes/`, `patches/`, `health-hook.jsonl`, `mutation/stryker.log`, `pr-body.md`) and are
copied to `.shepherd/work/in-progress/lean-coding-domain/eval/<task>-lean/`. The host checks
resolve Stryker and fallow from the cosmonauts package (the worktree's `node_modules`), since the
base commits predate the Stryker devDependency. The task clone's `.cosmonauts/config.json` at the
base lacks `contract` and `git-workflow` in the skills allowlist, so the lead cannot load the
`contract` skill there; the base config was left as it was.

Model evidence: print mode and chain spawns use in-memory Pi sessions, so no transcript exists on
either side. Pi's cost for each stage equals the token counts priced at the `gpt-5.6-sol` catalog
rates ($4 / $20 / $0.40 per million input / output / cache read) to the cent on every stage
measured (lean builder-1: $0.7217; coding worker: $1.2935); the same tokens at gpt-5.5 rates would
be $0.94 (rates $5 / $30 / $0.50), so the match is specific. gpt-5.6-sol ran in both domains.

## 2. Runs

### 2.1 `fix` — lead on the statement, tier `direct`

Run `20261002T031631-c2c7d2fe`, status **done**, exit 0, wall 12 m 40 s (760 s). The lead chose
the direct tier (no plan) and called `lean_build` within 12 s with its own 96-word paraphrase of
the 154-word statement (`request.md`; it drops the provider file path and the `docs/fallow.md`
pointer), `requiredSignals` `["verify","health"]`, lens `general`.

| Stage | Agent time | in / out / cache read | Cost | Tool calls | Note |
|---|---|---|---|---|---|
| builder-1 | 190.4 s | 63,009 / 7,314 / 808,576 | $0.72 | 31 | envelope `done`; pass 1 `verify` failed (`bun run test` exit 1) |
| builder-2 (re-entry) | 148.4 s | 38,504 / 1,363 / 180,480 | $0.25 | 13 | reason "pass 1: verify failing" — the failures were two known load-sensitive flakes outside the change (`project-tools.test.ts`, then `driver-detached.test.ts` on the retry); **builder-2's patch is byte-identical to builder-1's**, so the re-entry changed nothing; pass 2 verify 5/5 |
| reviewer | 50.6 s | 60,484 / 2,210 / 176,512 | $0.36 | 17 | 0 findings |
| total | 389.4 s agent | 161,997 / 10,887 / 1,165,568 (1,338,452) | $1.33 | 61 | `tokensUsed` 172,884 of 1,000,000 |

The rest of the 760 s is host work: two graph regenerations (missing at start, stale after
pass 1), two verify passes of the full suite, blast-radius tests, fallow health and dupes, and
the Stryker dry run. Signals in the last pass: verify pass; health 11 changed functions, 0
regressed; dupes 0 new groups; blast-radius 2 changed files, 15 dependents, 51 tests;
blast-tests 40 passed, 11 not run (test-count cap); plan-vs-actual "direct tier: no plan";
**mutation unavailable** — Stryker's initial test run failed because five fallow-provider tests
require the repository's own fallow binary and fail in Stryker's sandbox copy (they pass in the
builder clone's own `bun run test`). Since `mutation` was
not in the run's required signals, the run still ended `done`; with the default required set it
would have ended `blocked`.

Diff applied: `fallow-provider.ts` +45/−23, `tests/extensions/project-tools-fallow.test.ts`
+104/−0. Acceptance **pass**: historic test file 34/34, typecheck 0, lint 0, test 0 (3,933),
reachability 0 (212/212), suppressions 0.

Against the reference: the same narrowing as the coding run (`warn` accepted only for
`changed-scope-audit`), split into three small helpers; and the "a `fail` audit needs all three
envelopes" check was moved after the zero-change branch; a zero-change audit asserting `fail` with
null envelopes is still rejected, but by `reconcileVerdictEvidence` ("verdict fail contradicts 0
normalized findings") instead of the envelope check, so only the error text changes. The
reference did not change that order. The health hook reported `reconcileVerdictEvidence` cyclomatic 12 → 16 after
builder-1 (information, not a gate). The code reviewer found nothing.

### 2.2 `feature` — lead on the statement, tier `direct`

Run `20261002T035414-a15e8244`, status **done**, exit 0, wall 12 m 43 s (763 s). The lead chose
the direct tier again and wrote no plan, although the change touches four modules and three
documents and `lead.md` says a plan is needed when more than one module changes. Required
signals were the default `verify`, `mutation`, `health`; lens `general`. The lead again passed
`lean_build` a paraphrase (131 words for 153), which says a tab or line break "must be escaped or
otherwise normalized"; "escaped" is the lead's word, not the statement's, and escaping is where
lean's result differs from the reference.

| Stage | Agent time | in / out / cache read | Cost | Tool calls | Note |
|---|---|---|---|---|---|
| builder-1 | 234.4 s | 54,705 / 5,148 / 619,008 | $0.57 | 37 | pass 1: verify, blast-tests, mutation pass (16 killed / 0 survived / 1 no coverage); **dupes reported 1 new duplicate group** (the sanitizer copied into both renderers) as info, before the reviewer |
| reviewer | 97.6 s | 45,749 / 4,813 / 123,392 | $0.33 | 17 | **1 finding** GEN-001 medium: sanitizer duplicated in both renderers and misses VT, FF, NEL, U+2028, U+2029 |
| builder-4 (findings re-entry) | 108.3 s | 28,680 / 3,453 / 281,856 | $0.30 | 23 | moved the sanitizer to `cli/shared/output.ts`, widened it; pass 2 mutation 12 killed / 0 survived |
| reviewer-2 | 29.0 s | 41,381 / 1,219 / 69,248 | $0.22 | 7 | 0 findings |
| total | 469.3 s agent | 170,515 / 14,633 / 1,093,504 (1,278,652) | $1.41 | 84 | `tokensUsed` 185,148 of 1,000,000; 0 check re-entries, 1 findings re-entry |

Signals in the last pass: verify 5/5; health 22 changed functions, 0 regressed; dupes 0 new
groups; blast-radius 10 changed files, 23 dependents, 33 tests; blast-tests 33 passed;
plan-vs-actual "direct tier: no plan"; mutation **pass**. Stryker worked here because the CLI
tests do not need the fallow binary. The graph was regenerated three times (missing, then stale
after each builder pass), which is part of the host time.

Diff applied: 10 files, +71/−28: `ROADMAP.md` −11, `cli/shared/output.ts` +6 (`renderPlainField`),
`cli/plans/commands/list.ts` +9/−1, `cli/tasks/commands/shared.ts` +4/−2, three skill documents,
three test files. Acceptance **fail under the predeclared rule, pass against the statement**: historic
`tests/cli/plans/commands/list.test.ts` 21/22, `tests/cli/tasks/commands/list.test.ts` 17/18,
`tests/cli/tasks/commands/search.test.ts` 21/21; the one failure in each list file is the
"title with a tab or line break" case, which pins the reference's choice of replacing the
character with a space, where the agent escapes it to the two-character sequences `\t` and `\n`.
The statement required only that a row split back into exactly its columns, which both
satisfy. The historic `tests/cli/shared/output.test.ts` (8/12) pins the reference's helper name
`renderPlainRow`, so it is reported separately as planned. Gates: typecheck 0, lint 0, test 0
(3,925), reachability 0 (212/212), suppressions 0.

Against the reference: the same shape (one shared helper, tab join, both renderers, the three
documents, the ROADMAP removal, the same three test files updated), a different escaping policy,
and no change to `tests/cli/shared/output.test.ts` (the reference extended it by 30 lines; the
reviewer's finding asked for "coverage using at least one Unicode line separator", which the
re-entry put in the renderer tests instead). The code reviewer's single finding was real: the
first builder had duplicated the sanitizer in both renderers and covered only `\t`, `\r`, `\n`.

### 2.3 `refactor` — lead on the statement, tier `direct`

Run `20261002T042641-44b36864`, status **done**, exit 0, wall 27 m 01 s (1,621 s). Direct tier
again; the lead asked for `requiredSignals` `["verify","dupes","health"]` (so `mutation` was
measured but not required) and lenses `general` + `security`.

| Stage | Agent time | in / out / cache read | Cost | Tool calls | Note |
|---|---|---|---|---|---|
| builder-1 | 481.4 s | 68,498 / 10,345 / 1,449,472 | $1.06 | 47 | pass 1 **mutation fail**: 16 survivors on changed lines (265 killed, 44 by timeout; 50 survived; 30 no coverage) |
| builder-2 (check re-entry) | 364.7 s | 72,277 / 9,624 / 1,696,000 | $1.16 | 54 | reason "pass 1: mutation failing"; pass 2: 34 survivors, all on unchanged lines of changed functions (241 killed) → info |
| reviewer | 98.8 s | 77,293 / 4,970 / 416,384 | $0.58 | 33 | 0 findings (general + security) |
| total | 944.8 s agent | 218,068 / 24,939 / 3,561,856 (3,804,863) | $2.80 | 134 | `tokensUsed` 243,007; 1 check re-entry, 0 findings re-entries |

Signals in the last pass: verify 4/4; health 18 changed functions, 0 regressed; dupes 0 new
groups (10 already in the floor); blast-radius 9 changed files, 75 dependents, 141 tests
(truncated: hubs not expanded transitively); blast-tests 40 passed, 101 not run (test-count
cap); plan-vs-actual "direct tier: no plan"; mutation info as above. The graph was regenerated
three times. The host's share of the wall time is large here: two full-suite verifies, two
Stryker runs over the changed functions (345 and 304 mutants; 265 and 241 killed, 44 and 42 of
them by timeout) and
the blast-radius tests.

Diff applied: 7 files edited (+90/−190) and 2 new helpers (`lib/harness-adapters/durable-file.ts`
+36, `lib/harness-adapters/path-safety.ts` +11); 0 test files. The second builder removed its own new
`lib/extensions/tool-input.ts` and instead imported already-covered code: `architecture-memory`
now imports `getMessages`, `getSystemPrompt` and `valueFromObject` from `agent-memory/index.ts`
(newly exported) and `utf8ByteLength` from `lib/memory/injection-budget.ts`; `agent-memory` now
value-imports `normalizeLimit` from `knowledge-surface/knowledge-tools.ts`; and the new
`lib/harness-adapters/durable-file.ts` re-exports `syncDirectory` from `lib/memory/durable-files.ts`
(the two-line export outside the named files). The replacements are behaviour-equivalent, but
they add coupling between extensions and from harness-adapters into `lib/memory` where the
statement asked for the smallest identical primitive; the reviewer accepted it. Acceptance **pass**: `fallow dupes` lists none of the 11 in-scope groups (37 remain, the 8 owned-path ones are exactly the out-of-scope set); 0 test files changed; typecheck 0, lint 0, test 0 (3,475, no re-run), reachability 0 (205/205), suppressions 0.

Against the reference (`ac8dbc11`): the same two harness helpers with the reference's own file
names, and the same six files edited; but the extension-side helpers (`context-values.ts`,
`knowledge-surface/recall-limit.ts` in the reference) became cross-imports between the existing
extension files rather than new modules. The mutation signal did something: the first builder's
new helper left 16 mutants alive on changed lines, a coverage gap rather than a shown defect, and
the re-entry made it disappear by deleting the helper and importing covered code, without touching
a test. Whether coding's refactor would have shown survivors is unknown: it was never mutation-tested.

## 3. Comparison

Wall = process wall time under the 2 h cap. Agent = sum of Pi agent time over the stages that
ran (`SpawnStats.durationMs`); the rest of the wall is host work (coding: chain bookkeeping only;
lean: graph refresh, verify suites, fallow, blast-radius tests, Stryker). Tokens are
input / output / cache read. Acceptance is the coordinator's own run of the checks in §1 of
the baseline.

### 3.1 `fix`

| | coding `worker -> reviewer` | lean `lean_build` direct |
|---|---|---|
| Status | complete | done |
| Wall | 6 m 14 s | 12 m 40 s |
| Agent time | 373 s | 389 s |
| Tokens | 170,543 / 10,550 / 2,399,616 | 161,997 / 10,887 / 1,165,568 |
| Cost | $1.85 | $1.33 |
| Stages / re-entries | 2 / 0 | 3 / 1 (two flaky tests failed verify after builder-1; the re-entry patch is identical) |
| Reviewer findings | unknown (report truncated to ~200 chars) | 0 |
| Host checks | none beyond the reviewer | verify 5/5, health, dupes, blast-tests 40 pass; mutation unavailable (Stryker's sandbox fails the fallow-binary tests) |
| Acceptance | pass (34/34, gates green) | pass (34/34, gates green) |
| Versus reference | narrower (`warn` only for the audit capability); stale error text | same narrowing; moved an envelope check after the zero-change branch |

### 3.2 `feature`

| | coding `plan-and-build` | lean `lean_build` direct |
|---|---|---|
| Status | **failed** at stage 2 of 7 (plan review round 2 malformed) | done |
| Wall | 15 m 38 s | 12 m 43 s |
| Agent time | 938 s | 469 s |
| Tokens | 483,227 / 29,669 / 4,402,560 | 170,515 / 14,633 / 1,093,504 |
| Cost | $4.29 | $1.41 |
| Stages / re-entries | 2 ran of 7 / 0 (planner looped its own reviewer twice) | 4 / 1 findings re-entry |
| Reviewer findings | 3 plan-review rounds, 7 findings (lifecycle, constraint ownership, behavior-spec ×2, user experience ×2, quality contract); PR-004 names the Unicode line-terminator gap at plan time; no code review | 1 real finding (duplicated, incomplete sanitizer; the dupes signal had already flagged the duplication), fixed and re-reviewed |
| Host checks | none reached | verify 5/5, health, dupes, blast-tests 33 pass, **mutation pass** 12 killed / 0 survived |
| Acceptance | fail (no code) | **fail under the predeclared rule** (59/61 historic renderer tests: the two tab/line-break cases pin a space where lean escapes to `\t`/`\n`); meets the statement's column contract; helper named differently |
| Versus reference | nothing to compare | same shape; different escaping policy; no helper test file |

### 3.3 `refactor`

| | coding `refactorer -> reviewer` | lean `lean_build` direct |
|---|---|---|
| Status | complete | done |
| Wall | 11 m 59 s | 27 m 01 s |
| Agent time | 719 s | 945 s |
| Tokens | 216,900 / 18,931 / 4,622,464 | 218,068 / 24,939 / 3,561,856 |
| Cost | $3.10 | $2.80 |
| Stages / re-entries | 2 / 0 | 3 / 1 (mutation failed after builder-1: 16 survivors on changed lines) |
| Reviewer findings | unknown (report truncated) | 0 (general + security) |
| Host checks | none beyond the reviewer | verify 4/4, health, dupes, blast-tests 40 pass; mutation 241 killed / 34 survivors on unchanged lines (info) |
| Acceptance | pass (11/11 groups gone; one unrelated timing flake re-run green) | pass (11/11 groups gone; suite green first time) |
| Versus reference | equivalent decomposition, 4 new modules | 2 of the 4 helper modules; the other two became cross-imports between extensions and into `lib/memory` (new coupling); one 2-line export outside the named files |

### 3.4 Overall

| | coding | lean |
|---|---|---|
| Tasks accepted (predeclared rule) | 2 of 3 | 2 of 3 (the feature fails two historic assertions on escaping policy; 3 of 3 against the statement's contract) |
| Wall, all three | 33 m 53 s | 52 m 24 s |
| Agent time, all three | 2,030 s | 1,803 s |
| Tokens, all three | 870,670 / 59,150 / 11,424,640 | 550,580 / 50,459 / 5,820,928 |
| Cost, all three | $9.24 | $5.54 |
| Agent stages / re-entries | 6 / 0 | 10 / 3 |
| Defects its own machinery caught | 7 plan-review findings on the feature (incl. the line-terminator gap) and a grammar violation that stopped that pipeline; nothing recorded for fix and refactor (reports truncated) | 1 real code defect (the duplicated, incomplete sanitizer: dupes signal + reviewer, fixed by re-entry) and 1 coverage gap (16 live mutants on changed lines, closed by re-entry); the fix re-entry was triggered by flaky tests and changed nothing |
| Reviewer output kept on record | no (~200-char summary) | yes (envelope with findings) |

Costs and tokens as Pi reports them for the stages that ran; the coding feature run is
included as spent. Not in any total, on either side: the three lean `lead` sessions and the
coding planner's two nested plan-reviewer spawns, none of which left a record.

## 4. What the comparison shows, and what weakens it

**What lean lost or cannot do that coding does.** (1) No plan or spec was ever produced: the lead
chose the direct tier for all three tasks, including a feature across four modules and three
documents and a ten-file refactor, so the plan and spec tiers, the `contract` skill, the
plan-versus-actual signal with a real plan, and the plan review conversation are unmeasured.
(2) No task decomposition, no Drive records, no durable findings report of the quality-manager
kind, no specialist lenses beyond `general` and `security`, and no integration-verifier. (3) The
lead decides `requiredSignals` per call and did so differently each time (`verify,health`;
the default; `verify,dupes,health`), so whether a run can end `done` with mutation unavailable
is the lead's choice, not policy. (4) Mutation is unavailable whenever the selected tests need a
project-local binary (the fallow-provider tests), and `blast-tests` hit its test-count cap in
every run but the feature. (5) Wall time is dominated by host work: two or three graph regenerations
per run, a full verify suite per pass, and Stryker (with 40-plus timeouts per pass on the
refactor); lean took about 2× to 2.3× the wall of a completed coding run (and less than the failed
coding feature run) at a lower recorded cost and fewer cache-read tokens, though not fewer input
and output tokens on the refactor. (6) The lead paraphrases the request before passing it to
`lean_build`, dropping file paths and adding its own wording.

**What lean caught that coding did not.** One real code defect: the feature's first builder
shipped a sanitizer copied into both renderers that covered only `\t`, `\r`, `\n`; the dupes
signal flagged the copy and the reviewer the gap, and the re-entry fixed both. One coverage gap:
the refactor's first attempt left 16 live mutants on changed lines, closed by the re-entry.
Coding's plan review had named the same line-terminator gap at plan time (PR-004), but its
pipeline failed before any code existed; whether coding's completed fix and refactor carried
comparable problems is unknown, because its reviewer reports are not on record and its refactor
was never mutation-tested. The fix-lean re-entry caught nothing: two flaky tests failed, and the
same patch passed on the next pass.

**Caveats.** Three tasks, one model (`gpt-5.6-sol` on both sides, verified by price), one run
each; the coding feature failure is a single event and may not recur; run order was fixed
(coding first for each task) and the machine was shared and loaded, with acceptance suites
running between runs; both domains' stage stats are Pi `getSessionStats()` and include any prompt-cache warming
equally (cache write is 0 everywhere, so none is visible); the lean lead sessions and the
planner's nested spawns are missing from every total; the task statements were written by
the coordinator from the historic changes and name the files involved, which favours the direct
tier; the reference diffs are machine-authored commits (two of the three carry a `Claude Fable 5.1`
trailer; authorship beyond the trailers is not established), so "versus reference" compares two
machine outputs from different model families; wall times include a 2 h cap that no run
reached; both domains ran from current `main` against old base commits whose config lacks the
`contract` and `git-workflow` skills in the allowlist, so the lead could not have loaded the
`contract` skill its tier rule relies on; and the lean builder never saw the statement itself,
only the lead's paraphrase.

## 5. Contract counts, refreshed for current `main`

Method and definitions: `missions/reviews/lean-contracts.md` (measured at `793ee564`), re-applied
at `37523fc0` by a read-only subagent; full table, per-row attribution and commands in
`.shepherd/work/in-progress/lean-coding-domain/eval/contracts-refresh.md`. Every coding number is
unchanged since that document except the two skill rows that include the shared `contract` skill
(+50 words). Lean moved in eight rows (2a, 2b, 4a, 4b, 4c, 7, T, T2).

| # | Metric | lean | coding |
|---|---|---|---|
| 1 | Agents | 4 | 18 |
| 2a | Prompt words, all `prompts/*.md` | 1,148 (was 1,178) | 24,714 |
| 2b | Prompt words, build roles | 1,148 (4 roles) | 18,873 (11 roles) |
| 3b | Capability words loaded by build roles | 0 | 3,406 (8 files) |
| 4a | Skill words a build role may load, allowlisted | 5,626 per role (5 skills) | 30,398 for `skills: ["*"]` roles (27 skills); planner 12,256; plan-reviewer 8,331 |
| 4c | Skill words the prompt tells the role to load | builder 3,118; lead 254 | planner 3,711; plan-reviewer 2,012; worker 3,118; reviewer 1,280 |
| 5 | Machine-parsed output grammars an agent must emit | 1 | 5 (+1 prompt-only) |
| 6 / 6b | Protocol sections, total / per build role | 6 / 1–2 | 92 / 3–12 |
| T | Words read before working, per role (Pi) | lead 992; builder 3,852; code-reviewer 760; checker 582 | planner 8,987; plan-reviewer 7,043; task-manager 2,569; coordinator 2,284; worker 8,779 (chain) / 9,778 (Drive); integration-verifier 3,109; quality-manager 3,512; reviewer 6,061 |
| T2 | Total for one build | `lean_build` clean path 4,612; with the one remediation round 9,290 | `implement` 26,314; `plan-and-build` 51,378 |

Readings the refresh had to make: the lean `build` chain no longer exists (builds go through
`lean_build`), so T2 is given for the clean path and for the path with one findings re-entry;
the builder's fixed task text is now the context pack (101 words, plus this repository's
`AGENTS.md`, which the method excludes as project context); the reviewer prompt now takes lenses.
The feature run above used exactly the remediation path (builder, reviewer, builder, reviewer).

## 6. Recommendation (for the human)

On this evidence, lean should not yet replace coding as the default. Under the acceptance rule
set before the runs, each domain delivered two accepted changes out of three: coding lost the
feature to a grammar mismatch between its plan-reviewer prompt and its round parser, and lean's
feature met the statement's contract but not the reference's escaping policy. Lean's recorded
cost was 60% of coding's, but both totals omit unrecorded sessions (the three lean leads, the
planner's two nested reviewers), and lean's wall time was about twice coding's on the completed
tasks. Lean's host checks found and fixed one real code defect and one coverage gap; coding's plan
review found seven plan findings, one of them the same defect, before its pipeline died.

Three things the measurement did not test keep the question open: the lead chose `direct` for
every task, so the plan and spec tiers never ran (and the `contract` skill they depend on was not
in the base allowlist); the lead chose `requiredSignals` differently on each call, so a run can end
`done` with mutation unavailable at the lead's discretion; and the lead rewrites the request
before the builder sees it. What the evidence does support: lean is a credible lead for
direct-tier work on this repository, cheaper per run by recorded cost and with findings kept on
record, and its host checks are worth having. A fair course: keep coding as the default; make
lean available as the alternative lead for direct work; fix the plan-reviewer empty-findings
grammar gap (a prompt change) and rerun the coding feature once; pin `lean.requiredSignals` in
project config rather than leaving it to the lead; pass the user's request text to the builder
verbatim alongside the lead's framing; add `contract` to the allowlist and measure a lean
plan-tier run; then repeat this comparison with at least two runs per task before deciding on a
default swap.
