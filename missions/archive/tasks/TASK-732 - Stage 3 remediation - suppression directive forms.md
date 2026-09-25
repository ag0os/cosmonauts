---
id: TASK-732
title: Stage 3 remediation - suppression directive forms
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-722
createdAt: '2026-09-24T05:47:37.945Z'
updatedAt: '2026-09-24T05:51:22.663Z'
---

## Description

Remediate Claude M6 from the mid-branch independent review (`missions/plans/qm-chain-safety/mid-review-1-claude.md`). The suppression scanner misses directive forms that TypeScript and the linters honour. This work is governed by D-009, B-008 and AC-011 (ratified): a new suppression directive must fail the gate unless it is registered.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 The suppression scanner recognizes every comment form the tools honour for each family, including `/// @ts-ignore`, `/** @ts-ignore */`, `/* @ts-expect-error */`, JSX `{/* biome-ignore ... */}` and `/* eslint-disable ... */`; an added directive in any of these forms fails `scripts/check-new-suppressions.ts` unless registered in the base registry; tested per form.
- [x] #2 Existing registered directives still pass and the registry is not re-seeded unless a newly recognized form reveals an existing intentional directive, in which case it is added with a note; `bun run check:suppressions -- --base main` passes on the branch.
<!-- AC:END -->
