---
id: TASK-736
title: >-
  Stage 6 remediation F - operator note, abandoned writes, group reaping,
  base-owned config
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-735
createdAt: '2026-09-24T07:26:18.247Z'
updatedAt: '2026-09-24T07:26:18.247Z'
---

## Description

Remediate the verified round-4 findings in `missions/plans/qm-chain-safety/mid-review-4-codex.md` (NEW-1..4, plus its host-check authority observation) and `mid-review-4-claude.md` (NEW-M1..M3, NEW-L1..L4).

This work is governed by D-025, D-009 (base ownership), D-011, D-013, Design §3 and R-014. R-014 means the durable runtime stays unaware of QM personas; put no QM-specific branches in generic runtime code. Binding ratified ground is INV-001..INV-005 and D-018..D-023. Timed-out panel children are never cancelled. Add no leases or owner protocol.

Every test must fail on the current code, and must drive the real path where one exists (not a hand-built string).

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).


<!-- AC:BEGIN -->
- [ ] #1 The operator note is caller-authored text only (Claude NEW-M2): durable and inline chain QM stages pass the user-supplied prompt, never generated stage defaults such as `buildStagePrompt` output; absent caller text means no note; tested through the durable `chain_run` path.
- [ ] #2 The operator note never names the source root or host run store (codex NEW-1, Claude NEW-M3): occurrences of the source path, its real path and the host run-store path are replaced with a neutral placeholder before reaching any quality session prompt or report; tested with a note containing each form.
- [ ] #3 An abandoned reviewer write keeps the assessment evidence (codex NEW-2, Claude NEW-L4): the verdict becomes `failed` with the abandonment reason added, but the completed report sections (checks, gates, findings, human items) remain in `final.md` and the plan summary; tested with an assessment carrying a finding and a human item.
- [ ] #4 No `artifact_written` for an abandoned or post-seal write is visible after finalization (codex NEW-3, Claude NEW-L4): the event append is itself inside the sealed window or compensated so `run status` never lists a reviewer artifact that does not exist; tested with an append that settles after sealing.
- [ ] #5 Host-added failing-audit findings are complete (codex NEW-4, AC-008/B-005): each carries a stable id, a priority derived from severity by a documented mapping, `file:line`, category, severity and a suggested fix (from the envelope actions, or a generic fix naming the category when none); tested with an envelope finding that has no actions.
- [ ] #6 Every host command reaps its process group on every exit path (Claude NEW-M1): after the leader exits normally, remaining same-group processes are killed and cannot keep writing to the clone; output already produced is kept; tested with `sh -c "(sleep 2; touch marker) & echo early"` asserting the marker never appears.
- [ ] #7 QM runs emit their normal `run_*` terminal event (Claude NEW-L1): the QM terminal lifecycle no longer makes the generic run record terminal through a QM-specific branch in `lib/durable-runtime/status.ts`; `run_completed`/`run_failed`/`run_blocked` are emitted as for other runs and `run status` stays terminal and correct; tested via the event log and a `chain_end` consumer.
- [ ] #8 Workspace removal default fits a real prepared clone (Claude NEW-L2): the default removal timeout is at least 60 s and configurable; a removal failure or timeout is visible in `run status` output as the post-terminal disposition; tested.
- [ ] #9 Triage treats behavior-bearing markdown as behavior (Claude NEW-L3): `*/capabilities/*.md`, driver templates, `AGENTS.md`/`CLAUDE.md` and agent prompts and skills are not documentation for triage; tested with a capability-layer removal of a read-only rule.
- [ ] #10 Quality-review configuration is base-owned (codex host-check observation, D-009): `qualityReview` (prepare, checks, timeouts, models) is read from the review base revision, not from the reviewed clone, so a change cannot choose its own prepare or check argv; a change to the block remains a gate-owned human item; when the base has no block the run follows D-019 (not configured); tested with a reviewed change that rewrites the check argv to write a marker outside the clone, asserting the base argv ran and no marker exists.
<!-- AC:END -->
