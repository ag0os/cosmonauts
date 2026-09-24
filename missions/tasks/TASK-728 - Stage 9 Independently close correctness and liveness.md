---
id: TASK-728
title: Stage 9 Independently close correctness and liveness
status: To Do
priority: medium
labels:
  - testing
  - 'plan:qm-chain-safety'
dependencies:
  - TASK-720
  - TASK-721
  - TASK-722
  - TASK-723
  - TASK-724
  - TASK-725
  - TASK-726
  - TASK-727
createdAt: '2026-09-24T03:18:26.982Z'
updatedAt: '2026-09-24T03:18:26.982Z'
---

## Description

Perform Implementation Order Stage 9 only after Stages 1–8 are complete. This is independent closure, not implementation: it owns no B-001..B-012 behavior and must not use the Quality Manager to certify its own repair.

Binding ratified ground (not worker-adjustable; any collision requires halt-and-escalate with a drafted decision under the deviation protocol): INV-001 review and all children cannot mutate the reviewed checkout and isolation failure refuses; INV-002 every relied-on record belongs uniquely to its run and missing evidence fails; INV-003 a complete verdict persists on every exit; INV-004 authority lists bind every launch path; INV-005 changed-scope gates judge only introduced findings and new suppressions require a human-listed exception. D-001 requires: review-only QM with remediation through tasks, Drive and independent review; run-scoped full reports plus an every-exit plan summary and archived shared rounds; a private local clone now with generic runner isolation/OS sandbox deferred; introduced-only committed baselines and reconciled debt docs; human-only suppression exceptions; measured/reproduced evidence for performance P1 and independent closure; a different-family reviewer; and `chain_run` enforcement of the caller allowlist. D-002 requires exactly this correctness/liveness closure: no quality-manager; use an independent Claude subagent reviewer plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`; implementation workers are codex `gpt-6-sol` at medium effort. D-018 permits exactly one reviewed-checkout change, the host-written new non-overwriting plan summary hidden from agents. D-019 makes missing checks/model config visible not-configured and human-decision items that block `ready`, never silence or refusal. D-020 requires a private local clone, not a linked worktree. D-021 starts the QM run after framework bootstrap at the launch boundary and before any QM/panel session. D-022 repairs only live-surface old links, preserves frozen/curated/evidence/archive history, and requires the archive README map. D-023 requires execution-liveness, when rebased later, to register prepare/check processes and the clone as outer-QM-attempt descendants.

<!-- AC:BEGIN -->
- [ ] #1 D-002 closure evidence includes both independent channels and no Quality Manager: a Claude subagent reviewer and `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, each explicitly framed to assess correctness and liveness against the approved spec and plan.
- [ ] #2 The independent reviews exercise or inspect every Stage 1–8 behavior proof without taking ownership of B-001..B-012, and adversarially attack every refusal, producer/correlation boundary, lifecycle/terminal outcome, authority route, snapshot fidelity case, baseline category, suppression/tamper path, report defect, model-family outcome, and legacy-link/caller path.
- [ ] #3 R-014 structural closure confirms framework-owned launch/artifact/model policy remains out of coding prompts and named complexity hotspots, durable runtime remains unaware of QM personas/Git mechanics, injected ports preserve dependency direction, ordinary agents/runs are unchanged, and no excluded generic isolation, panel-graph, owner-liveness, cancellation, summary, or evidence-generalization scope entered the implementation.
- [ ] #4 Configured project test, lint, and typecheck gates pass after the adversarial review, and the evidence demonstrates behavior through shipped tools, commands, chains, status projections, scripts, and documented-process files rather than exported functions alone.
- [ ] #5 Any finding is classified against current recorded ground; remediation is performed only through ordinary tasks and Drive, ratified collisions halt for a human decision, derived collisions are amended on record first, and every remediation receives another independent Claude-plus-read-only-codex correctness/liveness review before closure.
<!-- AC:END -->
