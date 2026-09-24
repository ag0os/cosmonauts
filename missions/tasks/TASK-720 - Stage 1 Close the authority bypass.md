---
id: TASK-720
title: Stage 1 Close the authority bypass
status: To Do
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:qm-chain-safety'
dependencies: []
createdAt: '2026-09-24T03:15:12.457Z'
updatedAt: '2026-09-24T03:15:12.457Z'
---

## Description

Implement Implementation Order Stage 1 only: close the `chain_run` and `run_driver` authority bypasses while preserving the existing `spawn_agent` predicate and allowed top-level behavior. This stage delivers the routes part of B-001; Stage 6 is the sole primary owner that completes B-001 with the QM profile.

Binding ratified ground (not worker-adjustable; any collision requires halt-and-escalate with a drafted decision under the deviation protocol): INV-001 review and all children cannot mutate the reviewed checkout and isolation failure refuses; INV-002 every relied-on record belongs uniquely to its run and missing evidence fails; INV-003 a complete verdict persists on every exit; INV-004 authority lists bind every launch path; INV-005 changed-scope gates judge only introduced findings and new suppressions require a human-listed exception. D-001 requires: review-only QM with remediation through tasks, Drive and independent review; run-scoped full reports plus an every-exit plan summary and archived shared rounds; a private local clone now with generic runner isolation/OS sandbox deferred; introduced-only committed baselines and reconciled debt docs; human-only suppression exceptions; measured/reproduced evidence for performance P1 and independent closure; a different-family reviewer; and `chain_run` enforcement of the caller allowlist. D-002 forbids QM verification of this plan: implementation workers use codex `gpt-6-sol` at medium effort and closure uses a Claude subagent plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. D-018 permits exactly one reviewed-checkout change, the host-written new non-overwriting plan summary hidden from agents. D-019 makes missing checks/model config visible not-configured and human-decision items that block `ready`, never silence or refusal. D-020 requires a private local clone, not a linked worktree. D-021 starts the QM run after framework bootstrap at the launch boundary and before any QM/panel session. D-022 repairs only live-surface old links, preserves frozen/curated/evidence/archive history, and requires the archive README map. D-023 requires execution-liveness, when rebased later, to register prepare/check processes and the clone as outer-QM-attempt descendants.

<!-- AC:BEGIN -->
- [ ] #1 B-001 routes part (primary owner: Stage 6): through the shipped `chain_run`, `run_driver`, and existing `spawn_agent` tools, “A forbidden target in any sequential, bracket or fan-out position of a `chain_run` expression is refused before any run is allocated. So is a `run_driver` call from a caller not allowed to start `worker`, and a forbidden `spawn_agent`. Each refusal names the caller and the target,” while “Leads whose definitions list the target, and top-level CLI invocations, behave as before.”
- [ ] #2 Design §1 and D-001 item 8 are satisfied by one shared `isSubagentAllowed` admission predicate with shared target resolution and denial facts: every parsed chain member is checked before allocation, driver authority is checked before task discovery/allocation, unknown callers or targets fail closed, and R-013 requires any newly found agent-starting surface to use this admission or be proven genuinely top-level.
- [ ] #3 The Stage 1 file seam is complete in `domains/shared/extensions/orchestration/authorization.ts`, `chain-tool.ts`, and `driver-tool.ts`; `spawn-tool.ts` retains equivalent existing admission behavior, and no policy is moved into coding-domain prompts or definitions.
- [ ] #4 Behavior proof follows red → green → refactor in Vitest under `tests/` mirroring source and exercises the shipped tools, including sequential, bracket, fan-out, pre-allocation, unknown-identity, allowed-lead, and top-level negative/positive cases; an exported helper alone is not proof.
- [ ] #5 R-001 and the ratified INV/D constraints in this task are stop-and-escalate ground; derived collisions are amended on record before code, and no test expectation may be weakened to make the implementation green.
<!-- AC:END -->
