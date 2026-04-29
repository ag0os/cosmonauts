---
id: TASK-217
title: 'T0a: Add shared CLI output/error helpers'
status: Done
priority: high
labels:
  - 'wave:0'
  - 'area:prep'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:55:47.055Z'
updatedAt: '2026-04-29T14:08:57.590Z'
---

## Description

Create `cli/shared/output.ts` and `cli/shared/errors.ts` with shared output/error helper contracts consumed by all CLI command modules.

**Files:** create `cli/shared/output.ts`, `cli/shared/errors.ts`; add tests under `tests/cli/shared/output.test.ts` and `tests/cli/shared/errors.test.ts`.

**Current responsibilities addressed:** duplicated JSON/plain/human output and error printing across plan/task commands, visible in clone groups such as `.fallow/baselines/dupes.json` entries for `cli/plans/commands/list.ts:23-31|cli/tasks/commands/list.ts:66-74|cli/tasks/commands/search.ts:128-136`.

**Target pattern:** shared output/error helpers with these contracts:

```ts
// cli/shared/output.ts
export type CliOutputMode = "json" | "plain" | "human";
export interface CliGlobalOptions { json?: boolean; plain?: boolean }
export interface CliTableColumn<T> {
  header: string;
  width: (rows: readonly T[]) => number;
  render: (row: T) => string;
}
export function getOutputMode(options: CliGlobalOptions): CliOutputMode;
export function printJson(value: unknown): void;
export function printLines(lines: readonly string[], stream?: "stdout" | "stderr"): void;
export function renderTable<T>(rows: readonly T[], columns: readonly CliTableColumn<T>[]): string[];
```

```ts
// cli/shared/errors.ts
import type { CliGlobalOptions } from "./output.ts";
export interface CliErrorPrintOptions { prefix?: string; jsonMessage?: string; stream?: "stdout" | "stderr" }
export function printCliError(message: string, globalOptions: CliGlobalOptions, options?: CliErrorPrintOptions): void;
```

Also export `CliParseResult<T>` reusable result type:
```ts
export type CliParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

**Coverage status:** `add-characterization-tests` — add helper tests for: mode precedence (`json` over `plain`), JSON pretty-printing, table width rendering, stdout/stderr routing, JSON error payload, and human/plain error text.

**TDD note:** yes — Red-Green-Refactor on helper contracts.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Commit the change as a single commit: `T0a: Add shared CLI output/error helpers`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 0 / T0a

<!-- AC:BEGIN -->
- [ ] #1 cli/shared/output.ts exports CliOutputMode, CliGlobalOptions, getOutputMode, printJson, printLines, and renderTable.
- [ ] #2 cli/shared/errors.ts exports printCliError and does not import any manager or command module.
- [ ] #3 Helper tests cover JSON/plain/human mode and error output behavior.
- [ ] #4 No production module outside cli/ imports these helpers.
- [ ] #5 fallow audit, bun run test, bun run lint, and bun run typecheck are green.
<!-- AC:END -->

## Implementation Notes

Codex-implemented in commit 4f92ce4. Pre-existing biome formatter issues in `missions/tasks/config.json` and `tests/extensions/project-tools.test.ts` were resolved in preparatory commit 9d3dc68 (`chore: apply biome formatter to pre-existing files`) before TASK-217 could land. Verification (fallow audit + bun run test [1601 passed] + lint + typecheck) all green.
