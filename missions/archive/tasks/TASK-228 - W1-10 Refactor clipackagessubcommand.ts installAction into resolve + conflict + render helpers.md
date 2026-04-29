---
id: TASK-228
title: >-
  W1-10: Refactor cli/packages/subcommand.ts installAction into resolve +
  conflict + render helpers
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:57:39.238Z'
updatedAt: '2026-04-29T15:25:03.237Z'
---

## Description

Refactor the `installAction(arg, options)` function at `cli/packages/subcommand.ts:123` into named resolve/conflict/render helpers, removing the complexity suppression.

**Suppression:** `cli/packages/subcommand.ts:123`, `installAction(arg, options)`.

**Current responsibilities:** resolves catalog/local/git source, determines package scope, calls `installPackage`, handles install errors, handles domain conflicts (`--yes`, prompt choices merge/replace/skip/cancel), rolls back skipped/cancelled installs, removes conflicting packages on replace, and renders install success.

**Target pattern:** command service/helpers:
- `resolveInstallRequest(arg: string, options: InstallCliOptions): InstallRequest`
- `handleInstallConflicts(result: InstallPackageResult, request: InstallRequest, options: InstallCliOptions): Promise<"continue" | "stopped">`
- `rollbackInstalledPackage(manifestName: string, scope: PackageScope, cwd: string): Promise<void>`
- `renderInstallSuccess(result: InstallPackageResult, scope: PackageScope): string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/cli/packages/subcommand.test.ts:116` covers normal install, scope/link/branch/catalog, `--yes` merge, and install errors, but conflict prompt branches are weak; add: skip, cancel, replace removing unique conflicting packages, prompt retry on invalid answer, and rollback failure handling if current behavior is to surface/propagate it.

**TDD note:** yes for request/render helpers; no for interactive prompt loop.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/packages/subcommand.ts:123`.
- Commit the change as a single commit: `W1-10: Refactor cli/packages/subcommand.ts installAction`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-10

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Source resolution uses existing resolveCatalogEntry/resolveCatalogSource behavior preserved by tests.
- [ ] #3 Suppression at cli/packages/subcommand.ts:123 is removed.
- [ ] #4 Conflict choices preserve current stdout/stderr/exitCode behavior.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
