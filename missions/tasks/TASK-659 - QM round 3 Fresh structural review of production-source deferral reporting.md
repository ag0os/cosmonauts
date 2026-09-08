---
id: TASK-659
title: 'QM round 3: Fresh structural review of production-source deferral reporting'
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-658
createdAt: '2026-09-08T19:22:13.337Z'
updatedAt: '2026-09-08T19:22:13.839Z'
---

## Description

Fresh structural review of the SR-014 remediation, required by D-006 and Quality
Contract assertion 8. This is the closing review for the plan.

Context the reviewer must be given: this reporting chain has produced a regression in
each of its last two rounds — SR-011's fix introduced SR-013, and SR-013's fix left
SR-014 — so check the remediation in every direction rather than confirming the named
finding.

The specific blind spot that produced SR-014 is the one to guard against: **behaviour
tests inject fixture sources that set these fields directly, so a production adapter
that never populates them passes green.** Verify the new coverage exercises the REAL
production corpus source, not a fixture, and that it would fail if the adapter stopped
reporting its count. Check the production episode source the same way.

Check all three omission cases against the production source — all cap-deferred, all
integrity, mixed — and confirm the reported counts are accurate per cause, that neither
diagnostic suppresses the other, and that `omitted` still means what it meant before.

Confirm this round disturbed nothing earlier: SR-010's path parity between the
deterministic fast path and the judgment path, SR-013's separation of causes, the
Stage-2 completeness barrier, and the Stage-3/4 committed-write recording.

Record the verdict at `missions/plans/living-memory-fidelity/review-14.md`.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).
- [ ] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, the digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and the count is 237, computed by the exact command in Implementation Order step 1.
- [ ] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened.
- [ ] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN.
- [ ] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [ ] #6 (SR-014; real-adapter coverage) The review confirms the new coverage exercises the real production corpus source rather than an injected fixture, and would fail if the adapter stopped reporting its cap-deferral count. It checks the production episode source the same way, or confirms the recorded reason it cannot produce cap deferrals.
- [ ] #7 (SR-014; all cases) All three omission cases are verified against the production source — all cap-deferred, all integrity, mixed — with per-cause count accuracy, neither diagnostic suppressing the other, and `omitted` unchanged in meaning.
- [ ] #8 (regression) The review confirms SR-010 path parity, SR-013's separation of causes, the Stage-2 completeness barrier and the Stage-3/4 committed-write recording are all undisturbed, and that the pre-SR-001 slice pattern has not reappeared.
- [ ] #9 (closing statement) Because this is the plan's closing review, the verdict states positively whether the reporting-fidelity chain (SR-011 through SR-014) is now complete and whether any adapter in scope still fails to populate a field the reported result depends on. A bare 'no findings' is not sufficient evidence for handoff.
- [ ] #10 (Quality Contract assertion 8) The verdict is recorded in `missions/plans/living-memory-fidelity/review-14.md` and referenced in task evidence, with zero unresolved high or medium findings required to close.
- [ ] #11 (D-010) `<n>` is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-14.md`. No existing review record may be overwritten, renamed or deleted.
- [ ] #12 (Plan ## Risks, structural-analysis entry) The five bindable gates are reported as **degraded/unbound**, never as clean, with an explicit statement that no executable structural evidence exists for them.
<!-- AC:END -->
