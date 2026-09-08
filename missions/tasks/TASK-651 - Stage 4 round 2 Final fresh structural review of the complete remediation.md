---
id: TASK-651
title: 'Stage 4 round 2: Final fresh structural review of the complete remediation'
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-650
createdAt: '2026-09-08T00:50:15.258Z'
updatedAt: '2026-09-08T00:50:25.554Z'
---

## Description

Repeat of Implementation Order step 20's final fresh structural review, required
because the previous final review (`review-9.md`, TASK-640) returned the unresolved
medium finding SR-008.

Review the **entire** permitted diff for the plan — Stages 0 through 4 and every
remediation round — supplied with the complete seven-round parent trajectory in
`missions/plans/living-memory/review-rounds.md` and every verdict in `review-2.md`
through `review-9.md`.

Regression history: six of seven parent rounds' fixes introduced a fresh defect. This
plan required SR-001 through SR-008 across four stages. The committed-write class
alone was closed in four separate components across four rounds — result assembly,
callers, durable-file primitives, and now the consolidation modules — each round
revealing the class one level or one component further out. The central question for
this round is whether that sweep is now complete across every module in scope, or
whether a fifth component still defers recording a durable write.

Check the task's enumeration of durable-write sequences in
`lib/memory/consolidation-sources.ts` and `lib/memory/consolidation-receipts.ts`
against the files rather than trusting it, and confirm the earlier sweeps of
`lib/memory/living-memory.ts` and `lib/memory/durable-files.ts` still hold after this
change.

Also verify the inverse direction across the whole plan: nothing reports a committed
write where none occurred, on dry-run, pre-write-failure, noop, or identity-conflict
paths.

Record the verdict at `missions/plans/living-memory-fidelity/review-10.md`. The final
scope audit and handoff proceed only with zero unresolved high or medium findings.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, the digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and the count is 237, computed by the exact command in Implementation Order step 1. No live `knowledge/` change and no non-dry-run write-capable memory command.
- [ ] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened.
- [ ] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN.
- [ ] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation was reordered in any swept module.
- [ ] #6 (Implementation Order step 20) The review covers the entire plan diff across Stages 0-4 and all remediation rounds, reruns the permanent measurement pack and the full fidelity pack B-001..B-012, and inspects completeness and commit monotonicity rather than only current test failures.
- [ ] #7 (SR-008; class closure) The review verifies SR-008 is closed, independently checks the task's enumeration of durable-write sequences in both consolidation modules against the files, confirms the recovery-path candidate at `:601`/`:607` is resolved or correctly justified, and answers explicitly whether the committed-write sweep is now complete across every module in scope.
- [ ] #8 (INV-003, inverse direction) The review verifies nothing reports a committed write where none occurred — dry-run, failure-before-write, noop, and identity-conflict paths — across the whole plan, not only this round's change.
- [ ] #9 (Quality Contract assertion 8; Implementation Order step 20) The verdict is recorded in `missions/plans/living-memory-fidelity/review-10.md` and referenced in task evidence. The final scope audit and handoff proceed only with zero unresolved high or medium findings; any such finding starts a further bounded remediation and another fresh final review.
- [ ] #10 (D-010) `<n>` is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-10.md`. No existing review record may be overwritten, renamed or deleted.
- [ ] #11 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates are reported as **degraded/unbound**, never as clean, with an explicit statement that no executable structural evidence exists for them and that the diff was inspected by hand.
<!-- AC:END -->
