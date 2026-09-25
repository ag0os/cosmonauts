---
type: gotcha
title: Coordinator mechanics that silently lose work in this repo
description: >-
  Task ACs must be single-line, Drive does not commit task files, and two-stage
  chains pass the prompt only to the first stage.
resource: >-
  knowledge/qm-chain-safety/gotcha-coordinator-mechanics-that-silently-lose-work-in-this-repo-0ac79d06528e.md
tags:
  - chains
  - drive
  - operations
  - tasks
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/coordinator-status.md
date: '2026-09-24T00:00:00.000Z'
---
Several traps hit during implementation. The task parser keeps only the first line of a multi-line acceptance criterion, so write ACs as single lines, edit task files by appending inside the AC markers, and never renumber. A malformed status line, for example `Done` followed by extra text, parses as To Do. Drive excludes `missions/tasks/` and other mission files from its source commits, so check git status after each run and commit task state with explicit paths. A two-stage chain passes the user prompt only to its first stage, and a plan-reviewer second stage picks a plan by itself and has reviewed the wrong plan. Verify that the review file names the intended plan, or run the reviewer directly with an explicit prompt. `--resume` only replays, so relaunch Drive with `--task-ids` to continue from partial work. Heavy suites time out under load: re-run a failure in isolation before believing it, and give the heaviest export test an explicit longer timeout. Leaked temp workspaces from tests accumulate in the user's TMPDIR, so tests must clean up their own.
