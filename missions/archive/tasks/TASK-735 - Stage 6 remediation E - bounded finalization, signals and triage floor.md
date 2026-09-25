---
id: TASK-735
title: 'Stage 6 remediation E - bounded finalization, signals and triage floor'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-733
  - TASK-734
createdAt: '2026-09-24T07:02:12.652Z'
updatedAt: '2026-09-24T07:15:16.586Z'
---

## Description

Remediate the verified round-3 findings in `missions/plans/qm-chain-safety/mid-review-3-codex.md` (codex 1–4 and the grandchild and prompt acceptances) and `mid-review-3-claude.md` (NEW-M1, NEW-M2, NEW-L1, NEW-L2, NEW-L4).

This work is governed by D-025 (its "Gate state is host-verified" bullet was amended on record on 2026-09-24), plus D-011, D-013 and Design §3. Design §3's ordering is: validate the report, replace the provisional files, append the terminal phase, remove the workspace only when no child is live, then return.

Binding ratified ground is INV-001..INV-005 and D-018..D-023. Timed-out panel children are never cancelled (D-011; execution-liveness AC-015). Add no leases, owner identity or owner-death protocol.

Every test must fail on the current code.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).

<!-- AC:BEGIN -->
- [x] #1 Sealing is bounded (codex 1): sealing the reviewer sink waits at most a bounded grace for in-flight reviewer writes; a write still pending at the grace is abandoned, recorded as an integrity failure naming the lens, and cannot land after finalization; tested with a store write that never settles.
- [x] #2 Terminal event precedes workspace removal (codex 2, Design §3): final report and plan summary are replaced and the terminal phase (`finalized` or `retained`) is appended before removal starts; removal is bounded by a timeout; its outcome (`removed`, `removal-failed`, `removal-timed-out`) is appended as a post-terminal disposition record without a second terminal phase; `run status` is terminal even if removal never settles; tested with a remover that never settles and one that throws.
- [x] #3 Host commands complete on exit, not on pipe close (codex grandchild acceptance, Claude): on timeout or cancellation the host kills the process group, then finishes on the child exit event and destroys its stdio pipes, so a detached grandchild holding stdout cannot extend the wait beyond a small bound; tested with a detached grandchild `sleep` holding inherited stdout and a 1 s timeout, asserting completion well under the grandchild lifetime.
- [x] #4 Signals keep their default meaning (Claude NEW-M1): after killing active command groups on SIGINT/SIGTERM the handler removes itself and re-raises the signal (or otherwise preserves the host’s prior disposition) so a host without its own handler still terminates; a cancelled check is recorded as cancelled, not as an ordinary failure; the CLI SIGINT wiring has a test.
- [x] #5 Triage floor uses paths and both diff directions (codex 3, Claude NEW-M2): the documentation filter applies only to documentation files (e.g. markdown/text outside prompt and skill directories), not to any path segment named docs/memory/knowledge/missions; removed lines count as signals; agent prompt and skill markdown counts as behavior for the generalist and relevant lenses; tested with a `lib/memory/*.ts` fs-write diff, a deletion-only auth-check removal in `lib/auth.ts`, and a docs-only diff (reviewer only).
- [x] #6 Failed-audit reporting follows amended D-025 (codex 4): a bound completed audit with a failing verdict is a gate failure forcing `not-ready`; each introduced audit finding from the envelope is reported as a finding with `file:line`, category and severity; no human-decision item is added for it; unbound/unconsented/unobserved/failed-to-run remain human items; tested on the real validator output, not a hand-written gate-state string.
- [x] #7 Human-item text is not duplicated on the real path (Claude NEW-L1): the test drives `validateQualityReviewAnalysisCalls` output for unbound, unconsented and missing-status states into the report and asserts single-prefix text.
- [x] #8 Caller prompt is carried, not silently dropped (codex acceptance): a caller prompt from CLI print, `spawn_agent` or a chain stage is passed to the QM as an operator note that cannot change the host-determined scope, and the report records it; tested for CLI and `spawn_agent`.
- [x] #9 Cancellation grace and skill visibility (Claude NEW-L2, NEW-L4): the post-abort QM settle grace is configurable with a default long enough for an in-flight tool to abort (seconds, not 250 ms); skill locations dropped by the clone remap are listed in the report as omitted; tested.
<!-- AC:END -->
