---
id: TASK-480
title: Persist Drive capture failures as bridged diagnostics
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-478
createdAt: '2026-07-17T20:08:30.522Z'
updatedAt: '2026-07-17T20:08:30.522Z'
---

## Description

Implementation Order step 7 diagnostic-transport branch (the authoritative plan places B-026 with Drive normal exits). Add an awaitable Drive warning reporter and bridge `driver_diagnostic` to every existing observation channel without making capture load-bearing. This task solely owns B-026 and depends on the common Drive capture contract.

<!-- AC:BEGIN -->
- [ ] #1 B-026 (Source AC-006) is proven with the sole `@cosmo-behavior plan:episodic-log#B-026` marker: episode capture failures appear with path/reason in legacy JSONL, normalized durable events, and the session bus via `BRIDGED_EVENT_TYPES`, while Drive result and completion remain unchanged.
- [ ] #2 The Drive reporter is awaited and surfaces emit/append failure by rejecting or throwing; it never swallows failure or reports false success, allowing `recordEpisode` to provide one bounded stderr fallback without rejecting.
- [ ] #3 Exactly one warning owner exists at the Drive edge, preventing details-only, partial-channel, duplicate stderr-plus-diagnostic, or unhandled-rejection behavior.
- [ ] #4 Driver diagnostic transport remains additive and does not widen MemoryStore contracts, create a parallel serializer/state store, or turn episode persistence into a prerequisite for primary Drive work.
- [ ] #5 Targeted fault-injection tests catch missing bus bridging, missing legacy/durable persistence, swallowed reporter errors, duplicate warnings, and capture failures that alter Drive outcomes.
<!-- AC:END -->
