---
id: TASK-143
title: '`lib/sessions/manifest.ts`: plan-session lineage manifest'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-141
createdAt: '2026-04-07T19:04:17.361Z'
updatedAt: '2026-04-07T19:14:24.940Z'
---

## Description

Implement manifest CRUD operations for the plan-to-session lineage file. The manifest is a JSON file at `missions/sessions/<planSlug>/manifest.json` tracking all sessions that participated in a plan.\n\n**New files:**\n- `lib/sessions/manifest.ts` — `createManifest`, `appendSession`, `readManifest` (exact signatures from plan)\n- `tests/sessions/manifest.test.ts` — create/append/read tests using temp directories\n\nManifest file is JSON with `SessionManifest` shape. `appendSession` creates the manifest if it doesn't exist yet, then appends the record.

<!-- AC:BEGIN -->
- [ ] #1 createManifest writes a valid SessionManifest JSON file to the sessions directory
- [ ] #2 appendSession adds a SessionRecord to an existing manifest and updates updatedAt
- [ ] #3 appendSession creates the manifest if it does not exist (idempotent on first call)
- [ ] #4 readManifest returns the deserialized SessionManifest, or undefined when the file does not exist
- [ ] #5 Tests use temporary directories and pass reliably (no global state, no file leaks) (QC-004)
<!-- AC:END -->

## Implementation Notes

Implemented createManifest, appendSession, readManifest in lib/sessions/manifest.ts. All 17 tests pass. The lint error in lib/sessions/session-store.ts (format) is pre-existing and unrelated to this task. The remaining lint warning in tests is from a `String()` cast used to avoid noNonNullAssertion lint rule while comparing optional strings.
