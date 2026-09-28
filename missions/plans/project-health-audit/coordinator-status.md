# project-health-audit — coordinator status

Coordinator: Claude (Herdr pane `pha-implementer`), successor to `pha-coordinator`,
briefed by Shepherd via `.shepherd/work/in-progress/project-health-audit/brief-implementer.md`.
Implementation started 2026-09-28.

## Needs the user

Nothing. Q-008 ruled (a) 2026-09-28 (human, relayed; plan D-022, spec Q-008,
rulings file round 3). Earlier rulings: Q-001..003 in `spec.md`; Q-004..007 in
`plan.md` D-010/D-012/D-013/D-017.

## Done

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

- Slice 6 / TASK-773 (characterize harness and validation criticals): launched
  after the slice-5 record-only commit; slice-start `S` = that commit.
  Remaining ready after it: TASK-775, 777, 779 (all depend only on 772).

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
8. Launching Drive through a print-mode cosmo session works but the launcher
   must be detached from the coordinator's tool timeout (`nohup … & disown`);
   killing it mid-run leaves a stale `running` record and an In-Progress task.

## Blocked

Nothing (TASK-770 was blocked on Q-008 from 18:09Z until the ruling).

- History: slice 3 / TASK-770 attempt 1 (run `run-d744cc20`) blocked on Q-008. Worker
  evidence restored into the task notes. Worktree holds its partial extraction
  (diagnostic went 85 → 48 groups with retrieval.ts included; retrieval.ts
  restored). Resume: relaunch TASK-770 after the ruling; the worker re-applies
  the retrieval extraction (a) or records the baseline (b), records D-015
  against `C = d17a497`, ticks ACs.

## HEAD

`feature/project-health-audit` at `a0b89e9` (record-only commit after the
TASK-768 Drive commit `8b366a0` and state commit `8a768c7`), seventeen commits
ahead of local `main` `64dca3c`. Worktree clean at launch of slice 2.

## Successor handoff — implement

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
