---
id: TASK-605
title: Constrain recovered journal targets to registered adapter paths
status: Done
priority: high
labels:
  - backend
  - security
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:30:22.758Z'
updatedAt: '2026-08-26T15:03:56.125Z'
---

## Description

Remediate security finding SR-003 against D-009/INV-002.

NARROWED 2026-08-26 by the coordinator: the PATH half of this finding is already implemented by TASK-606 (Done) — journal member target paths must be immediate children of a registered adapter directory via assertRegisteredTransactionTarget, proven by a crafted-journal negative test that asserts the entire owner root stays byte-identical. Verify that holds; do not rebuild or disturb it.

The RESIDUAL gap to close is transaction-ID grammar on READ. lib/harness-adapters/sync.ts enforces /^[A-Za-z0-9._-]+$/ when WRITING a journal, but the reader isOwnerRootJournal only checks `typeof value.transactionId === "string"`. The transaction id is embedded in derived sibling paths — observed live as `.cosmonauts-harness-claude-<transactionId>-0.backup` — so a persisted journal whose transactionId contains a path separator or `..` yields stage/backup paths that escape the canonical owner-root parent. Same trust-persisted-state class as TASK-606, different field.

Coordinate with TASK-595 absent/zero-member support so valid deletion and manifest-only journals still parse. Do not modify existing plan artifacts. Ratified ground: INV-002, D-009, B-007, Design section 7 row 2 (malformed/owner-path-schema mismatch preserves all state and reports ambiguous).

Acceptance: (1) journal READ enforces the same transaction-id grammar as journal WRITE, refusing violators as malformed; (2) a refused journal maps to Design section 7 row 2 — all state preserved, ambiguous reported, nonzero exit, no stage/backup/target/manifest byte written or removed; (3) a negative test with a traversal-bearing transactionId proves derived stage and backup paths can never escape the canonical owner-root parent; (4) legitimate UUID journals still parse, recover, and clean up unchanged, and existing B-007/B-012 tests pass under their existing titles and markers with no new behavior marker.

<!-- AC:BEGIN -->
- [x] #1 Recovered journal transaction IDs satisfy the same grammar as writer-created IDs.
- [x] #2 Every journal target path is validated against the registered target's skill or command adapter directory and is a strict valid asset child, not merely any owner-root descendant.
- [x] #3 Crafted rolling-back/committed journals cannot create, replace, or remove settings files, adapter roots, nested escapes, or unrelated descendants.
- [x] #4 Malformed journal bytes and all nominated filesystem nodes remain untouched with a nonzero ambiguous result.
- [x] #5 Valid creation, removal, manifest-only, migration, and evidence-held recovery tests remain green.
<!-- AC:END -->

## Implementation Notes

spawn failed with exit code 143
