# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The backend contract still cannot expose a running process to the stop reconciler"
  plan_refs: Design §5 “Deadline authority, reconciliation triggers, races, and settlement”, Design §6 “Descendant ownership”, Design §8 “Drive integration and result fencing”, Files to Change backend entries
  code_refs: lib/durable-runtime/backends.ts:25-44, lib/driver/backends/types.ts:7-30, lib/driver/backends/cli-process.ts:57-118, lib/driver/drive-scheduler-backend.ts:101-139
  description: |
    The plan says the owner watchdog dispatches through a live handle and a fresh status/watch process may use an exact persisted process control. The current Driver boundary cannot provide either contract: `Backend.run()` returns only `Promise<BackendRunResult>`, `runCliBackendProcess()` keeps the child/group PID private until after `child.exited`, and `createDriveSchedulerBackend().start()` exposes only the eventual result promise. The existing optional `OrchestrationBackend.cancel(handle)` is not implemented by that scheduler backend and cannot be reconstructed by a fresh process.

    The proposed `BackendHandle` adds `completion` and `settlement`, but still has no stop operation, start-time process/session control descriptor, or persistable reconstruction shape. Listing the backend files does not tell independent workers how the PID/session becomes available before completion or how `requestId` makes dispatch idempotent. Implemented literally, current CLI backends can only record dispatch unavailable and block after grace; they cannot be asked to stop once as B-001/AC-001 require. Define the start-time stop/settlement contract and its persisted safe-control representation before task decomposition.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "A fresh observer is mistaken for host suspension, so enforced idle can be postponed indefinitely"
  plan_refs: D-007, B-003, B-004, Design §4 “Owner probing and epoch-aware clock”, Implementation Order stage 4
  code_refs: cli/run/subcommand.ts:52-76, cli/run/subcommand.ts:128-158, lib/durable-runtime/controller.ts:11-53, lib/driver/run-step.ts:70-123
  description: |
    D-007 and Design §4 classify every positive wall gap across a monotonic-epoch mismatch as host-unavailable and exclude it from idle elapsed. The same section explicitly permits process-relative clocks with a per-process epoch. In the current composition, detached Drive runs in the separate `run-step` process, while each `cosmonauts run status` invocation is a fresh CLI process that creates its own controller/store.

    If the owner process is alive but its event loop has stopped renewing, a status process necessarily has a different per-process epoch even though the host was continuously active. The rule excludes the entire silent interval, then B-008's owner probe reports the process alive and preserves it as expired-but-held. Repeating status from another fresh process repeats the epoch mismatch and exclusion, so an `enforce` idle deadline need never fire before the hard ceiling. That violates ratified AC-002/AC-004 and B-003's promised outcome. The clock contract must distinguish actual host unavailability from a change of observer process; fixing it must preserve ratified INV-003's genuine-suspension exclusion rather than counting all gaps as idle.

- id: PR-003
  dimension: state-sync
  severity: medium
  title: "Stop dispatch has neither a durable transition nor durable terminal provenance"
  plan_refs: Design §2 `AttemptStopState`, Design §3 conditional `RunStore`, Design §7 exit audit, Design §10 operator observation contract
  code_refs: lib/durable-runtime/types.ts:253-264, lib/durable-runtime/types.ts:299-355, lib/durable-runtime/backends.ts:25-44
  description: |
    The proposed `requested` stop variant owns `requestId`, reason, request/grace times, and `dispatch`, but the `settled` and `unconfirmed` variants discard all of them. Design §10 nevertheless requires terminal status rows to show the stop request, dispatch, and grace, and ratified INV-007 requires the persisted record to explain why the attempt ended.

    The proposed store interface also has `requestStepStop`, `settleStepAttempt`, and `blockStepAttempt`, but no operation that can change dispatch from `pending` to `dispatched` or `unavailable` after the external delivery attempt. The store cannot know that outcome when it atomically creates intent, and §7's claim that every pending dispatch exits is therefore not represented by a transition. A crash-recovered reconciler cannot tell whether it is retrying an undelivered request or one already sent, while a terminal record loses the evidence entirely. Preserve stop intent/provenance across terminal states and define the authority-checked dispatch-result transition.

- id: PR-004
  dimension: constraint-ownership
  severity: high
  title: "Conditional store results cannot atomically fence Drive's real commits and task writes"
  plan_refs: B-006, Design §3 promotion rule, Design §8 “Drive integration and result fencing”, Files to Change, Implementation Order stage 6
  code_refs: lib/driver/drive-finalization.ts:57-138, lib/driver/drive-finalization.ts:151-223, lib/driver/drive-finalization.ts:309-397, lib/driver/shell-command-finalizer.ts:84-215
  description: |
    B-006 says that after the absolute deadline no source commit, final-state commit, or task transition can land. Design §3 also says a prior conditional check is never a reusable permit. The actual owners of those effects are `finalizeDriveSourceCommit`, `transitionDriveTaskStatus`, and `commitDriveFinalState`: they acquire the repository lock, run Git, and call `TaskManager.updateTask()` with only an `AbortSignal`. `shell-command-finalizer.ts` invokes them without attempt authority or a `RunStore` port.

    None of the proposed conditional store methods wraps an external mutation under the step authority/deadline critical section. Merely checking a conditional result in the listed caller leaves the exact forbidden race: the deadline can become due after the check and before the Git commit or task-file write. `lib/driver/drive-finalization.ts`, the concrete effect owner, is also absent from Files to Change. This needs a defined mutation protocol and an explicit file owner, not another pre-check. Ratified AC-007 must remain true; weakening its post-settlement side-effect guarantee instead would touch ratified acceptance ground and require human approval.

## Missing Coverage

- Cancellation of a grace-waiting `run status` / `run watch` call: the registered tools currently receive an `AbortSignal` but ignore it, and the plan does not state whether cancellation returns immediately, continues reconciliation in the background, or leaves only persisted intent for the next trigger.
- Backward wall-clock movement: the plan preserves non-decreasing hard elapsed but makes the absolute wall deadline authoritative, without stating which one fences an attempt when monotonic elapsed reaches the ceiling while wall time has moved backward.
- Lock-release uncertainty at the new store boundary: `withEntityFileLock` can report that a committed action's release is unconfirmed, but the proposed conditional result variants do not state how the scheduler stops follow-up work after that outcome.
- Drive compatibility state after foreign reconciliation: a fresh status process can terminalize the normalized run while the detached owner is unable to write `run.completion.json`; the plan does not state how legacy Drive status/resume surfaces observe that terminal outcome.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared proposed policy, store, backend handle, stop-control, status/watch, Chain launch, and Driver contracts with the current durable-runtime, CLI backend, Pi session, and Drive finalizer boundaries.
  findings: PR-001, PR-004

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`) per `analysis_status`; no capability-backed duplicate-path claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced persisted authority, clock samples, stop intent/dispatch/settlement, descendants, late evidence, process controls, and Drive side effects across owner, fresh-observer, and restart paths.
  findings: PR-001, PR-002, PR-003, PR-004

- dimension: risk-blast-radius
  status: checked
  checked: Walked owner stall/crash/suspension, fresh status/watch, detached Drive, CLI/Pi cancellation, finalizer commits, task projection, and legacy compatibility state.
  findings: PR-001, PR-002, PR-004

- dimension: user-experience
  status: checked
  checked: Walked early launch identity, policy errors, overdue status/watch, idle enforcement, expired-held reporting, stop progress, terminal evidence, and replacement-run guidance through shipped CLI/tool entry points.
  findings: PR-002, PR-003

- dimension: behavior-spec
  status: checked
  checked: Verified all twelve behaviors use Source/Observer/Entry point/Outcome, cover AC-001 through AC-013 and AC-018, and include material failure outcomes; then checked those outcomes against reachable current composition roots.
  findings: PR-001, PR-002, PR-004

- dimension: architecture-record
  status: unchecked
  checked: Textually compared `orchestration-future.md` D-001/D-007/D-009–D-012 and its Boundary Model with Architecture Context and Stage 0. Runtime boundary conformance could not be capability-checked because `boundary-conformance` is unbound (`fallow`, `execution-not-consented`), and the architecture-map provider reports no available modules.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables, predicted binding states, separate quality-criteria lists, pre-named tests, and authored-prose assertions.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked deadline/idle accounting, epoch changes, owner lapse, stop dispatch, settlement, terminal absorption, external side-effect races, descendant drain, and every temporary state named by the design.
  findings: PR-001, PR-002, PR-003, PR-004

- dimension: constraint-ownership
  status: checked
  checked: Traced Decision Log rules, store operations, backend ports, Files to Change, and Implementation Order into the concrete current process and Drive mutation owners.
  findings: PR-001, PR-003, PR-004

- dimension: scope-size
  status: checked
  checked: Counted twelve behavior clusters and confirmed the first-slice/follow-up split and staged implementation order stay within the project's behavior guidance.
  findings: none

## Assessment

The human amendment makes the overall direction viable, but the plan is still not implementation-ready. Define the start-time backend stop/control contract first; without it the core stop-and-settle behavior is unreachable, and the Drive mutation and persisted dispatch contracts cannot be completed coherently.
