# driver-hardening — coordinator status

Worktree `/Users/cosmos/Projects/cosmonauts-framework-health`, branch
`feature/driver-hardening` off `main` `2134cbc3`. Brief:
`.shepherd/work/in-progress/driver-hardening/brief-coordinator.md` (main
checkout). Human ruling 2026-09-29 (typed to Shepherd, relayed): "keep
improving the base system before major features"; order driver-hardening →
suite-reliability → execution-liveness resumes.

## Done

- 2026-09-29: step 1 of the brief. Evidence read (improvement review, the
  archived coordinator observations 1-25, D-031/D-033/D-035, `lib/driver/*`,
  the tasks and project-tools extensions, the Fallow adapter and CLI help).
  Plan `missions/plans/driver-hardening/` created via `cosmonauts plan create`
  with `spec.md` (Purpose evidence table, Intent INV-001..006 with ranking,
  AC-001..020, Scope, Assumptions). Roadmap item removed per the roadmap
  skill. `plan.md` is a placeholder body until `/spec-to-backlog`.

## Running

`/implement-plan driver-hardening` (implementing coordinator, started 2026-09-29 from Shepherd's `brief-implementer.md`). Slice log below under `## Implementation log`.

## Implementation log (implementing coordinator, 2026-09-29)

- **Launch binary (derived, coordinator).** The global `cosmonauts` on PATH is `~/.bun/bin/cosmonauts -> ~/.bun/install/global/node_modules/cosmonauts`, which resolves to the **main checkout** `/Users/cosmos/Projects/cosmonauts/bin/cosmonauts`. An inline `run_driver` launched through it would load the main checkout's Drive and `task_edit`, not this branch's. Every slice is therefore launched through this worktree's own `bin/cosmonauts` (absolute path), so the host runs the source being changed and the D-028 restart after slice 4 picks up the fixed Drive. Launch/poll helpers live in the session scratchpad (`launch.sh TASK-NNN`, `poll.sh`).
- Baseline at `0f1ebf70`: typecheck green, lint green (644 files), full suite 3933/3933 in 288 files (exit 0).

- **Slice 1 / TASK-790 — DONE** (run `run-d89a6674`, 2026-09-29 17:04–17:21Z, one attempt, worker `success`). Drive commit `d1e53585` (parent `4bbe5f40` = slice start). Five `verify` `passed`. `tests/`: one new file (`tests/tasks/task-note-preservation.test.ts`, 6 cases incl. separate-process concurrent appends) + purely additive cases in `tests/cli/tasks/commands/edit.test.ts` and `tests/extensions/task-tools.test.ts`; no expectation changes, no `.skip/.only/.todo`. Task path canonical, all 7 ACs checked, D-030 red/green row and D-026 hand-off (per-task `task-update-<ID>.lock`, 10 s bound, outside the episode lock) recorded in the task notes. **Boundary artifact:** Drive's `git add --all .` swept the untracked `PI-UPGRADE-STATUS.md` into `d1e53585`; un-tracked again (`git rm --cached`) in the record commit that follows, file left on disk. Improvement-pass candidate: Drive stages every untracked file outside `missions/`/`memory/`.
- **Slice 2 / TASK-791 — DONE** (run `run-dca91814`, 2026-09-29 17:22–17:38Z, one attempt, worker `success`). Drive commit `10664396` (parent `0e2fe9f9` = slice start). Five `verify` `passed`. `tests/`: additive cases in four driver/extension suites; six pre-existing expectations that pinned the note-replacement defect changed, each with an inline `AC-020` comment (finalization-failure, unknown-reason, post-verify-failed, and `verify failed` note assertions now assert the worker note plus the `### Drive — outcome … — attempt … — run …` record; finalizer update is status-only `{ status: "Blocked" }`). No `.skip/.only/.todo`, no `lib/durable-runtime/`, no config files. All 7 ACs checked; D-030 row (RED `preserves worker notes and records unknown output before inferred success` at `0e2fe9f9`, GREEN same test, mutation-checked). Cosmo's final text: "Event log path: not returned" — the AC-016 defect, expected until slice 11.
- **Slice 3 / TASK-792 — DONE** (run `run-f2157a66`, 2026-09-29 17:41–17:55Z, one attempt, worker `success`). Drive commit `aa74f856` (parent `b60570df` = slice start). Five `verify` `passed`. `tests/`: additive only across five driver suites, zero removed/changed expectations, no `.skip/.only/.todo`, no `lib/durable-runtime/`, no config. All 9 ACs checked; D-030 rows for three tests (blocked fenced parse, blocked-before-postflight on the legacy path under three commit policies, blocked human stop rendered for `cosmonauts-subagent`), mutation-checked. From this slice on, a Drive block preserves worker notes (rule 1 of the handoff retires; each run is a fresh print-mode host so the fix is live for slice 4's run).
- **Slice 4 / TASK-793 — DONE** (run `run-8b24ed33`, 2026-09-29 17:55–18:08Z, one attempt, worker `success`). Drive commit `b2752b04` (parent `f0a7d37c` = slice start); Drive state commit `29d180f8`. Five `verify` `passed`. `tests/`: additive across six driver suites; the only deleted lines are a call-site reshape in `contradicted-block-retry.test.ts` (no expectation removed); no `.skip/.only/.todo`, no `lib/durable-runtime/`, no config. All 7 ACs checked; D-030 row (RED `retries a graph task once` at `f0a7d37c`: no `task_retry` before re-spawn; GREEN same test, 3964 suite).
- **D-028 checkpoint (before slice 5).** Every run is its own `cosmonauts -p` host, so the restart is the next launch: slice-4 host pid 50144 exited ~18:08:30Z; `bin/cosmonauts-drive-step` absent; recorded in TASK-794's notes with HEAD. Slice 5's run `startedAt` is the fresh-session time (filled in below after the run).
- **Slice 5 / TASK-794 — DONE** (run `run-1de7983c`, fresh host `startedAt` 2026-09-29T18:09:36.345Z, ended 18:21Z, one attempt, worker `success`). Drive commit `08ff87f9` (parent `dedc033d` = slice start). Five `verify` `passed`. Change set: `lib/driver/prompt-template.ts` + its test only. One pre-existing expectation changed — `omits the CLI completion protocol for internal subagent workers` pinned the missing in-process protocol; replaced with the `task_edit`/`checkAc` instruction test, inline `AC-007` citation (AC-020 satisfied). All 7 ACs checked; D-030 RED/GREEN rows recorded, mutation-checked. The all-backend completion protocol is now live in the host; the standing AC-marking note (tasks 1-5) retires. **Flake candidate for `suite-reliability`:** worker saw one failure of `tests/driver/driver-detached.test.ts` `startDetached > escalates an ignored SIGTERM to SIGKILL …` ("Detached driver start aborted" instead of resolving) with no detached code changed; passed on rerun (3968/3968).
- **Slice 6 / TASK-795 — DONE** (run `run-01ddb18c`, 2026-09-29 18:22–18:35Z, one attempt, worker `success`). Drive commit `ac4c10f6` (parent `1940bdbb` = slice start). Five `verify` `passed`. Change set: Fallow adapter, three analysis docs, analysis + drive skills, two test files. One pre-existing expectation changed — the complexity binding's advertised `scopes: ["project"]` now includes `paths`, inline `AC-008` citation (the defect pinned). No `.skip/.only/.todo`, no `lib/durable-runtime/`, no config. All 7 ACs checked; D-030 RED/GREEN rows for B-005 and B-007 (RED failure: `FallowBindingUnavailableError` because the `paths` scope was not advertised), mutation-checked by bypassing the filter.

## Blocked

Nothing.

## Needs the user

Nothing. H-001 ruled (a),(a) and applied (spec AC-012 amended on record; plan D-019). D-020 reviewed and stands.

## Backlog (TASK-790..802, all To Do, linear chain 790 -> 791 -> ... -> 802)

| Task | Slice | Owns | Drive? |
|---|---|---|---|
| TASK-790 | 1 task mutation + title hygiene | B-003 | yes — DONE `d1e53585` |
| TASK-791 | 2 Drive records (failure/partial/unknown/spawn-failure) | B-001 | yes — DONE `10664396` |
| TASK-792 | 3 blocked report vertical slice | B-013 | yes — DONE `aa74f856` |
| TASK-793 | 4 retry event + nonterminal projection | B-002 | yes — DONE `b2752b04` |
| TASK-794 | 5 all-backend completion protocol (host-restart precondition recorded here) | B-004 | yes — DONE `08ff87f9` |
| TASK-795 | 6 scoped complexity/duplication + residue | B-005, B-007 | yes — DONE `ac4c10f6` |
| TASK-796 | 7 bounded analysis presentation | B-014 | yes |
| TASK-797 | 8 export-only trace classification | B-006 | yes |
| TASK-798 | 9 execution probe (creates the Git classifier) | B-008 | yes |
| TASK-799 | 10 Git guard + worktree snapshots | B-009, B-011 snapshot clauses | yes |
| TASK-800 | 11 boundary hygiene | B-010, B-011 rest | yes |
| TASK-801 | 12 worker persona alignment | B-015 | yes |
| TASK-802 | 13 coordinator closeout + live acceptance | B-012 | **no — coordinator-run** |

Phase 6 compliance review: 18 verified findings (3 lenses), 0 refuted, all applied (commit `git log -1`). Key: coordinator-only actions were written as worker ACs, which Drive would have blocked as unchecked (D-031).

## Successor handoff — run `/implement-plan driver-hardening` (written 2026-09-29 by the spec-to-backlog coordinator)

**State.** Worktree `/Users/cosmos/Projects/cosmonauts-framework-health`, branch `feature/driver-hardening` off `main` `e55040de`; HEAD = the commit carrying this file. Tree clean except the untracked `PI-UPGRADE-STATUS.md` (not ours; leave it). Plan `missions/plans/driver-hardening/` (spec.md ratified Intent INV-001..006, AC-001..020 with AC-012 amended by H-001; plan.md D-001..D-031, B-001..B-015, 13 slices; review-1..3.md are the chain's rounds). Brief: `/Users/cosmos/Projects/cosmonauts/.shepherd/work/in-progress/driver-hardening/brief-coordinator.md`; rulings: `.../rulings.md` (round 1 Q-001..Q-003; round 2 H-001 (a),(a); D-020 not vetoed).

**H-001 wording (human, 2026-09-29, ratified).** (i) AC-012 amended on record: the probe "restores every instrumented file to its original digest whether the command passed, failed, timed out, or was aborted, and reports any other tracked-file change the command made as a side effect that invalidates the hit evidence" (the old letter "leaves the source tree byte-identical to its start even when the command fails" is superseded). (ii) "dirty" in Q-002 (a) = the target's bytes changed between the digest taken at validation and the instrumentation write, or an outstanding probe journal exists for the project; git-dirty files are probeable. TASK-798 AC #4 carries both verbatim.

**Launch path (brief step 2; the CLI passes no postflight, so use the Pi tool).** One slice per run, dependency order (`cosmonauts task list --label plan:driver-hardening --plain`). Clean tree at a record-only commit first; commit nothing while a run is live (obs. 22). From the repo root, detached (never inside a tool timeout; macOS has no `setsid`), with `COSMONAUTS_DRIVER_*` and `ANTHROPIC_MODEL` unset:

```
nohup bash -c 'cosmonauts -p -a cosmo "Call run_driver with planSlug '"'"'driver-hardening'"'"', taskIds ['"'"'TASK-NNN'"'"'], backend '"'"'cosmonauts-subagent'"'"', mode '"'"'inline'"'"', branch '"'"'feature/driver-hardening'"'"', commitPolicy '"'"'driver-commits'"'"', postflightCommands ['"'"'bun run test'"'"','"'"'bun run lint'"'"','"'"'bun run typecheck'"'"','"'"'bun run check:reachability'"'"','"'"'bun run check:suppressions -- --base main'"'"'], taskTimeoutMs 5400000. Then call run_status until terminal and report the runId, eventLogPath, and final status. Do nothing else."' > <log> 2>&1 < /dev/null & disown
```

Worker model is `openai-codex/gpt-6-sol` (`bundled/coding/agents/worker.ts`); cosmo is the same. Poll `missions/sessions/driver-hardening/runs/<runId>/events.jsonl` for `task_done|task_blocked|run_completed|run_aborted` plus the cosmo pid (`kill -0`) every 30 s; Monitors have missed terminal events. `driver.lock` under `missions/sessions/driver-hardening/` holds runId/pid.

**Per-slice rules that hold.** (1) Until slice 3 lands, Drive replaces worker notes on a block: recover them from the newest `missions/sessions/driver-hardening/worker-*.jsonl` (the `task_edit` `implementationNotes` arguments and the last assistant text), write them back with `cosmonauts task edit --notes`, add a `### Coordinator note before attempt N`, set `--status todo`, relaunch. (2) Until slice 5 is live in the host, workers see no AC-marking instruction: tasks 1-5 carry the standing note in their Description; expect `acceptance criteria still unchecked` blocks anyway on early attempts. (3) After TASK-793's Drive commit: exit the cosmo host, start a fresh one, confirm `bin/cosmonauts-drive-step` does not exist, record HEAD and the session start time in TASK-794's notes (its precondition). (4) After each `run_completed`: confirm the Drive commit's parent is your slice-start commit; five `verify` `passed` events; `git diff --name-status --diff-filter=MDR <S> <driveCommit> -- tests/` shows only additions unless the task cites AC-020/D-024 (slice 7's text-equals-details change is the one pre-declared expectation change); no `.skip|.only|.todo` added; the task file path is canonical (a quoted title renames it, obs. 13); then update this file, commit record files with explicit paths. (5) Every Drive behavior change needs a failing test recorded before the change (D-030 rows in task notes); if a task's notes lack the red row, do not accept it. (6) TASK-802 is yours, not Drive's: second host restart, `## Evidence` table appended to plan.md, AC-020 change-set audit, the live throwaway-task acceptance exactly as its ACs say (`commitPolicy` `no-commit`), D-026 hand-off copy. (7) Escalate to Shepherd only: a collision with ratified ground (INV, AC letter, Q/H rulings), a worker `blocked` needing a human, an undeclared `tests/` change, a broken launch path, or the pinned Pi being unable to block a `tool_call` (TASK-799 AC #4).

**After TASK-802.** `/implement-plan` Phases 2-4: ground-truth gates (`bun run test`, `lint`, `typecheck`, `check:reachability`, `check:suppressions -- --base main`, `cosmonauts plan check-artifacts driver-hardening`); Quality Manager (`cosmonauts run chain "coding/quality-manager" "<prompt>"`, commit first — it has reverted uncommitted work; reconcile against LOCAL `main` `e55040de`; run detached with nohup and poll); codex review `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only "<prompt>" < /dev/null > <file> 2>&1`, framed as a correctness/liveness review of `e55040de..HEAD` against INV-001..006 and B-001..B-015, never adversarial; re-review after every fix round; save rounds under `missions/reviews/codex/driver-hardening-round-N.md`. Final report per the brief. **No push, merge, or PR.** Known suite flakes (rerun before believing): `tests/extensions/project-tools.test.ts`, `tests/driver/run-step.test.ts`, `tests/orchestration/quality-review-run.test.ts`, `tests/orchestration/cross-plan-commit-lock`, `tests/plans/archive.test.ts`. `bun run test:coverage` exits 1 today on the branch threshold; not a failure.

**Constraints (brief).** Commit only on `feature/driver-hardening`, explicit paths, never `git add -A` (a running chain's rewrite would be swept in). No suppressions, thresholds, or config changes to clear findings. Ratified ground changes only by a relayed human decision. Keep this file current; hand off at ~45% context.

## Rulings (human, 2026-09-29, typed to Shepherd, relayed; `.shepherd/work/in-progress/driver-hardening/rulings.md`)

- Q-001 Intent ratified as drafted. Q-002 (a). Q-003 (a). Recorded in `spec.md`.
- Branch rebased onto `main` `e55040de` before `/spec-to-backlog`.

## Phase 3 synthesis (2026-09-29)

- Chain: `planner -> plan-reviewer` (75 min) produced `plan.md` B-001..B-012 and three review rounds; rounds 2 and 3 (PR-011..PR-021) were written after the planner's last edit and were unaddressed.
- Independent channel: four-lens Workflow, 24 findings, all adversarially verified: 9 CONFIRMED (1 high, 4 medium, 4 low), 15 PARTIAL, 0 REFUTED.
- Convergence: both channels hit the execution-probe design (crash-durable supervisor, numeric process identity, unsettled trees, command-side mutation, guard bypass via `testCommand`, package auto-load), INV-001 on status-only updates, and the retry projection versus execution-liveness first-terminal.
- Applied as D-017..D-030 (all `coordinator, amend-on-record`): spec no longer copied; raw notes preserved on every update; probe simplified to lock + journal + always-restore + Drive journal block (D-019, pending H-001); worktree snapshot ref before every spawn for every backend (D-020, un-narrows INV-006); retry evidence nonterminal and no fabricated attempt (D-021); single note writer + idempotent append (D-022); blocked + `backend-commits` rule (D-023); renderer header + pinned-test change citing AC-009 (D-024); probe extension under `bundled/coding/` (D-025); execution-liveness overlap recorded (D-026); one owner per behavior, B-013..B-015 added (D-027); slices 1-4 mitigation + host restart (D-028); CLI `--append-notes` routed (D-029); evidence table in plan (D-030). Behaviors 12 → 15; slices 11 → 12.
- Withdrawn: the coordinator's own "missing Quality Contract" suspicion; the live plan format has no gate section (D-015 stands).

## Evidence

Run records exist under `missions/archive/sessions/project-health-audit/runs/` (main checkout, 41 runs); rows re-derived in `spec.md` Purpose.

## HEAD

`feature/driver-hardening`, rebased onto `main` `e55040de`; see `git log -1`. Tree clean except the untracked `PI-UPGRADE-STATUS.md` (not this plan's file).
