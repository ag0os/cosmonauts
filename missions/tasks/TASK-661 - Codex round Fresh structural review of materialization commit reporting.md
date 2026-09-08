---
id: TASK-661
title: 'Codex round: Fresh structural review of materialization commit reporting'
status: Blocked
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-660
createdAt: '2026-09-08T20:11:37.192Z'
updatedAt: '2026-09-08T20:41:29.918Z'
---

## Description

Fresh structural review of the CDX-001/CDX-002 remediation, required by D-006 and
Quality Contract assertion 8.

Context: an independent `codex exec` review found that a pass reports
`writesCommitted: true` whenever `markMaterialized()` returns, even though the store
returns without writing for an already-materialized receipt. Fourteen prior fresh
structural reviews and the Quality Manager missed it, several while carrying an explicit
criterion to check exactly that inverse direction. Treat "the criterion was present" as
no evidence that the check was performed.

The central question: **is there any other place in scope where a committed bit is
inferred from a successful return rather than reported by the operation that performed
the write?** Enumerate the durable-write call sites and check each for that specific
shape — success implying commitment — rather than reviewing only the diff. This is the
same root cause as SR-014, where a reported field was inferred instead of carried.

Verify both directions on the materialization path: a no-op materialization reports
false, and a real materialization (including one that throws after writing) still
reports true.

Confirm nothing earlier regressed: SR-010 path parity, SR-011..SR-014 cause separation,
the Stage-2 completeness barrier, and committed-write recording in the understating
direction.

Record the verdict at `missions/plans/living-memory-fidelity/review-15.md`.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).
- [x] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, the digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and the count is 237, computed by the exact command in Implementation Order step 1.
- [x] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened.
- [x] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN.
- [x] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [x] #6 (CDX-001; both directions) The review verifies a no-op materialization reports `writesCommitted: false` and a real one still reports true, including the throw-after-write case, and that the bit is carried by the store rather than inferred at the call site.
- [x] #7 (CDX-001; class) The review enumerates every durable-write call site in scope and checks each for the success-implies-commitment shape, reporting any other instance as a finding even though no previous round named it.
- [x] #8 (CDX-002) The review confirms `ConsolidationSourceFinalization` is exported from the public barrel alongside its siblings and that no other type introduced by this plan is missing from it.
- [x] #9 (regression) SR-010 path parity, SR-011..SR-014 cause separation, the Stage-2 completeness barrier and Stage-3/4 committed-write recording are confirmed undisturbed.
- [ ] #10 (Quality Contract assertion 8) The verdict is recorded in `missions/plans/living-memory-fidelity/review-15.md` and referenced in task evidence, with zero unresolved high or medium findings required to close.
- [x] #11 (D-010) `<n>` is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-15.md`. No existing review record may be overwritten, renamed or deleted.
- [x] #12 (Plan ## Risks, structural-analysis entry) The five bindable gates are reported as **degraded/unbound**, never as clean, with an explicit statement that no executable structural evidence exists for them.
<!-- AC:END -->

## Implementation Notes

task failed
