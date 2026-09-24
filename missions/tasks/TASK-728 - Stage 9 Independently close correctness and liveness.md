---
id: TASK-728
title: Stage 9 Independently close correctness and liveness
status: To Do
priority: medium
labels:
  - testing
  - 'plan:qm-chain-safety'
dependencies:
  - TASK-762
  - TASK-763
  - TASK-761
  - TASK-760
  - TASK-759
  - TASK-748
  - TASK-747
  - TASK-720
  - TASK-721
  - TASK-722
  - TASK-723
  - TASK-724
  - TASK-725
  - TASK-726
  - TASK-727
  - TASK-729
  - TASK-730
  - TASK-731
  - TASK-732
  - TASK-733
  - TASK-734
  - TASK-735
  - TASK-736
  - TASK-737
  - TASK-738
  - TASK-739
  - TASK-740
  - TASK-741
  - TASK-742
  - TASK-743
  - TASK-744
  - TASK-745
  - TASK-746
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
- [ ] #6 (Compliance patch, 2026-09-24) The minimum attack list is executed, not just inspected — capture: a stale stat cache plus an injected porcelain call, an absolute or root-escaping symlink, source edits between the two samples; authority: bracket and fan-out `chain_run` to `fixer`, a QM or child attempting bash, write or `chain_run`; reviewer evidence: a forged, duplicate, foreign or empty reviewer completion, a reviewer timeout with no cancellation; suppressions: a same-change registry edit, a gate-owned-file edit; models and config: same-family, unresolvable and substituted models, unconfigured checks and model; end to end: one real QM run on a dirty checkout of this repository, with before/after hashes of HEAD, refs, `.git/index` and every tracked and untracked file.
- [ ] #7 (Compliance patch, 2026-09-24) Pass condition and evidence: both channels report no unresolved correctness or liveness finding, or each finding has a recorded disposition under #5. Both channels' full outputs are saved as `missions/plans/qm-chain-safety/closure-review-<n>.md`, so the closure verdict is durable.
<!-- AC:END -->
