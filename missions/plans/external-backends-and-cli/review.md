# Plan Review: external-backends-and-cli

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "run-step cannot construct Plan 1's runOneTask context from the specified spec.json"
  plan_refs: plan.md:184-223, plan.md:237-239, plan.md:398, plan.md:414-415, plan.md:466-467
  code_refs: missions/plans/driver-primitives/plan.md:86-90, missions/plans/driver-primitives/plan.md:186-199, missions/plans/driver-primitives/plan.md:343-357, lib/tasks/task-manager.ts:58-68
  description: |
    The binary sketch reads `spec.projectRoot`, `spec.parentSessionId`, and `spec.runId`, calls `new TaskManager(spec.projectRoot)`, then calls `taskManager.initialize()`. Plan 1's `DriverRunSpec` contract contains `planSlug`, `taskIds`, `backendName`, prompt/verification fields, `workdir`, `eventLogPath`, and timeout, but not `projectRoot`, `parentSessionId`, or `runId`; `parentSessionId` is in `DriverDeps`/`RunOneTaskCtx`, not the spec. The existing `TaskManager` constructor takes a project root, but its initialization method is `init()`, not `initialize()`.

    The same sketch imports `resolveBackend` from `./backends/registry.ts`, while Plan 1 explicitly says the driver does not use a name-only registry and constructs concrete backends at the tool boundary because backend dependencies vary. Plan 3 can add a registry, but it must define a new serializable detached-step spec and backend-deps shape instead of claiming it is reusing a Plan 1 registry/spec unchanged.

- id: PR-002
  dimension: state-sync
  severity: high
  title: "Detached mode does not define who owns and releases the plan-level lock"
  plan_refs: plan.md:237-248, plan.md:388-404, plan.md:253-268
  code_refs: missions/plans/driver-primitives/plan.md:62-65, missions/plans/driver-primitives/plan.md:372-390
  description: |
    Plan 3 says `startDetached` acquires Plan 1's plan-level lock, spawns `nohup bash run.sh`, writes `run.pid`, and returns. Plan 1's lock is a file at `missions/sessions/<planSlug>/driver.lock`; `runInline` releases it on exit, and stale-lock detection is based on the PID recorded in that lock. The generated bash script only removes `run.pid`; it never owns or releases `driver.lock`.

    If the lock records the parent cosmonauts PID, then a same-plan detached run can be misclassified as stale once the parent CLI/tool process exits, allowing a second invocation to break the lock while the bash/binary worker is still committing. If the parent process stays alive, the plan can remain locked after the detached run finishes because neither bash nor the step binary releases the lock. This needs a precise detached lock ownership/release design before implementation.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "Per-task binary loop drops run-level finalization and violates partial-stop semantics"
  plan_refs: plan.md:214-223, plan.md:263-268, plan.md:403, plan.md:416, plan.md:418-424
  code_refs: missions/plans/driver-primitives/plan.md:68-70, missions/plans/driver-primitives/plan.md:372-374, missions/plans/driver-primitives/plan.md:483-486, missions/plans/driver-primitives/plan.md:508-510
  description: |
    Plan 1's `runInline` owns the sequential loop, emits `run_started`/`run_completed`/`run_aborted`, releases the lock, and applies the default `partialMode: "stop"` policy. Plan 3 replaces that loop with bash calling `runOneTask` once per task. `runOneTask` returns only `done | blocked | partial`; it is not specified to emit final run events or release run resources.

    The binary exits 0 for `partial`, so the bash loop continues to the next task even though Plan 1 says partial commits progress, emits `task_blocked`, and aborts/stops by default unless `partialMode === "continue"`. On a blocked task, bash logs to `master.log` and exits 1, but no component emits `run_aborted`; on all tasks done, no component emits `run_completed`. The JSONL bridge/result logic that stops on final run events can therefore hang or never report a final DriverResult.

- id: PR-004
  dimension: state-sync
  severity: high
  title: "Cross-plan concurrency is marked fine despite repo-scoped git operations"
  plan_refs: plan.md:51, plan.md:485-486
  code_refs: missions/plans/driver-primitives/plan.md:29-31, missions/plans/driver-primitives/plan.md:473-481
  description: |
    Plan 3 explicitly excludes a multi-process mutex across drive runs on different plans and says cross-plan concurrency is fine. Plan 1's loop uses repo-scoped `git status --porcelain`, `git add`, and `git commit` for driver-side commits. Two detached runs for different plans in the same repository can therefore race on `.git/index.lock`, stage each other's files, or commit mixed work even though their plan-level locks do not conflict.

    This is not just a theoretical detached concern: the driver commit contract is repository-global. The plan should either add a repo/worktree-level mutex for commit-capable modes or classify cross-plan same-repo detached execution as unsupported/unsafe with a tested guard.

- id: PR-005
  dimension: user-experience
  severity: medium
  title: "status/list rely on run.pid even though the runner removes it on every exit"
  plan_refs: plan.md:41, plan.md:105-108, plan.md:260-268, plan.md:355-361, plan.md:549-558
  code_refs: missions/plans/driver-primitives/plan.md:56-58, missions/plans/driver-primitives/plan.md:116-118
  description: |
    The generated runner installs `trap 'rm -f "$WORKDIR/run.pid"' EXIT`, which runs for both success and failure. But `cosmonauts drive status <runId>` is specified as reading `run.pid`, and `drive list` scans `missions/sessions/*/runs/*/run.pid`. QC-009 also requires `status` to report `completed` after `run_completed`.

    After a clean run, `run.pid` is gone, so a status implementation that reads `run.pid` has no primary lookup record. After a blocked/non-zero step, the trap also removes the PID file, so users lose the process record needed to distinguish failed, dead, and completed runs. The plan needs a durable run metadata file separate from the live PID marker, or status/list semantics must be narrowed and QC-009 changed.

- id: PR-006
  dimension: quality-contract
  severity: medium
  title: "Binary compilation is only manually smoke-tested and package.json is not in scope"
  plan_refs: plan.md:374, plan.md:561-565, plan.md:578
  code_refs: package.json:27-35, /Users/cosmos/Projects/claude-forge/scripts/compile.ts:48-52
  description: |
    Implementation step 4 says to manually smoke-test `bun build --compile ...` and add scripts to `package.json`, but `package.json` is not listed in Files to Change. The current project scripts contain lint/typecheck/test only. The claude-forge reference also performs a static asset generation step before compiling; Plan 3 does not state whether cosmonauts needs an equivalent asset strategy or why it is unnecessary.

    QC-011 checks the final binary later, but the implementation order claims each step stays green independently. Without an automated compile test or package script in the plan scope, workers can land `run-step.ts` that typechecks but fails `bun build --compile` until a late integration step.

## Missing Coverage

- Prior F-001 is addressed: QC-007 now asserts behavioral equivalence and explicitly excludes identical SHAs; D-P3-11 states commit timestamps are not frozen.
- Prior F-002 is addressed at the plan level: `shellCommandTemplate` is removed and codex/claude sketches use child-process spawning, not shell strings.
- Prior F-003 is mostly addressed: the bridge now specifies missing-file handling, trailing buffers, parse retry, and auto-stop. The plan should still state whether permanently malformed complete JSONL lines block later valid events forever.
- Prior F-004 and F-005 are addressed: the dirty-tree check is before invocation, and `createDriveProgram(): Command` matches the zero-arg subcommand factory pattern. The `cli/main.ts:106` references are stale; the actual dispatch table is at `cli/main.ts:658-688`.
- Prior F-006 is partially addressed by the compiled binary, but only if PR-001's detached spec/backend reconstruction issue is fixed; there is no runtime `cosmonauts` PATH lookup in the hot path as written.
- Prior F-007 is addressed in scope/tests, but PR-005 shows the `run.pid` lifecycle conflicts with the promised status behavior.
- Backend child cleanup on external kill is not specified: Node/Bun `spawn(..., { signal })` covers planned abort signals, but killing the step binary itself does not automatically kill its `codex`/`claude` child process.
- Binary size/time estimates are under-supported. A current `bun build --compile cli/main.ts` smoke test in this repo produced a 68 MB binary, larger than the accepted 30-50 MB estimate.

## Assessment

The Q1 pivot is directionally better than shell templates, but the detached execution boundary is not yet coherent. Fix the step-spec/context contract and detached lock/finalization semantics first; otherwise workers will build a binary loop that compiles but cannot safely coordinate runs or report completion.
