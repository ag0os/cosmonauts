---
id: TASK-065
title: Add domain field to project config
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies: []
createdAt: '2026-03-09T16:04:12.755Z'
updatedAt: '2026-03-09T16:14:47.499Z'
---

## Description

Add a `domain` field to the project configuration type and parser to allow projects to specify a default domain.

**Changes:**
- `lib/config/types.ts`: Add `domain?: string` to `ProjectConfig` interface
- `lib/config/loader.ts`: Parse the `domain` field from `.cosmonauts/config.json`
- Update tests

**Reference:** Plan section "Config loader update". Spec section "Project Config Addition".

<!-- AC:BEGIN -->
- [x] #1 ProjectConfig in lib/config/types.ts has an optional domain?: string field
- [x] #2 Config loader parses the domain field from .cosmonauts/config.json
- [x] #3 Missing domain field defaults to undefined (not an error)
- [x] #4 Config loader tests verify domain field parsing
<!-- AC:END -->

## Implementation Notes

Verified all ACs are met by prior worker's implementation. All 14 config loader tests pass. domain field exists in types.ts, loader.ts parses it, missing domain defaults to undefined, and three dedicated tests cover domain parsing (parses domain string, defaults to undefined, ignores non-string). Checked off all AC boxes.
