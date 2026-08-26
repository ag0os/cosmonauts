---
id: TASK-597
title: Make migration backup cleanup crash-resumable
status: Done
priority: medium
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:26:21.066Z'
updatedAt: '2026-08-26T13:18:26.293Z'
---

## Description

Remediate general-review finding F-004 against B-012/Design §7. Repository and personal-bundle migration cleanup currently deletes backups before durably recording each backup exit, so a hard crash in that window leaves checked evidence that treats the absent backup as ambiguous. Add durable per-backup cleanup intent and resumable completion for the exact deletion boundary, preserving exact-byte checks and never deleting ambiguous backups. Do not modify any existing file under missions/plans/harness-adapters/; use temporary fixture evidence for regression coverage.

## Implementation Plan

Remediate both F-004 and SR-001. Before any cleanup, derive backup paths from validated canonical transaction identity, journal parent, and fixed member index; never trust evidence-supplied cleanup paths or oldState snapshots as authorization. Persist per-backup cleanup intent before deleting, fsync, and resume exact deletions safely.

<!-- AC:BEGIN -->
- [x] #1 A hard interruption immediately after the first project-set backup deletion resumes to complete evidence without manual repair or lost old bytes.
- [x] #2 The equivalent interruption for the personal bundle resumes safely to complete evidence.
- [x] #3 Cleanup intent is durable before deletion, and absent backup is accepted only as completion of a matching exact cleanup intent.
- [x] #4 Ambiguous or changed backup bytes remain preserved and nonzero.
- [x] #5 All migration, harness-adapter, and project-native checks remain green.
<!-- AC:END -->

## Implementation Notes

Security constraint: a crafted tracked evidence document must not nominate an arbitrary same-user path for recursive removal. Use temp fixture evidence only; do not modify existing plan evidence files.
