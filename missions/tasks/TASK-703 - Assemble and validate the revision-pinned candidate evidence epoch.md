---
id: TASK-703
title: Assemble and validate the revision-pinned candidate evidence epoch
status: Done
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:test-health-audit'
dependencies:
  - TASK-702
createdAt: '2026-09-16T18:37:25.193Z'
updatedAt: '2026-09-19T05:17:52.000Z'
---

## Description

Stage 9 — Candidate evidence.

Owned behavior: **B-010** (sole owner).

Build the final candidate only after R1. Re-derive the census over the current tree, use the stage-6 resume mechanism for every newly missing identity (including this plan’s own tests), rerun the bounded command regimen, and validate all ten bundles plus canonical digest. INV-005/INV-006, AC-011/AC-014/AC-015, and D-009/D-010/D-013/D-018/D-020/D-024 are settled ground: mechanical and agent-assessed lanes stay separate, no heuristic becomes CI failure here, and the plan cannot expand into excluded work. Halt and escalate on ratified conflict.

<!-- AC:BEGIN -->
- [x] #1 B-010 is proved at current-epoch `gate-recommendations.md`, `scripts/test-health-audit/artifacts.ts`, and `cli.ts` by `tests/scripts/test-health-audit/artifacts.test.ts` > `validates all ten bundles in one epoch and forbids heuristic CI activation or active-plan coupling`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-010` near the executable test.
- [x] #2 The candidate epoch re-derives source identities from the current tree, drains bounded D-016 profile units for every missing current identity including `tests/scripts/test-health-audit/**`, reruns normal/watch/coverage/repeat/shuffle/isolation evidence, and rejects incomplete/blocked census or stale profiles/digests.
- [x] #3 All ten deliverable bundles and supporting inventory/raw evidence link to one epoch and canonical candidate digest; permanent validator tests use temporary explicit audit roots and remain valid after plan archival.
- [x] #4 Gate recommendations label every item `objective-candidate` or `agent-assessed-heuristic`, cite calibration and limitations, activate no CI gate, and preserve the ordered Quality Contract: correctness bound, artifact-conformance bound, mutation bindable/unbound.
- [x] #5 Recommendations cross-link but do not implement `behavioral-regression` and `deliverable-completeness-gates`; no deintroverter port, indiscriminate mutation, coverage objective, whole-project static health, new analysis provider, or `project-health-audit` work appears.
- [x] #6 Quality Contract assertion 8 is satisfied: project lint is clean after a full epoch exists under `missions/plans/test-health-audit/audit/`, with generated audit JSON protected by the configured exclusion rather than formatter mutation.
- [x] #7 The canonical digest covers material source/test/authority/runner/config/setup inputs, bundles 1–9, and canonical baseline-condition rows while excluding only volatile timestamps, the index pointer, and the future owner block.
<!-- AC:END -->
