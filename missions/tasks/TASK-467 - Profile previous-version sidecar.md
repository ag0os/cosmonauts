---
id: TASK-467
title: Profile previous-version sidecar
status: Done
priority: high
labels:
  - 'plan:memory-hardening'
dependencies: []
createdAt: '2026-07-14T14:40:44.226Z'
updatedAt: '2026-07-14T14:49:04.788Z'
---

<!-- AC:BEGIN -->
- [ ] #1 Replacing an existing valid profile first writes its prior content to profile.md.prev
- [ ] #2 Sidecar file is never listed as a record, never parsed, and never indexed
- [ ] #3 First-ever profile creation writes no sidecar
- [ ] #4 docs/memory.md documents the recovery path
<!-- AC:END -->
