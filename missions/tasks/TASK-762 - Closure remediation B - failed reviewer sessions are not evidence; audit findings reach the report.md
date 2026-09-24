---
id: TASK-762
title: >-
  Closure remediation B - failed reviewer sessions are not evidence; audit
  findings reach the report
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-761
createdAt: '2026-09-24T21:40:04.186Z'
updatedAt: '2026-09-24T22:04:17.692Z'
---

## Description

Fix `missions/plans/qm-chain-safety/closure-review-1-claude.md` HIGH-1, MEDIUM-1 and LOW-3.

**HIGH-1 (AC-006, B-003, D-011).** A reviewer child whose final assistant message ended in a provider error or abort is recorded as a successful review:
- `executeChildPromptLoop` in `domains/shared/extensions/orchestration/spawn-tool.ts` returns success without inspecting the final message's error or aborted state.
- `recordReviewerResult` hard-codes `outcome: "success"`.
- `lib/orchestration/assistant-text.ts` falls back to earlier assistant text, or to `"<role> completed"`, so the empty-evidence check can never fire.

In the pinned Pi 0.80.6, `session.prompt` resolves normally after retries with an error message that carries no text (`handleRunFailure`). For quality-review reviewers, a final assistant message in an error or aborted state, or with no text of its own, must make that reviewer's evidence a failure, which fails the assessment. Fallback or synthesized text must never be accepted as reviewer evidence.

Ordinary, non-QM spawns keep their current behavior unless a change is required and is tested.

**MEDIUM-1 (D-025 amendment, AC-008).** `analysisAuditObservation` in `lib/orchestration/agent-spawner.ts` drops `findings` from the D-025 audit events it forwards, so `qualityReviewAuditFindingLines` always returns nothing on the real launch path. Carry the findings through, in the shape the launcher expects, so each introduced finding is reported with file:line.

**LOW-3.** Add tests that fail when protections are removed:
- the unresolvable-model-family branch, where the model is the configured one but its family is unresolvable, so the substitution check does not mask it;
- the reviewer digest-mismatch check, if it can be reached through a test seam; if it cannot, say so in the task notes.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Lint on tracked paths must pass. Run the suite as `bun run test`.

<!-- AC:BEGIN -->
- [x] #1 Through the real `spawn_agent` reviewer path, a reviewer child whose final assistant message is an error or aborted (including after partial text), or has no text of its own, produces a failed reviewer record and the QM assessment fails with a visible integrity reason; `ready` is impossible; the tests fail on the current code.
- [x] #2 No fallback or synthesized text (earlier assistant text, `<role> completed`) is accepted as quality-review reviewer evidence; ordinary non-QM spawns keep their behavior, tested.
- [x] #3 Through a real `createPiSpawner` quality spawn, a failing bound audit envelope with findings yields host report lines for each introduced finding with file:line; the test fails on the current code.
- [x] #4 A test fails when the unresolvable-family check is removed, using a configured-and-observed model whose family is unresolvable; the digest-mismatch check is tested or its unreachability is recorded in the task notes.
- [x] #5 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
- [x] #6 The QM prompt tells the QM to write each Findings and Out-of-range entry as a `- <ID> …` bullet; the host sentinel line `None recorded.` is not left in a section above host-appended items (real run 2 in closure-e2e.md); tested for the host part.
<!-- AC:END -->
