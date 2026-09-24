---
id: TASK-729
title: 'Stage 6 remediation A - isolation, consent and verdict integrity'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-725
createdAt: '2026-09-24T05:47:37.930Z'
updatedAt: '2026-09-24T06:14:18.609Z'
---

## Description

Remediate verified findings from the mid-branch independent review of Stages 1–6. The review files are `missions/plans/qm-chain-safety/mid-review-1-codex.md` (C-n) and `mid-review-1-claude.md` (H/M/L-n). This work is governed by plan D-025 (amend-on-record 2026-09-24), plus D-004, D-006, D-009, D-011, D-012 and D-013. Binding ratified ground is INV-001..INV-005 and D-018..D-023 (see TASK-725). Any collision with it halts for a human decision.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).

<!-- AC:BEGIN -->
- [x] #1 Snapshot analysis consent reaches the analysis provider (Claude H1, codex C2): with consent granted for the operator source real path, a real (not mocked-spawner) QM launch path makes `analysis_status`/`analysis_audit` in the clone bound and consented for that one run only, via the in-memory authorization; no consent record is written or copied (R-007); a test drives the real project-tools extension against a snapshot root.
- [x] #2 No quality session sees the source root or host run store (Claude H2, codex C1, D-025): `checks.md` is copied into `materialsRoot` before it is made read-only and the QM prompt names only materials/clone paths; a test asserts the QM and panel prompts and tool args contain neither the source real path nor `hostRunStoreRoot`.
- [x] #3 `ready` requires a host-observed completed bound `analysis_audit` result for the literal base (codex C3, D-025): an unbound, unconsented, failed or missing audit result is recorded as that gate state plus a human-decision item and forces `not-ready` regardless of report text; tested with an unbound audit and a model report claiming the gate passed.
- [x] #4 Review base is the merge-base of captured HEAD with the resolved base ref (Claude H3, D-025): materials base SHA, diff, changed files, `{base}` for checks and the enforced audit base all use it; tested with a base branch that advanced after the fork, including a base-only change to a gate-owned file that must not produce a gate-owned human item.
- [x] #5 Finalization ordering follows Design §3 (Claude M5): the final report and plan summary are replaced and `finalized` appended before workspace removal; a removal failure keeps the completed verdict in `final.md` and records the workspace as retained; tested by making removal throw after a `not-ready` assessment.
- [x] #6 The run’s own plan summary `missions/plans/<slug>/qm-runs/<runId>.md` is excluded from the captured state (Claude L1); tested for a plan-scoped run.
- [x] #7 Only the host produces `refused` (Claude L2): a model report with `Verdict: refused` is a report-integrity failure (`failed`), never a blocked outcome; tested.
- [x] #8 No reviewer evidence is written after the run leaves `assessing` (Claude L3): a late completion from a timed-out child is not persisted and emits no `artifact_written`; the child is still not cancelled; tested.
- [x] #9 The interactive `/agent quality-manager` route (Claude L7) either routes through the quality launcher or is refused with a named reason; it never starts a QM against the operator checkout; tested.
- [x] #10 `chain_run` and `run_driver` fail closed when the calling session has no resolvable agent identity, matching `spawn_agent` (codex C5, B-001); top-level CLI commands (which do not go through these tools) are unchanged; tested.
- [x] #11 Gate-owned `.cosmonauts/config.json` detection is limited to changes of the `qualityReview` block (Claude L6, D-009 wording); an unrelated config edit is not a gate-owned item; tested.
<!-- AC:END -->
