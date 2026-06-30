---
title: 'Task ID allocation — derive from active∪archive, drop the counter'
status: active
createdAt: '2026-06-30T00:00:00.000Z'
updatedAt: '2026-06-30T14:56:14.234Z'
---

## Overview

Stop treating `missions/tasks/config.json` as mutable allocation state. The task system will keep reading configuration for stable settings (`prefix`, `zeroPadding`, default labels/priority), but `task create` will allocate the next ID from persisted task files and will write only the newly created task file. Explicit scaffold/init flows may still create or rewrite config; create flows must not.

Source acceptance criteria in this plan use the existing `spec.md` bullets in order:

- `AC-001` - task create does not modify `missions/tasks/config.json`; user sees only the new task file.
- `AC-002` - next ID is one greater than the highest configured-prefix ID across active and archived tasks.
- `AC-003` - an archive-only maximum still drives the next ID.
- `AC-004` - `lastIdNumber` is removed from the config contract; legacy configs tolerate and ignore it.
- `AC-005` - existing IDs, configured prefix/zero-padding, and empty-project first-ID behavior are preserved.
- `AC-006` - cross-branch sequential collision caveat is documented; `task renumber` is future only.
- `AC-007` - the Biome `missions/` exclusion is removed or narrowed and the lint gate stays green.
- `AC-008` - project verification passes, with direct allocation coverage including archive-aware and empty-project cases.

Resolved open questions:

1. **Archived IDs come from filenames; active IDs remain content-based.** Current active create allocation reads active task files and uses frontmatter IDs via `parseTask()`, so the plan preserves that behavior for active tasks. Archived tasks are scanned by filename (`parseTaskIdFromFilename`) because archive files are not active records, filenames are the existing task-system index, and this counts archived IDs even if the archived markdown body later becomes malformed. A supported archived task with no parseable filename ID would require a plan revision; do not add content parsing speculatively.
2. **Biome end state is to remove the explicit blanket `!missions` include exclusion.** The repo already uses `.gitignore` for high-volume session transcripts (`missions/sessions/`, `missions/archive/sessions/`), so `biome.json` should stop excluding tracked missions artifacts wholesale. If static analysis reveals a large unrelated historical artifact backlog, stop and revise the plan rather than reintroducing `!missions`.
3. **Duplicate-ID warning is out of scope.** Sequential allocation will remain silent if a messy merge leaves duplicate existing task IDs; the documented future reconciliation path is `cosmonauts task renumber`, not this implementation.

Plan-review response incorporated: no-config lazy create is now explicit; active allocation remains content-based; archived filename use has a mutation-style test; archived-active isolation covers both query and ID-lookup seams; `TaskManager.init()` sanitizes returned/cached config; CLI batch/docs/Biome coverage is explicit.

## Behaviors

### B-001 - Empty allocation starts at the first configured ID

- Source: AC-005, AC-008
- Context: a project has no active or archived task IDs for the configured prefix
- Action: the allocation helper is asked for the next ID
- Expected: it returns the first sequential ID for the configured prefix, preserving zero-padding when configured (`TASK-1` without padding, `TASK-001` with `zeroPadding: 3`)
- Seam: `lib/tasks/id-generator.ts` pure allocation
- Test: `tests/tasks/id-generator.test.ts` > `generates TASK-1 for empty task ID set`
- Marker: `@cosmo-behavior plan:task-id-system#B-001`

### B-002 - Allocation uses the highest active-or-archived ID without filling gaps

- Source: AC-002, AC-005, AC-008
- Context: the allocation helper receives the union of active and archived task IDs, including gaps, mixed padding, and IDs with other prefixes
- Action: it calculates the next ID for the configured prefix
- Expected: it ignores other prefixes, parses matching IDs case-insensitively, chooses the highest numeric value across the whole supplied union, and returns highest + 1 with configured formatting
- Seam: `lib/tasks/id-generator.ts` pure allocation
- Test: `tests/tasks/id-generator.test.ts` > `uses the highest ID across active and archived IDs`
- Marker: `@cosmo-behavior plan:task-id-system#B-002`

### B-003 - Archived filenames drive archive-aware create allocation

- Source: AC-002, AC-003, AC-008
- Context: active tasks contain only lower IDs from their parsed frontmatter, while `missions/archive/tasks/` contains the highest matching filename ID; the archived file body may be missing frontmatter, malformed, or contain a lower/mismatched `id`
- Action: `TaskManager.createTask` creates a new task
- Expected: the created task ID is above the archived filename maximum (`TASK-429` for archived filename `TASK-428 - Archived.md`), proving archived content parsing is not required and no archived filename ID is reused
- Seam: `lib/tasks/task-manager.ts` create path plus `lib/tasks/file-system.ts` archived-file listing
- Test: `tests/tasks/task-manager.test.ts` > `allocates above an archived-only filename maximum even when archive content is invalid`
- Marker: `@cosmo-behavior plan:task-id-system#B-003`

### B-004 - Missing archive directory is treated as empty

- Source: AC-002, AC-005
- Context: a project has an active task directory and config, but `missions/archive/tasks/` is absent or empty
- Action: `TaskManager.createTask` creates a task
- Expected: creation succeeds, active IDs still drive allocation, and an otherwise empty project creates the first configured ID instead of erroring
- Seam: `lib/tasks/file-system.ts` archived-file listing and `lib/tasks/task-manager.ts` create path
- Test: `tests/tasks/task-manager.test.ts` > `treats a missing archive task directory as empty during allocation`
- Marker: `@cosmo-behavior plan:task-id-system#B-004`

### B-005 - Task create does not rewrite existing config or use legacy lastIdNumber

- Source: AC-001, AC-004
- Context: `missions/tasks/config.json` already exists, possibly with a legacy `lastIdNumber` field and non-Biome formatting
- Action: `TaskManager.createTask` creates a task
- Expected: the config file bytes are unchanged after create, `lastIdNumber` does not influence the allocated ID, and no create call path persists config
- Seam: `lib/tasks/task-manager.ts` create path and `lib/tasks/file-system.ts` config loading
- Test: `tests/tasks/task-manager.test.ts` > `does not rewrite config or use legacy lastIdNumber during create`
- Marker: `@cosmo-behavior plan:task-id-system#B-005`

### B-006 - First create without config does not create config

- Source: AC-001, AC-005
- Context: a project has no `missions/tasks/config.json` yet and a caller creates the first task without running explicit scaffold/init first
- Action: `TaskManager.createTask` creates a task using default in-memory config
- Expected: the task file is written with the default configured ID shape, directories may be created as needed, but `missions/tasks/config.json` is not created by the create path
- Seam: `lib/tasks/task-manager.ts` create-specific config loading
- Test: `tests/tasks/task-manager.test.ts` > `creates the first task without creating config when config is absent`
- Marker: `@cosmo-behavior plan:task-id-system#B-006`

### B-007 - Archived tasks affect allocation only, not active task operations

- Source: AC-002, AC-005
- Context: archived task files exist alongside active tasks
- Action: callers list, search, get, update, or delete tasks through `TaskManager`
- Expected: list/search stay driven by active parsed task files, get/update/delete stay driven by active filename lookup, archived files are not returned as live tasks and cannot be edited/deleted through active-task operations; archived IDs are consulted only for new-ID allocation
- Seam: `lib/tasks/task-manager.ts` `loadAllTasks`, `findTaskFilenameById`, and create-only allocation helper
- Test: `tests/tasks/task-manager.test.ts` > `keeps archived tasks out of list search and id lookup operations`
- Marker: `@cosmo-behavior plan:task-id-system#B-007`

### B-008 - Config filesystem contract drops lastIdNumber while tolerating legacy files

- Source: AC-004
- Context: a legacy `missions/tasks/config.json` contains `lastIdNumber` along with supported settings such as `prefix` and `zeroPadding`
- Action: task config is loaded and saved through the config filesystem helpers
- Expected: supported settings are preserved, `lastIdNumber` is omitted from the returned/saved config contract, and legacy presence does not throw
- Seam: `lib/tasks/task-types.ts` `ForgeTasksConfig` and `lib/tasks/file-system.ts` `loadConfig`/`saveConfig`
- Test: `tests/tasks/file-system.test.ts` > `loads legacy config while dropping lastIdNumber`
- Marker: `@cosmo-behavior plan:task-id-system#B-008`

### B-009 - TaskManager init returns and caches sanitized config

- Source: AC-004
- Context: `TaskManager.init()` merges existing config and caller-provided config, and runtime callers may still pass a legacy object with `lastIdNumber`
- Action: init saves, returns, and caches the final config
- Expected: the returned and cached config omit `lastIdNumber`, and subsequent creates from the same manager cannot see stale in-memory counter state
- Seam: `lib/tasks/task-manager.ts` `init` and config cache
- Test: `tests/tasks/task-manager.test.ts` > `init returns and caches config without legacy lastIdNumber`
- Marker: `@cosmo-behavior plan:task-id-system#B-009`

### B-010 - CLI create paths have the same no-config-churn behavior

- Source: AC-001
- Context: a user creates tasks through the task CLI create command, both single-task and `--from-file` batch paths
- Action: the create command completes successfully
- Expected: rendered output still reports the created task(s), task files are created under `missions/tasks/`, and `missions/tasks/config.json` remains byte-for-byte unchanged when present and is not created when absent
- Seam: `cli/tasks/commands/create.ts` consuming `TaskManager.createTask`
- Test: `tests/cli/tasks/commands/create.test.ts` > `creates tasks without rewriting task config through single and batch create`
- Marker: `@cosmo-behavior plan:task-id-system#B-010`

### B-011 - Task-facing docs describe the sequential caveat and future reconciliation

- Source: AC-006
- Context: an agent or maintainer reads the task skill/capability docs to understand task IDs
- Action: they inspect the documented task ID behavior
- Expected: both docs describe configured sequential IDs, active+archive allocation, the accepted cross-branch collision caveat, and `task renumber` as a future reconciliation option rather than an implemented command
- Seam: `domains/shared/skills/task/SKILL.md` and `domains/shared/capabilities/tasks.md`
- Test: `tests/prompts/task-skill.test.ts` > `documents task ID allocation caveat and future renumber option`
- Marker: `@cosmo-behavior plan:task-id-system#B-011`

### B-012 - Tracked missions artifacts are no longer blanket-excluded from Biome

- Source: AC-007
- Context: config churn is removed from task creation
- Action: the Biome include/exclude configuration and `.gitignore` session exclusions are inspected, and the project static-analysis gate runs
- Expected: `biome.json` no longer contains the blanket `!missions` exclusion, session transcript exclusions remain in `.gitignore`, and the lint/static-analysis gate stays green
- Seam: `biome.json` and `.gitignore`
- Test: `tests/config/biome.test.ts` (new) > `does not blanket-exclude tracked missions artifacts`
- Marker: `@cosmo-behavior plan:task-id-system#B-012`

## Design

### Module responsibilities and dependency direction

- `lib/tasks/id-generator.ts` remains the pure domain module for parsing, formatting, and selecting sequential IDs. It must not import filesystem, parser, serializer, CLI, or task-manager modules.
- `lib/tasks/file-system.ts` remains the filesystem adapter for task/config files. It lists active and archived task filenames and loads/saves config; it must not decide allocation policy.
- `lib/tasks/task-manager.ts` remains the orchestration seam. It composes config, active task parsing, archived filename listing, ID generation, serialization, and locking for `createTask`, while keeping list/get/search/update/delete active-only.
- `cli/tasks/commands/create.ts` remains a user-facing adapter. It must not implement its own ID allocation or config write; it delegates to `TaskManager.createTask`.
- Prompt/docs files (`domains/shared/skills/task/SKILL.md`, `domains/shared/capabilities/tasks.md`) describe the behavior for agents. They do not affect runtime allocation.

### Contracts workers must preserve

`lib/tasks/id-generator.ts` should shift from task-object input to ID-string input so allocation can combine active parsed IDs and archive filename-derived IDs:

```ts
export function generateNextId(
	config: ForgeTasksConfig,
	existingTaskIds: readonly string[],
): string;

export function extractIdNumbers(
	ids: readonly string[],
	prefix: string,
): number[];
```

If minimizing churn is easier, a small compatibility helper may accept `{ id: string }` internally, but the public allocation seam used by `TaskManager` must be ID-string based. `generateNextId` uses only `config.prefix` (falling back to `TASK` as today), `config.zeroPadding`, and parsed numbers from `existingTaskIds`. It must not read or consider `lastIdNumber`.

`lib/tasks/file-system.ts` should add an archived-file listing helper that mirrors the active listing behavior:

```ts
export async function listArchivedTaskFiles(
	projectRoot: string,
): Promise<string[]>;
```

Both `listTaskFiles` and `listArchivedTaskFiles` return sorted `.md` filenames only and return `[]` when their directory is missing. Prefer an internal `listMarkdownFiles(directory: string)` helper to avoid duplicating error handling.

`lib/tasks/task-manager.ts` should keep the existing create lock, but make create use a non-persisting config path:

```ts
const config = await this.ensureCreateConfig();
return await withTaskCreateLock(this.projectRoot, () =>
	this.createTaskLocked(input, config),
);
```

`ensureCreateConfig()` must:

1. Return the cached sanitized config if present.
2. Load and sanitize `missions/tasks/config.json` when it exists.
3. Use sanitized `DEFAULT_CONFIG` in memory when config is missing.
4. Never call `init()` and never call `saveConfig()`.

Inside `createTaskLocked`:

1. Re-read active tasks **inside the lock** using the existing content parser path (`loadAllTasks()`), preserving current active frontmatter-ID behavior.
2. Re-read archived filenames **inside the lock** with `listArchivedTaskFiles()` and `parseTaskIdFromFilename()`.
3. Combine `activeTasks.map((task) => task.id)` with archived filename IDs.
4. Call `generateNextId(config, ids)`.
5. Build and save the new active task file.
6. Return the task without calling `saveConfig`.

Add a private helper such as `loadTaskIdsForAllocation()`; do not broaden `loadAllTasks()` because live task queries must remain active-only.

`lib/tasks/task-types.ts` should remove `lastIdNumber` from `ForgeTasksConfig`. `lib/tasks/file-system.ts` should tolerate legacy files by stripping `lastIdNumber` on `loadConfig` and before `saveConfig` output. `TaskManager.init()` must also sanitize the merged config before saving, caching, and returning it, so a runtime caller that passes a legacy object cannot leave stale counter state in memory. Use a local legacy type/helper rather than keeping the field in the public config interface.

### Filename-derived archive IDs

Use filenames as the allocation index for archived directories. This matches the existing task-file naming contract, avoids parsing archived markdown, and still protects against reusing IDs from archived files whose body is malformed. Preserve active content-based allocation to avoid dropping currently live active IDs from non-standard filenames.

### Biome configuration

Remove the explicit `files.includes: ["**", "!missions"]` blanket exclusion from `biome.json`. Because `vcs.useIgnoreFile` is already `true`, `.gitignore` continues to exclude generated session transcripts. If `missions/tasks/config.json` remains tracked, format it once as needed after removing `lastIdNumber`; future task creation must not churn it.

### Documentation

Update the task skill and task capability docs to avoid hard-coding `COSMO-NNN` as the only shape. They should state that IDs use the configured prefix and optional zero-padding, are allocated from active task frontmatter plus archived task filenames, and remain sequential/readable but not branch-global. Document the cross-branch duplicate caveat and mention `task renumber` only as a future reconciliation option.

## Files to Change

- `tests/tasks/id-generator.test.ts` - update allocation tests to the ID-string contract; add markers for `B-001` and `B-002`; remove `lastIdNumber` expectations.
- `lib/tasks/id-generator.ts` - ignore/remove counter semantics; allocate from supplied ID strings only.
- `tests/tasks/file-system.test.ts` - cover archived task file listing and legacy config stripping (`B-008`).
- `lib/tasks/file-system.ts` - add `listArchivedTaskFiles`; strip legacy `lastIdNumber` during config load/save.
- `tests/tasks/task-manager.test.ts` - add archive filename max, missing archive dir, existing-config no rewrite/legacy ignore, no-config create, archive-active isolation, and init-sanitization tests (`B-003` through `B-007`, `B-009`).
- `tests/tasks/task-manager-concurrency.test.ts` - keep existing distinct-ID concurrency coverage green after create no longer writes config.
- `lib/tasks/task-manager.ts` - add no-write create config loading; combine active parsed IDs with archived filename IDs inside the create lock; remove create-time config persistence; sanitize init cache/return; keep active-only query paths.
- `tests/cli/tasks/commands/create.test.ts` - add CLI no-config-rewrite coverage for single and batch create (`B-010`).
- `cli/tasks/commands/create.ts` - no allocation logic expected; change only if tests expose adapter-specific behavior.
- `tests/prompts/task-skill.test.ts` - add doc/capability caveat coverage that reads both task-facing docs (`B-011`).
- `domains/shared/skills/task/SKILL.md` - document configured sequential IDs, active+archive allocation, caveat, and future renumber.
- `domains/shared/capabilities/tasks.md` - align short capability wording with the skill.
- `tests/config/biome.test.ts` (new) - assert Biome no longer blanket-excludes tracked `missions/` artifacts and `.gitignore` still excludes session transcripts (`B-012`).
- `biome.json` - remove the blanket `!missions` include exclusion; rely on `.gitignore` for generated sessions.
- `missions/tasks/config.json` - remove the legacy `lastIdNumber` field and format once if needed; task creation must not touch it afterward.

## Risks

- **No-config create regression.** `ensureInitialized()` currently writes config. Create must use a separate no-write config path; otherwise AC-001 still fails for uninitialized projects.
- **Active ID regression.** Switching active allocation to filename-only would drop currently parsed active frontmatter IDs from non-standard filenames. Keep active content parsing and use filename parsing only for archive.
- **Archive filename/content mismatch.** The design intentionally treats archived filenames as the supported archive ID index. If implementation finds archived files without parseable filename IDs, stop and revise the design instead of silently adding a content parser.
- **Accidental archive broadening.** Adding archive awareness to `loadAllTasks()` or `findTaskFilenameById()` would make archived work appear live. Keep archive scanning in a create-only helper and prove active operations stay active-only.
- **Lock regression.** Removing the config write must not move active/archived ID discovery outside `withTaskCreateLock`; concurrent create tests must still prove distinct IDs across managers.
- **Legacy config leakage.** If `lastIdNumber` remains in the public type, saved JSON, or cached `TaskManager` config, future code can accidentally depend on it again. Strip it at the file-system and task-manager init boundaries.
- **Biome fallout.** If removing `!missions` reveals unrelated historical artifact churn, do not reintroduce a blanket missions exclusion. Narrow only to generated transcript paths after revising the plan.
- **Scope creep into reconciliation.** Duplicate detection, warnings, and `task renumber` are future work. This plan documents the limitation but does not implement merge repair.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | allocation and create-path tests prove empty-project, active+archive maximum, archive filename maximum with invalid content, missing archive directory, existing-config no-churn, no-config create no-write, legacy counter ignored, init sanitization, CLI single/batch no-churn, active-only operations, and documentation/config expectations | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | behavior-spine mechanical checks pass for `B-001` through `B-012`, including exact markers in referenced tests/evidence | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | tests would fail if allocation used active-only IDs, used `lastIdNumber`, wrote or created config on create, parsed archived contents instead of filenames, switched active allocation to filename-only, or included archived tasks in active operations | pending | unbound; reviewer must inspect that the named negative cases are asserted |
| 4 | `boundary-conformance` | bindable | bound | pure ID generation has no filesystem imports; CLI has no allocation logic; archive scanning is create-only; config stripping stays at filesystem/init boundaries; create config loading does not call `init()` | reviewer evidence | hard fail if violated |
| 5 | `duplication` | bindable | bound | active and archived file listing share one small helper or otherwise keep identical missing-dir/filter/sort behavior without divergent copies | reviewer evidence | hard fail for divergent duplicate IO logic |
| 6 | `dead-code` | bindable | bound | no runtime references to `lastIdNumber` remain outside legacy-stripping tests/docs; removed imports such as create-path `parseIdNumber` do not linger | project-discovered | hard fail |

## Implementation Order

1. **Pure allocation and file discovery first.** Write the `B-001`/`B-002` `id-generator` tests and archived-file listing tests red. Then update `id-generator.ts` and `file-system.ts` to allocate from ID strings and expose `listArchivedTaskFiles`.
2. **Create path and config contract second.** Write the `B-003` through `B-009` task-manager/file-system tests red, including archive filename max with invalid archived content, no-config create, active-operation isolation, and init sanitization. Then update `TaskManager.createTask`, `createTaskLocked`, `ForgeTasksConfig`, and config load/save stripping. Keep active ID discovery content-based, keep archive ID discovery filename-based, and keep all allocation reads inside the create lock.
3. **User-facing CLI, docs, and lint config third.** Write the `B-010` CLI single/batch test, `B-011` docs test, and `B-012` Biome config test red. Then update docs/capability wording and remove the blanket `!missions` Biome exclusion.
4. **Verification and refactor.** Run the project-native correctness, static-analysis, and type-safety gates. If the Biome change surfaces unrelated historical artifact churn, stop and revise the plan before narrowing exclusions. If unexpected consumers require the old `generateNextId(config, Task[])` signature, keep a compatibility wrapper rather than broadening scope beyond task allocation.
