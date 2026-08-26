---
id: TASK-605
title: Constrain recovered journal targets to registered adapter paths
status: To Do
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
updatedAt: '2026-08-26T12:30:22.758Z'
---

## Description

Remediate security finding SR-003 against D-009/INV-002. Fresh recovery validates containment but can accept crafted journal target paths for arbitrary owner-root descendants and does not reapply transaction-ID grammar. On journal read, enforce writer transaction-ID grammar and require each target to be a strict direct child of the registered adapter directory for the journal target and the member's valid asset shape; malformed journals stay untouched and nonzero. Coordinate with TASK-595's absent/zero-member recovery support so valid deletion and manifest-only journals remain accepted. Do not modify existing plan artifacts.

<!-- AC:BEGIN -->
- [ ] #1 Recovered journal transaction IDs satisfy the same grammar as writer-created IDs.
- [ ] #2 Every journal target path is validated against the registered target's skill or command adapter directory and is a strict valid asset child, not merely any owner-root descendant.
- [ ] #3 Crafted rolling-back/committed journals cannot create, replace, or remove settings files, adapter roots, nested escapes, or unrelated descendants.
- [ ] #4 Malformed journal bytes and all nominated filesystem nodes remain untouched with a nonzero ambiguous result.
- [ ] #5 Valid creation, removal, manifest-only, migration, and evidence-held recovery tests remain green.
<!-- AC:END -->
