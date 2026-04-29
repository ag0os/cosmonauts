---
id: TASK-229
title: >-
  W1-11: Refactor cli/scaffold/commands/missions.ts scaffoldMissions into state
  + init + render helpers
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:57:49.077Z'
updatedAt: '2026-04-29T15:31:07.844Z'
---

## Description

Refactor the `scaffoldMissions(options, globalOptions)` function at `cli/scaffold/commands/missions.ts:19` into named state/init/render helpers, removing the complexity suppression.

**Suppression:** `cli/scaffold/commands/missions.ts:19`, `scaffoldMissions(options, globalOptions)`.

**Current responsibilities:** detects existing task config, respects `--force`, initializes `TaskManager`, scaffolds `.cosmonauts/config.json`, and renders already-initialized/initialized results in JSON/plain/human modes.

**Target pattern:** command service/helpers:
- `getMissionsScaffoldState(projectRoot: string, force?: boolean): Promise<"already_initialized" | "should_initialize">`
- `initializeMissions(projectRoot: string, options: MissionsOptions): Promise<MissionsScaffoldResult>`
- `renderMissionsScaffoldResult(result: MissionsScaffoldResult, mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/cli/scaffold/subcommand.test.ts:4` covers program registration only; add: already initialized JSON/plain/human, `--force` reinitialize, successful initialized JSON/plain/human, project config created/existing output, and TaskManager/scaffold errors.

**TDD note:** yes for render helper; no for filesystem flow.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/scaffold/commands/missions.ts:19`.
- Commit the change as a single commit: `W1-11: Refactor cli/scaffold/commands/missions.ts scaffoldMissions`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-11

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Suppression at cli/scaffold/commands/missions.ts:19 is removed.
- [ ] #3 Existing scaffold missions and task init shared use remains intact.
- [ ] #4 Output strings for created directories/config are preserved.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
