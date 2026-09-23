---
id: TASK-710
title: 'Stage 3: a Cancelled task status, and the superseded audit plan archived'
status: Done
priority: high
labels:
  - 'plan:framework-health'
  - backend
dependencies:
  - TASK-711
createdAt: '2026-09-22T19:37:54.114Z'
updatedAt: '2026-09-23T19:58:51.067Z'
---

## Description

Framework-health Stage 3 (B-012; D-026, D-028, D-031, D-035). Add Cancelled to TaskStatus and to every shipped consumer in one change — find them by searching production code for the status literals and record the list (known: the persisted-task parser lib/tasks/task-parser.ts, which maps unknown values to To Do; Drive's plan-completion candidate; domains/shared/capabilities/tasks.md): task_edit schema, CLI status parser, artifact viewer counts, Drive and coordinator selection (excluded like Done), dependency resolution (a Cancelled dependency is never satisfied, active or archived; archived resolution reads the persisted status), plan archive (accepts Done and Cancelled), and the task/plan guidance — including the shipped prose that today makes completion conditional on all tasks being Done (coordinator and quality-manager prompts, drive skill and capability, the external cosmonauts and plans skills, the plan skill, and the packaged implement-plan command; D-031, D-035; and, per D-036, the spawning skill's "coordinator loops until all tasks are Done", lib/driver/README.md's completion-candidate rule, Drive resume finalization in cli/drive/subcommand.ts, and lib/driver/run-run-loop.ts's completion check unless TASK-709 has deleted that file), rewritten by reviewed diff so Cancelled counts as closed and is never selected. Then set TASK-706 and TASK-707 to Cancelled leaving their acceptance criteria and notes byte-identical, mark test-health-audit completed, and archive it. Test-first through the real entry points with synthetic tasks.

<!-- AC:BEGIN -->
- [x] #1 A task saved as Cancelled is read back as Cancelled by a fresh process; a plan whose tasks are all Done or Cancelled is a completion candidate; task_edit and the CLI accept status Cancelled; the viewer counts it; a plan whose tasks are all Done or Cancelled can be archived, and one with a Cancelled task and no others still open is archived by the ordinary command.
- [x] #2 Drive and the coordinator never select a Cancelled task; a task depending on a Cancelled task stays blocked before and after the plan is archived (seen red before the change).
- [x] #3 TASK-706 and TASK-707 are Cancelled with acceptance criteria and notes byte-identical to before; test-health-audit is completed and lives under missions/archive/plans/.
- [x] #4 The task's notes list every status-literal site the search found (code and shipped prose, including the four D-036 paths) with its disposition; Drive resume finalization treats a Cancelled task as closed (seen red before the change).
- [x] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->

## Implementation Notes

Completed by a Claude worker on top of a codex worker's uncommitted partial (cut off by a usage limit). Kept: the TaskStatus/parser/schema/CLI alias/viewer/selection/archive/completion changes and most prose. Changed: archived-dependency resolution now reads only the archived files an active task actually depends on (new `readArchivedTaskFile` in lib/tasks/file-system.ts) instead of every archived file; resume uses `isTaskClosed`; the partial's completion-candidate test was aborting (no git repo) and now inits git; one drive-skill sentence about `partialMode=continue` reverted, because `not_all_tasks_done` is decided from the run's step finalizers, not persisted status. Added: `task_list` declares `ready` (see below), coordinator prompt uses it, the fresh-process CLI test, viewer/coordinator/Drive-selection tests, CLI help texts.

Found while doing it: the coordinator told itself to call `task_list` with `hasNoDependencies: true`, but 33c2eda renamed the filter to `ready` and left the tool parameter behind, so the coordinator's "unblocked" listing ignored dependencies altogether and would have dispatched a task whose dependency is Cancelled. `task_list` now declares `ready` and the coordinator prompt uses `status: "To Do", ready: true`.

Status-literal search (lib/ cli/ domains/ bundled/ external-skills/ external-commands/ docs/ README.md; `"Done"`, `To Do`, `In Progress`, `Blocked`, `Cancelled`, "all tasks Done/done"):
Code
- lib/tasks/task-types.ts TaskStatus: + Cancelled; new `isTaskClosed` (Done|Cancelled); TaskListFilter.ready doc updated.
- lib/tasks/task-parser.ts VALID_STATUSES: + Cancelled (was mapped to To Do).
- lib/tasks/task-manager.ts TASK_STATUS_OUTCOMES: + cancelled; default "To Do" on create unchanged; matchesReadyFilter `=== "Done"` unchanged (Cancelled never satisfies), doc updated; resolveDependencyStatuses: archived deps now read with persisted status instead of assumed Done.
- lib/tasks/file-system.ts: + readArchivedTaskFile.
- lib/tasks/task-serializer.ts:133 doc example: unchanged.
- lib/driver/task-selection.ts (Drive default selection): excludes Done and Cancelled.
- lib/driver/drive-graph-runner.ts planCompletionCandidate: all Done or Cancelled.
- lib/driver/drive-scheduler-backend.ts:199,320,344,648; drive-finalization.ts:194,212,228,283,715; run-one-task.ts:89,798 (writes of In Progress/Blocked/Done): unchanged — Drive never writes Cancelled (D-028).
- lib/driver/shell-command-finalizer.ts / state-commit.ts `not_all_tasks_done`: unchanged, step-based not status-based.
- lib/orchestration/chain-runner.ts default completion check (coordinator loop): complete when every task is Done-with-ACs or Cancelled; all-Blocked terminal unchanged.
- lib/plans/archive.ts: accepts Done and Cancelled; error "tasks not Done or Cancelled".
- lib/artifact-viewer/loaders.ts countTasksByStatus: + Cancelled.
- cli/tasks/commands/shared.ts: + `cancelled` alias and error text; edit.ts/list.ts/search.ts help text + cancelled.
- cli/drive/subcommand.ts findFirstOpenTask (resume state-commit acceptance, D-036): Done or Cancelled is closed; reason text "neither Done nor Cancelled"; :1615 finalize writes Done unchanged.
- domains/shared/extensions/tasks/index.ts: StatusLiterals + Cancelled (task_edit/task_list/task_search); task_list `hasNoDependencies` -> `ready`.
- domains/shared/extensions/orchestration/driver-tool.ts taskIds description; domains/shared/extensions/plans/index.ts plan_archive description: Done or Cancelled.
- lib/driver/run-run-loop.ts (D-036): moot — deleted by TASK-709.
Shipped prose
- bundled/coding/prompts/coordinator.md: exit/completion on all Done or Cancelled; Cancelled listed and never selected; `ready: true` replaces `hasNoDependencies`; per-task Done/To Do/Blocked handling unchanged.
- bundled/coding/prompts/quality-manager.md:17,261: plan completed when all Done or Cancelled; :251 unchanged.
- bundled/coding/prompts/worker.md, refactorer.md (per-task status writes): unchanged.
- bundled/coding/skills/tdd/SKILL.md:118, languages/typescript/references/testing-patterns.md:36 (test-name examples): unchanged.
- domains/shared/capabilities/tasks.md: status list + Cancelled. drive.md: default selection excludes Done and Cancelled. spawning.md:22: unchanged.
- domains/shared/skills/drive/SKILL.md:14,89,93,112: Done or Cancelled (selection, resume evidence, completion candidate); the `partialMode=continue` clause stays "run task not Done".
- domains/shared/skills/plan/SKILL.md:112 (D-035): all Done or Cancelled.
- domains/shared/skills/spawning/SKILL.md:52 (D-036): coordinator loops until all Done or Cancelled; :115 unchanged.
- domains/shared/skills/task/SKILL.md: status list, flow diagram, Cancelled definition; :41 "must be Done" unchanged (correct).
- lib/driver/README.md:177 resume evidence and :300 completion candidate (D-036): Done or Cancelled.
- external-skills/cosmonauts/SKILL.md:102, plans/SKILL.md:99: Done or Cancelled. tasks/SKILL.md: status lists, `--ready` archived-Cancelled semantics; :153-157 manual jq recipe unchanged (Cancelled correctly never counts as done).
- external-commands/implement-plan.md:65 (D-035): all Done or Cancelled; :30 pre-flight "all To Do" unchanged.
- docs/orchestration.md:24: coordinator loops until Done or Cancelled. docs/testing.md:115, docs/designs/cosmo-ambient-assistant.md:3, README.md:218,369: unchanged.

Red evidence (production line reverted from a cp backup, target tests run, file restored and cmp-verified):
- parser without Cancelled -> red: tests/cli/tasks/cancelled-status.test.ts (fresh-process read-back), task-manager "keeps dependents blocked by a Cancelled task before and after archive".
- AC#2 Drive selection `status !== "Done"` -> red: tests/cli/drive/run.test.ts "never selects a Cancelled plan task by default".
- AC#2 archived dependency assumed Done -> red: task-manager "…before and after archive" and the CLI test (dependent listed --ready after `plan archive`).
- AC#2 coordinator: task_list schema back to `hasNoDependencies` -> red: tests/extensions/task-tools.test.ts "the coordinator's ready listing never selects a Cancelled task or its dependents"; chain-runner completion back to Done-only -> red: tests/orchestration/chain-runner.test.ts "returns true when every task is Done or Cancelled…".
- AC#4 resume `task?.status !== "Done"` -> red: tests/cli/drive/run.test.ts "resume accepts a Cancelled pending task as closed state-commit evidence".
- AC#1 completion candidate Done-only -> red: tests/driver/drive-graph-finalization-result.test.ts "emits a completion candidate…"; archive Done-only -> red: tests/plans/archive.test.ts "archives a plan whose only task is Cancelled" + CLI test; viewer count removed -> red: tests/artifact-viewer/loaders.test.ts (2 tests); CLI alias removed -> red: CLI test.

AC#3: TASK-706/707 saved before editing; after `task edit --status cancelled` and after archive, `diff` shows only `status` (Blocked -> Cancelled) and `updatedAt` — AC and notes byte-identical. `plan edit test-health-audit --status completed`, then `plan archive test-health-audit` moved the plan and its 22 tasks (20 Done, 2 Cancelled) to missions/archive/; nothing already in missions/archive/ was modified.

Gates: lint clean, typecheck 0, full suite 241 files / 3004 tests passed (exit 0), check-artifacts framework-health 0 issues.

Left open (outside this task): the coordinator chain's default completion check still has no terminal state for a To Do task whose dependency is Cancelled — it stays pending until the loop's iteration cap; the coordinator prompt now says to report such a task instead of dispatching it. Archived TASK-150 was archived as Blocked; with persisted-status resolution it would now block a dependent (none exists), which is the intended semantics.

2026-09-23 review follow-up (F3a/F3b): Drive now refuses to run a task with a Cancelled dependency (active or archived). lib/driver/drive-scheduler-backend.ts checks dependencies before preflight via new TaskManager.getTaskStatuses (active then archive), emits task_blocked, and returns a blocked step whose reason names the dependency ('dependency TASK-X is Cancelled; ...'); the task stays not-Done. Other dependencies are left to graph order and operator selection. Pinned through runDriveOnGraph in tests/driver/drive-cancelled-dependency.test.ts (red before the fix). task list --ready help, the isTaskClosed doc, and the external tasks SKILL.md ready example corrected.

2026-09-23 codex Stage 3 findings 5a/6: the default coordinator completion check (lib/orchestration/chain-runner.ts) now returns terminal (success:false, 'No actionable tasks ...') when no task is In Progress and no To Do task has every dependency Done (Cancelled deps never satisfy; statuses resolved across active+archive), mirroring the all-Blocked fail-fast; checked before the first spawn and after each iteration. Red first: Cancelled+Blocked and To Do-on-Cancelled ran to the 10-iteration cap. isTaskClosed doc corrected (resume remaining IDs come from run events); plan_completion_candidate reason value unchanged, its type doc and the watch_events rendering now say 'plan tasks closed (Done or Cancelled)'.

2026-09-23 follow-up (lead ruling): the no-actionable-tasks terminal fires only when at least one task is not Done; all Done with unchecked acceptance criteria stays pending so the coordinator is re-invoked as before (pinned by a runStage test, seen red first).

2026-09-23 (codex QM-review fix): (1) Restored the live Cancelled-dependency check at step start in lib/driver/drive-scheduler-backend.ts (getTask + getTaskStatuses, active then archived) — f1c1acf's run-start snapshot let a dependency Cancelled after run_started go unnoticed (repro started TASK-002). drive-graph-runner keeps the up-front rejection of selected Cancelled tasks and fail-closed read (assertDriveTasksRunnable); DriveTaskStatusSnapshot removed. Removed the 'resolves dependency statuses once' test (pinned the snapshot, INV-007); added 'blocks a dependent whose dependency is Cancelled after the run starts' via runDriveOnGraph, seen red before the fix. (2) tests/tasks/task-manager.test.ts: executable-frontmatter marker moved from /tmp/archive-pwned into the test's temp dir, global cleanup dropped; reverting assertYamlFrontmatter in lib/tasks/task-parser.ts (cp backup) turns it red.
