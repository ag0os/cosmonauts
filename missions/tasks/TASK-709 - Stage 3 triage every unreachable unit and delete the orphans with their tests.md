---
id: TASK-709
title: 'Stage 3: triage every unreachable unit and delete the orphans with their tests'
status: To Do
priority: high
labels:
  - 'plan:framework-health'
  - backend
dependencies:
  - TASK-708
createdAt: '2026-09-22T19:16:29.350Z'
updatedAt: '2026-09-22T19:16:29.350Z'
---

## Description

Framework-health Stage 3, second half (D-020, B-010). Run the reachability command; for every unreachable unit decide wired / staged-with-owner / deleted, with the gated-off set per D-027: autonomy-host pre-listed as a plan: owner; episodic-log expected reachable (not staged unless the run says otherwise); a module that would need memory-consolidation as owner halts for the human, since it has no plan and no roadmap heading today. The orphans the plan Overview measures (lib/orchestration/spawn-compiler.ts with no production importer, and lib/driver/run-run-loop.ts reached by production only for a type, so runOneTask is test-only) must be resolved. Delete orphans together with the tests that only they justified; run the project's checks after each deletion.

<!-- AC:BEGIN -->
- [ ] #1 After this task the reachability command exits zero with no unreachable unit and no staged entry whose owner is not live (B-010).
- [ ] #2 Every deleted module is listed in the commit with the reason, and no deleted module is imported by anything that ships.
- [ ] #3 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
