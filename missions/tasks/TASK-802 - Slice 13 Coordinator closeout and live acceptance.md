---
id: TASK-802
title: 'Slice 13: Coordinator closeout and live acceptance'
status: In Progress
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-801
createdAt: '2026-09-29T16:58:42.614Z'
updatedAt: '2026-09-29T20:51:09.280Z'
---

## Description

Implementation Order slice 13 (plan D-031). Owns B-012 from AC-019 and AC-020. Coordinator-run: this task is NOT dispatched through Drive and has no worker; the implementing coordinator performs every criterion after TASK-801's Drive commit and checks the criteria itself. Governed by D-001, D-003, D-020, D-026, D-027, D-028, D-030, and D-031.

<!-- AC:BEGIN -->
- [ ] #1 Host restart (D-028, second checkpoint): after TASK-801's Drive commit, exit the cosmo host, start a fresh print-mode cosmo session, confirm `bin/cosmonauts-drive-step` does not exist, and record HEAD and the session start time in this task's notes, so the live run executes slices 1-12 as committed.
- [ ] #2 B-012 (source AC-019): the coordinator audits every task TASK-790..801 for its per-behavior red/green rows (test name, commit, one-line failure; passing result) and appends a `## Evidence` table with one row per behavior B-001..B-015 to `missions/plans/driver-hardening/plan.md` (D-030); a behavior without a recorded failing run is a finding routed back to its owning task, never filled in by the coordinator.
- [ ] #3 B-012 (source AC-020): the coordinator audits the complete change set from the branch base to HEAD for suppression, threshold, baseline, ignore-pattern, or configuration changes made to clear a finding and for test expectation changes that do not cite the defect criterion they pinned; the audit command lines and result are recorded in this task's notes.
- [ ] #4 Live acceptance (B-012): create an unlabelled throwaway task with raw sentinel notes (CRLF, trailing spaces, a boundary blank line) whose attempt 1 reports `failure` naming an existing path as absent and whose attempt 2 reports `blocked` with a fixed reason; run only that task through real inline `cosmonauts-subagent` via `run_driver` with `commitPolicy` `no-commit` and one consented external postflight sentinel command that appends once per execution; accept only if the notes preserve the sentinel bytes and show Drive attempt 1 then attempt 2, events show attempt 1's block evidence, `task_retry`, the second `spawn_started`, exactly one postflight set before the retry and none after the blocked report, no third spawn, the verbatim final reason, a snapshot ref for the dirty tree on `spawn_started`, and durable and legacy records that agree; in `finally`, settle the run, retain its directory, append the run ID, retained artifact path, and the observed event subsequence (or the failure evidence) to this task's notes, then remove the throwaway task and the sentinel. If live access is unavailable or behavior is nondeterministic, stop for human disposition; never substitute a mock.
- [ ] #5 D-026 hand-off: the closeout report copies the execution-liveness hand-off from TASK-790's implementation notes (the per-task lock in `lib/tasks/task-manager.ts` and `lib/tasks/lock.ts`) for that plan's re-validation, without editing that plan's artifacts.
- [ ] #6 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no push, merge, or pull request. Ratified ground binds exactly: INV-001..INV-006 and the Ranking as written in `spec.md`; any collision is stop-and-escalate ground.
<!-- AC:END -->

## Implementation Notes

### Coordinator closeout (2026-09-29, implementing coordinator)

**AC #1 — host restart (D-028 second checkpoint).** TASK-801's Drive commit is `363169bd` (run run-1a2af012); its cosmo host (pid 33694) exited at ~20:48:40Z. Every Drive run in this plan is its own print-mode `cosmonauts -p -a cosmo` host launched from the worktree binary `/Users/cosmos/Projects/cosmonauts-framework-health/bin/cosmonauts`, so the live acceptance run below is a fresh session that loads slices 1-12 as committed. `bin/cosmonauts-drive-step` does not exist (checked 2026-09-29T20:49:24Z; `bin/` holds `cosmonauts` and `cosmo-worker-codex` only). HEAD at this record: `9bd68fbd` (slice-12 record commit on top of `363169bd`). The live run's fresh-session start time is its `startedAt` in `missions/sessions/driver-hardening/driver.lock`, copied into the AC #4 evidence below.

**AC #3 — AC-020 change-set audit, base `e55040de` (local main) to HEAD `9bd68fbd`, 53 commits.** Commands and results:
- `git diff --name-only e55040de HEAD | grep -E '^(\.fallow-baselines/|\.cosmonauts/|biome\.json|tsconfig|vitest\.config|package\.json|bun\.lock|\.gitignore|scripts/)'` → none.
- `bun run check:suppressions -- --base main` → `suppression check passed`.
- `git diff e55040de HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('` → none.
- `git diff e55040de HEAD | grep -E '^\+.*(biome-ignore|@ts-ignore|@ts-expect-error|eslint-disable)'` → none.
- `git diff e55040de HEAD -- tests/ | awk '/^diff --git/{f=$3} /^-/ && !/^---/ && /expect|toBe|toEqual|toContain|toThrow|toMatch|toHaveLength/{print f": "$0}'` → 16 deleted expectation lines, each verified at its slice against the criterion cited inline in the replacing test: `prompt-template.test.ts` 1 (AC-007, slice 5); `run-one-task.test.ts` 3 (AC-020 ×2 slice 2, AC-015 slice 11); `orchestration-driver-tool.test.ts` 8 (AC-020 ×3 slice 2; AC-018 ×2 slice 11; the `updateStatuses` sequence lines INV-001/D-033 in TASK-803); `project-tools-fallow.test.ts` 4 (AC-009/D-024, slice 7, the pre-declared text-equals-details change); plus `project-tools.test.ts` 1 (`scopes: ["project"]` → AC-008, slice 6). Remaining deletions in `edit.test.ts`, `task-tools.test.ts`, `shell-command-finalizer.test.ts` (1 each), `contradicted-block-retry.test.ts` (5), `orchestration-driver-detached.test.ts` (4), `drive-scheduler-backend.test.ts` (1) are import or call-site reshapes with no expectation removed. `tests/pi-contract/` untouched (D-032). Result: no suppression, threshold, baseline, ignore-pattern, or configuration change; every changed expectation cites its criterion.