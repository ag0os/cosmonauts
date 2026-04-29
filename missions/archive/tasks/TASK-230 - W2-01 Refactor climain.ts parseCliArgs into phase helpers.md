---
id: TASK-230
title: 'W2-01: Refactor cli/main.ts parseCliArgs into phase helpers'
status: Done
priority: medium
labels:
  - 'wave:2'
  - 'area:cli-infra'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:58:01.458Z'
updatedAt: '2026-04-29T15:34:04.324Z'
---

## Description

Refactor the `parseCliArgs(argv)` function at `cli/main.ts:104` into named phase helpers, removing the complexity suppression. Must land before W2-02 to avoid same-file conflicts.

**Suppression:** `cli/main.ts:104`, `parseCliArgs(argv)`.

**Current responsibilities:** detects `init`, extracts Pi passthrough flags and warnings via `parsePiFlags`, configures Commander options, parses prompt positionals, normalizes thinking/plugin/profile/options, and returns `CliOptions`.

**Target pattern:** phase split:
- `detectInitSubcommand(argv: readonly string[]): { isInit: boolean; effectiveArgv: string[] }`
- `buildCliParser(): Command`
- `parseThinkingOption(value: unknown): ThinkingLevel | undefined`
- `normalizeCliOptions(program: Command, isInit: boolean, piResult: PiFlagParseResult): CliOptions`

**Coverage status:** `add-characterization-tests` — existing `tests/cli/main.test.ts:15` covers many parse cases, but add: plugin-dir repeatability, `--profile`, Pi warning forwarding, and `--thinking` true/value normalization around the new phases before refactor.

**TDD note:** yes for pure phase helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/main.ts:104`.
- Commit the change as a single commit: `W2-01: Refactor cli/main.ts parseCliArgs`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 2 / W2-01

<!-- AC:BEGIN -->
- [ ] #1 Added characterization tests are green before refactor.
- [ ] #2 parseCliArgs delegates to the named phase helpers.
- [ ] #3 Suppression at cli/main.ts:104 is removed.
- [ ] #4 All existing parse tests remain green.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
