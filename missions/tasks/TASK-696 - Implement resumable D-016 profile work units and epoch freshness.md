---
id: TASK-696
title: Implement resumable D-016 profile work units and epoch freshness
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-695
createdAt: '2026-09-16T18:35:54.817Z'
updatedAt: '2026-09-16T18:35:54.817Z'
---

## Description

Stage 6 — Profile-unit substrate and queue initialization.

Owned behavior: **B-004** (sole owner).

Implement epoch/profile artifact validation and initialize the census-derived review queue. This task does **not** turn 267 test files into one worker session: the persisted mechanism issues bounded, disjoint work units to at most two concurrent reviewer sessions, reconstructs progress after interruption, and lets P-final verify queue exhaustion. INV-001/INV-005, AC-004/AC-005/AC-006, and D-013/D-015/D-016/D-020 are settled ground; stale, omitted, missing, or malformed evidence cannot become clean. Ratified contract/authority collisions halt and escalate.

<!-- AC:BEGIN -->
- [ ] #1 B-004 is proved at current-epoch `profiles/*.ndjson` and `manifest.json` seams by `tests/scripts/test-health-audit/artifacts.test.ts` > `requires one fresh complete profile per identity and safely subdivides oversized files across resumable units`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-004` near the executable test.
- [ ] #2 Quality Contract assertion 5 is enforced: aggregation requires exactly one current profile per auditable identity and rejects stale, duplicate, missing, malformed, or carried-without-complete-input-proof records.
- [ ] #3 Deterministic work units cap at 50 profile identities, 2,500 relevant source lines, and eight source files, except one indivisible test; oversized files split at suite/declaration boundaries and retain shared file-context/import/helper digests.
- [ ] #4 Each profile contains source/runtime/case counts; human-reviewed role, claim/authority, chain, non-Execution conclusions, reasons, portfolio contributions, and disposition; all seven dimension conclusions/bases; evidence/counterevidence/uncertainty; field provenance; and material-input digests using the plan’s exact vocabularies.
- [ ] #5 Progress is reconstructed solely from validated, atomically published current-epoch shards; one reviewer owns one disjoint unit, no more than two reviewer sessions run concurrently, and an interrupted session loses at most its bounded unit.
- [ ] #6 Carry-forward succeeds only after rehashing unchanged test declaration span, SUT chain, contract, method/schema, inventory row, runner/config/setup, and command inputs and records `carriedFrom`; any material change opens a successor epoch and refreshes runtime observations.
- [ ] #7 The current census deterministically initializes a persisted queue consumed one bounded unit per reviewer session, with control re-sampling between waves; no file-count shortcut or assumed unit count can satisfy completion.
<!-- AC:END -->
