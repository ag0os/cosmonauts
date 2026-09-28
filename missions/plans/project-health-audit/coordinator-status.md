# project-health-audit — coordinator status

Coordinator: Claude (Herdr pane `pha-coordinator`), briefed by Shepherd via
`.shepherd/work/in-progress/project-health-audit/brief-coordinator.md`.

## Needs the user

Answer via Shepherd. Q-001 blocks everything downstream; Q-002 and Q-003 shape
the backlog and are cheapest to rule now.

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

## Running

Nothing. Stopped after step 2 of the brief, awaiting ratification.

## Blocked

- `/spec-to-backlog` and `/implement-plan` wait on Q-001 (and Q-002/Q-003
  rulings, which change task shape).

## HEAD

See the latest commit on `feature/project-health-audit` (updated at each
commit below).

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
