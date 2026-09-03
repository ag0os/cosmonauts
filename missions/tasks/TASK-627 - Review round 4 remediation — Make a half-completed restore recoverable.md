---
id: TASK-627
title: Review round 4 remediation — Make a half-completed restore recoverable
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-626
createdAt: '2026-09-03T18:29:44.255Z'
updatedAt: '2026-09-03T18:29:44.255Z'
---

## Description

Review round 4 confirmed fixes B, C, D and E. One deterministic, fully-closable defect remains and is the entire scope of this task.

HIGH — a crash during `durableRestore` leaves a permanently unrecoverable journal state.
`durableRestore` performs `link(tombstone, live)`, then `syncDirectory`, then `durableRemove(tombstone)` as separate steps. A crash after the link and sync but before the tombstone removal leaves BOTH pathnames present as hard links to the same inode. Recovery then treats "live exists AND tombstone exists" as an irresolvable conflict at every site — uncommitted retirement, committed retirement, and episode recovery — so every subsequent run reports the same error and the transaction can never complete. The reviewer reproduced this state twice consecutively for the episode journal. This violates AC-014's requirement that a re-run completes interrupted work cleanly.

Fix: recovery must recognise a partially-completed restore instead of rejecting it. When both the live path and the tombstone path exist AND they are the same file (identical device+inode via no-follow lstat), that is a half-finished restore, not a conflict: complete it by durably removing the tombstone and continuing. Only treat it as a genuine conflict when the two paths are DIFFERENT files, which means an unrelated object occupies one of them. Apply this at all three recovery sites, and make `durableRestore` itself idempotent so re-invocation after a crash converges rather than erroring.

Add regression tests that hard-stop between the restore link and the tombstone removal and prove that (a) the next recovery completes cleanly rather than erroring, (b) a second consecutive recovery is also clean, and (c) the record ends in a valid terminal state with its bytes intact.

Explicitly OUT OF SCOPE — do not attempt, and do not add verification layers for:
The remaining check-then-destructive-pathname races the reviewer named (replacing the tombstone pathname between its verification and its unlink; the forward rename's absent-destination check followed by an overwriting rename; a save replacing the live destination between the restore link and the tombstone unlink). These are the same unclosable class as the ratified D-026 window, reached through rename/create rather than an open descriptor: POSIX offers no atomic no-clobber rename in portable Node and no inode-predicated unlink, so each additional check only moves the window. Four review rounds have each closed the previously-named instance and surfaced the next. D-026 is being broadened to record this class explicitly. Do NOT add a fifth verification layer, and do not weaken anything else to compensate.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Confine every change to lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests.

<!-- AC:BEGIN -->
- [ ] #1 A half-completed restore is recognised and finished rather than rejected: when the live and tombstone paths both exist AND are the same file by no-follow device+inode comparison, recovery completes the restore by durably removing the tombstone; only genuinely different files at those paths are reported as a conflict. This is applied at the uncommitted-retirement, committed-retirement, and episode recovery sites.
- [ ] #2 `durableRestore` is idempotent under re-invocation after a crash at any of its internal steps, converging to the restored state rather than erroring.
- [ ] #3 Regression tests hard-stop between the restore link and the tombstone removal and prove the next recovery completes cleanly, a second consecutive recovery is also clean, and the record ends live with its original bytes intact — for both the retirement and the episode journals.
- [ ] #4 No fifth verification layer or additional pathname-race machinery is added; the ratified unclosable class is left to D-026 and nothing else is weakened to compensate.
- [ ] #5 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green under their exact existing names and owners; live `knowledge/` and `memory/` stay byte-identical; a live dry run still completes as `ran` or `noop` writing nothing; and no file outside lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests is modified.
<!-- AC:END -->
