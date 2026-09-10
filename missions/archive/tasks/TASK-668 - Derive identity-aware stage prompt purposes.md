---
id: TASK-668
title: Derive identity-aware stage prompt purposes
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies: []
createdAt: '2026-09-10T02:12:28.907Z'
updatedAt: '2026-09-10T17:46:58.572Z'
---

## Description

Implementation Order step 1. Owns behaviors B-002 and B-004 exclusively. Work test-first in `tests/orchestration/chain-steps.test.ts` against `lib/orchestration/stage-prompts.ts`; characterize `lib/orchestration/chain-steps.ts` without changing its established prompt-injection behavior.

Recorded ground: D-001 through D-003 and D-008 are derived and may change only through amend-on-record; the spec acceptance criteria and scope exclusions are ratified, so any need for arbitrary prior-stage output, artifact I/O during purpose selection, persona changes, or a factory-mode/system-prompt layer is stop-and-escalate ground under the deviation protocol.

<!-- AC:BEGIN -->
- [x] #1 B-002 is proven by `tests/orchestration/chain-steps.test.ts` > `derives review purpose from resolved identity and zero-based strict topology order`, carrying `@cosmo-behavior plan:chain-stage-context#B-002`, and only a repeated resolved identity across a strictly intervening reviewer receives revision purpose.
- [x] #2 B-002 purpose selection consumes a zero-based top-level topology index, uses `stage.agentReference?.resolved.qualifiedId ?? stage.name`, treats only exact unqualified `reviewer` or a `-reviewer` suffix as review, selects plan specialization only for exact unqualified `plan-reviewer`, and leaves cross-domain same names, substring lookalikes, same-step siblings, and prior author/reviewer parallel groups at default.
- [x] #3 B-004 is proven by `tests/orchestration/chain-steps.test.ts` > `keeps non-cycle prompts and step-zero injection byte-identical`, carrying `@cosmo-behavior plan:chain-stage-context#B-004`, for `implement`, `verify`, `adapt`, every single-stage role including `plan-reviewer`, direct `runStage`, qualified non-repeats, and unordered groups.
- [x] #4 User-request injection remains step-0-only and byte-identical: later stages receive neither another request copy nor prior-stage prose.
- [x] #5 Plan-review participation is derived purely from topology when `plan-reviewer` strictly intervenes before a repeated author or has a `task-manager` at the same or a later top-level index; generic reviewers create no plan-review gate state.
- [x] #6 The purpose contract remains a narrow discriminated runtime value rather than stamped `ChainStage` state or filesystem-derived state, and explicit prompt overrides cannot remove selected safety instructions while existing coordinator label suffix behavior remains intact.
- [x] #7 D-013.5 precedence is proven: where an exact unqualified `plan-reviewer` and a `-reviewer` suffix reviewer both fall strictly between a repeated author pair, the exact `plan-reviewer` wins and the repeated author receives plan-specialized revision purpose rather than generic. A test covers both orderings of the two reviewers so precedence cannot be satisfied by incidental iteration order.
<!-- AC:END -->
