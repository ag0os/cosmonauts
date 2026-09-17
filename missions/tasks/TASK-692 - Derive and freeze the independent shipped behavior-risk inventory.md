---
id: TASK-692
title: Derive and freeze the independent shipped behavior-risk inventory
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-691
createdAt: '2026-09-16T18:35:08.561Z'
updatedAt: '2026-09-17T17:35:36.326Z'
---

## Description

Stage 4 — Independent inventory.

Owned behavior: **B-006** (sole owner).

Use bounded, separately reviewed non-test authority work units to derive `behavior-risk-inventory.json` before joining any test profiles. INV-004, AC-008, D-007, and D-026 are settled ground: tests, markers, coverage, and the census identity set cannot define the inventory. Incidental test citations in an authority are not opened or promoted to authority. Missing architecture-map evidence remains unavailable, never clean; a collision with **ratified scope** halts and escalates. A **shipped-authority collision** — the authorities an entry cites are absent or contradict each other — is not a halt: per ratified D-028/D-021 and D-034, record the claim `unresolved` with its colliding authorities and a drafted question, and continue; those rows batch into the single D-029 ratification packet.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is proved at `missions/plans/test-health-audit/audit/epochs/<epoch-id>/behavior-risk-inventory.json` by `tests/scripts/test-health-audit/artifacts.test.ts` > `rejects test-derived inventory and requires authority criticality boundaries and defect axes`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-006` near the executable test.
- [ ] #2 The restricted evidence pack excludes census identities, test files, markers, and coverage output while covering enumerated current package/CLI/domain/shipped-artifact surfaces, shipped contracts/docs, active architecture decisions, and relevant incident/risk records.
- [ ] #3 Every frozen inventory entry cites non-test authority and records consequence-based agent-assessed criticality, applicable producer/consumer/adapter/persisted-state/event/alternate-path/composition-root boundaries, and path/caller/defect axes using the ratified portfolio vocabulary.
- [ ] #4 The source log and positive coverage statements account for every enumerated shipped surface/authority group; incidental authority citations to tests are not opened, and neither tests nor markers nor coverage appear as an entry’s authority.
- [ ] #5 Agent-assessed provenance (agent id, model identifier and version, consulted authorities) is present on criticality and every other judgment, while mechanical source-log facts remain in the objective lane; no heuristic inventory judgment becomes a CI failure.
- [ ] #6 The frozen inventory/source-log digest belongs to the current epoch, and any later non-test authority or inventory change requires a successor epoch rather than mutation of the manifest.
- [ ] #7 A shipped-authority collision never stops the run: the entry is frozen with claim status `unresolved`, cites every colliding authority, carries a drafted question with options and the agent's recommendation, and is routed to the D-029 ratification packet; no such collision is silently resolved by agent preference.
<!-- AC:END -->

## Implementation Notes

spawn failed with exit code 143
