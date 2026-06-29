---
id: TASK-425
title: 'Review fix: clear Wave 1 quality audit failures'
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-29T18:38:09.277Z'
updatedAt: '2026-06-29T18:44:06.878Z'
---

## Description

Round 1 Quality Manager finding: project gates pass except the binding fallow audit (`npx fallow audit --base a9eb8323e09d1cf033e3524c67a1f896ff0eb8a9`) fails on changed files. Apply the narrowest fixes only at the reported locations; do not broaden refactors of passing code.

<!-- AC:BEGIN -->
- [x] #1 `npx fallow audit --base a9eb8323e09d1cf033e3524c67a1f896ff0eb8a9` exits 0.
- [x] #2 Unused export/type/member findings in `cli/main.ts`, `tests/helpers/packages.ts`, and `lib/domains/default-domain.ts` are removed or justified with the project's accepted suppression style.
- [x] #3 The duplicate block reported in `cli/drive/subcommand.ts:736-749` and `:792-805` is resolved with the smallest safe extraction or simplification.
- [x] #4 `bun run typecheck`, `bun run lint`, and relevant tests still pass.
<!-- AC:END -->

## Implementation Notes

Committed 6f41ce9. Verified `npx fallow audit --base a9eb8323e09d1cf033e3524c67a1f896ff0eb8a9`, `bun run typecheck`, `bun run lint`, `bun run test`, and targeted CLI/domain/drive tests pass. Left unrelated review/TASK-426 worktree artifacts untouched.
