---
id: TASK-697
title: P-final checkpoint — drain and certify the resumable profile queue
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-696
createdAt: '2026-09-16T18:36:06.050Z'
updatedAt: '2026-09-16T18:36:06.050Z'
---

## Description

Stage 6 gate **P-final**. Owned behaviors: **none**; TASK-696 is the sole B-004 owner.

P-final is the real graph gate after the plan’s own resume mechanism has driven bounded assessing-agent sessions. It is not a request for one worker to profile all 267 files in one session: each session consumes one D-016 unit, up to eight sessions run concurrently at the D-030 bound, and this checkpoint becomes checkable only when persisted queue state reports no remaining unit.

<!-- AC:BEGIN -->
- [ ] #1 The current-epoch persisted queue reports no pending or invalid profile unit after bounded assessing-agent sessions, with one OS process per unit at the D-030 bound of eight concurrent and disjoint shard ownership evidenced throughout.
- [ ] #2 Identity-set equality proves every current auditable declaration appears exactly once, including parameterized case counts, and no stale, duplicate, missing, malformed, or unsupported-as-absent profile passes.
- [ ] #3 Every unit respects the 50-identity, 2,500-relevant-line, and eight-file caps except a documented indivisible test, and oversized-file subdivisions retain shared context/import/helper digests.
- [ ] #4 Every current profile has complete agent-assessed provenance (agent id, model identifier and version, consulted authorities) for required judgments, exact seven-dimension/basis data, claim status and authority, reasons, uncertainty, portfolio/disposition, and complete material-input digests at the pinned scope; carry-forward has rehash proof.
- [ ] #5 Control re-sampling between waves remains passing, bound correctness and B-004 artifact-conformance pass, and the generic mutation rung remains explicitly unbound.
- [ ] #6 Every current-epoch unit carries its wall-clock duration and peak RSS, and no unit ran as an in-process `spawn_agent` child.
<!-- AC:END -->
