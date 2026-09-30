---
type: decision
title: Substitute review channel when the primary reviewer's provider is out
description: >-
  When Codex hit its usage limit mid-loop, an independent read-only Claude
  reviewer became the closing channel and a Claude subagent implemented
  remediation under the same red-first and gate rules; the human accepted it at
  merge.
resource: >-
  knowledge/driver-hardening/decision-substitute-review-channel-when-the-primary-reviewer-s-provider-is-out-6db23163da71.md
tags:
  - D-038
  - claude
  - codex
  - review
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/coordinator-status.md
date: '2026-09-30T00:00:00.000Z'
---
# Substitute review channel when the primary reviewer's provider is out

Codex round 6, ruled the cap of the codex review loop, could not run: the account hit its usage limit until Oct 5, and the Quality Manager's reviewers died on the same limit. Rather than wait five days, Shepherd ran an independent read-only Claude reviewer with fresh context over the unreviewed slices and the whole diff, and the remediation was implemented by a Claude subagent worker in the worktree under D-038 with the rules a Drive worker follows: failing test first per finding, mutation check, notes appended through the CLI, no forbidden paths, the coordinator running the freeze check and the full gate set with exit codes and committing from explicit paths.

What made it acceptable at merge: the plan's guarantees come from the criteria, the red-first evidence, the gates and an independent reviewer, not from which harness typed the code. Drive's own process guarantees were the plan's subject and had already been verified live. The substitute channel took three rounds (HOLD, HOLD, SHIP) and found real defects the codex rounds had missed, including a P2 regression in the last codex-era slice. Record the deviation as a derived decision with the reason, keep the primary channel's pending round on record, and let the human accept the substitute at merge.
