---
id: TASK-146
title: Post-completion transcript generation and manifest recording in agent-spawner
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-143
  - TASK-144
  - TASK-145
createdAt: '2026-04-07T19:04:50.340Z'
updatedAt: '2026-04-07T19:24:24.888Z'
---

## Description

Modify `agent-spawner.ts` to generate a transcript and append a `SessionRecord` to the plan manifest after each spawn completes (success or failure). This closes the loop on session lineage capture.\n\n**Modified files:**\n- `lib/orchestration/agent-spawner.ts` — in the `finally` block alongside `session.dispose()`: generate transcript, write transcript file, append manifest record\n\n**Implementation:** After spawn (in `finally`):\n1. If `planSlug` is set: call `generateTranscript(result.messages, role)` and `writeTranscript`\n2. Call `appendSession` with a `SessionRecord` including role, sessionId, parentSessionId, outcome, file paths, stats, and timestamps\n3. This happens even on failure — partial sessions should still be recorded

## Implementation Plan

AC#1: ✅ Transcript written to missions/sessions/<planSlug>/<role>-<uuid>.transcript.md\nAC#2: ✅ Manifest SessionRecord contains role, sessionId, outcome, sessionFile, transcriptFile, stats, timestamps\nAC#3: ✅ finally block records even on failure with outcome: failed\nAC#4: ✅ No transcript/manifest when planSlug absent\nAC#5: ✅ All 73 existing agent-spawner tests pass"

<!-- AC:BEGIN -->
- [ ] #1 After a plan-linked spawn succeeds, a transcript .md file exists at missions/sessions/<planSlug>/<role>-<uuid>.transcript.md
- [ ] #2 After a plan-linked spawn completes (success or failure), the session manifest contains a SessionRecord with correct role, sessionId, outcome, sessionFile, transcriptFile, stats, and timestamps (QC-004)
- [ ] #3 Recording happens in the finally block — a failed spawn still produces a manifest entry with outcome: failed
- [ ] #4 When planSlug is absent, no transcript is written and no manifest is updated (QC-005)
- [ ] #5 Existing agent-spawner tests continue to pass (no behavioral regression for non-plan sessions)
<!-- AC:END -->

## Implementation Notes

Modified `lib/orchestration/agent-spawner.ts` to generate and write a transcript, then append a `SessionRecord` to the plan manifest in the inner `finally` block (alongside `session.dispose()`). Key decisions:\n- Used `dirname(sessionFilePath)` to derive plan sessions dir and base sessions dir — avoids re-importing `sessionsDirForPlan` and keeps the path derivation close to the source of truth.\n- Captured `finalMessages` from `session.messages` before `session.dispose()` to ensure messages are available for transcript generation.\n- Tracked `spawnOutcome` and `capturedStats` as variables set on the success path; on failure they remain `\"failed\"` / `undefined` so the manifest entry reflects the real outcome.\n- Lineage recording is wrapped in a try/catch within the `finally` block — errors are silently swallowed to prevent lineage failures from crashing spawns.\n- `SessionRecord.stats.tokens` excludes `cacheRead`/`cacheWrite` (not in the type); only `input`, `output`, `total` are written.\n- Added 16 tests in `tests/orchestration/agent-spawner.lineage.test.ts` covering all ACs; existing 73 spawner tests continue to pass."
