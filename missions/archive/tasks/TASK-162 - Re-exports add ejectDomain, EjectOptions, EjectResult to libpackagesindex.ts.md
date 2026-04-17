---
id: TASK-162
title: >-
  Re-exports: add ejectDomain, EjectOptions, EjectResult to
  lib/packages/index.ts
status: Done
priority: low
assignee: worker
labels:
  - backend
  - 'plan:domain-eject-and-tiers'
dependencies:
  - TASK-159
createdAt: '2026-04-10T02:16:31.148Z'
updatedAt: '2026-04-10T02:21:10.865Z'
---

## Description

Update `lib/packages/index.ts` to re-export the new eject types and function from `lib/packages/eject.ts`.

Add the following to the existing re-export list:
```typescript
export type { EjectOptions, EjectResult } from "./eject.ts";
export { ejectDomain } from "./eject.ts";
```

Follow the existing file's style: type exports grouped together, value exports separate, sorted alphabetically within each group.

<!-- AC:BEGIN -->
- [ ] #1 lib/packages/index.ts exports ejectDomain, EjectOptions, and EjectResult
- [ ] #2 The new exports follow the existing file style (type exports separate from value exports)
- [ ] #3 No other existing exports in lib/packages/index.ts are changed
<!-- AC:END -->

## Implementation Notes

Added two lines after the catalog exports (alphabetical order): `export type { EjectOptions, EjectResult } from \"./eject.ts\";` and `export { ejectDomain } from \"./eject.ts\";`. No other exports changed. Typecheck passes.
