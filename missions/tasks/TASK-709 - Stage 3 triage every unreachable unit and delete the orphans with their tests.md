---
id: TASK-709
title: 'Stage 3: triage every unreachable unit and delete the orphans with their tests'
status: To Do
priority: high
labels:
  - 'plan:framework-health'
  - backend
dependencies: []
createdAt: '2026-09-22T19:16:29.350Z'
updatedAt: '2026-09-22T19:16:29.350Z'
---

## Description

Framework-health Stage 3, second half (D-020, B-010). Run the reachability command; for every unreachable unit decide wired / staged-with-owner / deleted, with the human's known gated-off set (episodic-log, memory-consolidation, autonomy-host) pre-listed as staged. The three orphans measured in the plan Overview (lib/orchestration/spawn-compiler.ts, the test-only reach of lib/driver/run-run-loop.ts runOneTask, and the marker-era helpers) must be resolved. Delete orphans together with the tests that only they justified; run the project's checks after each deletion. Also implement D-025: a Cancelled task status accepted by archive; TASK-706 and TASK-707 become Cancelled with their records unchanged.

<!-- AC:BEGIN -->
- [ ] #1 After this task the reachability command exits zero with no unreachable unit and no staged entry whose owner is not live (B-010).
- [ ] #2 Every deleted module is listed in the commit with the reason, and no deleted module is imported by anything that ships.
- [ ] #3 A task with status Cancelled is accepted by plan archive and never counted as satisfied by the scheduler; TASK-706 and TASK-707 are Cancelled and their acceptance criteria and notes are byte-identical to before.
- [ ] #4 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
