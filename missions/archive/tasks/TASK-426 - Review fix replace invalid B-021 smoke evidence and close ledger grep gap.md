---
id: TASK-426
title: 'Review fix: replace invalid B-021 smoke evidence and close ledger grep gap'
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-29T18:38:20.394Z'
updatedAt: '2026-06-29T18:46:10.816Z'
---

## Description

Round 1 Quality Manager findings: (1) `missions/plans/coding-agnostic-framework/dogfood-drive-verification.md` does not satisfy B-021 because it cites a codex run with an explicit legacy envelope instead of a real `cosmonauts-subagent` Drive smoke with omitted `envelopePath` and no project domain override. (2) The test-decoupling ledger claims fresh `grep -rl coding tests/` coverage but misses grep hits whose only match is `encoding`: `tests/agent-packages/claude-binary-runner.test.ts`, `tests/cli/drive/status.test.ts`, `tests/driver/driver-script.test.ts`, and `tests/driver/run-step.test.ts`. Fix artifacts/tests narrowly and commit the required plan artifacts so the worktree can become clean.

<!-- AC:BEGIN -->
- [x] #1 Run or otherwise produce a real B-021 Drive smoke with backend `cosmonauts-subagent`, omitted `envelopePath`, no project domain override, and inspectable evidence that the Drive worker resolves to `coding/worker`; record run id/task id/backend/frozen framework default envelope path/resolved-agent proof in `dogfood-drive-verification.md`.
- [x] #2 Do not present the previous codex run with an explicit legacy envelope as satisfying B-021; it may be mentioned only as non-satisfying prior evidence if useful.
- [x] #3 Regenerate/update `test-decoupling-ledger.md` so every path returned by `grep -rl coding tests/` has a disposition, including false-positive `encoding` hits, or update the validator/artifact wording to make and enforce the exact intended matcher unambiguous while satisfying the plan/user watch-item.
- [x] #4 `tests/coding-agnostic-fixtures.test.ts` and any targeted dogfood evidence tests pass.
- [x] #5 Required plan artifacts are tracked/committed so `git status --porcelain` can be clean after remediation.
<!-- AC:END -->

## Implementation Notes

Implemented a B-021 executable Drive smoke using the real cosmonauts-subagent backend path with the Pi session factory mocked at the LLM boundary. The smoke records/validates the framework default envelope path, no domainContext override, cosmonauts-subagent events, and resolved coding/worker session input. Updated the ledger validator to match the plan watch-item grep semantics (`coding` substring) and classified the encoding-only false positives.
