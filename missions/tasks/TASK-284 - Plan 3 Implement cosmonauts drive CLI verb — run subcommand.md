---
id: TASK-284
title: 'Plan 3: Implement cosmonauts drive CLI verb — run subcommand'
status: To Do
priority: high
labels:
  - cli
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-278
createdAt: '2026-05-04T20:22:08.798Z'
updatedAt: '2026-05-04T20:22:08.798Z'
---

## Description

Implements Implementation Order step 11. Decision Log: D-P3-5, D-P3-6, D-P3-10. Quality Contracts: QC-005, QC-008.

Create `cli/drive/subcommand.ts` with the `drive run` (default) subcommand and wire it into `cli/main.ts`.

**Cross-plan invariants:**
- P3-INV-8: `createDriveProgram(): Command` is a **zero-argument factory** — no constructor parameters. Wire into `cli/main.ts` dispatch table at **lines 658-688** (the actual location — NOT line 106). Existing entries: `task`, `plan`, `eject`, `create`, `update`, `init`, `scaffold`. Do not disturb any existing entry.
- P3-INV-12: `--resume <runId>` reads existing JSONL, identifies last-completed task, slices `spec.taskIds`. Before binary invocation, runs `git status --porcelain`; if non-empty, refuses with structured error citing dirty paths unless `--resume-dirty` is passed.

**CLI shape for `drive run`:**
```
cosmonauts drive [run]
  --plan <slug>                            (required)
  [--task-ids <id1,id2,...>]
  [--backend codex|claude-cli|cosmonauts-subagent]  (default: codex)
  [--mode inline|detached]                 (default: detached if taskIds.length >= 5, else inline per D-P3-10)
  [--branch <name>]
  [--commit-policy driver-commits|backend-commits|no-commit]
  [--envelope <path>]  [--precondition <path>]  [--overrides <dir>]
  [--max-cost <usd>]   [--max-tasks <n>]   [--task-timeout <ms>]
  [--resume <runId>]   [--resume-dirty]
```

Inline mode: subscribe to activityBus; print each DriverEvent JSON to **stderr**; print final DriverResult JSON to **stdout**; exit 0 on full success, 1 on any task blocked (QC-005).
Detached mode: call `startDetached`; print `{ runId, workdir, eventLogPath }` to stdout; exit.

<!-- AC:BEGIN -->
- [ ] #1 createDriveProgram(): Command exported from cli/drive/subcommand.ts as a zero-argument factory (P3-INV-8).
- [ ] #2 Wired into cli/main.ts dispatch table at lines 658-688; existing subcommands (task, plan, eject, create, update, init, scaffold) are unmodified (P3-INV-8).
- [ ] #3 Mode heuristic: detached if taskIds.length >= 5, else inline; explicit --mode flag overrides the heuristic (D-P3-10).
- [ ] #4 Inline mode prints each DriverEvent as JSON to stderr, final DriverResult JSON to stdout; exits 0 on full success, 1 on any task blocked (QC-005).
- [ ] #5 --resume <runId> reads existing JSONL, identifies last-completed task, slices spec.taskIds from that point; runs git status --porcelain and refuses with structured error on dirty tree unless --resume-dirty is passed (P3-INV-12, QC-008).
- [ ] #6 Tests in tests/cli/drive/run.test.ts verify argument parsing, mode heuristic, inline/detached routing, and resume + dirty-tree guard.
<!-- AC:END -->
