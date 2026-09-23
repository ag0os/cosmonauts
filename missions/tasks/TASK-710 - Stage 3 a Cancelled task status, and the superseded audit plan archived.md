---
id: TASK-710
title: 'Stage 3: a Cancelled task status, and the superseded audit plan archived'
status: To Do
priority: high
labels:
  - 'plan:framework-health'
  - backend
dependencies:
  - TASK-711
createdAt: '2026-09-22T19:37:54.114Z'
updatedAt: '2026-09-23T13:20:00.000Z'
---

## Description

Framework-health Stage 3 (B-012; D-026, D-028, D-031, D-035). Add Cancelled to TaskStatus and to every shipped consumer in one change — find them by searching production code for the status literals and record the list (known: the persisted-task parser lib/tasks/task-parser.ts, which maps unknown values to To Do; Drive's plan-completion candidate; domains/shared/capabilities/tasks.md): task_edit schema, CLI status parser, artifact viewer counts, Drive and coordinator selection (excluded like Done), dependency resolution (a Cancelled dependency is never satisfied, active or archived; archived resolution reads the persisted status), plan archive (accepts Done and Cancelled), and the task/plan guidance — including the shipped prose that today makes completion conditional on all tasks being Done (coordinator and quality-manager prompts, drive skill and capability, the external cosmonauts and plans skills, the plan skill, and the packaged implement-plan command; D-031, D-035; and, per D-036, the spawning skill's "coordinator loops until all tasks are Done", lib/driver/README.md's completion-candidate rule, Drive resume finalization in cli/drive/subcommand.ts, and lib/driver/run-run-loop.ts's completion check unless TASK-709 has deleted that file), rewritten by reviewed diff so Cancelled counts as closed and is never selected. Then set TASK-706 and TASK-707 to Cancelled leaving their acceptance criteria and notes byte-identical, mark test-health-audit completed, and archive it. Test-first through the real entry points with synthetic tasks.

<!-- AC:BEGIN -->
- [ ] #1 A task saved as Cancelled is read back as Cancelled by a fresh process; a plan whose tasks are all Done or Cancelled is a completion candidate; task_edit and the CLI accept status Cancelled; the viewer counts it; a plan whose tasks are all Done or Cancelled can be archived, and one with a Cancelled task and no others still open is archived by the ordinary command.
- [ ] #2 Drive and the coordinator never select a Cancelled task; a task depending on a Cancelled task stays blocked before and after the plan is archived (seen red before the change).
- [ ] #3 TASK-706 and TASK-707 are Cancelled with acceptance criteria and notes byte-identical to before; test-health-audit is completed and lives under missions/archive/plans/.
- [ ] #4 The task's notes list every status-literal site the search found (code and shipped prose, including the four D-036 paths) with its disposition; Drive resume finalization treats a Cancelled task as closed (seen red before the change).
- [ ] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
