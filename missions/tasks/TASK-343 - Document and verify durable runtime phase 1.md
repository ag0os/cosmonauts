---
id: TASK-343
title: Document and verify durable runtime phase 1
status: To Do
priority: medium
labels:
  - testing
  - devops
  - 'plan:durable-run-store-events'
dependencies:
  - TASK-342
createdAt: '2026-06-03T21:58:27.016Z'
updatedAt: '2026-06-03T21:58:27.016Z'
---

## Description

Implementation Order step 7. Update planned documentation and run the Quality Contract gates after all behavior implementation tasks are complete. This task owns final cross-behavior verification rather than new runtime behavior. Behavior markers must be present near executable tests as `@cosmo-behavior plan:durable-run-store-events#B-###` for every planned behavior.

<!-- AC:BEGIN -->
- [ ] #1 Documentation in `lib/driver/README.md` and `domains/shared/capabilities/drive.md` accurately describes the behavior guarantees for B-006, B-008, B-009, B-010, B-011, B-016, and B-017: Drive keeps legacy event/status/list/resume/watch compatibility while normalized Drive events live in the `orchestration-events.jsonl` sidecar and durable setup/write failures remain isolated.
- [ ] #2 Behavior-spine evidence exists for B-001 through B-017 with exact `@cosmo-behavior plan:durable-run-store-events#B-###` markers in the plan-named tests: `creates an inspectable run layout and reloads run metadata`, `continues event sequences after reopening the file store`, `persists step records and rejects path traversal identifiers`, `maps driver lifecycle events without fabricating backend or step data`, `preserves reports activity commits and finalization details without extending terminal events`, `writes normalized events alongside unchanged legacy driver events`, `continues the drive run when normalized event append fails`, `ignores normalized runtime files when classifying drive status`, `ignores normalized-only runtime directories when listing drive runs`, `resume uses legacy driver events while dual-writing normalized resume events`, `reads legacy driver events when normalized events also exist`, `pages normalized events by sequence cursor and reports malformed lines`, `derives status from terminal events when run records disagree`, `registers only read-only normalized run observation tools`, `maps failed preflight to activity detail followed by canonical step blocked`, `reports normalized status and events from a drive-produced run record events path`, and `continues the drive run when run record creation fails before the first event`.
- [ ] #3 The plan's Quality Contract gates pass for the implemented behavior set: targeted behavior tests plus project test/lint/typecheck checks, behavior-spine marker conformance, targeted negative-test coverage for listed mutation risks, and boundary-conformance inspection.
- [ ] #4 No scheduler ownership, backend adapter migration, fabricated normalized fields, non-canonical terminal event fields, mutating runtime controls, or replacement of legacy `watch_events` behavior is introduced during final documentation or verification.
<!-- AC:END -->
