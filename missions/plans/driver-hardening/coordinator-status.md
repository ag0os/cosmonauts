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

Nothing. No Drive run, no chain, no agent.

## Blocked

Waiting on the human rulings below (step 1 stop point per the brief).

## Needs the user

- **Q-001 - Ratify the Intent.** `spec.md` `## Intent`: goal, INV-001..006,
  and the Ranking paragraph. Ratify as drafted, or edit. Until ratified the
  invariants are a draft; `/spec-to-backlog` must not start before this.
  Options: (a) ratify as drafted; (b) ratify with edits (say which).
- **Q-002 - The execution-probe helper writes to the working tree.** AC-012
  asks for a worker-invocable helper that instruments named source locations,
  runs a test command, reports hit counts, and restores the tree
  byte-identical. The only known-reliable mechanism (D-031: Vitest v8 coverage
  had duplicated function-map entries) is a temporary source edit with a
  backup copy, run inside the worker's own session. Options: (a) allow it,
  with byte-identical restore verified by digest and a refusal to run on a
  dirty file (recommended default); (b) restrict the helper to a throwaway
  `git worktree` copy of HEAD, which cannot probe uncommitted refactors and so
  would not have covered the audit's cases; (c) drop AC-012 and keep D-031 as a
  documented manual procedure.
- **Q-003 - Confirm the one exclusion from ranked follow-up 7.** Observation 4
  (`bun run lint` reads `.git/info/exclude`-ignored paths) is argued out in
  `spec.md` `## Scope` as a lint-configuration matter, not a Drive defect.
  Options: (a) confirm the exclusion (recommended); (b) keep it in scope.

Everything else is decided in `spec.md` as derived ground: `outcome: blocked`
becomes a first-class outcome (replacing the contract line that forbids it);
AC-003's run-level consequence follows the existing `partialMode` rule; the
retry event is emitted by the existing contradicted-path loop only; AC-008's
path scope is adapter-side filtering because Fallow `health` has no per-file
filter; AC-014 uses a Pi `tool_call` block in Drive worker sessions only.

## Evidence gap

The brief says the run records under
`missions/sessions/project-health-audit/runs/` are present locally. They are
not: the directory does not exist in this worktree or in the main checkout
(checked 2026-09-29). The spec relies on the improvement review and the
archived observation list; no row was re-derived from a run record. Recorded
in `spec.md` `## Assumptions`.

## HEAD

`feature/driver-hardening`; see `git log -1` for the commit carrying this
file. Tree otherwise clean except the pre-existing untracked
`PI-UPGRADE-STATUS.md`, which is not this plan's file and is left alone.

## Successor handoff

After the human relays Q-001..Q-003: apply any Intent edits to `spec.md`
(record ratification with date and provenance under `## Intent` Provenance),
then run `/spec-to-backlog driver-hardening`, then `/implement-plan` per the
brief's step 2 (Drive on `cosmonauts-subagent` inline, worker
`openai-codex/gpt-6-sol`, one slice per run, print-mode cosmo `run_driver`
with the five postflight gates: test, lint, typecheck, check:reachability,
`check:suppressions -- --base main`). Constraints that hold throughout: every
Drive behavior change needs a test that fails first; the blocked path gets a
real end-to-end slice on a throwaway task as final acceptance; commit only on
this branch with explicit paths; no suppressions, thresholds, or config
changes to clear findings; no push, merge, or PR; never commit while a run is
live; poll `events.jsonl` plus the cosmo pid every 30 s.
