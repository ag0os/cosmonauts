---
id: TASK-814
title: >-
  Shared provider runner: bounded settle after termination (driver-hardening
  Claude review 1, F3 pre-existing half)
status: To Do
priority: medium
labels:
  - follow-up
  - backend
  - analysis
dependencies: []
createdAt: '2026-09-30T11:41:40.147Z'
updatedAt: '2026-09-30T11:41:40.147Z'
---

## Description

Post-plan follow-up from driver-hardening (improvement row 13; `missions/reviews/claude/driver-hardening-round-1.md` F3). `domains/shared/extensions/project-tools/process-runner.ts` (`runProviderProcess`) never settles when a descendant escapes the process group while holding stdout/stderr (reproduced with a `setsid` child); every analysis capability call can hang a Pi session. The probe-local runner got a settle deadline in TASK-811 P3 and TASK-812; mirror that here. This touches a shared extension, so it needs its own plan-level sign-off (gate-owned path precedent R-013).

<!-- AC:BEGIN -->
- [ ] #1 After termination is initiated (timeout or abort), a bounded settle deadline destroys the pipes and resolves with the initiated outcome even if a descendant holds the pipes; a test with a setsid child that inherits stdio settles within the bound.
- [ ] #2 Existing provider-runner tests keep passing; no capability contract changes.
<!-- AC:END -->
