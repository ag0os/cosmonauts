---
id: TASK-112
title: Update coordinator prompt and spawning capability docs
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies:
  - TASK-110
  - TASK-111
createdAt: '2026-03-21T03:55:49.351Z'
updatedAt: '2026-03-21T04:20:36.660Z'
---

## Description

Update the coordinator prompt and spawning capability documentation to reflect non-blocking spawn behavior and the multi-turn completion loop.

**Files**:
- `domains/coding/prompts/coordinator.md` — rewrite the delegation section
- `domains/shared/capabilities/spawning.md` — document non-blocking behavior

**coordinator.md changes**:
- Rewrite the delegation section: the coordinator calls `spawn_agent` once per ready task (all non-blocking). Each call returns `{ status: "accepted", spawnId }` — not a result. Children run concurrently.
- After spawning all ready tasks, the coordinator explains what it spawned and that it is waiting.
- Completion results arrive as follow-up user messages (formatted: `[spawn_completion] spawnId=... role=... outcome=... summary=...`). Each completion triggers a new turn.
- In each completion turn: verify the task's done status, handle partial failures, and continue spawning the next wave of ready tasks if applicable.
- Add file conflict avoidance guidance: workers should operate on independent files; the coordinator should design task assignments to avoid overlap.

**spawning.md changes**:
- Document that `spawn_agent` is non-blocking: it returns `{ status: "accepted", spawnId }` immediately.
- Document that completion results arrive as follow-up messages, not as the tool's return value.
- Add usage patterns for parallel spawning: spawn all ready tasks first, then await results; process each completion turn by turn.

<!-- AC:BEGIN -->
- [ ] #1 coordinator.md delegation section describes non-blocking spawn_agent usage: spawn all ready tasks, receive completions as follow-up turns
- [ ] #2 coordinator.md includes guidance on processing each completion turn: verify task status, handle failures, spawn next wave if needed
- [ ] #3 coordinator.md includes file conflict avoidance guidance for parallel workers
- [ ] #4 spawning.md documents that spawn_agent returns { status: 'accepted', spawnId } immediately (not the final result)
- [ ] #5 spawning.md documents the completion message format and that results arrive as follow-up prompts
- [ ] #6 spawning.md includes a parallel spawning usage pattern example
<!-- AC:END -->

## Implementation Notes

Updated coordinator.md: rewrote step 4 (delegation) to describe non-blocking parallel spawn, added step 5 (completion turn processing), updated error handling for the multi-turn model, updated critical rules. Updated spawning.md: added 'How spawn_agent Works' section documenting non-blocking return value and completion message format, added 'Parallel Spawning Pattern' section with annotated example.
