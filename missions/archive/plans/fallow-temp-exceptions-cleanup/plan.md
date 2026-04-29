---
title: Remove Temporary Fallow Exceptions
status: active
createdAt: '2026-04-28T21:10:45.531Z'
updatedAt: '2026-04-29T13:10:03.623Z'
---

## Summary

Remove the temporary Fallow complexity suppressions and duplication baseline documented in `docs/fallow-exceptions.md`, while leaving permanent `entry` and `dynamicallyLoaded` configuration exceptions untouched. The work is staged as an umbrella plan with shared CLI/test prep, one task per suppressed function, and a two-phase capstone for duplication-baseline cleanup.

## Scope

Included:
- Remove every inline `// fallow-ignore-next-line complexity` suppression documented under `docs/fallow-exceptions.md` for CLI command actions, CLI/session infrastructure, orchestration/runtime internals, and validation/stores/serialization.
- Remove `.fallow/baselines/dupes.json` and `audit.dupesBaseline` only after all Wave 0/1/2/3/4 refactors land and residual duplicate clone families are audited and cleaned.
- Add or preserve behavior tests for each suppressed function before structural refactoring, then prove the same tests remain green after refactoring.
- Introduce shared CLI output/error helpers and shared plan/task test fixtures before CLI command refactors.
- Run a two-phase duplication capstone: W5-01a cleans residual clone families from the baseline after prior waves, then W5-01b removes the baseline config/file and verifies Fallow with no baseline.

Excluded:
- Do not modify `entry` in `fallow.toml`; it is a public API exception confirmed at `fallow.toml:3`.
- Do not modify `dynamicallyLoaded` in `fallow.toml`; it is a framework-convention exception confirmed at `fallow.toml:24`.
- Do not change CLI user-facing output except where existing output is demonstrably preserved by characterization tests.
- Do not switch workflow to TDD; use standard `plan-and-build` with task-local Red-Green-Refactor notes only.

Assumptions:
- Current `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck` are green as reported by the previous planner verification.
- For private or closure-scoped functions (`cli/main.ts:run`, Commander `.action(...)` closures), characterization tests may use the existing public command/program boundary rather than importing the function directly.
- Task-manager may split Wave 0 helper work into exactly two prep tasks as directed, then create one task per suppressed function plus the two capstone tasks.
- Residual clone cleanup after Waves 0-4 is expected to touch test helper/setup code and non-suppressed production duplication families already listed in `.fallow/baselines/dupes.json`; W5-01a is the bounded place for that work.

## Decision Log

- **D-001 — Plan structure**
  - Decision: Umbrella plan; one task per suppressed function; same-file pairs (`cli/main.ts`, `lib/orchestration/chain-runner.ts`) are serial dependencies.
  - Alternatives: Separate plans per area; one large implementation task; merge same-file suppressions into single tasks.
  - Why: One umbrella keeps the Fallow cleanup coordinated while per-function tasks keep worker scope small and reviewable.
  - Decided by: user-directed

- **D-002 — Shared CLI helpers**
  - Decision: Prep tasks land first: shared CLI output/error helpers consumed by `cli/{plans,tasks}/commands/*`, then shared plan/task test fixtures/builders. All CLI command refactors depend on these prep tasks.
  - Alternatives: Inline helpers in each command; defer test fixture cleanup to the capstone.
  - Why: The duplication baseline shows command output/error and test setup clones; front-loading helpers prevents each command task from inventing its own API.
  - Decided by: user-chose-default

- **D-003 — Refactor depth**
  - Decision: Use idiomatic target patterns per the Fallow doc: per-event formatter table (`formatChainEvent`), predicate composition (`matchesFilter`), per-rule helpers (`validateDomains`, `validateManifest`), per-shape renderers (`generateTranscript`), strategy helpers (`resolveSessionManager`), per-handler dispatch (`run` mode dispatch in `cli/main.ts`), phase split (`parseCliArgs`, `runChain`, `runStage`, `spawn`). Plain extraction is fallback only when no pattern fits.
  - Alternatives: Shallow extraction only; rewrite whole subsystems; keep suppressions and document exceptions.
  - Why: These patterns reduce actual cognitive complexity at the source instead of moving branches into unrelated wrappers.
  - Decided by: user-chose-default

- **D-004 — Coverage gate (mandatory)**
  - Decision: No refactor may land without behavior tests covering the function's current responsibilities. Each task records `existing-coverage-sufficient` or `add-characterization-tests`, and workers must run characterization tests before and after refactor plus `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck`.
  - Alternatives: Refactor first and repair tests later; rely on full-suite smoke coverage.
  - Why: These are complexity-reduction refactors, so preserving behavior is the primary correctness requirement.
  - Decided by: user-directed

- **D-005 — Workflow**
  - Decision: Use standard `plan-and-build`; for clean extracted helper contracts, task specs tell workers to apply Red-Green-Refactor per helper. Do not switch to the `tdd` workflow.
  - Alternatives: Switch the entire plan to TDD; skip helper-level RGR.
  - Why: The cleanup is mostly refactoring under existing behavior, not new feature development.
  - Decided by: user-directed

- **D-006 — Dupes baseline**
  - Decision: Add a dedicated capstone task after all CLI command tasks land. It removes `.fallow/baselines/dupes.json` plus `audit.dupesBaseline` from `fallow.toml`, runs `fallow dupes`, and cleans residual clones.
  - Alternatives: Remove baseline first; remove baseline area-by-area.
  - Why: Existing duplicate clusters span plan/task commands and tests, so removing the baseline before command cleanup would create noisy failures.
  - Decided by: planner-proposed default, approved

- **D-007 — Permanent exceptions stay**
  - Decision: `entry` and `dynamicallyLoaded` in `fallow.toml` stay untouched.
  - Alternatives: Attempt to eliminate all Fallow configuration exceptions.
  - Why: They represent public API and dynamic framework conventions, not temporary migration debt.
  - Decided by: user-directed

- **D-008 — Dupes capstone strategy**
  - Decision: Use Strategy B — split Wave 5 into W5-01a residual de-baseline cleanup and W5-01b final baseline/config removal. Both W5 tasks are gated on all Wave 0/1/2/3/4 work, and W5-01b additionally depends on W5-01a.
  - Alternatives: Strategy A — add explicit W4 tasks for every non-CLI clone family and make one final capstone; Strategy B — audit residuals after per-function waves, clean clone families, then remove the baseline.
  - Why: `.fallow/baselines/dupes.json` contains a large cross-cutting set of production and test clone groups beyond CLI command clones, including update/installer source resolution, orchestration extension/spawner/chain-runner clones, plans/tasks extensions, package/task managers, runtime/domain/session/package/orchestration tests, and workflow/config tests. Many will shrink or change after Waves 0-4 and shared helpers land, so a residual audit task is more accurate and bounded than pre-enumerating dozens of speculative per-family tasks.
  - Decided by: planner-proposed

## Design

### Module structure

New helper modules:
- `cli/shared/output.ts` — single responsibility: normalize global CLI output mode and render reusable JSON/plain/human output primitives.
- `cli/shared/errors.ts` — single responsibility: print command errors consistently across JSON and non-JSON modes without owning command control flow.
- `tests/helpers/plans.ts` — single responsibility: build reusable plan manager fixtures and plan records for CLI/manager tests.
- `tests/helpers/tasks.ts` — single responsibility: build reusable task manager fixtures and task records for CLI/manager tests.
- `tests/helpers/cli.ts` — single responsibility: capture console/stdout/stderr and `process.exit` effects for CLI command characterization tests.

Existing modules to refactor in place:
- CLI command modules under `cli/tasks/commands/*`, `cli/plans/commands/*`, `cli/packages/subcommand.ts`, and `cli/scaffold/commands/missions.ts` keep command registration but delegate validation, mutation, and rendering to small same-file helpers unless a helper is shared by 3+ call sites.
- CLI/session infrastructure modules under `cli/main.ts`, `cli/session.ts`, `cli/pi-flags.ts`, and `cli/chain-event-logger.ts` keep public exports stable and split complex functions by phase/strategy/formatter table.
- Orchestration/runtime modules under `lib/orchestration/*` and `domains/shared/extensions/orchestration/*` keep their public APIs stable and split orchestration from rendering/persistence helpers.
- Validation/store/serialization modules under `lib/domains/validator.ts`, `lib/packages/*`, `lib/sessions/session-store.ts`, and `lib/tasks/task-manager.ts` keep domain logic local and split by rule, shape, or predicate.
- Capstone duplicate cleanup in W5-01a may add narrowly scoped test helpers under `tests/helpers/*` or package/orchestration-specific test helper modules only when a clone family has 3+ repeated setup blocks; otherwise it should collapse duplication locally in the affected test/source file.

### Dependency graph

- CLI command modules may import `cli/shared/output.ts`, `cli/shared/errors.ts`, and domain managers (`PlanManager`, `TaskManager`). Shared CLI helpers must not import managers or command modules.
- Test helpers under `tests/helpers/*` may import production managers/types and Vitest lifecycle utilities. Production code must not import test helpers.
- Domain/library modules (`lib/domains`, `lib/packages`, `lib/tasks`, `lib/sessions`) must not import CLI modules.
- Orchestration modules may import session-store persistence helpers as they already do at `lib/orchestration/agent-spawner.ts:12`, but rendering helpers must remain isolated from session lifecycle code.
- W5-01a residual duplicate cleanup depends on every Wave 0/1/2/3/4 task so it audits the post-refactor duplicate surface, not the stale baseline.
- W5-01b depends on W5-01a and is the only task that deletes `.fallow/baselines/dupes.json` and removes `audit.dupesBaseline` from `fallow.toml`.

### Key contracts

Shared CLI helper contracts for Wave 0a:

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

Shared test helper contracts for Wave 0b:

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

Reusable CLI parse result for command-local validation helpers:

```ts
export type CliParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

Per-area helper contracts are specified in the wave task specs below. Workers must keep public exported functions stable unless a task explicitly says to export a new pure helper for tests.

### Integration seams verified

- `docs/fallow-exceptions.md:47` confirms `audit.dupesBaseline` is temporary; `fallow.toml:36` confirms it points at `.fallow/baselines/dupes.json`.
- `.fallow/baselines/dupes.json` contains clone groups spanning plan/task commands, command tests, orchestration, package store, validator, runtime, workflow/config, domain, extension, and session tests; W5 must run after all Wave 0/1/2/3/4 work and must not be limited to CLI command cleanup.
- CLI task commands use `TaskManager` from `lib/tasks/task-manager.ts`, and `TaskManager.matchesFilter` is the central predicate currently suppressed at `lib/tasks/task-manager.ts:351`.
- CLI plan commands use `PlanManager` and `TaskManager` directly (`cli/plans/commands/list.ts:18`, `cli/plans/commands/edit.ts:28`, `cli/plans/commands/delete.ts:30`), so shared CLI helpers must not own persistence.
- `cli/main.ts:104` suppresses `parseCliArgs`, which already delegates Pi passthrough parsing to `parsePiFlags` at `cli/main.ts:111`; refactoring must preserve this phase order.
- `cli/main.ts:262` suppresses `run`, which builds `CosmonautsRuntime` before handling information/init/workflow/print/interactive modes; dispatch helpers must keep first-run domain checks before agent execution.
- `cli/session.ts:246` suppresses `resolveSessionManager`; existing tests exercise Pi session priority and graceful abort via `createSession` in `tests/cli/session.test.ts:207`.
- `lib/orchestration/chain-runner.ts:319` and `lib/orchestration/chain-runner.ts:508` are same-file suppressions; they must be serialized to avoid conflicting edits.
- `lib/orchestration/agent-spawner.ts:95` and `domains/shared/extensions/orchestration/spawn-tool.ts:352` both persist transcripts via `generateTranscript` from `lib/sessions/session-store.ts:111`; extraction must avoid divergent lineage persistence logic.
- `domains/shared/extensions/orchestration/rendering.ts:43` and `cli/chain-event-logger.ts:27` both format orchestration display events/tools; helper tables should remain local unless W5-01a duplicate cleanup proves a shared renderer is necessary.

### Seams for change

- CLI output helpers isolate JSON/plain/human branching because command output variants are repeated and likely to evolve together.
- Formatter tables isolate ChainEvent/tool variants so future event/tool types add one formatter entry rather than another switch branch.
- Validation rule helpers isolate domain/package rules so future fields add one rule helper without modifying every existing condition.
- Predicate composition in `TaskManager` isolates task filter semantics so CLI filters can add predicates without growing `matchesFilter`.
- W5-01a is the explicit seam for duplication families that are outside inline-suppressed functions; it should prefer localized test helpers or source helpers tied to an existing module, not new broad utility abstractions.

## Approach

1. Land shared CLI output/error helpers and tests before touching command actions.
2. Land shared plan/task/CLI test fixtures before command characterization tests.
3. For each suppressed function task: add missing characterization tests, run them green, refactor to the target helper pattern, remove the suppression, rerun the same tests, then run the full verification gate.
4. Keep same-file serial dependencies: `cli/main.ts:parseCliArgs` before `cli/main.ts:run`, and `lib/orchestration/chain-runner.ts:runChain` before `lib/orchestration/chain-runner.ts:runStage`.
5. After all Wave 0/1/2/3/4 tasks land, run W5-01a: execute `fallow dupes` with the current baseline still configured, compare against `.fallow/baselines/dupes.json`, and clean residual clone families listed in the W5-01a spec.
6. Run W5-01b only after W5-01a: remove `audit.dupesBaseline` and delete `.fallow/baselines/dupes.json`, then verify `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck`.

Workers must run these commands for every per-function task after the refactor:

```bash
fallow audit
bun run test
bun run lint
bun run typecheck
```

For tasks with `add-characterization-tests`, workers must also run the target test file before refactor and again after refactor.

## Wave Layout and Task Specs

### Wave 0 — Prep (serial)

#### T0a — Shared CLI output/error helpers
- Files: create `cli/shared/output.ts`, `cli/shared/errors.ts`; add tests under `tests/cli/shared/output.test.ts` and `tests/cli/shared/errors.test.ts`.
- Current responsibilities addressed: duplicated JSON/plain/human output and error printing across plan/task commands, visible in clone groups such as `.fallow/baselines/dupes.json` entries for `cli/plans/commands/list.ts:23-31|cli/tasks/commands/list.ts:66-74|cli/tasks/commands/search.ts:128-136`.
- Target pattern: shared output/error helpers with contracts from Design.
- Coverage status: `add-characterization-tests` — add helper tests for mode precedence (`json` over `plain`), JSON pretty-printing, table width rendering, stdout/stderr routing, JSON error payload, and human/plain error text.
- TDD note: yes — Red-Green-Refactor on helper contracts.
- Acceptance criteria:
  1. `cli/shared/output.ts` exports `CliOutputMode`, `CliGlobalOptions`, `getOutputMode`, `printJson`, `printLines`, and `renderTable`.
  2. `cli/shared/errors.ts` exports `printCliError` and does not import any manager or command module.
  3. Helper tests cover JSON/plain/human mode and error output behavior.
  4. No production module outside `cli/` imports these helpers.
  5. `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck` are green.
- Dependencies: none.

#### T0b — Shared plan/task test fixtures
- Files: create `tests/helpers/plans.ts`, `tests/helpers/tasks.ts`, `tests/helpers/cli.ts`; optionally refactor existing command/manager tests to use them where it removes duplication.
- Current responsibilities addressed: repeated temp manager setup and fixture creation in plan/task tests, visible in `.fallow/baselines/dupes.json` entries for `tests/cli/plans/commands/archive.test.ts:15-25|tests/cli/plans/commands/list.test.ts:14-24|tests/cli/plans/commands/view.test.ts:14-24|tests/plans/archive.test.ts:30-40` and task manager setup clones.
- Target pattern: shared fixture builders with contracts from Design.
- Coverage status: `add-characterization-tests` — add helper tests or use helper self-tests proving temp setup initializes managers, creates fixture task/plan records, captures CLI output, and restores mocks.
- TDD note: yes — Red-Green-Refactor on helper contracts.
- Acceptance criteria:
  1. `tests/helpers/plans.ts` provides plan fixture builders.
  2. `tests/helpers/tasks.ts` provides task manager initialization and task fixture builders.
  3. `tests/helpers/cli.ts` captures output and process exits without leaking mocks between tests.
  4. At least one existing plan command test and one existing task/manager test use the new helpers.
  5. `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck` are green.
- Dependencies: T0a.

### Wave 1 — CLI command actions (mostly parallel; depends on Wave 0)

#### W1-01 — `cli/tasks/commands/create.ts` action
- Suppression: `cli/tasks/commands/create.ts:37`, Commander `.action(async (title, options) => ...)`.
- Current responsibilities: validates priority and due date, builds `TaskCreateInput`, persists via `TaskManager.createTask`, and emits JSON/plain/human success or error output.
- Target pattern: command service/helpers:
  - `parseTaskCreateInput(title: string, options: TaskCreateCliOptions): CliParseResult<TaskCreateInput>`
  - `parseTaskDueDate(value: string | undefined): CliParseResult<Date | undefined>`
  - `renderTaskCreateSuccess(task: Task, mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:65` covers manager persistence, but no CLI action output/error coverage exists; add CLI tests for valid full create, invalid priority, invalid date in JSON and human modes, plain output prints ID, and manager error output.
- TDD note: yes for pure parse/render helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Action delegates parsing/rendering to named helpers above.
  3. Suppression at `cli/tasks/commands/create.ts:37` is removed.
  4. JSON/plain/human outputs match characterization tests before and after refactor.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-02 — `cli/tasks/commands/delete.ts` action
- Suppression: `cli/tasks/commands/delete.ts:33`, Commander `.action(async (taskId, options) => ...)`.
- Current responsibilities: loads task, handles not-found errors, prompts unless `--force`, handles cancellation output, deletes through `TaskManager.deleteTask`, and emits JSON/plain/human success or error output.
- Target pattern: command service/helpers:
  - `loadTaskForDeletion(manager: TaskManager, taskId: string): Promise<CliParseResult<Task>>`
  - `confirmTaskDeletion(task: Task, force?: boolean): Promise<boolean>`
  - `renderTaskDeleteResult(result: TaskDeleteResult, mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:302` covers manager deletion, but no CLI prompt/cancel/output tests exist; add force delete, not found JSON/human, cancellation JSON/plain/human, and manager error cases.
- TDD note: yes for render helper; no for readline prompt wrapper.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Action delegates lookup, confirmation, deletion result rendering, and error printing.
  3. Suppression at `cli/tasks/commands/delete.ts:33` is removed.
  4. Cancellation does not call `deleteTask` and preserves existing output.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-03 — `cli/tasks/commands/list.ts` action
- Suppression: `cli/tasks/commands/list.ts:54`, Commander `.action(async (options) => ...)`.
- Current responsibilities: normalizes status/priority filters, builds `TaskListFilter`, calls `TaskManager.listTasks`, and renders empty/table/plain/JSON outputs plus errors.
- Target pattern: command service/helpers:
  - `parseTaskListFilter(options: TaskListCliOptions): CliParseResult<TaskListFilter>`
  - `renderTaskList(tasks: readonly Task[], mode: CliOutputMode): unknown | string[]`
  - `renderTaskRow(task: Task): string`
- Coverage status: `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:332` covers manager filters, but no CLI normalization/output tests exist; add invalid status, invalid priority, ready filter maps to `hasNoDependencies`, empty human output, table columns, plain output, JSON output, and manager error.
- TDD note: yes for parse/render helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Shared CLI `renderTable` is used for human table output.
  3. Suppression at `cli/tasks/commands/list.ts:54` is removed.
  4. Filter semantics match current manager behavior.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-04 — `cli/tasks/commands/search.ts` action
- Suppression: `cli/tasks/commands/search.ts:116`, Commander `.action(async (query, options) => ...)`.
- Current responsibilities: normalizes status/priority/label filters, parses positive limit, calls `TaskManager.search`, scores/sorts by title/description/notes/plan relevance, applies limit, renders no-results/table/plain/JSON outputs, and handles errors.
- Target pattern: command service/helpers:
  - `parseTaskSearchOptions(options: TaskSearchCliOptions): CliParseResult<{ filter?: TaskListFilter; limit: number }>`
  - `scoreTaskForQuery(task: Task, query: string): number`
  - `rankTaskSearchResults(tasks: readonly Task[], query: string, limit: number): Task[]`
  - `renderTaskSearchResults(tasks: readonly Task[], query: string, mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:437` covers manager search but not CLI relevance sorting/limit/output validation; add title exact/starts-with ranking, invalid status/priority/limit, empty results human output, plain/table/JSON modes, and manager error.
- TDD note: yes for score/rank/render helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Relevance scoring behavior remains unchanged.
  3. Suppression at `cli/tasks/commands/search.ts:116` is removed.
  4. Search output modes preserve current strings and table columns.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-05 — `cli/tasks/commands/view.ts` `outputFormatted`
- Suppression: `cli/tasks/commands/view.ts:82`, private `outputFormatted(task: Task)`.
- Current responsibilities: renders header, metadata, description with AC marker stripping, implementation plan, acceptance criteria, and implementation notes in one function.
- Target pattern: per-section renderers:
  - `renderTaskHeader(task: Task): string[]`
  - `renderTaskMetadata(task: Task): string[]`
  - `renderTaskDescription(task: Task): string[]`
  - `renderTaskImplementationPlan(task: Task): string[]`
  - `renderTaskAcceptanceCriteria(task: Task): string[]`
  - `renderTaskImplementationNotes(task: Task): string[]`
  - `renderFormattedTask(task: Task): string[]`
- Coverage status: `add-characterization-tests` — no direct tests for task command view; add formatted output for all sections, omitted optional sections, AC marker stripping, due date formatting, JSON not-found, plain output escaping, and manager error.
- TDD note: yes for per-section renderers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. `outputFormatted` is replaced by `printLines(renderFormattedTask(task))` or equivalent.
  3. Suppression at `cli/tasks/commands/view.ts:82` is removed.
  4. Section order and indentation are preserved.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-06 — `cli/tasks/commands/edit.ts` action
- Suppression: `cli/tasks/commands/edit.ts:159`, Commander `.action(async (taskId, options) => ...)`.
- Current responsibilities: fetches existing task, validates status/priority/due date, processes escaped newlines, updates basic fields, plan/notes append/replace, labels, dependencies, acceptance criterion add/remove/check/uncheck with reindexing, no-change errors, persistence, and JSON/plain/human output.
- Target pattern: command service/helpers:
  - `buildTaskUpdate(existing: Task, options: TaskEditCliOptions): CliParseResult<{ updateInput: TaskUpdateInput; changes: FieldChange[] }>`
  - `applyTaskLabelEdits(existing: readonly string[], edits: LabelEditOptions): string[]`
  - `applyTaskDependencyEdits(existing: readonly string[], edits: DependencyEditOptions): string[]`
  - `applyAcceptanceCriterionEdits(existing: readonly AcceptanceCriterion[], edits: AcceptanceCriterionEditOptions): AcceptanceCriterion[]`
  - `renderTaskEditSuccess(task: Task, update: TaskUpdateInput, changes: readonly FieldChange[], mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:211` covers manager updates, but no CLI option-composition tests exist; add invalid status/priority/date, no changes, escaped newlines for description/plan/notes, append plan/notes with separators, add/remove labels case-insensitively, add/remove deps case-insensitively, AC remove reindex/add/check/uncheck, plain changed fields, JSON output, not found, and manager error.
- TDD note: yes for pure edit helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Action delegates update construction and rendering to named helpers.
  3. Suppression at `cli/tasks/commands/edit.ts:159` is removed.
  4. AC reindexing and append separator behavior are preserved.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-07 — `cli/plans/commands/edit.ts` action
- Suppression: `cli/plans/commands/edit.ts:25`, Commander `.action(async (slug, options) => ...)`.
- Current responsibilities: validates status, builds `PlanUpdateInput`, processes escaped newlines, rejects no-change invocations, persists via `PlanManager.updatePlan`, renders JSON/plain/human outputs, and handles errors.
- Target pattern: command service/helpers:
  - `buildPlanUpdate(options: PlanEditCliOptions): CliParseResult<{ updateInput: PlanUpdateInput; changedFields: string[] }>`
  - `renderPlanEditSuccess(plan: Plan, changedFields: readonly string[], mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/cli/plans/commands/edit.test.ts:9` tests `PlanManager.updatePlan` directly, not CLI validation/output; add invalid status, no changes, escaped body/spec newlines, JSON/plain/human success, and manager error/not found.
- TDD note: yes for parse/render helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Action delegates update construction and rendering.
  3. Suppression at `cli/plans/commands/edit.ts:25` is removed.
  4. Existing PlanManager tests remain unchanged or green after fixture cleanup.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-08 — `cli/plans/commands/list.ts` action
- Suppression: `cli/plans/commands/list.ts:15`, Commander `.action(async (options) => ...)`.
- Current responsibilities: validates optional status filter, lists plans, gets task-count summaries, renders empty/table/plain/JSON outputs, and handles errors.
- Target pattern: command service/helpers:
  - `parsePlanStatusFilter(status?: string): CliParseResult<PlanStatus | undefined>`
  - `loadPlanSummaries(planManager: PlanManager, taskManager: TaskManager, status?: PlanStatus): Promise<PlanSummary[]>`
  - `renderPlanSummaries(summaries: readonly PlanSummary[], mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/cli/plans/commands/list.test.ts:12` tests manager listing/summaries, not CLI output/error; add invalid status JSON/human, empty human output, JSON/plain/table outputs with task count, and manager error.
- TDD note: yes for parse/render helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Shared table rendering is used for human output.
  3. Suppression at `cli/plans/commands/list.ts:15` is removed.
  4. Task-count summary behavior is preserved.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-09 — `cli/plans/commands/delete.ts` action
- Suppression: `cli/plans/commands/delete.ts:28`, Commander `.action(async (slug, options) => ...)`.
- Current responsibilities: loads plan, handles not-found errors, prompts unless `--force`, handles cancellation output, deletes through `PlanManager.deletePlan`, and renders JSON/plain/human success or errors.
- Target pattern: command service/helpers:
  - `loadPlanForDeletion(manager: PlanManager, slug: string): Promise<CliParseResult<Plan>>`
  - `confirmPlanDeletion(plan: Plan, force?: boolean): Promise<boolean>`
  - `renderPlanDeleteResult(result: PlanDeleteResult, mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/cli/plans/commands/delete.test.ts:8` tests `PlanManager.deletePlan`, not CLI prompt/output; add force delete, cancellation JSON/plain/human, not found JSON/human, and manager error.
- TDD note: yes for render helper; no for readline prompt wrapper.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Action delegates lookup, confirmation, and rendering.
  3. Suppression at `cli/plans/commands/delete.ts:28` is removed.
  4. Cancellation preserves current no-delete behavior.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-10 — `cli/packages/subcommand.ts` `installAction`
- Suppression: `cli/packages/subcommand.ts:123`, `installAction(arg, options)`.
- Current responsibilities: resolves catalog/local/git source, determines package scope, calls `installPackage`, handles install errors, handles domain conflicts (`--yes`, prompt choices merge/replace/skip/cancel), rolls back skipped/cancelled installs, removes conflicting packages on replace, and renders install success.
- Target pattern: command service/helpers:
  - `resolveInstallRequest(arg: string, options: InstallCliOptions): InstallRequest`
  - `handleInstallConflicts(result: InstallPackageResult, request: InstallRequest, options: InstallCliOptions): Promise<"continue" | "stopped">`
  - `rollbackInstalledPackage(manifestName: string, scope: PackageScope, cwd: string): Promise<void>`
  - `renderInstallSuccess(result: InstallPackageResult, scope: PackageScope): string[]`
- Coverage status: `add-characterization-tests` — existing `tests/cli/packages/subcommand.test.ts:116` covers normal install, scope/link/branch/catalog, `--yes` merge, and install errors, but conflict prompt branches are weak; add skip, cancel, replace removing unique conflicting packages, prompt retry on invalid answer, and rollback failure handling if current behavior is to surface/propagate it.
- TDD note: yes for request/render helpers; no for interactive prompt loop.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Source resolution uses existing `resolveCatalogEntry`/`resolveCatalogSource` behavior preserved by tests.
  3. Suppression at `cli/packages/subcommand.ts:123` is removed.
  4. Conflict choices preserve current stdout/stderr/exitCode behavior.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

#### W1-11 — `cli/scaffold/commands/missions.ts` `scaffoldMissions`
- Suppression: `cli/scaffold/commands/missions.ts:19`, `scaffoldMissions(options, globalOptions)`.
- Current responsibilities: detects existing task config, respects `--force`, initializes `TaskManager`, scaffolds `.cosmonauts/config.json`, and renders already-initialized/initialized results in JSON/plain/human modes.
- Target pattern: command service/helpers:
  - `getMissionsScaffoldState(projectRoot: string, force?: boolean): Promise<"already_initialized" | "should_initialize">`
  - `initializeMissions(projectRoot: string, options: MissionsOptions): Promise<MissionsScaffoldResult>`
  - `renderMissionsScaffoldResult(result: MissionsScaffoldResult, mode: CliOutputMode): unknown | string[]`
- Coverage status: `add-characterization-tests` — existing `tests/cli/scaffold/subcommand.test.ts:4` covers program registration only; add already initialized JSON/plain/human, `--force` reinitialize, successful initialized JSON/plain/human, project config created/existing output, and TaskManager/scaffold errors.
- TDD note: yes for render helper; no for filesystem flow.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. Suppression at `cli/scaffold/commands/missions.ts:19` is removed.
  3. Existing `scaffold missions` and `task init` shared use remains intact.
  4. Output strings for created directories/config are preserved.
  5. Full verification gate is green.
- Dependencies: T0a, T0b.

### Wave 2 — CLI/session infrastructure (may run parallel with Waves 1, 3, 4 except same-file serial pair)

#### W2-01 — `cli/main.ts` `parseCliArgs`
- Suppression: `cli/main.ts:104`, `parseCliArgs(argv)`.
- Current responsibilities: detects `init`, extracts Pi passthrough flags and warnings via `parsePiFlags`, configures Commander options, parses prompt positionals, normalizes thinking/plugin/profile/options, and returns `CliOptions`.
- Target pattern: phase split:
  - `detectInitSubcommand(argv: readonly string[]): { isInit: boolean; effectiveArgv: string[] }`
  - `buildCliParser(): Command`
  - `parseThinkingOption(value: unknown): ThinkingLevel | undefined`
  - `normalizeCliOptions(program: Command, isInit: boolean, piResult: PiFlagParseResult): CliOptions`
- Coverage status: `add-characterization-tests` — existing `tests/cli/main.test.ts:15` covers many parse cases, but add plugin-dir repeatability, `--profile`, Pi warning forwarding, and `--thinking` true/value normalization around the new phases before refactor.
- TDD note: yes for pure phase helpers.
- Acceptance criteria:
  1. Added characterization tests are green before refactor.
  2. `parseCliArgs` delegates to the named phase helpers.
  3. Suppression at `cli/main.ts:104` is removed.
  4. All existing parse tests remain green.
  5. Full verification gate is green.
- Dependencies: none.

#### W2-02 — `cli/main.ts` `run`
- Suppression: `cli/main.ts:262`, private `run(options)`.
- Current responsibilities: discovers framework/bundled/domain runtime, handles no-domain first-run guard, routes list-domains/list-workflows/list-agents/dump-prompt/init/workflow/print/interactive modes, sets profiling output for chains, creates sessions, and maps failures to exit codes.
- Target pattern: per-handler dispatch:
  - `selectRunMode(options: CliOptions, hasNonSharedDomain: boolean): CliRunMode`
  - `handleListDomains(runtime: CosmonautsRuntime): Promise<void>`
  - `handleListWorkflows(cwd: string, domainWorkflows: readonly WorkflowDefinition[]): Promise<void>`
  - `handleListAgents(runtime: CosmonautsRuntime, options: CliOptions): Promise<void>`
  - `handleDumpPrompt(runtime: CosmonautsRuntime, options: CliOptions): Promise<void>`
  - `handleInitMode(runtime: CosmonautsRuntime, options: CliOptions, cwd: string): Promise<void>`
  - `handleWorkflowMode(runtime: CosmonautsRuntime, options: CliOptions, cwd: string): Promise<void>`
  - `handlePrintMode(...)` and `handleInteractiveMode(...)`
- Coverage status: `add-characterization-tests` — no direct tests cover private dispatch; add tests through exported pure helpers where possible and CLI entry behavior where feasible: no-domain guard, list modes bypass guard, dump-prompt file/stdout, workflow failure sets exitCode, print requires prompt, and interactive registry setup. Planner-proposed assumption: workers may first extract/export `selectRunMode` under test, then keep behavior locked while splitting handler bodies.
- TDD note: no for IO-heavy mode handlers; yes for `selectRunMode`.
- Acceptance criteria:
  1. Dispatch characterization tests are added before body split and are green.
  2. `run` becomes a short orchestration wrapper delegating to mode handlers.
  3. Suppression at `cli/main.ts:262` is removed.
  4. `parseCliArgs` refactor from W2-01 is already landed to avoid conflicts.
  5. Full verification gate is green.
- Dependencies: W2-01.

#### W2-03 — `cli/session.ts` `resolveSessionManager`
- Suppression: `cli/session.ts:246`, private `resolveSessionManager(opts)`.
- Current responsibilities: validates Pi session flag conflicts; applies Pi priority cascade `noSession → fork → session → resume → continue → default`; resolves path/partial IDs; prompts for cross-project fork; lists local/global sessions for resume; returns in-memory or persistent fallback.
- Target pattern: strategy helpers:
  - `resolveNoSessionStrategy(): SessionManager | undefined`
  - `resolveForkStrategy(piFlags, cwd, sessionDir): Promise<SessionManager | undefined>`
  - `resolveSessionStrategy(piFlags, cwd, sessionDir): Promise<SessionManager | undefined>`
  - `resolveResumeStrategy(piFlags, cwd, sessionDir): Promise<SessionManager | undefined>`
  - `resolveContinueOrDefaultStrategy(piFlags, persistent, cwd, sessionDir): SessionManager`
- Coverage status: `existing-coverage-sufficient` — `tests/cli/session.test.ts:207` covers `--continue`, `--no-session`, `--session` path/partial/cross-project decline, `--fork` path/unknown/conflicts, `--resume` no sessions/cancel, and default persistence through `createSession`.
- TDD note: no; behavior is already covered through public `createSession`.
- Acceptance criteria:
  1. Existing session flag tests are green before refactor.
  2. Strategy helpers implement the existing priority order without changing `createSession` API.
  3. Suppression at `cli/session.ts:246` is removed.
  4. Cross-project fork and resume cancel still throw `GracefulExitError`.
  5. Full verification gate is green.
- Dependencies: none.

#### W2-04 — `cli/pi-flags.ts` `parsePiFlags`
- Suppression: `cli/pi-flags.ts:146`, `parsePiFlags(argv)`.
- Current responsibilities: extracts enabled Pi flags, leaves unknown flags in remaining args, warns and drops disabled flags plus their values, accumulates string-array flags, tolerates optional list-models logic even though disabled, and post-processes comma-separated models/tools if enabled later.
- Target pattern: phase split:
  - `buildDisabledCliLookup(): Map<string, FlagKey>`
  - `consumeEnabledFlag(argv: readonly string[], index: number, flags: Record<string, unknown>): number`
  - `consumeDisabledFlag(argv: readonly string[], index: number, warnings: string[]): number`
  - `postProcessPiFlags(flags: Record<string, unknown>): PiFlags`
- Coverage status: `add-characterization-tests` — enabled session flags are indirectly covered by `tests/cli/main.test.ts:205`, but add direct tests for disabled flags warning/value skipping (`--provider`, `--tools`, `--extension`), unknown flags remaining, repeated `--theme`, `--no-themes`, missing value behavior, and non-flag positional preservation.
- TDD note: yes for parser phase helpers.
- Acceptance criteria:
  1. Characterization tests are green before refactor.
  2. `parsePiFlags` delegates to phase helpers.
  3. Suppression at `cli/pi-flags.ts:146` is removed.
  4. Existing `parseCliArgs` Pi passthrough tests remain green.
  5. Full verification gate is green.
- Dependencies: none.

#### W2-05 — `cli/chain-event-logger.ts` `formatChainEvent`
- Suppression: `cli/chain-event-logger.ts:27`, `formatChainEvent(event)`.
- Current responsibilities: formats every `ChainEvent` variant for stderr logging, including chain/stage lifecycle, stats, iterations, spawn lifecycle, forwarded agent turn/tool events, errors, parallel groups, and spawn completions.
- Target pattern: per-event formatter table:
  - `type ChainEventFormatter<K extends ChainEvent["type"]> = (event: Extract<ChainEvent, { type: K }>) => string`
  - `const CHAIN_EVENT_FORMATTERS: { [K in ChainEvent["type"]]: ChainEventFormatter<K> }`
  - `formatChainEvent(event)` dispatches through the table.
- Coverage status: `add-characterization-tests` — existing `tests/cli/chain-event-logger.test.ts:27` covers most event variants but misses `stage_stats`, `agent_turn`, both `agent_tool_use` branches, and `spawn_completion`; add those cases before refactor.
- TDD note: yes for per-event formatters.
- Acceptance criteria:
  1. Missing event characterization tests are green before refactor.
  2. Formatter table covers every `ChainEvent["type"]` with TypeScript exhaustiveness.
  3. Suppression at `cli/chain-event-logger.ts:27` is removed.
  4. `createChainEventLogger` continues writing one formatted line to stderr.
  5. Full verification gate is green.
- Dependencies: none.

### Wave 3 — Orchestration/runtime internals (may run parallel with Waves 1, 2, 4 except chain-runner serial pair)

#### W3-01 — `lib/orchestration/chain-runner.ts` `runChain`
- Suppression: `lib/orchestration/chain-runner.ts:319`, `runChain(config)`.
- Current responsibilities: initializes chain caps/timers/spawner/stats, emits chain lifecycle events, iterates sequential and parallel steps, computes remaining loop constraints, aggregates stage results/stats/errors, stops on abort/timeout/failure, disposes spawner, builds `ChainResult`, and emits `chain_end`.
- Target pattern: phase split:
  - `createChainExecutionState(config: ChainConfig): ChainExecutionState`
  - `shouldStopBeforeStep(state, config): boolean`
  - `runChainStep(step, stepIndex, config, spawner, state): Promise<ChainStepOutcome>`
  - `recordChainStepOutcome(state, outcome): void`
  - `finalizeChainResult(state, config, chainStart): ChainResult`
- Coverage status: `existing-coverage-sufficient` — `tests/orchestration/chain-runner.test.ts:1036` covers sequential success, user prompt injection, failure stop, unknown role, chain events, abort, disposal, iteration budget, timeout, qualified chains, stats, and parallel groups.
- TDD note: yes for pure stop/finalize helpers; no for full async runner.
- Acceptance criteria:
  1. Existing chain runner tests are green before refactor.
  2. `runChain` delegates to phase helpers and remains the public API.
  3. Suppression at `lib/orchestration/chain-runner.ts:319` is removed.
  4. Spawner disposal remains in a `finally` path.
  5. Full verification gate is green.
- Dependencies: none.

#### W3-02 — `lib/orchestration/chain-runner.ts` `runStage`
- Suppression: `lib/orchestration/chain-runner.ts:508`, `runStage(stage, config, spawner, constraints)`.
- Current responsibilities: validates stage role, resolves model/thinking/prompt/planSlug, runs one-shot stages with event forwarding, runs loop stages with pre-checks/default completion, enforces iteration/deadline/abort caps, aggregates stats, emits errors, and maps exceptions to `StageResult`.
- Target pattern: phase split:
  - `prepareStageExecution(stage, config): StageExecutionContext | StageResult`
  - `createStageSpawnConfig(context, onEvent): SpawnConfig`
  - `runOneShotStage(context): Promise<StageResult>`
  - `runLoopStage(context, constraints): Promise<StageResult>`
  - `evaluateLoopState(stage, config): Promise<LoopState>`
  - `buildLoopExitResult(context, loopState): StageResult`
- Coverage status: `existing-coverage-sufficient` — `tests/orchestration/chain-runner.test.ts:170` covers one-shot success/failure/prompts/compaction/registry; `tests/orchestration/chain-runner.test.ts:393` covers loop completion/budget/abort/failure/default completion; `tests/orchestration/chain-runner.test.ts:763` covers event forwarding.
- TDD note: yes for pure helper contracts; no for full async runner.
- Acceptance criteria:
  1. Existing `runStage` tests are green before refactor.
  2. `runStage` delegates one-shot and loop paths to named helpers.
  3. Suppression at `lib/orchestration/chain-runner.ts:508` is removed.
  4. W3-01 has already landed to avoid same-file conflicts.
  5. Full verification gate is green.
- Dependencies: W3-01.

#### W3-03 — `lib/orchestration/agent-spawner.ts` `spawn`
- Suppression: `lib/orchestration/agent-spawner.ts:95`, `createPiSpawner(...).spawn(config)`.
- Current responsibilities: abort precheck, resolves agent definition, creates session, tracker, plan context, event subscription, prompts session, delivers child completions, captures stats, cleans trackers/context/subscription/session, writes transcript/manifest lineage for plan-linked sessions, swallows lineage errors, and returns success/failure.
- Target pattern: phase split:
  - `prepareSpawnSession(registry, config, domainsDir, resolver): Promise<PreparedSpawnSession>`
  - `runSpawnSession(prepared, config, spawnTimeoutMs): Promise<SpawnExecutionResult>`
  - `cleanupSpawnSession(prepared, config): FinalMessages`
  - `persistPlanLinkedSpawn(prepared, execution, finalMessages, config): Promise<void>`
  - `toSpawnFailure(err: unknown): SpawnResult`
- Coverage status: `existing-coverage-sufficient` — `tests/orchestration/agent-spawner.spawn.test.ts:120` covers success/failure/stats/event subscription/cleanup; `tests/orchestration/agent-spawner.completion-loop.test.ts:118` covers child completion loop/timeout/tracker cleanup; `tests/orchestration/agent-spawner.lineage.test.ts:112` covers plan-linked transcript/manifest success/failure and lineage error swallowing.
- TDD note: no for lifecycle orchestration; yes only for pure mapper helpers if exported for tests.
- Acceptance criteria:
  1. Existing spawner tests are green before refactor.
  2. `spawn` delegates lifecycle, completion loop, cleanup, and lineage persistence phases.
  3. Suppression at `lib/orchestration/agent-spawner.ts:95` is removed.
  4. Cleanup still runs after prompt/subscription failures.
  5. Full verification gate is green.
- Dependencies: none.

#### W3-04 — `domains/shared/extensions/orchestration/spawn-tool.ts` child promise handler
- Suppression: `domains/shared/extensions/orchestration/spawn-tool.ts:352`, `.then(async ({ session, sessionFilePath }) => ...)`.
- Current responsibilities: registers child depth/tracker/plan context, publishes activity events from child session, prompts child, drains nested completions, extracts assistant summary, completes/fails parent tracker, sends self-delivered completion when needed, captures stats, cleanup subscriptions/trackers/context/session, writes transcript/manifest lineage, and handles session creation failure.
- Target pattern: phase split:
  - `runDetachedChildSession(params: DetachedChildSessionParams): Promise<void>`
  - `subscribeChildActivity(session, spawnId, params): () => void`
  - `executeChildPromptLoop(session, childTracker, prompt): Promise<ChildPromptResult>`
  - `settleSpawnTracker(tracker, spawnId, result, pi): void`
  - `persistChildLineage(params, result, finalMessages): Promise<void>`
- Coverage status: `add-characterization-tests` — existing `tests/extensions/orchestration.test.ts:332` covers accepted spawn, authorization, nested completions, and completion message; `tests/extensions/orchestration-lineage.test.ts:214` covers lineage; add focused tests that child session activity publishes `tool_start`, `tool_end`, `turn_start`, `turn_end`, and `compaction`, and that cleanup runs when child prompt throws after subscribing.
- TDD note: no for detached lifecycle; yes for pure activity mapping helper.
- Acceptance criteria:
  1. Added activity/cleanup characterization tests are green before refactor.
  2. Promise handler delegates to named lifecycle helpers.
  3. Suppression at `domains/shared/extensions/orchestration/spawn-tool.ts:352` is removed.
  4. Self-delivery and external delivery modes remain unchanged.
  5. Full verification gate is green.
- Dependencies: none.

#### W3-05 — `lib/orchestration/chain-profiler.ts` `buildSummary`
- Suppression: `lib/orchestration/chain-profiler.ts:337`, `buildSummary(entries, spans, pendingTools)`.
- Current responsibilities: builds chain overview, stage breakdown, parallel group breakdown and overlap ratio, slowest tools top 20, per-agent tool breakdown, and orphaned/incomplete tool calls in one report.
- Target pattern: per-section renderers:
  - `renderChainOverview(entries: readonly ProfileTraceEntry[]): string[]`
  - `renderStageBreakdown(entries: readonly ProfileTraceEntry[]): string[]`
  - `renderParallelBreakdown(entries: readonly ProfileTraceEntry[]): string[]`
  - `renderSlowestTools(spans: readonly ToolSpan[]): string[]`
  - `renderPerAgentToolBreakdown(spans: readonly ToolSpan[]): string[]`
  - `renderPendingTools(pendingTools: ReadonlyMap<string, PendingTool>): string[]`
- Coverage status: `add-characterization-tests` — existing `tests/orchestration/chain-profiler.test.ts:622` covers required sections, total duration, incomplete chain, top 20 tools, orphaned tools, per-agent breakdown; `tests/orchestration/chain-profiler.test.ts:405` covers parallel breakdown/scopes. Add pre-refactor tests for stage breakdown rows with expected columns/values for typical multi-stage entries, the `(no stages recorded)` placeholder when no stage entries exist, slowest-tool `[error]` tags for errored tool spans, empty slowest-tool and empty per-agent placeholder rendering, and pending-tool lines including all expected fields.
- TDD note: yes for per-section renderers.
- Acceptance criteria:
  1. Added profiler summary edge-case tests are green before refactor.
  2. `buildSummary` composes section renderers without changing output text.
  3. Suppression at `lib/orchestration/chain-profiler.ts:337` is removed.
  4. Parallel overlap ratio behavior is preserved.
  5. Full verification gate is green.
- Dependencies: none.

#### W3-06 — `domains/shared/extensions/orchestration/rendering.ts` `summarizeToolCall`
- Suppression: `domains/shared/extensions/orchestration/rendering.ts:43`, `summarizeToolCall(toolName, args)`.
- Current responsibilities: summarizes read/write/edit by basename, bash command with truncation, grep pattern with truncation, spawn_agent role, and unknown tools.
- Target pattern: per-tool renderer table:
  - `type ToolCallSummaryFormatter = (args?: unknown) => string`
  - `const TOOL_SUMMARY_FORMATTERS: Record<string, ToolCallSummaryFormatter>`
  - `summarizePathToolCall(toolName, args)`, `summarizeBashToolCall(args)`, `summarizeGrepToolCall(args)`, `summarizeSpawnAgentToolCall(args)`
- Coverage status: `existing-coverage-sufficient` — `tests/extensions/orchestration-rendering.test.ts:6` covers path tools, missing args, bash/grep truncation, spawn_agent role/fallback, unknown tools, and chain progress integration.
- TDD note: yes for per-tool formatters.
- Acceptance criteria:
  1. Existing rendering tests are green before refactor.
  2. Formatter table preserves all current summary strings.
  3. Suppression at `domains/shared/extensions/orchestration/rendering.ts:43` is removed.
  4. `chainEventToProgressLine` behavior remains unchanged.
  5. Full verification gate is green.
- Dependencies: none.

### Wave 4 — Validation, stores, and serialization (all parallel)

#### W4-01 — `lib/domains/validator.ts` `validateDomains`
- Suppression: `lib/domains/validator.ts:48`, `validateDomains(domains)`.
- Current responsibilities: locates shared/portable domains, warns on duplicate portable capabilities, collects bare and qualified agent IDs, validates domain lead, workflow stages, persona prompts, capabilities, extensions, and subagent allowlists.
- Target pattern: per-rule helpers:
  - `findSharedDomain(domains)` and `findPortableDomains(domains)`
  - `validatePortableCapabilityOverlap(portableDomains): DomainValidationDiagnostic[]`
  - `collectKnownAgentIds(domains): Set<string>`
  - `validateDomainLead(domain): DomainValidationDiagnostic[]`
  - `validateWorkflowAgents(domain, allAgentIds): DomainValidationDiagnostic[]`
  - `validateAgentPrompts(domain): DomainValidationDiagnostic[]`
  - `validateAgentCapabilities(agent, domain, shared, portableDomains): DomainValidationDiagnostic[]`
  - `validateAgentExtensions(...)` and `validateAgentSubagents(...)`
- Coverage status: `existing-coverage-sufficient` — `tests/domains/validator.test.ts:50` covers valid domains, missing personas, capability/extension resolution across domain/shared/portable, subagents, portable overlap, lead, workflow stages, and `DomainValidationError` formatting.
- TDD note: yes for per-rule validators.
- Acceptance criteria:
  1. Existing validator tests are green before refactor.
  2. `validateDomains` composes per-rule helpers and preserves diagnostic shape/order where tests assert it.
  3. Suppression at `lib/domains/validator.ts:48` is removed.
  4. Domain module still imports only domain types, not runtime/CLI infrastructure.
  5. Full verification gate is green.
- Dependencies: none.

#### W4-02 — `lib/packages/manifest.ts` `validateManifest`
- Suppression: `lib/packages/manifest.ts:60`, `validateManifest(raw)`.
- Current responsibilities: rejects non-object/array/null inputs with required missing fields, validates package name format, version/description strings, domains presence/non-empty/entry shape, accumulates field errors, and returns typed `PackageManifest` on success.
- Target pattern: per-rule helpers:
  - `validateManifestObject(raw): { ok: true; value: Record<string, unknown> } | { ok: false; errors: ManifestValidationError[] }`
  - `validatePackageName(value: unknown): ManifestValidationError | undefined`
  - `validateRequiredString(field, value): ManifestValidationError | undefined`
  - `validateDomainsField(value: unknown): ManifestValidationError | undefined`
  - `toPackageManifest(obj: Record<string, unknown>): PackageManifest`
- Coverage status: `add-characterization-tests` — existing `tests/packages/manifest.test.ts:88` covers valid manifests; `tests/packages/manifest.test.ts:145` covers missing fields/non-object broadly; `tests/packages/manifest.test.ts:241` covers invalid names; `tests/packages/manifest.test.ts:310` covers domain array/entry errors. Add pre-refactor tests asserting `null`, array input, and non-object scalar inputs such as string and number each return exactly the four required-missing-field errors. Assert the exact missing-field set and preserve order if the current implementation guarantees order.
- TDD note: yes for per-field validators.
- Acceptance criteria:
  1. Added non-object/null/array missing-field characterization tests are green before refactor.
  2. No CLI shared types are imported into `lib/packages/manifest.ts`.
  3. Suppression at `lib/packages/manifest.ts:60` is removed.
  4. Error accumulation behavior, including required missing-field set/order covered by tests, is preserved.
  5. Full verification gate is green.
- Dependencies: none.

#### W4-03 — `lib/packages/store.ts` `listInstalledPackages`
- Suppression: `lib/packages/store.ts:64`, `listInstalledPackages(scope, projectRoot)`.
- Current responsibilities: resolves store root, returns empty for missing store, reads store entries, skips stat/read failures and non-directories, descends scoped `@scope/name` directories, reads/validates manifests, skips invalid manifests, and returns `InstalledPackage` records with install path/scope/birthtime.
- Target pattern: store helpers:
  - `readStoreEntries(storeRoot: string): Promise<string[]>`
  - `collectCandidatePackageDirs(storeRoot: string, entries: readonly string[]): Promise<Array<{ path: string; birthtime: Date }>>`
  - `collectScopedPackageDirs(scopeDir: string): Promise<Array<{ path: string; birthtime: Date }>>`
  - `readInstalledPackage(installPath: string, birthtime: Date, scope: PackageScope): Promise<InstalledPackage | undefined>`
- Coverage status: `add-characterization-tests` — existing `tests/packages/store.test.ts:94` covers missing/empty store, valid packages, installPath/scope/installedAt, skipped invalid entries, and non-directory entries; add scoped package discovery for `@org/pkg`, unreadable scoped directory/stat failure tolerance if feasible, and invalid scoped child manifest skip.
- TDD note: yes for candidate collection/read helpers.
- Acceptance criteria:
  1. Added scoped package characterization tests are green before refactor.
  2. `listInstalledPackages` delegates candidate collection and manifest reading.
  3. Suppression at `lib/packages/store.ts:64` is removed.
  4. Missing/corrupt manifests continue to be skipped without throwing.
  5. Full verification gate is green.
- Dependencies: none.

#### W4-04 — `lib/sessions/session-store.ts` `generateTranscript`
- Suppression: `lib/sessions/session-store.ts:111`, `generateTranscript(messages, role)`.
- Current responsibilities: renders transcript heading, user messages from string/text blocks, assistant text/thinking/tool-call names, skips toolResult messages, ignores malformed/unknown shapes, and returns markdown without tool arguments.
- Target pattern: per-shape renderers:
  - `renderTranscriptMessage(message: unknown): string[]`
  - `renderUserMessage(content: unknown): string[]`
  - `renderAssistantMessage(content: unknown): string[]`
  - `renderThinkingBlocks(thinkings: readonly string[]): string[]`
  - `renderToolCallSummary(toolNames: readonly string[]): string[]`
- Coverage status: `existing-coverage-sufficient` — `tests/sessions/session-store.test.ts:138` covers heading; `tests/sessions/session-store.test.ts:154` user strings/blocks/skips; `tests/sessions/session-store.test.ts:186` assistant text/thinking/tools; `tests/sessions/session-store.test.ts:237` tool result exclusion; `tests/sessions/session-store.test.ts:295` malformed defensive handling.
- TDD note: yes for per-shape renderers.
- Acceptance criteria:
  1. Existing transcript tests are green before refactor.
  2. `generateTranscript` composes per-shape renderers and remains pure.
  3. Suppression at `lib/sessions/session-store.ts:111` is removed.
  4. Tool arguments/results remain excluded.
  5. Full verification gate is green.
- Dependencies: none.

#### W4-05 — `lib/tasks/task-manager.ts` `matchesFilter`
- Suppression: `lib/tasks/task-manager.ts:351`, private `matchesFilter(task, filter)`.
- Current responsibilities: applies status (single/multiple), priority (single/multiple, missing priority fails), assignee case-insensitive exact match, label case-insensitive match, and has-no-dependencies predicate; all predicates are AND-composed.
- Target pattern: predicate composition:
  - `type TaskFilterPredicate = (task: Task, filter: TaskListFilter) => boolean`
  - `matchesStatusFilter(task, filter): boolean`
  - `matchesPriorityFilter(task, filter): boolean`
  - `matchesAssigneeFilter(task, filter): boolean`
  - `matchesLabelFilter(task, filter): boolean`
  - `matchesDependencyFilter(task, filter): boolean`
  - `const TASK_FILTER_PREDICATES: readonly TaskFilterPredicate[]`
- Coverage status: `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:332` covers listing; `tests/tasks/task-manager.test.ts:344` status; `tests/tasks/task-manager.test.ts:358` multiple statuses; `tests/tasks/task-manager.test.ts:373` priority; `tests/tasks/task-manager.test.ts:384` assignee case-insensitive; `tests/tasks/task-manager.test.ts:395` label case-insensitive; `tests/tasks/task-manager.test.ts:406` hasNoDependencies; `tests/tasks/task-manager.test.ts:419` combined filters. Add pre-refactor tests that `priority: ["high", "low"]` returns tasks matching either priority and that a task with no priority is excluded whenever any priority filter is applied.
- TDD note: yes for predicate helpers.
- Acceptance criteria:
  1. Added multiple-priority and missing-priority characterization tests are green before refactor.
  2. `matchesFilter` delegates to predicate array and preserves AND semantics.
  3. Suppression at `lib/tasks/task-manager.ts:351` is removed.
  4. `TaskManager` public API remains unchanged.
  5. Full verification gate is green.
- Dependencies: none.

### Wave 5 — Two-phase duplication baseline removal

#### W5-01a — De-baseline residual duplicate clone families
- Files: keep `fallow.toml` and `.fallow/baselines/dupes.json` in place during this task; modify only the source/test files needed to eliminate residual clone groups reported by `fallow dupes` against the post-Wave-4 tree.
- Current state: `.fallow/baselines/dupes.json` baselines far more than CLI command clones, including runtime, orchestration, extensions, package scanner/installer/eject/store, domain validation/assembly tests, session tests, workflow/config tests, and task/package manager clones.
- Target pattern: remove structural duplicates family-by-family with the smallest local helper, parameterized test table, or inline collapse that improves readability; do not create broad shared utilities with only one effective call site.
- Expected residual clone families and required treatment:
  1. CLI command output/prompt/error clones (`cli/plans/commands/*`, `cli/tasks/commands/*`, command tests): consume Wave 0 CLI output/error/test helpers; extract only command-local render/prompt helpers when still duplicated after Wave 1.
  2. CLI package/update/eject install-source and fixture clones (`cli/update/subcommand.ts`, `cli/packages/subcommand.ts`, `lib/packages/installer.ts`, package/update/eject tests): consolidate source-request/fixture setup where already shared by 3+ call sites; otherwise collapse repeated test cases with tables.
  3. Orchestration extension/spawner lineage/activity clones (`domains/shared/extensions/orchestration/*`, `lib/orchestration/agent-spawner.ts`, orchestration extension/lineage tests): reuse existing transcript/manifest persistence helpers and extract shared test session/tracker fixtures under `tests/helpers/` only when the duplicate setup spans multiple test files.
  4. Chain runner/parser/profiler test clones (`tests/orchestration/chain-*.test.ts`): replace repeated agent/registry/stage setup with local test builders or table-driven assertions while preserving one-concept-per-test naming.
  5. Domain/runtime/workflow/config test setup clones (`tests/domains/*`, `tests/runtime.test.ts`, `tests/workflows/*`, `tests/config/*`, `tests/agents/*`): introduce domain/runtime fixture builders only for repeated manifest/domain definitions; do not hide assertion-specific data.
  6. Package scanner/installer/eject/store/manifest test clones (`tests/packages/*`): consolidate repeated manifest/package directory builders and convert symmetric cases to parameterized tests.
  7. Task/session/todo test clones (`tests/tasks/*`, `tests/sessions/*`, `tests/cli/session.test.ts`, `tests/todo/*`): reuse task/session fixture helpers from Wave 0b or add narrow local builders for repeated session/task record shapes.
  8. Production extension/tool handler clones outside inline suppressions (`domains/shared/extensions/plans/index.ts`, `domains/shared/extensions/tasks/index.ts`, `lib/tasks/task-manager.ts` update branches): extract local helper functions only where the same validation/response pattern repeats in the same module.
- Coverage status: `existing-coverage-sufficient` for behavior after Waves 0-4, with targeted characterization only if a residual clone family involves production behavior not already covered.
- TDD note: no for mechanical duplicate collapse; yes if W5-01a introduces a new shared test/source helper contract.
- Acceptance criteria:
  1. Before changes, run `fallow dupes` and save/list the remaining clone groups from `.fallow/baselines/dupes.json` that still apply after Waves 0-4.
  2. Every remaining clone group is assigned to one of the expected residual clone families above and addressed by extraction, local builder/table conversion, or inline collapse.
  3. No new production dependency points from library/domain modules into CLI modules or test helpers.
  4. `fallow dupes` reports no residual clone groups that would be unbaselined by W5-01b.
  5. `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck` are green with the baseline still configured.
- Dependencies: T0a, T0b, W1-01, W1-02, W1-03, W1-04, W1-05, W1-06, W1-07, W1-08, W1-09, W1-10, W1-11, W2-01, W2-02, W2-03, W2-04, W2-05, W3-01, W3-02, W3-03, W3-04, W3-05, W3-06, W4-01, W4-02, W4-03, W4-04, W4-05.

#### W5-01b — Remove dupes baseline and verify clean Fallow audit
- Files: modify `fallow.toml`; delete `.fallow/baselines/dupes.json`.
- Current state: `fallow.toml:36` configures `audit.dupesBaseline = ".fallow/baselines/dupes.json"`; W5-01a has already cleaned residual duplicate clone groups.
- Target pattern: no duplication baseline; keep permanent `entry` and `dynamicallyLoaded` arrays untouched.
- Coverage status: `existing-coverage-sufficient` after W5-01a; this task is configuration removal plus verification.
- TDD note: no.
- Acceptance criteria:
  1. `.fallow/baselines/dupes.json` is deleted.
  2. `audit.dupesBaseline` is removed from `fallow.toml`, while `entry` and `dynamicallyLoaded` remain unchanged.
  3. `fallow audit` passes without the duplication baseline file or config.
  4. No `// fallow-ignore-next-line complexity` comments remain in `cli`, `lib`, or `domains/shared/extensions/orchestration`.
  5. `bun run test`, `bun run lint`, and `bun run typecheck` are green.
- Dependencies: W5-01a.

## Files to Change

New files:
- `cli/shared/output.ts` — shared CLI output mode, line printing, JSON printing, and table rendering helpers.
- `cli/shared/errors.ts` — shared CLI error printer.
- `tests/cli/shared/output.test.ts` — tests for shared output helpers.
- `tests/cli/shared/errors.test.ts` — tests for shared error helpers.
- `tests/helpers/plans.ts` — shared plan fixtures/builders.
- `tests/helpers/tasks.ts` — shared task fixtures/builders.
- `tests/helpers/cli.ts` — shared CLI output/exit capture helpers.
- Optional W5-01a helper files under `tests/helpers/*` — only if a residual clone family spans 3+ test files and a shared helper reduces total complexity.

Modified source files:
- `cli/tasks/commands/create.ts` — split create action parsing/rendering and remove suppression.
- `cli/tasks/commands/delete.ts` — split delete action lookup/confirmation/rendering and remove suppression.
- `cli/tasks/commands/list.ts` — split filter parsing/rendering and remove suppression.
- `cli/tasks/commands/search.ts` — split search parsing/ranking/rendering and remove suppression.
- `cli/tasks/commands/view.ts` — split formatted task view into section renderers and remove suppression.
- `cli/tasks/commands/edit.ts` — split update construction/edit helpers/rendering and remove suppression.
- `cli/plans/commands/edit.ts` — split plan update parsing/rendering and remove suppression.
- `cli/plans/commands/list.ts` — split status parsing/summary rendering and remove suppression.
- `cli/plans/commands/delete.ts` — split delete lookup/confirmation/rendering and remove suppression.
- `cli/packages/subcommand.ts` — split install request/conflict/render helpers and remove suppression.
- `cli/scaffold/commands/missions.ts` — split scaffold state/init/render helpers and remove suppression.
- `cli/main.ts` — split argument parsing phases and mode dispatch handlers; remove two suppressions serially.
- `cli/session.ts` — split session manager priority cascade into strategy helpers and remove suppression.
- `cli/pi-flags.ts` — split Pi flag parser phases and remove suppression.
- `cli/chain-event-logger.ts` — replace switch with per-event formatter table and remove suppression.
- `lib/orchestration/chain-runner.ts` — split `runChain` then `runStage`; remove both suppressions serially.
- `lib/orchestration/agent-spawner.ts` — split spawn lifecycle phases and remove suppression.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — split detached child lifecycle handler and remove suppression.
- `lib/orchestration/chain-profiler.ts` — split summary report sections and remove suppression.
- `domains/shared/extensions/orchestration/rendering.ts` — replace tool summary switch with formatter table and remove suppression.
- `lib/domains/validator.ts` — split domain validation rules and remove suppression.
- `lib/packages/manifest.ts` — split manifest validation field/rule helpers and remove suppression.
- `lib/packages/store.ts` — split package store listing helpers and remove suppression.
- `lib/sessions/session-store.ts` — split transcript per-shape renderers and remove suppression.
- `lib/tasks/task-manager.ts` — split filter predicates and remove suppression.
- Residual clone cleanup candidates for W5-01a include files named in `.fallow/baselines/dupes.json`, especially `cli/update/subcommand.ts`, `domains/shared/extensions/{plans,tasks}/index.ts`, package modules, runtime/domain/workflow/config/session/orchestration tests, and package/task/session test files.
- `fallow.toml` — W5-01b removes only `audit.dupesBaseline`, leaving `entry` and `dynamicallyLoaded` unchanged.
- `.fallow/baselines/dupes.json` — W5-01b deletes this file.

Modified/added test files:
- `tests/cli/tasks/subcommand.test.ts` or new task command tests under `tests/cli/tasks/commands/*.test.ts` — add command characterization for task create/delete/list/search/view/edit.
- `tests/cli/plans/commands/edit.test.ts` — add CLI action validation/output characterization.
- `tests/cli/plans/commands/list.test.ts` — add CLI action validation/output characterization.
- `tests/cli/plans/commands/delete.test.ts` — add CLI action prompt/output characterization.
- `tests/cli/packages/subcommand.test.ts` — add install conflict branch characterization.
- `tests/cli/scaffold/subcommand.test.ts` or `tests/cli/scaffold/commands/missions.test.ts` — add `scaffoldMissions` characterization.
- `tests/cli/main.test.ts` — add parse phase and dispatch helper characterization.
- `tests/cli/session.test.ts` — may stay unchanged if existing coverage remains sufficient, but may be simplified in W5-01a if duplicate session setup remains.
- `tests/cli/chain-event-logger.test.ts` — add missing event formatter cases.
- `tests/orchestration/chain-runner.test.ts` — likely unchanged except helper exports if needed; may be simplified in W5-01a for duplicate setup.
- `tests/orchestration/agent-spawner.spawn.test.ts`, `tests/orchestration/agent-spawner.completion-loop.test.ts`, `tests/orchestration/agent-spawner.lineage.test.ts` — likely unchanged unless helper exports require targeted tests; W5-01a may consolidate duplicate setup.
- `tests/extensions/orchestration.test.ts`, `tests/extensions/orchestration-lineage.test.ts`, `tests/extensions/orchestration-rendering.test.ts` — add spawn activity cleanup tests if needed; W5-01a may consolidate duplicate lineage/activity setup.
- `tests/orchestration/chain-profiler.test.ts` — add stage breakdown row, no-stage placeholder, errored slowest-tool, empty section placeholder, and pending-tool line characterization.
- `tests/domains/validator.test.ts` — likely unchanged for W4-01, but W5-01a may consolidate repeated domain fixture setup.
- `tests/packages/manifest.test.ts` — add exact non-object/null/array required-missing-field assertions.
- `tests/packages/store.test.ts` — add scoped package listing characterization.
- `tests/sessions/session-store.test.ts` — likely unchanged for W4-04, but W5-01a may consolidate repeated session fixture setup.
- `tests/tasks/task-manager.test.ts` — add multiple-priority and missing-priority filter assertions.
- Additional W5-01a test files named in `.fallow/baselines/dupes.json` may be modified to remove residual test clone groups without changing behavior.

## Risks

- **Mitigated — Same-file conflicts in `cli/main.ts` and `lib/orchestration/chain-runner.ts`.** Blast radius: CLI startup modes, workflow execution, and chain orchestration could break if parallel workers edit the same file inconsistently. Countermeasure: same-file pairs are serial dependencies: W2-01 before W2-02 and W3-01 before W3-02.
- **Mitigated — Hidden behavior in legacy CLI dispatch.** Blast radius: users could see changed first-run domain guidance, dump-prompt output, workflow profile files, print-mode errors, or interactive session setup. Countermeasure: W2-02 requires dispatch characterization tests before splitting `run` and keeps public command entry behavior stable.
- **Mitigated — Shared helper API churn if Wave 0 guesses wrong.** Blast radius: all CLI command tasks could diverge or repeatedly edit helper APIs. Countermeasure: Wave 0 helpers expose only low-level output/error primitives, not command-specific business logic; command-specific helpers stay in each command file unless used by 3+ call sites.
- **Mitigated — Residual clones surfaced by capstone.** Blast radius: `fallow audit` will fail after removing `audit.dupesBaseline`, blocking the cleanup from landing. Countermeasure: W5-01a is explicitly gated on all prior waves, enumerates residual clone families from `.fallow/baselines/dupes.json`, and must make `fallow dupes` clean before W5-01b removes the baseline.
- **Mitigated — Refactor changes behavior while lowering complexity.** Blast radius: command outputs, session selection, child spawn lifecycle, and validation diagnostics can subtly change despite tests passing elsewhere. Countermeasure: every per-function task has a coverage gate and requires target characterization tests green before and after refactor.
- **Mitigated — Capstone over-abstracts tests to satisfy duplication checks.** Blast radius: tests become harder to read and failures become less diagnostic. Countermeasure: W5-01a permits shared helpers only for repeated setup across 3+ call sites and otherwise prefers table-driven cases or local builders that keep assertion data visible.

## Quality Contract

- id: QC-001
  category: correctness
  criterion: "No `// fallow-ignore-next-line complexity` comments remain in files listed under `docs/fallow-exceptions.md` Inline Complexity Suppressions."
  verification: verifier
  command: "bash -c '! grep -R \"fallow-ignore-next-line complexity\" cli lib domains/shared/extensions/orchestration'"

- id: QC-002
  category: integration
  criterion: "The temporary duplication baseline is removed while `entry` and `dynamicallyLoaded` remain present in `fallow.toml`."
  verification: reviewer

- id: QC-003
  category: correctness
  criterion: "Fallow passes without a dupes baseline after residual clone cleanup."
  verification: verifier
  command: "fallow audit"

- id: QC-004
  category: behavior
  criterion: "Every task marked `add-characterization-tests` includes tests that were run before and after the refactor and assert current error/edge behavior, not only happy paths."
  verification: reviewer

- id: QC-005
  category: integration
  criterion: "The full project test suite, lint, and typecheck pass after all suppressions and baseline config are removed."
  verification: verifier
  command: "bun run test && bun run lint && bun run typecheck"

- id: QC-006
  category: architecture
  criterion: "Shared CLI helpers do not import plan/task managers or command modules, and library/domain modules do not import CLI shared helpers."
  verification: reviewer

- id: QC-007
  category: correctness
  criterion: "W5-01a runs after every Wave 0/1/2/3/4 task and leaves no residual clone groups before W5-01b deletes `.fallow/baselines/dupes.json`."
  verification: reviewer

## Implementation Order

1. **Wave 0a** — Add shared CLI output/error helpers and tests.
2. **Wave 0b** — Add shared plan/task/CLI test fixtures and use them in at least representative existing tests.
3. **Wave 1** — Refactor 11 CLI command suppressions. Same-file conflicts are not present in this wave, but all tasks depend on Wave 0. These can run mostly parallel after Wave 0.
4. **Wave 2** — Refactor CLI/session infrastructure. W2-01 (`parseCliArgs`) must land before W2-02 (`run`); W2-03 through W2-05 can run parallel.
5. **Wave 3** — Refactor orchestration/runtime internals. W3-01 (`runChain`) must land before W3-02 (`runStage`); W3-03 through W3-06 can run parallel.
6. **Wave 4** — Refactor validation/stores/serialization suppressions in parallel.
7. **Wave 5a** — After every Wave 0/1/2/3/4 task is complete, run residual de-baseline cleanup by clone family and make `fallow dupes` clean while the baseline is still configured.
8. **Wave 5b** — Remove `.fallow/baselines/dupes.json` and `audit.dupesBaseline`, verify no complexity suppressions remain, and run `fallow audit`, `bun run test`, `bun run lint`, and `bun run typecheck`.
