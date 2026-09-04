---
id: TASK-628
title: Review round 5 remediation — Episode convergence and INV-005 byte bounds
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-627
createdAt: '2026-09-04T14:06:17.537Z'
updatedAt: '2026-09-04T14:25:32.447Z'
---

## Description

Review round 5 confirmed the retirement/restore byte-safety story is closed: no new regression, and no remaining INV-001/INV-002/INV-006/INV-007 or data-destruction violation outside the ratified D-026 class. Four findings remain. None destroys data; three are INV-005 bounds and one is a convergence defect.

HIGH 1 — production episode negative judgments do not converge (AC-014/B-016).
When a model pass returns no proposal for selected episodes, the materialized receipt still marks all selected inputs represented. On the next pass the episode source discards represented episodes BEFORE returning its inventory, so receipt discharge receives no current key for them, concludes the receipt is fully stale, and deletes it. The immediate rerun therefore reports committed maintenance instead of `noop`, and the pass after that re-admits and re-judges the unchanged episode. A negative judgment must be durable: an unchanged input that was already judged with no proposal must not be re-judged, and an immediate rerun after a completed pass must be an honest `noop`.
Fix: make discharge aware of represented-but-filtered inputs so a receipt is only discharged when its consumed digests genuinely no longer exist in the corpus/episode set — not merely when the source filtered them out as already represented. Whether that is done by having sources report represented-but-filtered records in the inventory, or by passing the represented key set into discharge, is the implementer's choice; the observable contract is what matters. Add a regression test: a full model pass that yields NO proposal for its episodes, then an immediate rerun that must be a no-model `noop` with the receipt retained, then a third run that must still not re-judge the unchanged episode.

HIGH 2 — the production corpus inlet is not byte-bounded (INV-005).
The corpus adapter retrieves the complete project/user corpus through the shared knowledge-store read path, which reads every file fully into memory, and only afterwards applies the per-record and aggregate byte ceilings. One arbitrarily large knowledge file therefore controls peak memory regardless of the limits.
Note the constraint that created this: TASK-617 deliberately required reusing the existing knowledge reader and forbade a second corpus reader, so do NOT fix this by duplicating the reader. Parameterize the shared read path instead — give the knowledge-store read an optional byte ceiling that the corpus adapter supplies, so oversized files are skipped or truncated at read time with an explicit decline rather than being fully materialized first. Default behaviour for all existing callers must be unchanged when no ceiling is passed.

HIGH 3 — judgment request and response bytes are unbounded (INV-005).
`LivingMemoryLimits` defines source-body ceilings but no serialized request or output ceiling. The prompt is serialized without measuring it, and output validation bounds counts while accepting arbitrarily large reasons, metadata, tags, and replacement bodies, so one valid-shaped provider response can create an unbounded receipt or proposal.
Fix: add explicit serialized request and output byte ceilings to `LivingMemoryLimits` with sensible defaults, measure the serialized request before dispatching it and fail closed if it exceeds the ceiling, and reject over-ceiling model output during validation before any receipt or proposal is written. Model output must continue to fail closed, never be silently truncated.

LOW 4 — `DurableFileCommittedError` is exported from `lib/memory/durable-files.ts` with no importer or re-export consumer, violating the Quality Contract's "every new export has a consumer". Either wire it to its consumer or stop exporting it.

Every commit that changes `lib/memory/types.ts` must re-pin its full-source SHA-256 in the profile-playbooks seam test in the SAME commit; `lib/architecture-map/retrieval.ts` must remain byte-identical with its pin untouched.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Do not weaken the receipt floor, the frozen pins, retirement/byte authority, or any existing marker. Do not reopen the D-026 ratified pathname-race class or add verification layers for it. Confine every change to lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests.

<!-- AC:BEGIN -->
- [x] #1 A negative judgment is durable and convergent: a full model pass that yields no proposal for its selected episodes retains its materialized receipt, an immediate rerun is an honest no-model `noop`, and a third run still does not re-admit or re-judge the unchanged episode. Receipt discharge only removes a receipt whose consumed digests genuinely no longer exist, never one whose inputs were merely filtered as already-represented.
- [x] #2 The corpus inlet enforces its byte ceilings at read time rather than after full materialization, achieved by parameterizing the shared knowledge read path with an optional ceiling rather than adding a second corpus reader; oversized files are skipped or truncated with an explicit decline, and every existing caller that passes no ceiling behaves exactly as before.
- [x] #3 `LivingMemoryLimits` gains explicit serialized request and output byte ceilings with sensible defaults; the serialized judgment request is measured and fails closed before dispatch when it exceeds its ceiling; and over-ceiling model output is rejected during validation before any receipt or proposal is written, failing closed rather than being truncated.
- [x] #4 `DurableFileCommittedError` either has a real consumer or is no longer exported, and the changed scope contains no exported symbol without a consumer.
- [x] #5 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green under their exact existing names and owners; any commit touching `lib/memory/types.ts` re-pins its SHA-256 in the same commit with `lib/architecture-map/retrieval.ts` byte-identical; live `knowledge/` and `memory/` stay byte-identical; a live dry run still completes as `ran` or `noop` writing nothing; and no file outside lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests is modified.
<!-- AC:END -->
