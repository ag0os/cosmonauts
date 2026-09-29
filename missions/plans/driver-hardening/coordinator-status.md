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

Nothing. `/spec-to-backlog` Phase 3 done (plan revised); Phase 4 (task creation) waits on the Phase 3 human gate and H-001.

## Blocked

Phase 4 waits on H-001 (below) and the Phase 3 gate ("report the findings synthesis; proceed on approval").

## Needs the user

- **H-001 - AC-012 letter and the meaning of "dirty" (plan D-019).** Two clauses of ratified ground collide with any buildable probe:
  - (i) AC-012 says the helper leaves "the source tree byte-identical to its start even when the command fails". A target-file journal restores the instrumented files and can detect, but not undo, changes an arbitrary test command makes elsewhere. Options: **(a) amend AC-012 on record**: every instrumented file is restored to its original digest; any other tracked-file change the command makes is reported as a side effect and invalidates the hit evidence (recommended); (b) keep the letter, which needs a filesystem sandbox this plan cannot build, so drop the helper (slice 9) and keep the manual D-031 procedure.
  - (ii) Q-002 (a) says the helper "refuses a dirty file" without defining dirty. Read as git-dirty, it refuses exactly the uncommitted refactors Q-002 rejected option (b) for not covering. Options: **(a) dirty = the target's bytes changed between validation and instrumentation, or an outstanding probe journal exists** (git-dirty files are probeable; recommended); (b) dirty = git-dirty.
  - Slice 9 does not start until both are ruled. Everything else in the plan is independent of H-001.

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

## Successor handoff

After H-001 and the Phase 3 gate are relayed: apply the H-001 ruling to `spec.md` (AC-012 amendment on record if (a)) and `plan.md` D-019, then continue `/spec-to-backlog` at Phase 4 (task-manager chain, coverage matrix, compliance review, task fixes), then `/implement-plan` per the
brief's step 2 (Drive on `cosmonauts-subagent` inline, worker
`openai-codex/gpt-6-sol`, one slice per run, print-mode cosmo `run_driver`
with the five postflight gates: test, lint, typecheck, check:reachability,
`check:suppressions -- --base main`). Constraints that hold throughout: every
Drive behavior change needs a test that fails first; the blocked path gets a
real end-to-end slice on a throwaway task as final acceptance; commit only on
this branch with explicit paths; no suppressions, thresholds, or config
changes to clear findings; no push, merge, or PR; never commit while a run is
live; poll `events.jsonl` plus the cosmo pid every 30 s.
