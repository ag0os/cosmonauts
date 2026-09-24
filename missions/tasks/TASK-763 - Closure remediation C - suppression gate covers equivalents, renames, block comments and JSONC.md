---
id: TASK-763
title: >-
  Closure remediation C - suppression gate covers equivalents, renames, block
  comments and JSONC
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-761
createdAt: '2026-09-24T21:40:04.197Z'
updatedAt: '2026-09-24T22:15:27.227Z'
---

## Description

Fix `missions/plans/qm-chain-safety/closure-review-1-claude.md` MEDIUM-2, LOW-1 and LOW-2 (AC-011, INV-005). Suppressions are defined in `lib/quality/suppression-policy.ts` and checked by `scripts/check-new-suppressions.ts`.

- **MEDIUM-2.** `// @ts-nocheck` passes the gate because the `equivalents` map is empty. Recognize the file-level and line-level equivalents that the project's toolchain actually honors: at least `@ts-nocheck` alongside `@ts-ignore` and `@ts-expect-error`, and the Biome forms already handled. Treat them as suppressions that need a human-listed exception.
- **LOW-1.** Renaming a file that already contains a directive (`git mv`) reports it as new. Use git rename detection, so that an existing directive moved by a rename is unaffected, while a directive added in the same change is still caught.
- **LOW-2.** A multi-line block comment whose last line is `@ts-ignore` passes, although `tsc` honors it. A `biome-ignore` in a `.jsonc` or `.json` file that Biome lints also passes. Detect both.

Keep the change in the policy and the script. Do not edit `.cosmonauts/suppression-exceptions.json`: base-owned, human-only. Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Lint on tracked paths must pass. Run the suite as `bun run test`.

<!-- AC:BEGIN -->
- [x] #1 Adding `// @ts-nocheck` (and each recognized equivalent) without a base-listed exception fails `check:suppressions`; tested through the real script in a temp repo; the test fails on the current code.
- [x] #2 A pure `git mv` of a file carrying an existing directive passes; the same rename plus a newly added directive fails; tested through the real script.
- [x] #3 A multi-line block comment ending in `@ts-ignore`, and a `biome-ignore` added to a Biome-linted `.jsonc` file, each fail without an exception; tested through the real script.
- [x] #4 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass; `check:suppressions -- --base main` passes on this branch.
<!-- AC:END -->
