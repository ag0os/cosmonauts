---
id: TASK-657
title: 'QM round 2: Fresh structural review of mixed-cause source reporting'
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-656
createdAt: '2026-09-08T03:08:19.517Z'
updatedAt: '2026-09-08T03:08:19.928Z'
---

## Description

Fresh structural review of the SR-013 remediation, required by D-006 and Quality
Contract assertion 8.

Context: SR-011 (integrity omissions reported as bounded deferrals) was fixed by gating
the deferral decline on source completeness, which introduced SR-013 (a mixed-cause
source loses its cap-deferral diagnostic entirely). This is the seventh time in this
plan that a fix introduced a fresh defect. The remediation must therefore be checked in
BOTH directions: an integrity omission must never be reported as a bounded deferral, and
a genuine cap deferral must never be suppressed by the presence of an integrity omission.

Check all three cases explicitly — omissions all cap-deferred, all integrity, and mixed —
and verify the reported counts are accurate per cause rather than repeating the aggregate.

Also confirm this round did not disturb SR-010's path parity: pressure-blocked retirement
diagnostics must remain identical between the deterministic fast path and the judgment
path, and the pre-SR-001 slice pattern must not have reappeared.

Record the verdict at `missions/plans/living-memory-fidelity/review-13.md`.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).
- [ ] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, the digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and the count is 237, computed by the exact command in Implementation Order step 1.
- [ ] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened.
- [ ] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN.
- [ ] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [ ] #6 (SR-013, both directions) The review verifies all three omission cases — all cap-deferred, all integrity, and mixed — and confirms that neither diagnostic suppresses the other and that neither cause is mislabelled as the other. Reported counts are checked for per-cause accuracy.
- [ ] #7 (regression) The review confirms SR-010's path parity is intact and the pre-SR-001 `observedRetirementCandidates.length` slice pattern has not reappeared anywhere in `lib/memory/`.
- [ ] #8 (Quality Contract assertion 8) The verdict is recorded in `missions/plans/living-memory-fidelity/review-13.md` and referenced in task evidence, with zero unresolved high or medium findings required to close.
- [ ] #9 (D-010) `<n>` is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-13.md`. No existing review record may be overwritten, renamed or deleted.
- [ ] #10 (Plan ## Risks, structural-analysis entry) The five bindable gates are reported as **degraded/unbound**, never as clean, with an explicit statement that no executable structural evidence exists for them.
<!-- AC:END -->
