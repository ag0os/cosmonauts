---
id: TASK-233
title: 'W2-04: Refactor cli/pi-flags.ts parsePiFlags into phase helpers'
status: Done
priority: medium
labels:
  - 'wave:2'
  - 'area:cli-infra'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:58:40.691Z'
updatedAt: '2026-04-29T15:46:46.379Z'
---

## Description

Refactor the `parsePiFlags(argv)` function at `cli/pi-flags.ts:146` into named parser-phase helpers, removing the complexity suppression.

**Suppression:** `cli/pi-flags.ts:146`, `parsePiFlags(argv)`.

**Current responsibilities:** extracts enabled Pi flags, leaves unknown flags in remaining args, warns and drops disabled flags plus their values, accumulates string-array flags, tolerates optional list-models logic even though disabled, and post-processes comma-separated models/tools if enabled later.

**Target pattern:** phase split:
- `buildDisabledCliLookup(): Map<string, FlagKey>`
- `consumeEnabledFlag(argv: readonly string[], index: number, flags: Record<string, unknown>): number`
- `consumeDisabledFlag(argv: readonly string[], index: number, warnings: string[]): number`
- `postProcessPiFlags(flags: Record<string, unknown>): PiFlags`

**Coverage status:** `add-characterization-tests` — enabled session flags are indirectly covered by `tests/cli/main.test.ts:205`, but add direct tests for: disabled flags warning/value skipping (`--provider`, `--tools`, `--extension`), unknown flags remaining, repeated `--theme`, `--no-themes`, missing value behavior, and non-flag positional preservation.

**TDD note:** yes for parser phase helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/pi-flags.ts:146`.
- Commit the change as a single commit: `W2-04: Refactor cli/pi-flags.ts parsePiFlags`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 2 / W2-04

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 parsePiFlags delegates to phase helpers.
- [ ] #3 Suppression at cli/pi-flags.ts:146 is removed.
- [ ] #4 Existing parseCliArgs Pi passthrough tests remain green.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
