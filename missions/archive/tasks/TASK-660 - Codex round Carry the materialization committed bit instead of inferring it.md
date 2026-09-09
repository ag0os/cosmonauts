---
id: TASK-660
title: 'Codex round: Carry the materialization committed bit instead of inferring it'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-658
createdAt: '2026-09-08T20:11:37.183Z'
updatedAt: '2026-09-08T20:22:50.021Z'
---

## Description

Remediation opened by the independent post-implementation `codex exec` review, which
returned DO-NOT-SHIP with two findings. Both are confirmed against the code.

**CDX-001 (medium) — a pass can report a committed write it never made.**
`lib/memory/living-memory.ts:122` records `writesCommitted: true` unconditionally
whenever `markMaterialized()` returns successfully. The production store at
`lib/memory/consolidation-receipts.ts:221` returns *without writing* when the receipt is
already materialized:

    if (current.state === "materialized") return current;

In a materialization-only retry — or when another actor materializes the receipt between
this pass's `list()` and its `markMaterialized()` call — the pass performs no durable
mutation yet reports `writesCommitted: true`. The caller cannot distinguish the two
cases from the return value, because both return a receipt whose state is
`"materialized"`.

This is the inverse of the direction rounds 2 through 5 closed. Those closed
*understating* a committed write; this *overstates* one. Fourteen fresh structural
reviews and the Quality Manager all missed it, even though several carried an explicit
acceptance criterion requiring the inverse direction to be checked.

Fix direction — the same lesson SR-014 established: **do not infer a committed bit,
carry it.** Have the receipt store report whether `markMaterialized()` actually wrote,
and have the consolidator fold that real bit rather than assuming a successful return
means a durable mutation. Do not fix this by comparing receipt state at the call site;
both paths return `"materialized"`, so any call-site inference is guesswork.

**CDX-002 (low) — the new finalization result is not publicly nameable.**
`ConsolidationSourceFinalization` (`lib/memory/consolidation-sources.ts:116`) is the
required return type of `finalize()`, but the source-contract export block in
`lib/memory/index.ts` omits it while exporting its siblings
(`ConsolidationFinalizedRecord`, `ConsolidationSource`,
`ConsolidationSourceCollectOptions`, `ConsolidationSourceInventoryRecord`, …). A
consumer implementing the source contract from the public barrel cannot name the type
without a deep import. Add it to that block.

Ratified-ground handling: the five common constraints below and INV-001..INV-004 are
stop-and-escalate ground. Preserve everything closed so far: the Stage-1 measurement
contract, the Stage-2 completeness barrier, SR-010 path parity, the SR-011..SR-014
reporting separation, and committed-write recording in the understating direction.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [x] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. No live `knowledge/` change and no non-dry-run write-capable memory command.
- [x] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the same commit.
- [x] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [x] #6 (CDX-001) A RED counterexample reproduces the over-claim before any production edit: a pass calls `markMaterialized()` on a receipt that is already in the materialized state, so the production store returns without writing, and the result is shown to report `writesCommitted: true`. After the fix that pass reports `writesCommitted: false`.
- [x] #7 (CDX-001; carried not inferred) The committed bit comes from the receipt store reporting whether it actually wrote, not from the consolidator inferring it from a successful return or from comparing receipt state at the call site. Both store paths return a receipt whose state is `"materialized"`, so a call-site comparison cannot distinguish them and does not satisfy this criterion.
- [x] #8 (CDX-001; understating direction preserved) A `markMaterialized()` call that DOES write still reports `writesCommitted: true`, including when it throws after the bytes changed — the committed-error tagging from earlier rounds is unaffected. Both directions are pinned by tests on the same code path.
- [x] #9 (CDX-002) `ConsolidationSourceFinalization` is exported from the source-contract block in `lib/memory/index.ts` alongside its siblings, and a test asserts it is nameable from the public barrel.
- [x] #10 (regression) SR-010 path parity, the SR-011..SR-014 cause separation, the Stage-2 completeness barrier and the Stage-3/4 committed-write recording are preserved. The full fidelity pack B-001..B-012, the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->
