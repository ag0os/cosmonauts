---
id: TASK-765
title: >-
  Closure remediation E - closure-2 items (caller accuracy, QM final-message
  evidence, negative pins)
status: To Do
priority: high
labels:
  - backend
  - testing
  - docs
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-764
createdAt: '2026-09-24T23:04:19.408Z'
updatedAt: '2026-09-24T23:04:19.408Z'
---

## Description

Close the actionable items from TASK-728 closure review 2:
- `missions/plans/qm-chain-safety/closure-review-2-codex.md`: M2, M3, L1;
- `closure-review-2-claude.md`: LOW-1, LOW-2, LOW-3;
- `closure-review-2-kimi.md`: MEDIUM-3.

Codex M1 is dispositioned by plan D-035 as a recorded limit; do NOT add host prose-field validation. Read D-031, D-032, D-034 and D-035.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. No gate-owned file edits.

Tests follow D-014 (observer, entry point, outcome; no sentence matching). A link or path search that asserts the ABSENCE of old paths is a structural check, not a sentence match.

Lint on tracked paths must pass. Run the suite as `bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 Codex M2 (D-034): `external-commands/implement-plan.md` names `gpt-5.6-sol` for the codex review channel and codex workers; no live caller surface (prompts, skills, docs, README, AGENTS, external commands/skills) names `gpt-6-sol`.
- [ ] #2 Codex M3 (D-026): `docs/fallow-workflow-integration.md` Quality Manager Protocol states the shipped order: the panel runs and its evidence is sealed before host preparation and host checks execute reviewed code; no live doc implies checks run before the panel is sealed.
- [ ] #3 Claude LOW-1: the QM session result is subject to the same final-message evidence rule as reviewers (`finalAssistantEvidence`): a QM final message that is an error, aborted or text-less yields a failed assessment with a visible reason, never an earlier report; tested through the real launch path; the test fails on the current code.
- [ ] #4 Claude LOW-2: a reviewer or QM final message stopped by the token limit (`stopReason` `length`) is not accepted as complete evidence; it fails the reviewer (or the assessment) visibly; tested; ordinary non-QM spawns keep their behavior.
- [ ] #5 Claude LOW-3: a test fails when the post-clone "source changed during private clone" re-check in `quality-review-workspace.ts` is removed.
- [ ] #6 Codex L1: a test asserts that a QM run (success and failure paths) writes no `missions/reviews/*-round-N.md`; a test asserts no live surface (tracked files outside `missions/archive/**`, `missions/reviews/**` evidence, frozen fixtures, `knowledge/`, and this plan's review files) references any of the eleven archived round paths.
- [ ] #7 Kimi MEDIUM-3: a test fails if any hard-coded gate-owned path in `isGateOwnedFile` (and each `qualityReview.gateOwnedPaths` entry in this repository's config) does not exist in the repository.
- [ ] #8 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
