---
id: TASK-655
title: >-
  QM round: Fresh structural review of the deterministic-path and reporting
  remediation
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-654
createdAt: '2026-09-08T02:32:11.388Z'
updatedAt: '2026-09-08T02:32:28.264Z'
---

## Description

Fresh structural review of the QM-round remediation, required by D-006 and Quality
Contract assertion 8.

Context the reviewer must be given: the post-implementation Quality Manager review found
that TASK-642's SR-001 fix was applied only to the judgment path, leaving the identical
pre-SR-001 pattern intact in the deterministic fast path — a defect ten prior fresh review
rounds all missed. That is the strongest available evidence that this codebase has
near-duplicate sibling paths where a fix applied to one does not reach the other.

Therefore the central question for this round is **path parity**: for every behaviour this
plan established, does the deterministic fast path
(`deterministic.length > 0 && !needsJudgment`) behave identically to the judgment path?
Enumerate the behaviours and check each across both paths rather than reviewing only the
diff. Specifically include: unusable-pressure retirement gating and diagnostics, the
completeness barrier, committed-write recording at every durable write, warning
append-only monotonicity, and receipt lifecycle handling.

Also verify the inverse for the new reporting changes: an integrity diagnostic must not be
emitted for a genuine cap deferral, and a source that is complete must not be named as
incomplete.

Confirm that none of the pre-existing findings deliberately left out of scope was modified:
corpus body-admission ordering, per-file aggregate deferral shape, `directEpisodePaths`
symlink handling, and `listKnowledgeFiles` dirent-exclusion completeness must all remain
exactly as on `main`.

Record the verdict at `missions/plans/living-memory-fidelity/review-12.md`.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).
- [ ] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, the digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and the count is 237, computed by the exact command in Implementation Order step 1.
- [ ] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened.
- [ ] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN.
- [ ] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [ ] #6 (SR-010; path parity) The review verifies SR-010 is closed and, more importantly, enumerates every behaviour this plan established and checks it across BOTH the deterministic fast path and the judgment path. A behaviour present in one path and absent or different in the other is a finding even though no previous round named it.
- [ ] #7 (SR-011/SR-012) The review verifies integrity omissions are no longer reported as bounded deferrals, that a genuine cap deferral is still reported as one, and that the incomplete source is identified in the reported result without a complete source ever being named.
- [ ] #8 (scope) The review confirms the pre-existing findings left out of scope — corpus body-admission ordering, per-file aggregate deferral shape, `directEpisodePaths`, and `listKnowledgeFiles` dirent-exclusion completeness — are byte-identical to `main`.
- [ ] #9 (Quality Contract assertion 8) The verdict is recorded in `missions/plans/living-memory-fidelity/review-12.md` and referenced in task evidence, with zero unresolved high or medium findings required to close.
- [ ] #10 (D-010) `<n>` is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-12.md`. No existing review record may be overwritten, renamed or deleted.
- [ ] #11 (Plan ## Risks, structural-analysis entry) The five bindable gates are reported as **degraded/unbound**, never as clean, with an explicit statement that no executable structural evidence exists for them.
<!-- AC:END -->
