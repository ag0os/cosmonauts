---
id: TASK-288
title: 'Plan 3: Implement cosmonauts drive status and list subcommands'
status: Done
priority: medium
labels:
  - cli
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-284
createdAt: '2026-05-04T20:22:33.840Z'
updatedAt: '2026-05-05T16:08:03.781Z'
---

## Description

Implements Implementation Order step 12. Decision Log: D-P3-8. Quality Contracts: QC-009, QC-010.

Add `status <runId>` and `list` subcommands to `cli/drive/subcommand.ts`.

**Cross-plan invariant — P3-INV-7 (status logic):**
Read `run.completion.json` first → if present, report terminal state (`outcome` from `DriverResult`). Else read `run.pid` → `kill -0` + start-time match → classify as `running` / `orphaned` / `dead`. The bash trap removes `run.pid` on exit, so after a clean run only `run.completion.json` remains.

**Classification table (from D-P3-8):**
| Condition | Status |
|---|---|
| `run.completion.json` present | Terminal: completed / aborted / blocked |
| `run.completion.json` absent + PID alive + start-time matches | `running` |
| `run.completion.json` absent + PID dead | `dead` |
| `run.completion.json` absent + PID alive + start-time mismatch | `orphaned` (PID reuse) |

**`drive list`:** scan `missions/sessions/*/runs/*/` for both `run.pid` and `run.completion.json`; combine and classify each run. Outputs structured summary across all plans.

<!-- AC:BEGIN -->
- [ ] #1 drive status <runId> reads run.completion.json first; if present, reports terminal state with outcome from DriverResult (QC-009, P3-INV-7).
- [ ] #2 If run.completion.json absent, reads run.pid; uses kill -0 + start-time match to classify as running, orphaned, or dead; detects PID reuse after reboot via start-time mismatch.
- [ ] #3 drive list scans missions/sessions/*/runs/*/ and classifies all runs across all plans as running / completed / orphaned / dead (QC-010).
- [ ] #4 Tests in tests/cli/drive/status.test.ts exercise all four classification branches: completion record present, PID alive+matching, PID dead, PID alive+start-time mismatch (reuse).
- [ ] #5 Tests in tests/cli/drive/list.test.ts enumerate and classify multiple runs across multiple plans.
<!-- AC:END -->

## Implementation Notes

Added drive status <runId> [--plan] and drive list. Status resolves run directories, reads run.completion.json before pidfiles, classifies terminal outcomes, running/dead/orphaned via process.kill and ps lstart comparison, and emits structured JSON/errors. List scans missions/sessions/*/runs/* and classifies stateful runs across plans. Added status/list CLI tests covering completion-first, running, dead, orphaned, and multi-plan list classification. Verified focused drive tests, typecheck, and lint pass.
