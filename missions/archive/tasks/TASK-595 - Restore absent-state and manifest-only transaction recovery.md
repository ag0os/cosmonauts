---
id: TASK-595
title: Restore absent-state and manifest-only transaction recovery
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:24:22.496Z'
updatedAt: '2026-08-26T12:50:24.374Z'
---

## Description

Remediate integration finding I-001 against plan harness-adapters B-007 / Design §7. The writer legitimately emits creation members with absent old state, removal members with absent new state, and zero-member manifest-only forget/transfer transactions, but fresh-process journal parsing/classification excludes these valid shapes. Implement test-first and preserve the full phase table, non-destructive ambiguity handling, one-lock contract, and evidence policies. Do not modify existing plan artifacts.

KNOWN PITFALL (an earlier partial attempt hit this and regressed): the naive fix is to drop the `value.members.length > 0` and `value.newState.kind !== "absent"` guards and then, in `classifyNode`, return "old" when `target && oldState.kind === "absent"`. That ordering breaks the existing passing test 'fresh recovery preserves equal old and new target relations for cross-project regeneration' in tests/harness-adapters/sync.test.ts, which builds a member with `newState: member.oldState` (old and new byte-identical, the cross-project regeneration case). When old and new are equal the vector becomes ambiguous and recovery wrongly returns recovery-required instead of completed. Handle the equal-old-and-new case explicitly; that pre-existing test must stay green.

## Implementation Plan

Also remediate F-003: preserve old/new relation information instead of lossy single-state classification. Cover prepared creation (absent old) and equal-old/new target snapshots across installing, commit-ready, and committed recovery, including D-020 same-byte cross-project regeneration.

<!-- AC:BEGIN -->
- [x] #1 Fresh recovery accepts and correctly classifies creation members whose old target snapshot is absent, including prepared-phase restoration.
- [x] #2 Fresh recovery accepts removal members whose new target snapshot is absent and converges correctly in every applicable prepared/installing/commit-ready/committed/rolling-back phase.
- [x] #3 Manifest-only forget, owner-transfer, and absent-target source-removal transactions with zero target members recover old/new manifest intent after crashes instead of becoming malformed.
- [x] #4 Regression tests exercise absent old/new snapshots and zero-member vectors through the public transaction/recovery seam and fail for the current exclusions.
- [x] #5 All existing harness-adapter and project-native checks remain green.
<!-- AC:END -->

## Implementation Notes

Merged duplicate findings I-001/F-002 with F-003. Do not stop at relaxing journal schema; phase predicates must handle absent-old, absent-new, zero-member, and old==new relations correctly.
