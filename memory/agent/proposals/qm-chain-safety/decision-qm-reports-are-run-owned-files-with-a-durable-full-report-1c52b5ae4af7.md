---
type: decision
title: QM reports are run-owned files with a durable full report
description: >-
  Shared plan-agnostic review filenames were retired; each run writes its own
  artifacts and a tracked plan-scoped summary on every exit.
resource: >-
  knowledge/qm-chain-safety/decision-qm-reports-are-run-owned-files-with-a-durable-full-report-1c52b5ae4af7.md
tags:
  - artifacts
  - orchestration
  - quality-manager
  - reports
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-23T00:00:00.000Z'
---
The old chain wrote fixed filenames under `missions/reviews/` (`review-round-N.md` and lens variants), so every run overwrote earlier plans' review records. It stored only a 200-character stage summary, so a 5 KB verdict report was lost. Report paths are now run-owned and written only by the host. The full report is a run artifact that status points to, and a tracked plan-scoped summary is written on every exit. Assessment outcome and execution outcome stay distinct. A missing report index is a report defect, not a failed run, and the run's finalization state is persisted before assessment. The legacy shared records were archived and callers updated. The review commands and skills now describe a review-only QM that ends at findings, and an equivalence test checks that no live surface links the retired paths. If you add a chain stage whose output matters, never rely on the stage summary: it is capped, and the session is only in memory.
