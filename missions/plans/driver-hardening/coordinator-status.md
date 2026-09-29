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

Nothing yet. Next action: `/spec-to-backlog driver-hardening`.

## Blocked

Nothing.

## Rulings (human, 2026-09-29, typed to Shepherd, relayed; `.shepherd/work/in-progress/driver-hardening/rulings.md`)

- Q-001 Intent ratified as drafted. Q-002 (a). Q-003 (a). Recorded in
  `spec.md` (Intent provenance, Scope, Assumptions, Open Questions).
- Branch rebased onto `main` `e55040de` (chore/base-small-fixes merged) before
  `/spec-to-backlog`, per Shepherd.

## Evidence

The run records exist under `missions/archive/sessions/project-health-audit/runs/`
(main checkout, 41 runs, gitignored); the archive step had moved them. Rows
re-derived and recorded in `spec.md` Purpose (outcome tally, retry runs,
commit subjects). The earlier "not present" note is withdrawn.

## HEAD

`feature/driver-hardening`, rebased onto `main` `e55040de`; see `git log -1`.
Tree clean except the pre-existing untracked `PI-UPGRADE-STATUS.md` (not this
plan's file).

## Successor handoff

Rulings applied. Run `/spec-to-backlog driver-hardening`, then `/implement-plan` per the
brief's step 2 (Drive on `cosmonauts-subagent` inline, worker
`openai-codex/gpt-6-sol`, one slice per run, print-mode cosmo `run_driver`
with the five postflight gates: test, lint, typecheck, check:reachability,
`check:suppressions -- --base main`). Constraints that hold throughout: every
Drive behavior change needs a test that fails first; the blocked path gets a
real end-to-end slice on a throwaway task as final acceptance; commit only on
this branch with explicit paths; no suppressions, thresholds, or config
changes to clear findings; no push, merge, or PR; never commit while a run is
live; poll `events.jsonl` plus the cosmo pid every 30 s.
