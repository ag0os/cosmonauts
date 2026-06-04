---
id: TASK-361
title: >-
  Reviewer/quality-manager resolve diff base to origin/main, pulling
  already-merged commits into the review range
status: To Do
priority: medium
labels:
  - bug
  - agents
  - prompts
dependencies: []
createdAt: '2026-06-04T18:42:19.187Z'
updatedAt: '2026-06-04T18:42:19.187Z'
---

## Description

The clean-context reviewer and quality-manager resolve their review base to origin/<base> FIRST, then compute the range as merge-base(HEAD, base)..HEAD. When local main is ahead of origin/main (the normal dogfooding state — work committed locally, not pushed), merge-base(HEAD, origin/main) resolves to the stale origin tip, so the review range includes every local-main-ahead commit (i.e. prior, already-merged plans) on top of the actual feature branch. The reviewer then reports those already-merged files as 'Out-of-scope Changed Source Files' and the quality-manager raises a false out-of-scope BLOCKER for a branch that is actually clean.

Root cause (prompt base-resolution order):
- bundled/coding/coding/prompts/quality-manager.md:29-30 ('Resolve the base reference in this order: origin/main (if git rev-parse --verify origin/main succeeds) ...') and :223 ('Always review against main (or origin/main when available).')
- bundled/coding/coding/prompts/reviewer.md:56 ('Resolve base: origin/main -> main -> master').
The lens reviewers (security/ux/performance) receive the base/merge-base from the spawn prompt, so they inherit the same bad base.

Observed 2026-06-04 during the durable-graph-scheduler (Plan 3) run: local main was 19 commits ahead of origin/main (fbb84d2); the QM review header recorded 'base: origin/main, range: fbb84d2..HEAD' and listed cli/, lib/driver/, bundled/ (Plan 1/2 work) as out-of-scope. The authoritative 'git diff --stat main..HEAD' (local main) showed only lib/durable-runtime/* and tests/durable-runtime/*. See missions/reviews/review-round-1.md.

Fix direction: prefer the LOCAL base branch the feature was forked from (main -> master) for merge-base computation; only fall back to origin/<base> when no local base branch exists. Apply consistently across reviewer.md, quality-manager.md, and the lens-reviewer base handoff.

<!-- AC:BEGIN -->
- [ ] #1 Reviewer and quality-manager base-resolution prefers the local base branch (main, then master) for merge-base; origin/<base> is only a fallback when no local base branch exists
- [ ] #2 With local main ahead of origin/main and a feature branch forked from local main, the computed review range equals merge-base(HEAD, local main)..HEAD and excludes already-merged commits
- [ ] #3 In that scenario the reviewer's changed-file set matches 'git diff --name-only $(git merge-base HEAD main)..HEAD' and the quality-manager raises NO out-of-scope blocker for files outside the branch's own changes
- [ ] #4 The base-resolution fix is applied consistently across bundled/coding/coding/prompts/reviewer.md, quality-manager.md, and the lens reviewers (security/ux/performance) that receive base/merge-base from the spawn prompt
- [ ] #5 The project's test, lint, and typecheck gates pass; any prompt-snapshot tests are updated
<!-- AC:END -->
