---
id: TASK-681
title: Prove and observe Quality Manager liveness
status: To Do
priority: high
labels:
  - orchestration
  - quality
  - documentation
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-680
  - TASK-682
createdAt: '2026-09-11T13:25:38.090Z'
updatedAt: '2026-09-13T04:03:40.105Z'
---

## Description

Complete B-012 in shadow-first Wave A. Prove the synthetic silent Quality Manager outer step through runDurableChain, expose liveness state and metrics, update operator guidance, and leave the enablement decision to the dependent human task.

<!-- AC:BEGIN -->
- [ ] #1 B-012 replaces its todo with an executable integration test that runs a synthetic silent Quality Manager step through runDurableChain and reaches terminal or terminal-blocked state within enforced test policy.
- [ ] #2 The Quality Manager proof retains session, activity, deadline, cancellation, and rejected-result evidence sufficient to distinguish the three observed tail shapes.
- [ ] #3 Status, watch, metrics, and documentation distinguish heartbeat, useful activity, suspension, shadow or enforce deadline, cancellation acknowledgement or settlement, and planless session evidence.
- [ ] #4 The proof leaves Quality Manager topology, the 200-character summary contract, and the separate qm-chain-safety filename defect unchanged; active-long coverage remains owned by B-005.
- [ ] #5 No test.todo remains for B-012; its named test, plan artifact check, full test suite, lint, and typecheck execute and pass before TASK-685 receives the live evidence.
<!-- AC:END -->
