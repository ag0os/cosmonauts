---
id: TASK-468
title: Surface memory warnings to model and injected context
status: Done
priority: medium
labels:
  - 'plan:memory-hardening'
dependencies: []
createdAt: '2026-07-14T14:40:44.647Z'
updatedAt: '2026-07-14T14:53:20.571Z'
---

<!-- AC:BEGIN -->
- [ ] #1 recall text names each skipped record's path and reason (clamped per entry, capped with +N more overflow)
- [ ] #2 Injected context includes a warnings section whose bytes are reserved before any truncation so it can never evict the profile notice
- [ ] #3 Warnings-only stores (zero readable records) still inject a notice naming the broken files
<!-- AC:END -->
