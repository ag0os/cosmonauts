---
id: TASK-061
title: Update runtime identity marker for qualified agent IDs
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-060
createdAt: '2026-03-09T16:03:27.522Z'
updatedAt: '2026-03-09T18:30:00.000Z'
---

## Description

Update `lib/agents/runtime-identity.ts` to support qualified agent IDs containing `/` (e.g. `coding/worker`).

**Changes:**
- Update `AGENT_ID_MARKER_REGEX` from `[a-z0-9-]+` to `[a-z0-9/-]+` to accept `/` in the ID capture group
- `buildAgentIdentityMarker` — no logic change needed (accepts any string)
- `extractAgentIdFromSystemPrompt` — returns qualified IDs when present (e.g. `coding/worker`)
- Update all consumers: `subagents` arrays in definitions will contain qualified IDs (`"coding/worker"` not `"worker"`)

**Reference:** Plan section "Runtime identity marker update". Current implementation at `lib/agents/runtime-identity.ts`.

<!-- AC:BEGIN -->
- [x] #1 AGENT_ID_MARKER_REGEX accepts / in the agent ID capture group
- [x] #2 buildAgentIdentityMarker produces valid markers for qualified IDs like 'coding/worker'
- [x] #3 extractAgentIdFromSystemPrompt correctly extracts qualified IDs from system prompts
- [x] #4 Tests verify marker generation and extraction for both qualified and unqualified IDs
<!-- AC:END -->

## Implementation Notes

- Updated regex capture group from `[a-z0-9-]+` to `[a-z0-9/-]+` in `AGENT_ID_MARKER_REGEX`
- Added 3 new test cases for qualified IDs (build, extract, last-marker precedence)
- All 9 tests pass (6 existing + 3 new)
- No changes needed to `buildAgentIdentityMarker` or `appendAgentIdentityMarker` — they already work with any string
