# Drive Improvement Observations from `artifact-format-redesign`

Context:

- Plan: `artifact-format-redesign`
- Initial Drive run: `run-017e5ba0-745f-443e-836b-0e906421a5f7`
- Follow-up Drive run: `run-6a43d580-4f46-4241-b0e8-dfb23ef504c4`
- Backend/mode: detached Codex, driver-owned commits
- Verification: `bun run test`, `bun run lint`, `bun run typecheck`

## Observed Problems and Recommendations

| Observed problem / blocker | What happened in this run | Suggested Drive improvement | Why it helps |
|---|---|---|---|
| Commit infrastructure failure was reported as task blocked | `TASK-305` backend reported success and all postflight commands passed, but the driver marked the task `Blocked` because the driver-owned commit failed on `.cosmonauts/driver-commit.lock`. | Split implementation outcome from driver finalization outcome. Add a state/event such as `verified_commit_failed` or `driver_infra_blocked`, preserving that backend + postflight succeeded. | Avoids making a completed implementation look behaviorally blocked. Lets coordinators retry commit/finalization without re-running or re-implementing the task. |
| Ignored commit lock path broke `git add` | Driver attempted `git add --all` with an excluded ignored file path, and Git still rejected `.cosmonauts/driver-commit.lock`. | Keep lock files outside the project commit path, or exclude lock files with a robust glob pathspec such as `.cosmonauts/*.lock`. Add regression coverage for ignored lock files. | Prevents infrastructure files from interfering with source commits. This was fixed locally for this run by broadening the exclusion and adding test coverage. |
| Resume path after commit failure required manual coordination | After `TASK-305` verified but commit failed, I manually committed its source changes, fixed the driver lock bug, marked the task Done, and launched a second run for the remaining task list. | Add a resume/finalize flow for tasks whose backend and postflight passed but commit/status finalization failed. The flow should retry only commit/status finalization or accept an externally supplied commit. | Reduces operator work and avoids rerunning agents for work already verified. Makes Drive more resilient to transient Git or filesystem failures. |
| Driver source commits exclude `missions/`, leaving task state dirty | Per-task driver commits intentionally excluded missions artifacts. After all source work was committed, task state/archive changes still needed separate manual handling. | Make artifact-state persistence explicit: e.g. `stateCommitPolicy: none | final-state-commit | per-task-state-commit`, separate from source commit policy. | Keeps source commits clean while giving coordinators a first-class way to persist task status, plan archive moves, and memory artifacts. |
| Full postflight ran after every task | Each task ran the full project test, lint, and typecheck suite. This was safe but repetitive across 14 tasks. | Support tiered verification: targeted `perTaskPostflightCommands` plus required `finalPostflightCommands`, with an option to run full gates only at dependency boundaries or at the end. | Preserves confidence while reducing run time and cost. The final full gate still protects merge readiness. |
| Parallel execution was unsafe in a shared worktree | The task set touched overlapping skill, prompt, and test files, so I kept Drive sequential despite the user's openness to parallelism. | Add path ownership / conflict metadata to plans or task prompts, then have Drive schedule only non-overlapping tasks in parallel. For stronger isolation, use per-task git worktrees and a merge queue. | Enables safe parallelism when tasks do not conflict, while avoiding same-worktree races for prompt/skill/test edits. |
| Event stream did not distinguish implementation failure from Drive infrastructure failure clearly enough | User-visible events said `TASK-305: blocked` and run aborted, but the important nuance was: backend success + postflight pass + commit failure. | Emit and summarize distinct phases: `backend_success`, `postflight_passed`, `commit_failed`, `status_update_failed`, `driver_infra_blocked`. Include phase outcomes in `watch_events` compact summaries. | Operators can route fixes correctly: code remediation for implementation failures, Drive/runtime remediation for infrastructure failures. |
| Task acceptance checkboxes remain unchecked after completion | Archived task files show status `Done`, but acceptance criteria checkboxes remain unchecked. | Either have Drive check AC boxes when marking a task Done, or change task rendering so ACs are not represented as manual checkboxes when completion is status-driven. | Avoids confusing archived tasks where status says Done but every criterion visually appears incomplete. |
| Backend success reports are useful but not enough for coordination history | `TASK-305` summary file captured backend success and verification, but the durable task note mostly reflected the later commit failure. | Preserve backend report, verification report, and driver finalization report separately in task implementation notes or run artifacts. | Keeps the true history visible: what the agent did, what verification proved, and what the driver failed to finalize. |

## Highest-Value Follow-ups

1. Add a `verified_commit_failed` / `driver_infra_blocked` outcome and resume/finalize path.
2. Keep transient lock files outside commit scope or robustly exclude `*.lock` files, with regression tests.
3. Add configurable source-vs-state commit policy so task status/archive/memory persistence is first-class.
4. Add per-task targeted verification plus final full verification.
5. Add path-aware scheduling or per-task worktrees before enabling parallel Drive runs in one repository.

## Non-Goals from This Observation

These notes are about Drive/orchestration behavior. They do not ask Drive to enforce the new work-artifact contracts yet. Runtime behavior-marker scanning, concrete gate binding, artifact-conformance CLI support, and HTML rendering remain separate follow-up designs.
