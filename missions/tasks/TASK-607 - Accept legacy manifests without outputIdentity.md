---
id: TASK-607
title: Accept legacy manifests without outputIdentity
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T14:45:25.425Z'
updatedAt: '2026-08-26T14:53:59.504Z'
---

## Description

Codex round-3 finding (Medium severity, but live and unrecoverable-in-band, so raised to high priority). Commit 4ef9c06 cross-checks each manifest entry `outputPath` against a path re-derived from `(target, scope, kind, outputIdentity)`. Entries written before that commit have no `outputIdentity`, and the compatibility fallback at lib/harness-adapters/provenance.ts:478 derives it as `basename(logicalPath)`. But output identity legitimately comes from skill frontmatter `name` (lib/skills/discovery.ts:439, lib/harness-adapters/inventory.ts:284), which may differ from the directory basename — the flattening rule is explicitly `frontmatter-name`. When they differ the entry fails the comparison at provenance.ts:403 and BLOCKS SYNC AND CHECK FOR THE ENTIRE OWNER MANIFEST.

Measured on this machine: all 48 existing entries (3 personal, 45 project) lack `outputIdentity`, so every entry currently takes this fallback. Nothing breaks today only because every exported asset happens to have frontmatter name equal to its directory basename. Authoring one legally-named skill where they differ wedges the whole manifest — and it cannot self-heal, because the blocked operation is the very sync that would rewrite the manifest with `outputIdentity`.

Correct compatibility rule: for a legacy entry, the stored `outputPath` basename IS its historical output identity by construction. Derive it from there, not from `logicalPath`. Keep the strict guard fully intact — the entry must still be an immediate child of the registered adapter directory for its target/scope/kind, and every protection added by 4ef9c06 must still hold. Ratified ground: INV-002, INV-003, AC-002, AC-006, B-004, B-006, D-017.

<!-- AC:BEGIN -->
- [x] #1 A legacy entry with no `outputIdentity` whose frontmatter name differs from its directory basename is accepted, and its expected path is derived from the stored `outputPath` basename rather than from `basename(logicalPath)`.
- [x] #2 The 4ef9c06 guard is not weakened: a legacy or current entry whose `outputPath` is not an immediate child of the registered adapter directory for its target/scope/kind is still refused, and the crafted-manifest and crafted-journal negative tests still pass unchanged.
- [x] #3 One invalid entry never blocks unrelated entries more than the ratified design requires; the failure mode is reported and bounded rather than silently poisoning every row of the owner manifest.
- [x] #4 A legacy entry is upgraded to carry `outputIdentity` on the next successful sync, so the compatibility path is self-healing once sync is unblocked.
- [x] #5 A regression test covers a legacy no-outputIdentity entry whose frontmatter name differs from its directory basename, proving sync and check both succeed for it and for the rest of the manifest.
- [x] #6 Existing B-004/B-006/B-008 tests pass under their existing titles and markers; the live 96-row default check still reports exactly the two ratified conflicts; no new behavior marker is added.
<!-- AC:END -->
