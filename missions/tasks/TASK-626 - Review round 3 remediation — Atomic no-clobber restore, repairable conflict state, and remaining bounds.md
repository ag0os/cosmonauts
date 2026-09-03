---
id: TASK-626
title: >-
  Review round 3 remediation — Atomic no-clobber restore, repairable conflict
  state, and remaining bounds
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-625
createdAt: '2026-09-03T16:43:22.573Z'
updatedAt: '2026-09-03T16:59:08.271Z'
---

## Description

Review round 3 returned DO-NOT-SHIP with 6 findings. Five are closable and are IN SCOPE here. One is not closable with portable primitives and is explicitly OUT OF SCOPE — see the end of this description. Do not attempt it, and do not add another tombstone layer.

CRITICAL A — `durableRename` is not atomic no-clobber, so "restore" can destroy a concurrently recreated file.
`lib/memory/durable-files.ts` `durableRename` does `lstat(destination)` and then plain `rename()`. POSIX `rename` silently OVERWRITES an existing destination, so a file created between the check and the rename is destroyed. On the mismatch-restore path (tombstone -> live) this means a concurrent save that recreated the live path has its new bytes destroyed by the very operation meant to preserve them. This is a regression the tombstone protocol introduced; the previous direct-unlink path had no such overwrite.
Fix: the RESTORE direction must be atomic and no-clobber. Node exposes no `renameat2(RENAME_NOREPLACE)`/`renamex_np(RENAME_EXCL)`, but `link()` already gives exactly this guarantee portably — it fails with EEXIST if the destination exists. Restore must therefore be `link(tombstone, live)` followed by `unlink(tombstone)`, treating EEXIST as a conflict that leaves BOTH files intact and reports the conflict without destroying either. This is the same exclusive-create pattern `writeTextExclusive` already uses.
The FORWARD direction (live -> tombstone) may keep using `rename`: its destination is a fresh unique name, and rename's unconditional atomic move of whatever bytes are at the source is precisely the property that preserves a concurrent edit. Keep the "destination already occupied" guard for the forward direction, and apply the same treatment to both episode rename paths in `lib/memory/consolidation-sources.ts`.

CRITICAL B — a detected in-place conflict can be finalized into an invalid, unrepairable state.
The retired hard link is created before manifest commit. If an in-place edit changes that shared inode, mismatch recovery restores the edited tombstone and `removeChangedRetiredDuplicate` removes the changed retired link — but recovery then REMOVES THE JOURNAL even though it collected a conflict. The result is a state that is neither required terminal state: the manifest round remains active, the exact manifested bytes exist neither live nor retired, and no journal remains to repair the transaction. Violates INV-002/AC-014.
Fix: never discharge the journal when the transaction collected a conflict — leave the transaction repairable and report it, so a subsequent pass or the owner can resolve it. Ensure every terminal state is either live-with-original-bytes or retired-with-manifested-bytes, and that any third state retains its journal and is reported explicitly rather than silently finalized.

MEDIUM C — unlink-success/fsync-failure still reports no writes.
`durableRemove` unlinks and then syncs the parent; episode code sets its committed flag only after the whole call resolves. If the unlink succeeds but the directory sync throws, bytes are gone while `writesCommitted` stays false and the error is not marked committed. Fix so any path that has already removed bytes reports `writesCommitted: true`, including on a post-unlink sync failure.

MEDIUM D — the exported retirement store's dry-run path bypasses the retirement cap.
Non-dry operation validates `candidates.length <= maxRetirements`, but dry-run skips that validation and `previewRetirements` returns every authorized candidate. The top-level consolidator is capped, so the CLI is fine, but the exported store contract can still report more than `maxRetirements`. Bound the dry-run preview at the store seam too, reporting the remainder as deferred.

MEDIUM E — inlet byte bounds are not enforced at the adapter boundary.
The production episode adapter reads every candidate's complete body via an unbounded `handle.readFile` before testing representation or admission count, and never consults `maxEpisodeRecordBytes`/`maxEpisodeBytes` — those are checked only after the adapter returns. The citation inventory likewise reads complete files with no byte ceiling. Count-bounded output is therefore not a hard per-pass inlet-byte bound (INV-005). Enforce the byte ceilings inside the adapter and the citation inventory, skipping or truncating oversized inputs with an explicit decline rather than reading unbounded bytes.

EXPLICITLY OUT OF SCOPE — do NOT attempt, and do not add machinery for it:
The residual race in which a process holding an ALREADY-OPEN file descriptor writes to the inode after verification but before unlink. Rename does not invalidate foreign descriptors and portable Node exposes no primitive to detect or prevent this, so no amount of additional checking closes it. Narrowing it further is not wanted. If you find yourself adding a fourth verification layer, stop. This residual is being put to the human owner as an accepted-limitation ruling; the deviation protocol reserves that ratification for the owner. Leave it unaddressed and do not weaken anything else to compensate.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Confine every change to lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests.

<!-- AC:BEGIN -->
- [x] #1 Restore is atomic and no-clobber: the tombstone-to-live direction uses exclusive `link` plus `unlink` (never plain `rename`), an EEXIST destination is reported as a conflict with BOTH files left intact, and a regression test recreates the live path concurrently before restore and proves the recreated bytes are not destroyed. Both episode rename paths get the same treatment; the forward live-to-tombstone direction may keep `rename`.
- [x] #2 No transaction can finalize into a state that is neither live-with-original-bytes nor retired-with-manifested-bytes: a collected conflict never discharges the journal, the transaction stays repairable, and the outcome is reported explicitly. A regression test drives the in-place-edit conflict through recovery and asserts the journal survives and the state is reported, not silently finalized.
- [x] #3 Any path that has already removed bytes reports `writesCommitted: true`, including when the unlink succeeded but the subsequent parent-directory sync threw.
- [x] #4 The exported retirement store bounds its dry-run preview at `maxRetirements` and reports the remainder as deferred, so the store contract cannot report more retirements than its cap even when called directly rather than through the consolidator.
- [x] #5 Inlet byte ceilings are enforced where the bytes are read: the episode adapter and the citation inventory respect their configured byte limits and decline or skip oversized inputs explicitly, instead of reading unbounded file bodies and checking limits only afterwards.
- [x] #6 No fourth verification layer or additional tombstone machinery is added for the open-file-descriptor race, which is deliberately left to an owner ruling; nothing else is weakened to compensate.
- [x] #7 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green under their exact existing names and owners; live `knowledge/` and `memory/` stay byte-identical; a live dry run still completes as `ran` or `noop` writing nothing; and no file outside lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests is modified.
<!-- AC:END -->
