---
id: TASK-592
title: Bootstrap and migrate the live Claude command pair atomically
status: To Do
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:harness-adapters'
dependencies:
  - TASK-591
createdAt: '2026-08-25T23:06:36.035Z'
updatedAt: '2026-08-25T23:06:36.035Z'
---

## Description

Sole owner of B-009 from AC-004 at strict Implementation Order step 8c, after completed project and personal-bundle evidence. Seam/files: `external-commands/spec-to-backlog.md`, `external-commands/implement-plan.md`, `lib/harness-adapters/render.ts`, `lib/harness-adapters/sync.ts`, `tests/harness-adapters/sync.test.ts`, and `missions/plans/harness-adapters/command-migration-evidence.json`; live targets are exactly `~/.claude/commands/spec-to-backlog.md` and `~/.claude/commands/implement-plan.md`. These files actively drive the current pipeline, so AC-004, INV-001/INV-002/INV-003, D-009, D-018, and D-019 are stop-and-escalate ground. Both commands must pass pair equality before either live write, and any failure rolls both back together. This bootstrap is fixed to these two IDs/paths and never uses historical lineage or a force path.

<!-- AC:BEGIN -->
- [ ] #1 B-009/AC-004/D-018: exact raw live bytes create only the two git-tracked native sources; each preserves existing `description`, `argument-hint`, and body bytes without normalization.
- [ ] #2 B-009: live, native, and marker-stripped deterministic Claude render equality is proven for both commands before either live/manifest write; all four live/native inputs are re-read under the personal Claude transaction lock immediately before the first move.
- [ ] #3 B-009/D-009/D-019: both copy-only command assets execute as one `after-evidence` atomic set through one `withOwnerRootTransaction`; no path reacquires the lock, offers link mode, or accepts another asset/path.
- [ ] #4 B-009/INV-002: any pair mismatch writes zero live/manifest bytes, and every pre-commit partial install or rolling-back crash restores both old live targets together, byte-intact; ambiguous bytes or unconfirmed release halt with recoverable state preserved.
- [ ] #5 B-009: successful targets are marker-stripped byte-equivalent to the original live files, and evidence records `authorizationKind: ratified-live-bootstrap`, normalized display paths, lengths, equal live/native/render/final digests, marker version, and both manifest keys.
- [ ] #6 B-009: pending state and both backups remain until evidence is durably written/re-read, its installed receipt clears pending, a command-only selected check reaches zero, checked evidence is durable, backups are removed together, and complete evidence is re-read; no historical revision is required.
- [ ] #7 `tests/harness-adapters/sync.test.ts` contains `bootstraps and migrates both commands as one nonhistorical recoverable transaction` with marker `@cosmo-behavior plan:harness-adapters#B-009` and proves pair preflight, zero-write mismatch, atomic rollback, single lock, evidence hold, selected check, cleanup, and retry.
<!-- AC:END -->
