---
id: TASK-650
title: 'Stage 4 round 2: Finish the committed-write sweep in the consolidation modules'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-639
createdAt: '2026-09-08T00:50:15.251Z'
updatedAt: '2026-09-08T00:50:15.251Z'
---

## Description

Bounded remediation opened by finding SR-008 (medium) in
`missions/plans/living-memory-fidelity/review-9.md` (TASK-640). The final scope audit
and handoff may not proceed until SR-008 is closed and a fresh final review passes.

SR-008, independently confirmed against the code. The production episode finalizer
durably replaces `.living-memory-episode-prune.json` via `replaceText()` at
`lib/memory/consolidation-sources.ts:506`, then attempts the episode-to-tombstone
rename at `:510`. The catch at `:540-545` tags the error only when
`writesCommitted || pruned.length > 0`, but the local `writesCommitted` is not set
until `:525`, after tombstone removal. An ordinary untagged failure from
`renameFile()` before it mutates therefore escapes with the journal write already
durable, and the consolidator's OR-only accumulator never sees it. The journal is
observable recovery state consumed by a later pass, not private staging.

This is the same class the plan has now closed in three other components — result
assembly and callers (`living-memory.ts`, TASK-646), the durable-file primitives
(`durable-files.ts`, TASK-648), and now the consolidation modules. Treat this round as
the **final component sweep**, not a single-site patch.

Sweep both remaining modules, not only the reported line. A second candidate of the
same shape was found by the coordinator and must be resolved or explicitly justified:
in the recovery path, `restoreFile()` at `:601` durably restores an episode, and the
following `removeFile(journal)` at `:607` can throw untagged before it removes
anything — after TASK-648, `durableRemove` tags only when it actually removed — so the
earlier restore commit can be lost the same way. `consolidation-receipts.ts:228`
appears safe because nothing can throw between `replaceText()` and its return;
confirm that rather than assume it.

Record in the task notes an enumeration of every durable-write sequence in
`lib/memory/consolidation-sources.ts` and `lib/memory/consolidation-receipts.ts`,
with, for each, either the commit recording applied or the reason it is already safe.
The pattern established by the earlier rounds is: record the commit at the write, not
at the end of the sequence.

Scope bounds: `lib/memory/retirement-store.ts` is untouched and D-026 is not reopened.
The episode prune journal is not retirement pathname sequencing. Do not reorder
operations; this task changes commit recording and error tagging only.

Ratified-ground handling: the five common constraints below and the spec Intent
invariants INV-001..INV-004 are stop-and-escalate ground. INV-003 is the invariant
SR-008 violates.


<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the same commit.
- [ ] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass at the task's commit boundary. Artifact conformance is now required GREEN — Stage 4 has reached the point where it must be. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21; D-026) D-026 is not reopened or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched. No operation is reordered; this task changes commit recording and error tagging only.
- [ ] #6 (SR-008; INV-003) A RED counterexample reproduces SR-008 before any production edit: the episode prune journal is durably written and `renameFile()` then fails with an ordinary untagged error before mutating. The failed result is shown to report `writesCommitted: false` while the journal exists on disk. After the fix that result reports `writesCommitted: true`.
- [ ] #7 (SR-008; class closure) The recovery-path candidate is resolved or explicitly justified in the task notes: `restoreFile()` at `consolidation-sources.ts:601` durably restores an episode and the following `removeFile(journal)` at `:607` can throw untagged before removing. If it is a real instance it is fixed with a counterexample; if it is not, the notes state precisely why.
- [ ] #8 (class closure) The task notes enumerate every durable-write sequence in `lib/memory/consolidation-sources.ts` and `lib/memory/consolidation-receipts.ts` with, for each, either the commit recording applied or the reason it is already safe — including confirmation that `consolidation-receipts.ts:228` cannot throw between the write and its return.
- [ ] #9 (INV-003, inverse direction) The fix does not make `writesCommitted` true where nothing was durably written — in particular on dry-run paths, on failures before the journal write, and on the no-work/noop path.
- [ ] #10 (Quality Contract assertions 1-4) The Stage-1 measurement contract, the Stage-2 completeness barrier, warning append-only monotonicity and the Stage-3 commit fold are all preserved unweakened. After the fix the full fidelity pack B-001..B-012, the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->
