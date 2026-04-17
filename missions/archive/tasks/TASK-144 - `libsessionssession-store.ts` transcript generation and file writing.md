---
id: TASK-144
title: '`lib/sessions/session-store.ts`: transcript generation and file writing'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-141
createdAt: '2026-04-07T19:04:27.944Z'
updatedAt: '2026-04-07T19:14:42.840Z'
---

## Description

Implement session directory resolution and transcript generation. `generateTranscript` is a pure function (messages → markdown) and is the primary extraction point for human-readable session summaries.\n\n**New files:**\n- `lib/sessions/session-store.ts` — `sessionsDirForPlan`, `generateTranscript`, `writeTranscript` (exact signatures from plan)\n- `tests/sessions/session-store.test.ts` — transcript generation tests with mock AgentMessage arrays\n\n**Transcript extraction rules** (from plan):\n- Include: user prompt messages, assistant text content, assistant thinking content, tool call names only (not args/results)\n- Exclude: tool result message content, tool call arguments (too noisy)\n- Defensively handle `unknown[]` shape — fallback gracefully for unexpected structures (QC-003 prerequisite)\n- Output is valid markdown with role headers per message

<!-- AC:BEGIN -->
- [ ] #1 sessionsDirForPlan(projectRoot, planSlug) returns missions/sessions/<planSlug> as an absolute path
- [ ] #2 generateTranscript(messages, role) produces valid markdown from a mock AgentMessage array covering: user messages, assistant text, assistant thinking, tool call names
- [ ] #3 generateTranscript handles unknown[] defensively — does not throw on unexpected message shapes
- [ ] #4 writeTranscript writes the markdown string to the given file path, creating directories as needed
- [ ] #5 Tests cover all AgentMessage variant types: user prompt, assistant text, assistant thinking, tool call, tool result (QC-002)
<!-- AC:END -->

## Implementation Notes

Implemented lib/sessions/session-store.ts with three exports: sessionsDirForPlan (pure path join), generateTranscript (pure unknown[]→markdown, defensively handles all AgentMessage variants), writeTranscript (mkdir -p + writeFile). No imports from lib/orchestration/ (QC-001). 31 tests pass covering all message variant types and edge cases.
