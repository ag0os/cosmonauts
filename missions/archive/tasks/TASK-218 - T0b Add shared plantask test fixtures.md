---
id: TASK-218
title: 'T0b: Add shared plan/task test fixtures'
status: Done
priority: high
labels:
  - 'wave:0'
  - 'area:prep'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
createdAt: '2026-04-29T13:56:01.565Z'
updatedAt: '2026-04-29T14:15:03.615Z'
---

## Description

Create `tests/helpers/plans.ts`, `tests/helpers/tasks.ts`, and `tests/helpers/cli.ts` with reusable fixture builders for CLI/manager tests.

**Files:** create `tests/helpers/plans.ts`, `tests/helpers/tasks.ts`, `tests/helpers/cli.ts`; optionally refactor existing command/manager tests to use them where it removes duplication.

**Current responsibilities addressed:** repeated temp manager setup and fixture creation in plan/task tests, visible in `.fallow/baselines/dupes.json` entries for `tests/cli/plans/commands/archive.test.ts:15-25|tests/cli/plans/commands/list.test.ts:14-24|tests/cli/plans/commands/view.test.ts:14-24|tests/plans/archive.test.ts:30-40` and task manager setup clones.

**Target pattern:** shared fixture builders with these contracts:

```ts
// tests/helpers/tasks.ts
export async function createInitializedTaskManager(projectRoot: string, prefix?: string): Promise<TaskManager>;
export async function createTaskFixture(manager: TaskManager, overrides?: Partial<TaskCreateInput>): Promise<Task>;

// tests/helpers/plans.ts
export async function createPlanFixture(manager: PlanManager, overrides?: Partial<PlanCreateInput>): Promise<Plan>;

// tests/helpers/cli.ts
export function captureCliOutput(): { stdout: () => string; stderr: () => string; restore: () => void };
export function mockProcessExit(): { calls: () => readonly number[]; restore: () => void };
```

**Coverage status:** `add-characterization-tests` — add helper tests or use helper self-tests proving: temp setup initializes managers, creates fixture task/plan records, captures CLI output, and restores mocks.

**TDD note:** yes — Red-Green-Refactor on helper contracts.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Commit the change as a single commit: `T0b: Add shared plan/task test fixtures`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 0 / T0b

<!-- AC:BEGIN -->
- [ ] #1 tests/helpers/plans.ts provides plan fixture builders.
- [ ] #2 tests/helpers/tasks.ts provides task manager initialization and task fixture builders.
- [ ] #3 tests/helpers/cli.ts captures output and process exits without leaking mocks between tests.
- [ ] #4 At least one existing plan command test and one existing task/manager test use the new helpers.
- [ ] #5 fallow audit, bun run test, bun run lint, and bun run typecheck are green.
<!-- AC:END -->

## Implementation Notes

Codex-implemented in commit a540415. Created tests/helpers/{plans,tasks,cli}.ts + tests/helpers/fixtures.test.ts; refactored tests/cli/plans/commands/list.test.ts and tests/extensions/task-plan-linkage.test.ts to consume the new helpers (proves AC #4). All four verification commands green at HEAD.
