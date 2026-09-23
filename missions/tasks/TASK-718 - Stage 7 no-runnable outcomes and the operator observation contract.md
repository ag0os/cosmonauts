---
id: TASK-718
title: 'Stage 7: no-runnable outcomes and the operator observation contract'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies:
  - TASK-717
createdAt: '2026-09-23T13:13:13.320Z'
updatedAt: '2026-09-23T13:13:13.320Z'
---

## Description

Execution-liveness Implementation Order stage 7; owns B-010 (Design §9, §12; D-037). Add concrete no-runnable outcomes; complete start/stop/control/effect/hook/event diagnostics; D-037 cancellable grace waits and dispositions; uniform summaries; projection retries (R-014); and replacement-run guidance. Wire CLI process signals and Pi tool signals through the shared observation API.

<!-- AC:BEGIN -->
- [ ] #1 B-010: with unreachable dependent work, blocked reachable work yields blocked; otherwise failed yields failed, cancelled yields cancelled, and legacy stale ranks last. Dependents are neither executed nor manually rewritten.
- [ ] #2 CLI SIGINT and a Pi tool abort during a status/watch grace wait both return the complete/interrupted disposition through the one D-037 API. The intent remains and the next trigger resumes the original grace.
- [ ] #3 A compatibility projection failure after terminalization leaves the terminal outcome absorbing and retries only the projection.
- [ ] #4 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
