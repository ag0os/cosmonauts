# project-health-audit — coordinator status

Coordinator: Claude, implementing coordinator successor #3 (predecessor
`pha-implementer-2`, retired at ~45% context), briefed by Shepherd via
`.shepherd/work/in-progress/project-health-audit/brief-implementer-3.md`.
Implementation started 2026-09-28.

## Needs the user

Nothing now. Q-015 ruled (B) by Shepherd 2026-09-29 (rulings round 9, plan D-034).
At closeout: gate-owned R-013 sign-off. Earlier: Q-013 resolved the provider (Codex back, gpt-6-sol). At closeout:
gate-owned R-013 sign-off. Earlier: Q-008 ruled (a) 2026-09-28 (human, relayed; plan D-022, spec Q-008,
rulings file round 3). Earlier rulings: Q-001..003 in `spec.md`; Q-004..007 in
`plan.md` D-010/D-012/D-013/D-017.

## Done

- **Slice 17 / TASK-787 Done** (2026-09-29 04:57Z, attempt 1 on gpt-6-sol, 13 min):
  Drive commit `86b44e34`, state `3933993f`. Two new test files (5 cases) + a full
  AST return/throw inventory with probe hit counts for the eight stage-13
  functions (one dead-by-construction throw left, `retirement-store.ts:599`);
  freeze clean from `S = 91524cd4`; five gates passed. `C` for TASK-780.
- **Slice 16 / TASK-778 Done** (2026-09-29 04:43Z, attempt 2 on gpt-6-sol, 17 min):
  Drive commit `87a9dbc3`, state `3a0c568c`. Two owned sources only; freeze clean
  from `S = 3afd9873` and `C = 9e6ebf4b`; five gates passed; four criticals
  absent, three surviving rows metric-identical at `C`; exporter family gone.
- **Slice 15 / TASK-786 Done** (2026-09-29 04:25Z, attempt 1 on gpt-6-sol, 15 min):
  Drive commit `9e6ebf4b`, state `4de8fd23`. Exactly one new test file (8 cases);
  the worker's sweep probe shows all former zero-hit exporter sites reached;
  freeze clean from `S = dddb0c64`; five gates passed. `C` for TASK-778's
  `runHarnessSync`/`enhancedRows`.
- **Slice 14 / TASK-776 Done** (2026-09-29 03:46Z, attempt 3 on gpt-6-sol, 47 min):
  Drive commit `479c2fa0`, state `795c2f50`. Nine owned sources + the stale
  `runDrive` registry row removed (gate-owned, R-013); freeze clean from `S =
  4e9d0d56` and `C = ef098dae`; five gates passed; all ten criticals absent, 19
  surviving rows metric-identical at `C`; no owned dupes group. Attempt 2 was a
  false reachability block (D-031). Coordinator error on record: the attempt-2
  note restore truncated the AC block (repaired in the verdict commit).
- **Slice 13 / TASK-785 Done** (2026-09-29 02:34Z, attempt 1 on gpt-6-sol, 7 min):
  Drive commit `ef098dae`, state `fde3888b`. Exactly one new test file (2 cases,
  both non-vacuity-probed); freeze clean from `S = 5251a314`; five gates passed.
  `ef098dae` is `C` for TASK-776's scheduler mapping.
- **Slice 1 / TASK-768 Done** (2026-09-28 17:06Z): Drive commit `8b366a0`, state
  commit `8a768c7`, record-only commit follows. Freeze check clean (two declared
  test edits, two new test files). Five postflight gates passed in the event log.
  Launch path trial passed (INV-003 tools used, commit parent as expected,
  postflight ran). Lessons: Drive clobbers worker notes on block
  (`run-one-task.ts:800`); Drive retries the worker in-run after a postflight
  failure; `run-step.test.ts` episode-capture flake under full-suite load.
  Four worker attempts were needed (unchecked ACs; Biome vs canonical JSON,
  D-021; flake).
- **Slice 2 / TASK-769 Done** (17:36Z): Drive commit `d17a497`, state `df9d39e8`.
  Two new characterization files (27 cases), nothing else changed; freeze
  clean; five gates passed. Attempt 1 blocked on unchecked ACs (prompt-template
  gap, observation 1).
- **Slice 3 / TASK-770 Done** (18:40Z): Drive commit `1fa3678`, state `457ecf3`.
  Freeze diff from `C = d17a497`: exactly the Q-008 (a) hash literal. Five gates
  passed. Diagnostic duplication 85 → 48 groups. Three attempts: Q-008 hard
  stop (ruled (a)), then the `warn` audit self-block (D-023).
- **Slice 4 / TASK-771 Done** (18:54Z, first attempt): Drive commit `ac8dbc1`,
  state `c359aa6`. No test changes; four new helper modules; five gates passed;
  task-close audit `pass`.
- **Slice 5 / TASK-772 Done** (19:24Z, first attempt): Drive commit `3346fa9`,
  state `f53b552`. No test changes; living-memory.ts hunks outside the critical
  functions; both three-file baseline reasons recorded; five gates passed.
  Health record files untouched since stage 1 — dispositions live in task
  notes and are folded into the record at stage 16 (Design §1 / D-015).
- **Slice 6 / TASK-773 Done** (19:54Z): Drive commit `48ecb5c`, state `65762d3`.
  Two new characterization files, nothing else; five gates passed after one
  in-run retry (quality-review settle-grace timing flake, passes in isolation).
  Attempt 1 stopped on export-only symbol traces → D-024.
- **Slice 12 / TASK-779 Done** (2026-09-29 00:57Z, attempt 1 on claude-cli/sonnet,
  launched by Shepherd): Drive commit `3cb2d2c3`, state `d59797e8`. Exactly five
  new test files (125 cases, non-vacuity probes recorded); freeze clean from
  `S = 2956e471`; five gates passed; no production or `missions/reviews/` paths.
- **Slice 10 / TASK-777 Done** (2026-09-29 00:45Z, attempt 1 on claude-cli/sonnet,
  launched by Shepherd): Drive commit `203de10c`, state `76dfe503`. Exactly two
  new test files (52 cases); freeze clean from `S = e7843a47`; five gates
  passed; no production or `missions/reviews/` paths. Worker recorded Q-002
  residual-risk variants (unreachable through entry points) for stage 11.
- **Slice 8 / TASK-775 Done** (2026-09-29 00:33Z, attempt 2 on claude-cli/sonnet,
  launched by Shepherd): Drive commit `7390f105`, state `6905a633`. Exactly
  seven new test files; freeze clean from `S = 0292eaa0`; five gates passed;
  claude-cli trial checks passed (parent, postflight events, no
  `missions/reviews/`). Surface record added by the coordinator (D-028).
  Attempt 1 (`run-76487eb0`) was green but aborted on the env leak (obs. 16).
- **Slice 7 / TASK-774 Done** (2026-09-29 00:00Z, attempt 3 on DeepSeek):
  Drive commit `1692b9b6`, state `edb19337`. Freeze from `S = e97cee90` clean;
  from `C = 48ecb5c5` only the two coordinator-ruled test edits (Q-009, Q-011).
  Five gates passed. All seven criticals gone; every new helper below
  threshold; the 28 remaining rows in the three files are pre-existing and
  metric-identical at `C` (not this task's helpers; dispositioned in notes).
  Worker quirks: quoted title renamed the task file (restored); it
  `git checkout --`'d the validation script and redid attempt 2's work.
- **Q-010 + Q-009 applied** (successor #2, 20:12Z): model repins (D-025) and
  the two source-hash pins removed from `tests/memory/interface.test.ts`
  (D-026; TASK-770 addendum). No test pinned the agent defaults;
  `tests/{agents,domains,main,cli,bundled}` and the memory interface suite green.
- Branch `feature/project-health-audit` off local `main` `64dca3c`; roadmap
  item removed; plan + spec created; Intent ratified.
- `/spec-to-backlog` complete: planner→plan-reviewer chain (review-1, review-2,
  planner did not revise); coordinator four-lens plan review (24 verified
  findings); synthesis `review-3.md`; plan revised (D-011..D-017); round-2
  rulings; task-manager chain (16 tasks); coverage matrix; coordinator
  three-lens task compliance review (18 verified findings); plan amended
  (D-018) and tasks patched; Stage 15 split into TASK-782 (15a) and TASK-784
  (15b). `cosmonauts plan check-artifacts project-health-audit` passes.
- Backlog: TASK-768..784, 17 tasks, all `To Do`, DAG mirrors the plan's
  Implementation Order (768 → 769 → 770; 771 ← 768; 772 ← 770,771; 773/775/
  777/779 ← 772; 774/776/778/780 ← their characterization task; 781 ← 780;
  782 ← 781,774,776,778,780; 784 ← 782; 783 ← 784).

## Running

**TASK-780 attempt 4** (seven functions after D-034; resumes from the preserved
worktree) on the Pi worker. Then 781 (now depends on 779) → 782 (+ the deferred
function) → 784 → 783.

## Improvement observations (for the Phase-4 pass; keep adding)

1. `lib/driver/prompt-template.ts:136-158`: the "mark each acceptance criterion
   before reporting" block is injected only for external backends; the
   `cosmonauts-subagent` worker never sees it and Drive then blocks every task
   with unchecked ACs (TASK-768 attempt 1, TASK-769 attempt 1). Workaround:
   standing note in every task's Implementation Notes.
2. `lib/driver/run-one-task.ts:800`: on `task_blocked` Drive sets
   `implementationNotes` to the block reason, destroying the worker's notes.
   Durable copy survives only in the run's `prompts/TASK-NNN.md` (from the
   next run's prompt render) or the worker transcript.
3. Drive retries the worker in-run after a postflight failure without an
   event that names the retry (only a second `spawn_started`), and the retry
   worker starts with the block reason as its notes.
4. `bun run lint` includes untracked, `info/exclude`-ignored paths (Biome does
   not read `.git/info/exclude`) and formats machine-canonical JSON under
   `missions/reviews/`; D-019/D-021 config exclusions were needed.
5. `tests/driver/run-step.test.ts` episode-capture flake under full-suite load
   (`episode_capture_failed` diagnostic); passes in isolation.
6. `run_driver` result does not expose `eventLogPath` (cosmo reported "not
   exposed by the tool response").
7. `fallow-provider.ts` `auditFindings` accepts only `pass`/`fail`, but Fallow's
   documented audit verdicts are pass/warn/fail; a `warn` audit surfaces as
   `invalid-output` and the worker protocol then self-blocks (D-023). Gate-owned;
   human sign-off item (R-013) with a Q-006-shaped narrow fix recommended.
8. Symbol `analysis_trace` cannot resolve non-exported functions (Fallow
   `dead-code --trace` is export-based, exit 2); the plan's overview sentence
   generalized D-013 to "any finding", which stopped slice 6 (D-024). The
   surface complexity output also overflows the tool result; no path scope.
9. The Pi `task_edit` tool has only replace-mode `implementationNotes`; workers
   cannot append, so each attempt overwrites the task notes. Coordinator
   re-merges from the committed task file at verdict time.
10. Second suite flake: `tests/orchestration/quality-review-run.test.ts`
   "uses the configured QM settle grace" (20 ms grace) under full-suite load.
11. Each `analysis_complexity` surface result is ~100 KB (all 219 findings, no
   path scope); three in one turn overflow the worker's context and Pi's
   compaction summary sends it back to the same step → infinite loop
   (TASK-774 attempt 1, 21 compactions in 30 min). The surface needs a path
   or file scope, or a compact rendering.
13. Pi `task_edit` accepts a `title` with literal surrounding quotes; the
   DeepSeek worker sent `'Stage 7: …'` and Drive's state commit then wrote
   the task under a new quoted filename, leaving the canonical path deleted
   in the worktree. Title edits from workers should be rejected or normalized.
14. A weaker worker model ran `git checkout -- <owned file>` mid-attempt and
   silently discarded the previous attempt's uncommitted refactor of that
   file (it redid the work). Uncommitted carry-over between attempts is
   fragile; consider a WIP commit or a warning in the worker prompt.
15. The coordinator session's Claude Code auto-mode classifier denies
   launching the `claude-cli` backend ("Create Unsafe Agents": the backend
   spawns `claude --dangerously-skip-permissions -p`). Workaround: Shepherd
   launches from its own pane (`launch-next.sh`); the coordinator only watches.
16. `COSMONAUTS_DRIVER_CLAUDE_ARGS` set for the launcher is inherited by the
   driver's postflight `bun run test`; `tests/cli/drive/run.test.ts` reads the
   real env and two cases fail ("parses run arguments…", "does not parse stale
   Codex env when running claude-cli"), so the first claude-cli run
   (`run-76487eb0`) aborted on a green worker. Pin the model with
   `ANTHROPIC_MODEL` instead, or make postflight scrub driver env vars.
17. `run_driver` rejects `claude-cli` in inline mode ("Unsupported driver
   backend in inline mode: claude-cli", `run-ede163bf`) although the tool's
   schema text only says external backends are "for detached runs"; the
   coordinator's assessment that inline works was wrong. External backends
   are detached-only.
18. `launch-next.sh`'s first version left `$TASK` unexpanded inside the
   `bash -c` single-quoted string ("Task not found: ", `run-2ab8e9d5`,
   aborted, empty). Shepherd fixed both; stale runs are aborted records only.
19. `lib/driver/report-parser.ts:5` accepts only `outcome: success|failure|
   partial|completed`; the worker protocol tells workers to stop `blocked`,
   and a final `outcome: blocked` line parses as `unknown` → `task_blocked`
   "report outcome unknown" + `run_aborted`, and the worker's notes are
   overwritten (obs. 2) even though it wrote a full blocker record
   (TASK-776 attempt 1, `run-6fe911a5`). Add `blocked` to the parser or map
   unknown-with-raw to the raw text in the notes.
20. Workers enumerate return-site reachability by grepping test fixtures
   (TASK-776 attempts 1 and 2); attempt 2's block was false (D-031). The worker
   protocol should require an execution probe (or a trustworthy coverage
   report) before a `blocked` stop on reachability; vitest v8 line coverage for
   `scheduler.ts` had duplicated function-map entries, so it cannot be the
   standard either.
21. The coordinator's TASK-778 attempt-1 note predated D-031 rule 5, so the
   worker again reasoned from fixture greps; this time the claim was true.
   Every pre-launch note now carries rule 5. Each coordinator probe costs one
   full-suite run (~2.5 min); a worker-side probe helper would remove the
   round trip.
22. Coordinator error: a record-only commit made while a run was live
   (TASK-781 note during TASK-780 attempt 2) moved HEAD past the worker's
   recorded `S`; the worker correctly stopped `partial` (4 min lost). Rule: the
   coordinator commits nothing between `run_started` and the terminal event.
23. Drive runs postflight and its in-run retry even when the worker reported
   `task_blocked` (TASK-780 attempt 3): the retry worker started from the block
   reason as its notes, re-derived the same human question in 4 minutes and
   stopped. A `blocked` report should end the run without postflight or retry.
12. Launching Drive through a print-mode cosmo session works but the launcher
   must be detached from the coordinator's tool timeout (`nohup … & disown`);
   killing it mid-run leaves a stale `running` record and an In-Progress task.

## Blocked

Nothing. Q-015 ruled (B). Earlier waits (778/786, 780/787) resolved. Both blocks were probe-confirmed unreached return sites, routed as characterization
tasks with a full return-site sweep. History: TASK-776 attempt 1 (`run-6fe911a5`, 02:21Z) stopped
`blocked` on the two unreached `runDurableGraphScheduler` return sites
(`scheduler.ts:215-224`, `:40-42`); resolved by Q-014 / D-030 = TASK-785.
Earlier provider blocks (Codex cap, claude.ai OAuth) resolved by Q-011/Q-013.

## Spend guard (Q-011; RETIRED by Q-013 / D-029 — table kept as record)

| when | total_credits | total_usage | remaining |
|---|---|---|---|
| 2026-09-28 20:20Z, before slice 7 attempt 3 | 10 | 1.9529 | 8.05 |
| 2026-09-29 00:05Z, after slice 7 (cost 2.99) | 10 | 4.9432 | 5.06 |
| 2026-09-29 00:45Z, after slice 8 (launchers + surface record on flash, 0.29) | 10 | 5.2292 | 4.77 |
| 2026-09-29 00:50Z, after slice 10 (launcher, 0.08; surface record follows) | 10 | 5.3114 | 4.69 |
| 2026-09-29 01:00Z, after slice 12 (launcher + two surface records, 0.17) | 10 | 5.4777 | 4.52 |

- History (predecessor): **Codex usage limit reached (20:45Z).** The print-mode cosmo launcher and the
  `coding/worker` role both pin `openai-codex/gpt-5.6-sol`; the relaunch of
  TASK-774 attempt 3 exited with `Codex error: The usage limit has been reached`
  before any run started. Worktree holds attempt 2's refactor (three owned
  files, uncommitted; typecheck green, lint = formatting only, one owned
  function still critical). No run is live; `driver.lock` is stale (dead pid).
  A direct `codex exec` probe says: "You hit your spend cap set by the owner
  of your workspace" — a workspace spend cap, not a rolling window, so it
  does not reset on its own. Options for the human: raise the cap, or switch
  the `coding/worker` and `main/cosmo` model pins (`bundled/coding/agents/worker.ts:13`,
  `domains/main/agents/cosmo.ts:8`, both `openai-codex/gpt-5.6-sol`; auth
  exists for `anthropic` and `openrouter`; Q-007 (a) only *prefers* GPT; no
  per-run model override exists in `run_driver` or the subagent backend).
  Phase 3 (`codex exec` review) is blocked by the same cap.

- History: slice 3 / TASK-770 attempt 1 (run `run-d744cc20`) blocked on Q-008. Worker
  evidence restored into the task notes. Worktree holds its partial extraction
  (diagnostic went 85 → 48 groups with retrieval.ts included; retrieval.ts
  restored). Resume: relaunch TASK-770 after the ruling; the worker re-applies
  the retrieval extraction (a) or records the baseline (b), records D-015
  against `C = d17a497`, ticks ACs.

## HEAD

`feature/project-health-audit`, record-only commit after slice 13 (see `git log`),
off local `main` `64dca3c`. 14 of 20 tasks Done; worktree dirty (TASK-780 partial).
Needs the user: nothing now; gate-owned R-013 sign-off at closeout.

## Successor handoff — continue implementation (refreshed by successor #2, 2026-09-29 02:15Z, after Q-013)

State: `feature/project-health-audit`; rulings Q-001..Q-014 in
`.shepherd/work/in-progress/project-health-audit/rulings-2026-09-28.md`, plan
D-001..D-030. Pins: worker and cosmo `openai-codex/gpt-6-sol` (D-029). 14 of 20
tasks Done (768-779, 785-787).

Remaining order: 780 attempt 2 (refactor, ready) → 781
(characterization, after 780; Pi worker, no claude-cli needed) → 782 (15a) →
784 (15b) → 783 (16 closeout, D-018 (4)) → `/implement-plan` Phases 2-4:
gates, QM (commit first, reconcile against local `main`, gate-owned files →
"pending sign-off"), `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only < /dev/null`
framed as correctness/liveness, Claude-subagent reviewer, Kimi channel via
Shepherd, improvement pass from the observations below, final report. No
push/merge/PR.

Per slice (Pi worker path, proven in slices 1-7):
1. Clean tree at a record-only commit. Append a coordinator note to the task
   with: model, `C` (its characterization task's Drive commit), the D-024
   one-metric-per-turn rule, return-site enumeration before edit, "never git
   checkout/stash/reset", "never pass `title` to task_edit", helper ceiling
   (new helpers only; pre-existing untouched rows out of scope, slice-7
   precedent), Q-002 hard stop. Commit it (explicit paths). That commit is `S`.
2. Launch detached with the `nohup … cosmonauts -p -a cosmo "Call run_driver …
   backend 'cosmonauts-subagent', mode 'inline' …"` line in the previous
   handoff (step 1 there); runId/pid in `driver.lock`.
3. On `run_completed`: `freeze-check.sh <S> <driveCommit>` (recreate: parent,
   `git diff --name-status --diff-filter=MDR`, porcelain, skip/only/todo grep,
   non-test path list) plus the same from `C`; confirm five `verify passed`
   events; `bunx fallow health --complexity --format json --quiet --no-cache`
   filtered to the owned files at the Drive commit and (via a throwaway
   `git worktree add --detach <dir> <C>`) at `C`; confirm the owned criticals
   are absent and every remaining row existed at `C` with equal metrics.
   Append `### Coordinator D-015 verdict`, set Done if the worker did not,
   update this file, commit record files with explicit paths. Check the task
   file path: a quoted title from the worker renames it (obs. 13).
4. On `task_blocked`: recover notes from the newest
   `missions/sessions/project-health-audit/worker-*.jsonl`, write them back,
   add a `### Coordinator note before attempt N`, `--status todo`, relaunch.
5. Characterization slice 781: same path, `C` not applicable, expect new test
   files only.

## Previous handoff — continue implementation (pha-implementer; steps 1-5 still accurate)

The loop that has closed slices 1-5 (repeat per ready task, one slice per run,
dependency order from `cosmonauts task list --label plan:project-health-audit --ready`):

1. Worktree must be clean and HEAD = last record-only commit. Launch detached
   (never inside a tool timeout; macOS has no `setsid`):
   `nohup bash -c 'cosmonauts -p -a cosmo "Call run_driver with planSlug '"'"'project-health-audit'"'"', taskIds ['"'"'TASK-NNN'"'"'], backend '"'"'cosmonauts-subagent'"'"', mode '"'"'inline'"'"', branch '"'"'feature/project-health-audit'"'"', commitPolicy '"'"'driver-commits'"'"', postflightCommands ['"'"'bun run test'"'"','"'"'bun run lint'"'"','"'"'bun run typecheck'"'"','"'"'bun run check:reachability'"'"','"'"'bun run check:suppressions -- --base main'"'"'], taskTimeoutMs 5400000. Then call run_status until terminal and report the runId, eventLogPath, and final status. Do nothing else."' > <log> 2>&1 < /dev/null & disown`
   The runId/pid land in `missions/sessions/project-health-audit/driver.lock`;
   events in `missions/sessions/project-health-audit/runs/<runId>/events.jsonl`.
   Poll the events file every 30 s for `task_done|task_blocked|run_completed|run_aborted`
   and the pid with `kill -0`.
2. On `run_completed`: freeze check with base `S` (= the record-only commit the
   slice started from; for refactor slices also `C` = the characterization
   task's Drive commit): `git diff --name-status --diff-filter=MDR <base> <driveCommit> -- tests/`,
   `git status --porcelain -- tests/`, `git diff -U0 <base> <driveCommit> -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`;
   confirm the Drive commit's parent; confirm five `verify` `passed` events;
   confirm `analysis_*` tool use in the events; for refactor slices confirm no
   hunk lands inside an uncharacterized critical function. Append a
   `### Coordinator D-015 verdict` section to the task notes
   (`cosmonauts task edit TASK-NNN --append-notes`), update this file, commit
   with explicit paths (`missions/plans/project-health-audit/coordinator-status.md`
   plus the task file(s)); never `git add -A`.
3. On `task_blocked`: Drive has overwritten the task notes with its reason.
   Recover the worker's notes/report from the newest
   `missions/sessions/project-health-audit/worker-*.jsonl` (`task_edit`
   `implementationNotes` arguments and the last assistant text), write them
   back with `--notes`, append a `### Coordinator note before attempt N`
   telling the worker what remains, set `--status todo`, relaunch. Known
   block causes so far: unchecked ACs (standing note now on every task),
   a Q-002 hard stop (escalate to Shepherd), the `warn` audit self-block
   (D-023; addendum on every task), a postflight flake (`run-step.test.ts`;
   rerun the suite yourself before believing it).
4. Escalate only: Q-002 hard stop, refactor blocked on a seam, `escalated`
   dead-code row, unextractable clone family, undeclared `tests/` change,
   broken launch path.
5. After TASK-783: `/implement-plan` Phases 2-4 (gates, QM with commit-first and
   local-`main` reconciliation, `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox read-only < /dev/null`
   framed as correctness/liveness, improvement pass using the observations
   below, final report). No push/merge/PR. Closeout human items: gate-owned
   files (R-013) incl. the `fallow-provider.ts` `warn` verdict gap (D-023).

Scratch helpers (session-local, recreate if missing): `freeze-check.sh <base> <commit>`
prints steps 2's commands plus the non-test path list.

### Original handoff (pha-coordinator → implementer), superseded where the above differs

### Successor handoff — implement (original)

Start with `/implement-plan project-health-audit`, but the procedure's Phase 1
launch line does not apply: human ruling Q-007 (a) requires the
`cosmonauts-subagent` inline backend, and the `cosmonauts run drive` CLI
passes no postflight commands (only the Pi-side `run_driver` tool takes
them; see `cli/drive/subcommand.ts` around line 1100). Launch each slice
through a Pi session instead:

1. Precondition: `analysis_status` from the execution root must show Fallow
   bound with consent (`~/.cosmonauts/analysis-execution-consent.json` already
   lists this project path). TASK-768 AC #4 owns this.
2. One slice per run, in dependency order (`cosmonauts task list --label
   plan:project-health-audit --ready`). For each ready task, run in the
   background with stderr to a log, from the repo root:
   `cosmonauts -p -a cosmo "Call run_driver with planSlug 'project-health-audit', taskIds ['TASK-7NN'], backend 'cosmonauts-subagent', mode 'inline', branch 'feature/project-health-audit', commitPolicy 'driver-commits', postflightCommands ['bun run test','bun run lint','bun run typecheck','bun run check:reachability','bun run check:suppressions -- --base main'], taskTimeoutMs 5400000. Then call run_status until terminal and report the runId, eventLogPath, and final status. Do nothing else."`
   `cosmo` and the `worker` role both default to `openai-codex/gpt-5.6-sol`
   (Q-007 GPT preference satisfied; no Opus stall risk). Monitor
   `missions/sessions/project-health-audit/runs/<runId>/events.jsonl`.
3. Between slices (D-015/D-018): confirm the Drive commit's parent is the
   slice-start commit; re-run the freeze commands from that base to the Drive
   commit (`git diff --name-status --diff-filter=MDR <base> <commit> -- tests/`
   and the skip/only/todo grep); record output + SHAs in the task's
   `## Implementation Notes`; review TASK-768's two pre-declared test edits
   (AC #8) and any pre-declared mechanical rename; then make the record-only
   commit of `missions/reviews/project-health-audit.{md,json}` and the task
   notes with explicit paths. Never `git add -A`. Anything undeclared under
   `tests/` → leave the task `blocked`, escalate to Shepherd.
4. Escalate to Shepherd (human) only: a Q-002 hard stop (test expectation
   change), a refactor task that stops `blocked` needing a seam, an
   `escalated` dead-code row (D-013), a clone family that cannot be extracted
   without violating an invariant (R-006), or QM gate-owned sign-off at the
   end (R-013: `fallow-provider.ts`, `.fallow-baselines/*`, suppression
   registry are gate-owned; QM cannot return `ready`, report "pending
   sign-off").
5. Stage 16 closeout shape is D-018 (4): Drive's TASK-783 commit carries the
   floors + `docs/fallow-exceptions.md`; the coordinator's record-only commit
   carries the two record files; diff from `analyzedCommit` to tip = exactly
   seven paths. Record the closeout SHAs and the `main`-based changed-scope
   audit in TASK-783 notes.
6. Then `/implement-plan` Phases 2–4 as written: ground-truth gates, Quality
   Manager (commit first; reconcile against local `main`; expect gate-owned
   human items), `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox read-only < /dev/null`
   framed as correctness/liveness, improvement pass, report. No push, merge,
   or PR.

Known facts the successor should not rediscover: the duplication capability
fails with `invalid-output` until TASK-768's `reconcileVerdictEvidence` fix
lands (exit 0 with findings); `TaskManager.getTaskDependencyStatusSnapshot`
is a provider false positive (live call `lib/driver/drive-graph-runner.ts:593`);
Fallow `static_estimated` coverage caps private helpers at cyclomatic 9
(partial) / 4 (none) via CRAP 30 (plan Design §4); Drive commits exclude
`missions/**`; `check:reachability` is not a configured qualityReview check
so it must be in postflight explicitly.

### Ruled 2026-09-28, round 2

Q-004 (a) analyzed-source-commit + artifact-only closeout; Q-005 (a) class
member `false-positive` with reference; Q-006 (a) narrow duplication
reconciliation fix in stage 1; Q-007 (a) `cosmonauts-subagent` inline, GPT
worker. Coordinator-derived decisions stand.

### Ruled 2026-09-28, round 1

Q-001 Intent ratified; Q-002 (a) refactor with best characterization, hard
stop on expectation change; Q-003 confirmed (41 one-/two-file families
extracted, two three-file families baselined).
