---
id: TASK-606
title: Re-derive deletion path authority instead of trusting persisted paths
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T14:18:15.362Z'
updatedAt: '2026-08-26T14:34:38.208Z'
---

## Description

Codex verification-review findings 1 and 2 (both High, one root cause). Persisted state is trusted for PATH authority:

(a) Manifest parsing (lib/harness-adapters/provenance.ts:346,367) accepts any string `outputPath` and never cross-checks it against the manifest key, owner shape, target/kind adapter, or the registered asset output directory. Complete reconciliation then trusts that path, classifies an exact claimed baseline as `remove-target-and-entry`, and hands it to the transaction (sync.ts:3622, exporter.ts:778). A corrupted, version-skewed, or forged matching-owner entry can therefore nominate an adapter directory, a settings file, or the owner root itself for deletion. Containment alone does not protect those paths.

(b) Journal parsing (sync.ts:2952,2984) validates member target paths only by owner-root containment, not by requiring a registered adapter directory and a strict asset child, so a crafted or corrupted journal can make rollback remove or restore arbitrary owner-root nodes (sync.ts:2784).

Root cause for both: deletion/restoration authority is READ from persisted data rather than RE-DERIVED. Design section 10 states the governing property directly — "no decision field trusted alone" — and INV-002 forbids destroying anything that is not a managed asset target.

Note on threat model: the plan scopes hostile same-user races out of the boundary, so this is NOT primarily an adversarial fix. The in-scope case is corruption, a bug, or schema drift producing a bad path and destroying user data such as ~/.claude/settings.json. Fix it as a correctness property that holds regardless of adversary. Ratified ground: INV-002, AC-003, B-004, B-007, B-008, Design sections 5, 7, and 10.

<!-- AC:BEGIN -->
- [x] #1 A manifest entry whose `outputPath` does not exactly equal the path re-derived from its `(target, scope, kind, outputIdentity)` through the registry is refused as invalid; it never becomes a removal candidate and never authorizes any write or delete.
- [x] #2 A manifest entry whose stored key disagrees with its `(ownerId, assetId)`, or whose target/kind has no registered adapter, is refused the same way.
- [x] #3 Journal member target paths are validated as strict children of a registered adapter directory for the journal target and scope, not merely as owner-root descendants; a journal failing this is treated as the Design section 7 malformed/owner-path-schema row, preserving all state and reporting ambiguous.
- [x] #4 Deletion and rollback can never remove or restore an owner root, an adapter directory, a manifest, a journal, a lock, or any non-asset path, proven by negative tests that attempt exactly those through a crafted manifest and a crafted journal.
- [x] #5 A refused manifest or journal produces a nonzero reported conflict and leaves every byte on disk intact, including the offending target.
- [x] #6 All legitimate flows are unaffected: existing B-004/B-006/B-007/B-008/B-012 tests pass under their existing titles and markers, the four repo skills, personal bundle, and both live commands still sync and check clean, and no new behavior marker is added.
<!-- AC:END -->
