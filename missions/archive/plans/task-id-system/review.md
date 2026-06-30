# Plan Review: task-id-system

## Findings

- id: PR-001
  dimension: behavior-spec
  severity: medium
  title: "No-config create path is still unspecified"
  plan_refs: plan.md:71-79, plan.md:101-109, plan.md:177-183, plan.md:241-244; spec.md:39-42, spec.md:69-77
  code_refs: lib/tasks/task-manager.ts:69-84, lib/tasks/task-manager.ts:322-335, tests/tasks/task-manager.test.ts:546-554
  description: |
    The plan proves no config churn only when `missions/tasks/config.json` already exists, but the spec says `task create` writes only the new task file, `config.json` is not modified, and config is read on create but never written. The existing lazy-create path calls `ensureInitialized()`, which calls `init()` when no config exists, and `init()` writes `missions/tasks/config.json`; the current regression test explicitly expects that side effect after `createTask` without prior `init()`.

    If workers follow the current plan literally, they can leave the lazy initialization behavior intact and still pass the named no-churn tests, while an uninitialized project produces both a config file and a task file. The planner should either explicitly scope AC-001/B-005/B-008 to already-initialized projects or add behavior/test/design instructions for creating the first task when config is absent.

- id: PR-002
  dimension: interface-fidelity
  severity: medium
  title: "Filename-only active scanning drops currently parsed active task IDs"
  plan_refs: plan.md:25, plan.md:177-191, plan.md:207-209
  code_refs: lib/tasks/task-manager.ts:115-120, lib/tasks/task-manager.ts:342-351, lib/tasks/task-parser.ts:300-329, lib/tasks/file-system.ts:224-236
  description: |
    The plan says to re-read active and archived filenames, parse IDs with `parseTaskIdFromFilename`, and use filenames as the allocation index for both active and archived directories. That is a behavior change for active tasks: the current create path calls `loadAllTasks()`, which reads every active `.md` file and uses `parseTask()` to get `Task.id` from frontmatter before `generateNextId()` runs.

    As written, an active task file with a parseable frontmatter ID but a non-standard filename is live for `listTasks()` and currently protects its ID from reuse during create. The planned filename-only active scan would ignore that ID (`parseTaskIdFromFilename()` returns `null` without the `" - "` filename separator), so a create could reuse an existing active task ID. The planner should either keep active allocation content-based while using filenames for archive, or explicitly declare non-standard active filenames unsupported and add migration/negative coverage.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "Archived filename-derived IDs are not proven against content parsing"
  plan_refs: plan.md:23-26, plan.md:51-59, plan.md:189-191, plan.md:232-234, plan.md:241-242
  code_refs: lib/tasks/task-manager.ts:115-120, lib/tasks/task-manager.ts:342-351, lib/tasks/task-parser.ts:300-329, lib/tasks/file-system.ts:224-236
  description: |
    The plan resolves that archived IDs come from filenames, and says filename scanning must still count archived files whose markdown body later becomes unparseable. But B-003 only describes an archive file such as `TASK-428 - Archived.md` and expects `TASK-429`; with normal matching frontmatter, an implementation that parses archived task contents instead of filenames would pass the same test.

    This leaves the central filename-derived archive decision unprotected by the named behavior. The planner should require a test fixture where the archived filename carries the maximum ID but the body is missing, malformed, or has a different/lower `id`, so a content-parsing implementation fails and a filename-scanning implementation passes.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "Archived-active isolation behavior names five operations but tests only listing"
  plan_refs: plan.md:81-89, plan.md:185, plan.md:221-222, plan.md:232-234
  code_refs: lib/tasks/task-manager.ts:173-181, lib/tasks/task-manager.ts:224-263, lib/tasks/task-manager.ts:270-314, lib/tasks/task-manager.ts:342-361
  description: |
    B-006 says archived files must not affect `list`, `search`, `get`, `update`, or `delete`, but the named test is `uses archived IDs for allocation without listing archived tasks`, and the mutation gate only mentions catching archived tasks in `listTasks`. The existing code has two separate active-only seams: `loadAllTasks()` drives list/search, while `findTaskFilenameById()` drives get/delete and update via `getTask()`.

    A worker could accidentally broaden `findTaskFilenameById()` to archived files without a list-only test failing, or broaden `loadAllTasks()` and miss `search`. The plan should require executable coverage for the active-only behavior across both seams, not just list output.

- id: PR-005
  dimension: state-sync
  severity: medium
  title: "Config stripping at file-system boundary does not cover init's returned/cached config"
  plan_refs: plan.md:91-99, plan.md:187, plan.md:224
  code_refs: lib/tasks/task-manager.ts:69-89, lib/tasks/file-system.ts:98-106, lib/tasks/task-types.ts:157-170
  description: |
    B-007 expects `lastIdNumber` to be omitted from the returned/saved config contract. The design assigns stripping to `loadConfig`/`saveConfig`, but `TaskManager.init(config?: Partial<ForgeTasksConfig>)` currently merges caller-provided config after the loaded/default base, caches `finalConfig`, and returns it. After the public type drops `lastIdNumber`, runtime callers or test fixtures can still pass an object containing that legacy key; `saveConfig` may strip the file output, but `init()` can still return/cache a config object containing stale allocation state.

    This leaves two sources of truth for the same legacy field: saved JSON without `lastIdNumber`, and in-memory `TaskManager.config` with it. The planner should specify whether `init()` sanitizes the merged config before caching/returning or explicitly narrows B-007 to config files only.

## Missing Coverage

- B-008 covers the single-task CLI create path, but `cli/tasks/commands/create.ts` also has a `--from-file` batch path that loops through `TaskManager.createTask`; decide whether CLI no-config-churn coverage must include batch create or explicitly relies on TaskManager coverage.
- B-009 should require the named doc test to read both `domains/shared/skills/task/SKILL.md` and `domains/shared/capabilities/tasks.md`. The current `tests/prompts/task-skill.test.ts` helper reads only the skill file, while the capability file is user-facing and currently hard-codes `COSMO-NNN`.
- B-010 should make clear that the config test checks both sides of the Biome contract: no blanket `!missions` exclusion in `biome.json`, and session transcript exclusions still present in `.gitignore`.

## Assessment

The plan is viable with revisions. The most important fix is deciding the no-config lazy-create behavior before tasking, because the current code and tests still treat first `createTask()` as an initializer that writes config, which conflicts with the plan's no-config-churn promise.
