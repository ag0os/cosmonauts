---
id: TASK-747
title: >-
  Stage 7 remediation A - robust B-010 host calibration and diversity wiring
  tests
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-726
createdAt: '2026-09-24T15:48:17.940Z'
updatedAt: '2026-09-24T16:05:06.430Z'
---

## Description

Remediate the verified findings in `missions/plans/qm-chain-safety/stage7-review-1-codex.md` (HIGH 1, MEDIUM 2–3, LOW 4–5) and `stage7-review-1-claude.md` (MEDIUM 1–3 and the LOWs).

B-011 diversity is sound. B-010 host enforcement (`lib/orchestration/quality-review-models.ts`, `quality-review-run.ts`) can be bypassed by ordinary, non-hostile QM or reviewer behavior. Examples: renumbered IDs, a missing index, a code line counted as "measured cost", and a QM silently dropping a finding.

This work is governed by B-010, B-011, AC-013, AC-014, D-005, D-019, D-025, D-026 and D-027 (accidental threat model; hostile-only routes stay residuals). Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

Every test must fail on the current code. `bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 Reviewer finding IDs are carried verbatim: the QM prompt requires the final report to keep each reviewer finding ID, and host calibration matches IDs exactly (word-bounded, so `PF-1` never matches `PF-10`); tested with the collision case.
- [x] #2 The host P1 cap works on indexed and unindexed reports alike, and on any performance-lens P1 in the final report that it cannot map to a reviewer finding with valid measured cost (renumbered or QM-raised): such a line is capped to P2 in the report text itself (never shown as P1 beside a cap note) or recorded as a host human-decision item that blocks `ready`; tested for renumbering, QM raising P2 to P1, and a missing index.
- [x] #3 Measured cost is a measurement, not a quote of code: an accepted `measuredCost` must state a numeric quantity with a cost unit (time, memory, size, throughput or count per operation) and cite where in the materials it was measured or reproduced; a bare quoted diff line (e.g. a loop header or constant) is rejected; tested with `for (let i = 0; …)` and `const BATCH_SIZE = 100000;` (both rejected) and a valid measurement (accepted).
- [x] #4 No finding is closed by its own lens alone, including in QM synthesis: every reviewer finding ID must appear in the final report either as a finding or as a dismissal whose closure evidence comes from a different lens or host evidence; a reviewer finding the report omits is carried over by the host into Findings as open; tested with an omitted finding and a same-lens dismissal.
- [x] #5 Diversity wiring is pinned: a spawn-tool test proves the generalist session uses `diverseReviewerModel` and specialists keep their definition models; a run-level test proves base-owned `modelFamilies` extends family normalization; a direct same-family test (configured and observed identical, same family as the implementer) fails; each would fail under the corresponding mutation.
- [x] #6 LOWs: a missing implementer identity fails the diversity check visibly (INV-002) rather than skipping it; a missing generalist is reported as missing, not unresolvable; the not-configured diversity item appears once on indexed and unindexed paths; the tamper test fixture uses a resolvable, diverse model so it tests the path it names.
- [x] #7 The changed-scope audit against `main` still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
