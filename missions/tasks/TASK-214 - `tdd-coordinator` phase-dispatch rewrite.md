---
id: TASK-214
title: '`tdd-coordinator` phase-dispatch rewrite'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:tdd-orchestration-hardening'
dependencies:
  - TASK-213
  - TASK-211
createdAt: '2026-04-28T14:30:18.699Z'
updatedAt: '2026-04-28T15:03:50.151Z'
---

## Description

Replace marker-driven orchestration in `tdd-coordinator.md` with manual ready-task discovery over plan-scoped `To Do` tasks plus explicit dependency-status checks. Define the phase→agent map, add `verifier` to the subagent allowlist, carry over coordinator-style file-conflict sequencing, and apply the fail-closed parser rule for malformed tasks.

**Files to change:**
- `bundled/coding/coding/agents/tdd-coordinator.ts` — add `verifier` to `subagents`
- `bundled/coding/coding/prompts/tdd-coordinator.md` — replace marker-state instructions with phase-dispatch logic
- `tests/prompts/tdd-coordinator.test.ts` — new file
- `tests/domains/coding-agents.test.ts` — update to cover new allowlist entries

**Phase→agent invariant map:**
```
phase:red         → test-writer
phase:red-verify  → verifier
phase:green       → implementer
phase:refactor    → refactorer
```
Unknown `phase:*` labels → set task to `Blocked`, do not guess.

**Ready-task discovery rule (PR-001 fix):**
- List plan-scoped `To Do` tasks
- For each candidate, read its `dependencies` array
- Verify each dependency ID is `Done` via `task_view`
- MUST NOT use `task_list(hasNoDependencies: true)` — that helper returns only tasks with empty dependency arrays; it can never surface `-red-verify`, `-green`, or `-refactor` tasks

**Fail-closed parser rule (PR-002 fix):**
- Missing required sections, malformed bullets, or empty file sets → set task to `Blocked` with `file-set parse failed: <reason>` in `implementationNotes`
- Do NOT leave malformed tasks in `To Do` (that keeps chain-runner loop pending forever)
- `Blocked` is the correct terminal state for the runner's completion semantics

**File-conflict rule:** Derive file set from all `file:` entries in `## Test Targets` and `## Implementation Pointers`; sequence ready tasks with overlapping file sets before spawning parallel work.

**Remove entirely:** all marker-state instructions, `RED-VERIFIED:` references, `select_next_phase` helper, and `implementationNotes`-based state transitions.

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding/coding/agents/tdd-coordinator.ts adds verifier to subagents alongside test-writer, implementer, and refactorer
- [ ] #2 tdd-coordinator.md defines and uses the invariant map: phase:red → test-writer, phase:red-verify → verifier, phase:green → implementer, phase:refactor → refactorer; unknown phase:* labels cause the task to be set to Blocked, not guessed
- [ ] #3 tdd-coordinator.md computes readiness manually: lists plan-scoped To Do tasks, reads each candidate's dependencies, verifies each dependency is Done via task_view; does NOT use task_list(hasNoDependencies: true) for phase tasks
- [ ] #4 tdd-coordinator.md carries coordinator-style file-conflict sequencing: derives a file set from ## Test Targets and ## Implementation Pointers; tasks with overlapping file sets are sequenced even when dependency-free
- [ ] #5 tdd-coordinator.md applies the fail-closed parser rule: missing required sections, malformed bullets, or empty file sets set the task to Blocked with a 'file-set parse failed: <reason>' note in implementationNotes (NOT left in To Do)
- [ ] #6 All marker-state instructions, RED-VERIFIED: references, select_next_phase calls, and implementationNotes-based state transitions are removed from tdd-coordinator.md
- [ ] #7 tests/prompts/tdd-coordinator.test.ts covers the phase→agent mapping, manual ready-task discovery (explicit dependency-status check), file-conflict sequencing, and the fail-closed parse-error Blocked transition
- [ ] #8 tests/domains/coding-agents.test.ts confirms tdd-coordinator can spawn verifier and quality-manager can spawn tdd-coordinator
<!-- AC:END -->

## Implementation Notes

Verified ACs 1-8 against the current task files, added an explicit prompt rule that `implementationNotes` are diagnostic only (never orchestration state), and extended the prompt regression to cover that invariant. Confirmed allowlists and phase-dispatch guidance remain in place. Validation: `bun run typecheck && bun run test`. Commit: `e2e91ac` (`TASK-214: Forbid note-driven TDD coordinator state`).
