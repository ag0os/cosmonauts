---
id: TASK-625
title: >-
  Review round 2 remediation — Close residual unlink races, lock self-report
  regression, and outlet caps
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-624
createdAt: '2026-09-02T19:55:02.242Z'
updatedAt: '2026-09-02T19:55:02.242Z'
---

## Description

A second independent codex review of the post-remediation branch returned DO-NOT-SHIP. The coordinator verified findings 1 and 3 (the regression) directly. Fix all of the below.

CRITICAL 1 — check-then-unlink is still not atomic, and the consequence is byte loss.
`assertManifestedLinkBeforeUnlink` validates by PATH (lstat both, then open/read live), and `durableFiles.removeFile` then unlinks by PATH as a separate syscall. An atomic save between the final read and the unlink still destroys newly curated bytes; an in-place edit in that window leaves the retired copy no longer matching the manifest digest. TASK-624 narrowed the window from seconds to microseconds but did not close it. POSIX has no portable "unlink only if inode matches" primitive, so DO NOT attempt to make check-then-unlink atomic.

Instead remove the CONSEQUENCE, which is what INV-001/INV-002 actually protect. Replace the destructive unlink with a reversible two-step: after the manifest commit, atomically RENAME the live path aside to a transaction-owned tombstone inside the same directory (rename is atomic and, crucially, PRESERVES whatever bytes were actually at that path). Then verify the tombstone: if its device+inode match the retired hard link and its digest matches the manifested digest, it was the manifested object — durably remove the tombstone. If it does NOT match, a concurrent writer replaced or edited the file: atomically rename the tombstone BACK to the live path, leave the record live, and report a conflict. Record the tombstone in the journal so recovery can complete or reverse it after a crash, and make recovery reverse an unverified tombstone rather than deleting it. Net effect: a concurrent edit can no longer be destroyed — worst case it is restored and the retirement is refused.

Do NOT switch to plain `rename(live -> retired)` as the commit: D-006/D-014 deliberately rejected rename-then-manifest because of its crash gap. Keep link -> manifest-commit -> (tombstone -> verify -> remove).

HIGH 2 — episode pruning has the identical residual race (`lib/memory/consolidation-sources.ts` finalization snapshots the episode, closes it, then unlinks the pathname). Apply the same tombstone-verify-or-restore protocol so a concurrently rewritten episode is never destroyed.

HIGH 3 — REGRESSION introduced by TASK-624: the whole-pass lock makes a healthy pass report false concurrency and exit nonzero.
`inspect()` reports `concurrent-mutation` merely because the lock file exists, but the mutating pass now HOLDS that lock while calling `inspect()`. The status is copied into successful pass details, and `consolidationExitCode` maps `concurrent-mutation` to exit 1 — so every successful non-dry `cosmonauts memory consolidate` exits nonzero. Inspection must distinguish the pass's OWN held lock from a foreign holder (e.g. pass ownership explicitly through the inspection call) and must not report concurrency against itself. Add a regression test asserting a successful non-dry pass reports `recovery: none` and exits zero.
Also fix the inverse reporting errors: an outer-lock acquisition timeout must not return `recovery: "none"`, and a release-unconfirmed outcome must set `recovery: "release-unconfirmed"` so a long-lived host cannot mistake it for success.

HIGH 4 — episode paging still starves. The corpus adapter now honours `representedKeys`, but the production episode adapter always returns the same sorted prefix and ignores them entirely, so once the first N episodes are represented-but-unpruned, later episodes can never be admitted. Make the episode adapter honour `representedKeys` exactly as the corpus adapter does.

MEDIUM 5 — the reported retirement outlet still exceeds its cap: applied, cap-deferred, and model-only retirements are concatenated without bounding the resulting array, and a test currently ENCODES the bug by expecting six retirement rows under a limit of five. Bound the reported array to `maxRetirements`, keep the deferred items reported through `declines`, and correct that test expectation rather than the cap.

MEDIUM 6 — committed episode-recovery writes can be reported as absent: accepted-episode recovery may prune several files and then throw, and the catch only corrects errors explicitly carrying `writesCommitted: true`, so ordinary source/durable-file errors yield `writesCommitted: false` after real prunes occurred. Ensure any path that has already removed bytes reports `writesCommitted: true`.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Byte authority outranks size pressure. Do not weaken the receipt floor, the frozen pins, model-output fail-closed validation, or any existing marker. Confine all changes to lib/memory, lib/extensions/knowledge-surface, cli/memory, and their tests — the previous round's repo-wide export cleanup outside those directories was reverted as out of scope and must not return.

<!-- AC:BEGIN -->
- [ ] #1 No live retirement unlink can destroy bytes that were not the manifested object: the live path is atomically renamed to a journal-recorded tombstone after manifest commit, verified by device+inode against the retired link AND by digest, then removed only on match and atomically restored to the live path on mismatch with a reported conflict; recovery completes or reverses a tombstone rather than deleting it unverified. A regression test mutates the live path in the window AFTER the pre-unlink verification (not merely at an earlier failpoint) via both an atomic replace and an in-place edit, and proves in both cases that no bytes are lost and the record remains live.
- [ ] #2 Episode pruning uses the same tombstone-verify-or-restore protocol, proven by a regression test that rewrites an episode in the window between snapshot and removal and asserts the rewritten bytes survive and the episode is not pruned.
- [ ] #3 A successful non-dry pass no longer reports concurrency against its own held lock: inspection distinguishes the pass's own lock ownership from a foreign holder, a successful pass reports `recovery: "none"` and exits zero, an outer-lock acquisition timeout does not report `recovery: "none"`, and a release-unconfirmed outcome reports `recovery: "release-unconfirmed"`.
- [ ] #4 The production episode adapter honours `representedKeys` exactly as the corpus adapter does, so already-represented episodes no longer permanently starve later ones; a test proves a second pass admits previously unadmitted episodes.
- [ ] #5 The reported retirements array never exceeds `maxRetirements`; cap-deferred items are reported through `declines`; and the test that expected six retirement rows under a limit of five is corrected to assert the cap rather than encode the violation.
- [ ] #6 Any pass or recovery path that has already removed bytes reports `writesCommitted: true`, including when it subsequently throws an ordinary source or durable-file error mid-prune.
- [ ] #7 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green under their exact existing names and owners; live `knowledge/` and `memory/` stay byte-identical; a live `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` still completes as `ran` or `noop` writing nothing; and no file outside lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests is modified.
<!-- AC:END -->
