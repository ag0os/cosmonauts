---
id: TASK-113
title: 'Domain manifest: add portable field to DomainManifest'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies: []
createdAt: '2026-03-28T20:34:48.887Z'
updatedAt: '2026-03-28T20:56:37.452Z'
---

## Description

Add `portable?: boolean` to the `DomainManifest` interface in `lib/domains/types.ts` and update the domain loader to read it into `LoadedDomain`. No behavior change — this is a pure type/data addition that unlocks portable domain support downstream.

<!-- AC:BEGIN -->
- [x] #1 DomainManifest interface has optional `portable?: boolean` field
- [x] #2 LoadedDomain carries the portable flag from its manifest
- [x] #3 Domain loader reads and propagates the portable field when loading a domain directory
- [x] #4 Existing domains without the field default to portable = false
- [x] #5 Existing tests continue to pass without modification
<!-- AC:END -->

## Implementation Notes

Second worker failure: worker (spawnId 812ab3c7) reported success and claimed ACs were checked and status set to Done, but task_view shows status still "In Progress" and all ACs unchecked. The underlying code changes are believed to be present (portable field in types.ts, loader.ts updated, test literals patched). Needs human review to verify the implementation and manually check off ACs.
