# project-health-audit — coordinator status

Coordinator: Claude (Herdr pane `pha-coordinator`), briefed by Shepherd via
`.shepherd/work/in-progress/project-health-audit/brief-coordinator.md`.

## Needs the user

Four rulings from the plan review (both channels; synthesis in `review-3.md`).
Each collides with ratified ground or moves scope, so the coordinator did not
decide it. Task creation waits on all four because they change task shape.

**Q-004 — AC-008 "at the branch's final commit".** The baseline refresh
analyzes a commit in a detached worktree and then writes the floors into the
working tree, so the commit that contains the refreshed floors can never be the
commit they were computed against. Options: (a) accept plan D-010: refresh
against the final *source* commit, then one artifact-only closeout commit
(`.fallow-baselines/`, `docs/fallow-exceptions.md`, the two record files), with
the record proving the tip differs only by those paths; (b) some other reading
you prefer. Recommendation: (a). It is the only reproducible interpretation.

**Q-005 — the single unused-class-member finding.** Fallow reports
`TaskManager.getTaskDependencyStatusSnapshot` unused, but the surface cannot
symbol-trace a class member (provider exit 2) and the method has a live call at
`lib/driver/drive-graph-runner.ts:593`. INV-003 requires a trace before acting;
AC-002 requires zero findings; INV-004 forbids a suppression. Options:
(a) disposition it `false-positive` with the reference evidence recorded, no
edit, AC-002 read as "zero findings except provider false positives recorded
with contradicting evidence"; (b) treat AC-002 as unmet by one row and escalate
at closeout. Recommendation: (a).

**Q-006 — the duplication capability is structurally broken.** The surface runs
`fallow dupes` with no threshold, Fallow exits 0 whenever duplication is under
threshold, and `reconcileVerdictEvidence` in `fallow-provider.ts` rejects
exit 0 with findings, so `analysis_duplication` fails with `invalid-output`
whenever any clone exists, including after this plan (two three-file families
stay by ruling). Options: (a) fix the defect narrowly in stage 1 (exit 0 with
findings is a completed `fail` for duplication; regression test; the file is
gate-owned so the QM will flag it for your sign-off either way); (b) leave it,
record AC-004 as `unmet: capability failed` with the direct-provider diagnostic
inventory beside it. Recommendation: (a). The record would otherwise carry a
permanently failed gate-facing capability that a ten-line fix resolves.

**Q-007 — execution backend.** The brief said Drive with Codex. Codex and
Claude CLI workers have no Pi tools, so they cannot call `analysis_status`,
the capability tools, or `analysis_trace`, which INV-003 requires immediately
before every edit. Options: (a) run the implementation slices with Drive's
`cosmonauts-subagent` backend inline (Pi `coding/worker`/`refactorer` with
`project-tools`), one slice per run; (b) Codex workers, with a Pi-hosted trace
step spawned before each slice and its evidence handed to the worker (weaker:
"immediately before the edit" becomes "before the slice"); (c) a thin
`cosmonauts analysis` CLI wrapper so external workers can call the surface
(new code, out of this plan's scope). Recommendation: (a), noting the known
Opus-out-of-usage stall risk for Pi-hosted agents; pick a GPT model for the
worker if that recurs.

Also for the record, no ruling needed: the spec's "five" tests/ critical
functions was a counting error (four); corrected in place. Sixteen tasks
instead of the skill's usual 3-12 is accepted on record (D-016) rather than
splitting the plan.

### Ruled 2026-09-28

**Q-001 — Ratify the Intent** (`spec.md` `## Intent`). Goal: every
whole-project static-health finding on `main` is either fixed with behavior
preserved or carried in a recorded, reasoned baseline, and the record that says
so can be regenerated and compared by any later run.

- INV-001 - Missing evidence is never clean. Every project-scope gate-facing
  capability appears in the record with its binding state; unbound,
  unsupported, or failed is named as such and never counts as passing.
- INV-002 - Remediation preserves observable behavior. Critical functions below
  `high` coverage get committed characterization tests before the first edit;
  a test expectation changes only when it pinned the removed defect, citing
  the finding.
- INV-003 - A finding is confirmed before it is acted on: trace through the
  analysis surface immediately before the edit; a finding that no longer
  reproduces is reported unresolved, not fixed.
- INV-004 - Nothing is silenced: no new suppression, threshold change, ignore
  pattern, entry point, or production-scope change to clear a finding; what is
  not fixed is baselined with a written reason through the provenance path.
- INV-005 - The record is reproducible: commit, provider identity/version,
  config digest, exact invocations, result digests; same commit reproduces the
  same finding identities and counts.
- Ranking: INV-002 over remediation scope; INV-001 and INV-004 over any clean
  verdict; INV-003 over throughput.

**Q-002 — Risk bound for critical refactors.** For a critical function that
cannot be characterized to a reasonable bound (`runPass`: 886 lines, 104 paths,
`partial` coverage): (a) refactor with the best characterization tests writable
plus the full suite, hard stop if any test expectation would have to change; or
(b) baseline it as a recorded exception to the critical ruling and defer.
Recommendation: (a).

**Q-003 — Duplication ruling consequence.** 41 of 43 clone families (85 of 87
groups, ~1,730 duplicated lines) are one- or two-file families, so "extract
one- or two-file families" extracts almost everything and baselines only two
three-file families (30 lines). Confirm, or set a narrower bound (minimum
family size, same-directory only, ...).

Decided by the coordinator as derived (override if you disagree, no question
needed otherwise): `scripts/` critical functions in scope (3), `tests/`
critical functions baselined (5), static coverage tier is the characterization
trigger, `fallow.toml` untouched.

## Done

- 2026-09-28: branch `feature/project-health-audit` off local `main` `64dca3c`.
- 2026-09-28: read Shepherd evidence (`dead.json`, `dupes.json`,
  `health.json`), the analysis surface (`docs/analysis-capabilities.md`,
  `docs/fallow.md`, `docs/fallow-exceptions.md`, `fallow-provider.ts`
  capability table), baseline manifest, suppression registry, consent file.
- 2026-09-28: plan created via `cosmonauts plan create`; `spec.md` written
  (Intent INV-001..005, AC-001..011, scope rulings, Q-001..003).
- 2026-09-28: roadmap item removed; pause paragraph points at the plan.

- 2026-09-28: `/spec-to-backlog` Phase 1 done: planner → plan-reviewer chain
  (40 min) wrote plan.md, review-1.md, review-2.md; planner did not revise
  after review (mtimes checked). Phase 2 done: independent four-lens workflow,
  24 findings verified (28 agents). Phase 3 done: plan revised by the
  coordinator (D-011..D-017, B-011, Design §1/§3/§4/§5, R-001 replaced,
  R-013..R-015, sixteen-stage order); synthesis in review-3.md;
  `plan check-artifacts` clean.

## Running

Nothing.

## Blocked

- `/spec-to-backlog` Phase 4 (task creation) waits on Q-004..Q-007 above.

## HEAD

`feature/project-health-audit` at `7158284` (plan + spec + roadmap removal),
one commit ahead of local `main` `64dca3c`. Worktree clean.

## Successor handoff

If a fresh session takes over: read the brief, this file, and `spec.md`. The
evidence JSON is Shepherd's direct Fallow run; AC-001 requires re-deriving it
through the analysis surface (`analysis_status` then the four project-scope
tools) and reconciling before any remediation. Nothing in `lib/`, `cli/`,
`domains/`, `scripts/`, or `tests/` has been edited. Next step once Shepherd
relays ratification: `/spec-to-backlog project-health-audit`, then
`/implement-plan project-health-audit` with
`COSMONAUTS_DRIVER_CODEX_ARGS="-m gpt-5.6-sol -c model_reasoning_effort=medium"`,
commit before any QM run, explicit paths only, no push.
