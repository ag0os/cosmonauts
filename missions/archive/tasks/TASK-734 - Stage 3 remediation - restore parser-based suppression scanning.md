---
id: TASK-734
title: Stage 3 remediation - restore parser-based suppression scanning
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-732
createdAt: '2026-09-24T06:37:27.806Z'
updatedAt: '2026-09-24T06:40:13.806Z'
---

## Description

Remediate Claude H1 from `missions/plans/qm-chain-safety/mid-review-2-claude.md`. TASK-732 switched `lib/quality/suppression-policy.ts` to a bare `ts.createScanner`. That scanner loses track after template-literal substitutions, so every later comment is invisible. The old scanner found 23 directives in the repository and the new one finds 15. This work is governed by D-009, B-008 and AC-011 (ratified).

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 Comment collection is parser-based (or otherwise syntax-correct), so directives after template literals with substitutions, regex literals and JSX are found; tested with `` const a = `x${y}z`; `` followed by `// @ts-ignore`, and with a regex literal containing `//`.
- [x] #2 The TASK-732 forms (`/// @ts-ignore`, `/** @ts-ignore */`, `/* @ts-expect-error */`, JSX `{/* biome-ignore ... */}`, `/* eslint-disable ... */`) are still recognized; their tests still pass.
- [x] #3 A repository-level test scans the tracked sources and asserts the recognized directive set equals the registry entries in `.cosmonauts/suppression-exceptions.json` (no unregistered existing directive and no stale entry), so a scanner regression that drops directives fails the suite; `bun run check:suppressions -- --base main` passes.
<!-- AC:END -->
