---
id: TASK-714
title: 'Stage 3: liveness policy, observation composition and launch writers'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies:
  - TASK-713
createdAt: '2026-09-23T13:13:11.224Z'
updatedAt: '2026-09-23T13:13:11.224Z'
---

## Description

Execution-liveness Implementation Order stage 3; owns B-005 (Design §1, §12; D-037, D-039). Cover absent, partial, invalid and default policy; Chain global composition; the Drive minimum; early identity; invalid-current-config observation; and a frozen resume. Wire cli/drive/subcommand.ts and domains/shared/extensions/orchestration/driver-tool.ts to the single DriverRunSpec liveness member from stage 1, and build the minimal observation context. Keep the old Drive timer until the backend cutover. Surface stage 1's refused platform/backend combinations as a visible launch refusal (review-7 PR-007, D-041). This task is not the B-001 owner; stage 5 is.

<!-- AC:BEGIN -->
- [ ] #1 B-005: .cosmonauts/config.json selects the idle mode/window and hard baseline without CLI flags. Omitted values use sourced defaults. An invalid member refuses a new launch and names the key. Status shows the frozen policy, candidates and deadline. A later invalid config appears only as a current-config diagnostic and blocks neither observation nor reconciliation of a frozen run.
- [ ] #2 A Drive run started from the CLI and one started from the tool persist a byte-comparable liveness snapshot through the shared DriverRunSpec type, and a resume leaves it unchanged (review-7 PR-005).
- [ ] #3 Launching on a platform/backend combination that stage 1 refuses (e.g. process-group control unavailable) fails before any attempt starts. The error names the unsupported capability and is visible from each of cosmonauts run chain, cosmonauts run drive, chain_run and run_driver (review-7 PR-007; AC-014 itself stays deferred).
- [ ] #4 Launch returns the exact run identity before it waits (B-001's identity half, verified here, owned by stage 5).
- [ ] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
