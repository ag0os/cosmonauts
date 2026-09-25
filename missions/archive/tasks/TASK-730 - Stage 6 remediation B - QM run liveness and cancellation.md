---
id: TASK-730
title: Stage 6 remediation B - QM run liveness and cancellation
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-725
createdAt: '2026-09-24T05:47:37.937Z'
updatedAt: '2026-09-24T06:22:29.490Z'
---

## Description

Remediate the liveness findings from the mid-branch independent review (`missions/plans/qm-chain-safety/mid-review-1-*.md`) under plan D-025's "Bounded assessment" rule. This task adds no leases, owner identity, start registration, settlement or owner-death protocol (D-013, R-008; execution-liveness owns those). It never cancels a timed-out panel child (D-011; execution-liveness AC-015). Binding ratified ground is as in TASK-725.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).

<!-- AC:BEGIN -->
- [x] #1 Caller cancellation propagates (Claude M3): the abort signal reaches dependency preparation, host checks and the QM session; an abort during any of them finalizes the run `cancelled` with verdict `failed` naming cancellation, promptly; tested for each phase.
- [x] #2 Host-run prepare and check timeouts kill the whole process tree (Claude M4): processes are started in their own process group and killed as a group; a check whose command spawns a grandchild holding stdout resolves at its timeout with the timeout recorded in `checks.md`; tested with a real grandchild process.
- [x] #3 The QM assessment has a configurable host deadline (codex C7): when the QM session does not settle before it, the run finalizes `failed` naming the deadline, the workspace is retained if any child is live, and no phase stays `assessing`; tested.
- [x] #4 Panel completion timeout is configurable for quality runs and recorded in the report (Claude L4); the default stays bounded; a timed-out reviewer still fails the assessment without cancelling the child; tested.
<!-- AC:END -->
