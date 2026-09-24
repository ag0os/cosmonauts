---
id: TASK-722
title: Stage 3 Base-owned suppression check
status: Done
priority: high
labels:
  - backend
  - devops
  - testing
  - 'plan:qm-chain-safety'
dependencies: []
createdAt: '2026-09-24T03:15:53.109Z'
updatedAt: '2026-09-24T03:42:32.990Z'
---

## Description

Implement Implementation Order Stage 3 only: add the base-owned suppression registry, pure matching policy, and shipped project check seeded with current intentional directives. This stage delivers the check part of B-008; Stage 6 is the sole primary owner that completes B-008 with report capture and the `ready` block.

Binding ratified ground (not worker-adjustable; any collision requires halt-and-escalate with a drafted decision under the deviation protocol): INV-001 review and all children cannot mutate the reviewed checkout and isolation failure refuses; INV-002 every relied-on record belongs uniquely to its run and missing evidence fails; INV-003 a complete verdict persists on every exit; INV-004 authority lists bind every launch path; INV-005 changed-scope gates judge only introduced findings and new suppressions require a human-listed exception. D-001 requires: review-only QM with remediation through tasks, Drive and independent review; run-scoped full reports plus an every-exit plan summary and archived shared rounds; a private local clone now with generic runner isolation/OS sandbox deferred; introduced-only committed baselines and reconciled debt docs; human-only suppression exceptions; measured/reproduced evidence for performance P1 and independent closure; a different-family reviewer; and `chain_run` enforcement of the caller allowlist. D-002 forbids QM verification of this plan: implementation workers use codex `gpt-6-sol` at medium effort and closure uses a Claude subagent plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. D-018 permits exactly one reviewed-checkout change, the host-written new non-overwriting plan summary hidden from agents. D-019 makes missing checks/model config visible not-configured and human-decision items that block `ready`, never silence or refusal. D-020 requires a private local clone, not a linked worktree. D-021 starts the QM run after framework bootstrap at the launch boundary and before any QM/panel session. D-022 repairs only live-surface old links, preserves frozen/curated/evidence/archive history, and requires the archive README map. D-023 requires execution-liveness, when rebased later, to register prepare/check processes and the clone as outer-QM-attempt descendants.

<!-- AC:BEGIN -->
- [x] #1 B-008 check part (primary owner: Stage 6) is observable through the shipped suppression-check script: “An added `fallow-ignore`, `biome-ignore`, `eslint-disable`, `@ts-ignore` or `@ts-expect-error` (or a configured equivalent) fails unless it is registered in the base revision's registry. A same-change registry edit does not clear it. Existing and moved registered directives pass.”
- [x] #2 D-009 and Design §8 are preserved by a machine-readable registry keyed by directive family, path, and normalized directive/target fingerprints, loaded from the explicit comparison base; only human-added base-revision entries authorize directives, while current intentional directives are seeded without allowing reviewed changes to self-authorize.
- [x] #3 R-011 is covered for named and equivalent directives, moved directives, changed targets, and same-change registry edits; fingerprint tuning may reduce noise only within D-009 and may never weaken base ownership.
- [x] #4 The Stage 3 file seam is complete in `lib/quality/suppression-policy.ts`, `scripts/check-new-suppressions.ts`, `.cosmonauts/suppression-exceptions.json`, and the suppression-check exposure in `package.json`; gate-owned-file reporting remains explicitly assigned to Stage 6, the B-008 primary owner.
- [x] #5 Code delivery follows red → green → refactor with Vitest coverage under `tests/` mirroring source and entry-point tests of the actual project script; mutation-style cases fail if the current registry is read instead of the base registry, target fingerprints are ignored, or a same-change exception is accepted.
- [x] #6 R-001 and the ratified INV/D constraints in this task are stop-and-escalate ground; derived collisions are amended on record before code, and no exception is added merely to make the new check pass.
<!-- AC:END -->
