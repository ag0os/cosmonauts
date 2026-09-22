# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The new start context is not connected to either existing backend boundary"
  plan_refs: D-014, D-022, D-029, Design §3 “Start handles, local control, and the pre-exec barrier”
  code_refs: lib/durable-runtime/backends.ts:25-44, lib/driver/backends/types.ts:7-30, lib/driver/drive-scheduler-backend.ts:93-178, lib/driver/backends/cli-process.ts:57-118
  description: |
    The revision defines `BackendStartContext.registerControl/registerDescendant`, but never revises `OrchestrationBackend.start` to receive that context or defines another route by which a backend obtains it. The current durable boundary remains `start(prepared): Promise<BackendHandle<Result>>`. The lower Drive boundary is independently result-only: `Backend.run(invocation): Promise<BackendRunResult>`, and `createDriveSchedulerBackend` starts the whole task wrapper from that promise. Neither interface can publish a broker PID/session before work or report registration rejection/release uncertainty as the plan requires.

    D-022 now supplies representable local and nested descriptor data, but data alone does not make Review 4 PR-001's start-time control path reachable. Define the exact revised `OrchestrationBackend.start` and lower Driver backend signatures, including the result when registration is rejected or release is unconfirmed, before decomposition. This is derived plan ground; no change to immutable INV-001–INV-007 is authorized or needed.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Live-owner reclamation can make the releasing owner delete its successor's lock"
  plan_refs: D-023, Design §4 “Storage-only transitions, effect transactions, and lock recovery”, Design §9 release-uncertainty exits
  code_refs: lib/entity-file-lock.ts:176-218, lib/entity-file-lock.ts:394-421
  description: |
    D-023 adds a path where a contender may reclaim a lock from a still-live exact owner after seeing `release-ready`. The current release path first reads and compares the lock, then performs a separate `unlink`. With the new path, the old owner can read its lock, a contender can atomically rename that entry and acquire a replacement lock, and the old owner's delayed `unlink(lockPath)` can then delete the contender's replacement. A third process may acquire while the contender is in its critical section, producing two effective owners.

    The plan requires reclamation to claim an exact entry but does not impose the same exact-entry rule on normal release, so implementing D-023 atop the named existing protocol creates this race. The release operation itself needs an exact atomic claim/handoff protocol, not read-then-unlink. This finding protects immutable INV-001; weakening single ownership would touch ratified ground and is not a permissible remediation.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "Event corruption handling can rewrite an already-terminal run to blocked"
  plan_refs: D-024, B-007, B-011, Design §5 “Sequence-preserving event-tail recovery”, Design §9 terminal-input row
  code_refs: lib/durable-runtime/file-store.ts:141-158, lib/durable-runtime/file-store.ts:312-345, lib/durable-runtime/status.ts:19-27
  description: |
    D-024 and Design §5 say every complete/interior malformed event or sequence inconsistency writes an absorbing `blocked/event-log-corrupt` canonical record. Design §9 and B-007 separately say terminal lifecycle bytes never change. Those rules collide when structural corruption is discovered after a run is already completed, failed, cancelled, stale, or blocked. The current store does not prevent that literal implementation: `updateRun` rejects terminal-to-nonterminal changes but permits one terminal status to replace another, and `appendEvent` likewise allows a later terminal status.

    Corruption discovered while a run is active needs the independent blocking exit; corruption discovered after terminalization needs diagnostic evidence without changing the first terminal outcome. Make that branch explicit. This is a direct collision with immutable INV-002's “once ended, stays ended” rule; the derived D-024/B-011 mechanism must yield rather than amending the invariant.

- id: PR-004
  dimension: interface-fidelity
  severity: medium
  title: "RunObservationContext is named but no observation or cancellation contract accepts it"
  plan_refs: D-027, D-032, B-001, B-005, Design §§1, 7, and 12
  code_refs: lib/durable-runtime/controller.ts:11-58, domains/shared/extensions/orchestration/run-control-tools.ts:20-72, cli/run/subcommand.ts:59-102
  description: |
    The plan says CLI and tools build a `RunObservationContext` containing the store, clock, owner/control ports, projector, and frozen policy, and that an attached observer's `AbortSignal` bounds its grace wait. No interface for that context is defined, and no revised `runStatus`/`runWatch` signature is shown. Today those functions accept only `(store, ref[, readOptions])`; both registered tools discard their `_signal` and call those read-only signatures directly.

    Without one explicit shared contract, the CLI, tools, controller, and reconciler can be implemented as incompatible paths—especially around current-config diagnostics, atomic cancellation, and the return value after an interrupted grace wait. Define the public observation call shape and cancellation result that all four entry points use.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "The task mutation guard and deferred episode capture have no shared API"
  plan_refs: D-030, Design §4 lock order, Design §10 task-status effect protocol, Files to Change task/memory entries
  code_refs: lib/tasks/task-manager.ts:180-239, lib/memory/episode-transition-lock.ts:57-126, lib/driver/drive-finalization.ts:159-228
  description: |
    D-030 requires ordinary `TaskManager.updateTask()` and managed Drive publication to share one unconditional per-task lock, while Design §10 requires the managed path to keep that guard through digest preparation, the step transaction, atomic replacement, receipt, and confirmed releases, then capture the episode afterward. The current API cannot express that composition: `updateTaskLocked` is private, `updateTask` conditionally bypasses locking when episodic context/config is absent, and status-change capture is owned internally after its own wrapper returns.

    The plan names a “mutation guard” but gives no signature, transaction/result shape, or ownership for deferred capture. Independent TaskManager and Driver workers can therefore only call `updateTask` (releasing too early), duplicate its private parse/rename logic, or introduce a second lock. Define the shared task mutation contract and how accepted managed updates hand episode data back for post-release capture.

- id: PR-006
  dimension: constraint-ownership
  severity: medium
  title: "The Drive CLI policy writer is still absent from Files to Change"
  plan_refs: B-005, B-006, D-027, Design §1, Files to Change CLI entries
  code_refs: cli/drive/subcommand.ts:205-367, cli/drive/subcommand.ts:1044-1111, cli/run/subcommand.ts:104-128
  description: |
    B-005/B-006 cover `cosmonauts run drive`, and Design §1 says Drive CLI and tool writers freeze the resolved liveness snapshot into `spec.json`. The actual CLI owner is `cli/drive/subcommand.ts`: it parses `--task-timeout`, resolves resume defaults, creates `DriverRunSpec`, and chooses frozen versus current fields. The plan lists `cli/run/subcommand.ts` and the registered `driver-tool.ts`, but not this file.

    Implementing the listed ownership literally leaves CLI-launched and resumed Drive runs without the project baseline/candidate snapshot while tool-launched runs can receive it. Add the concrete CLI writer to the file ownership handoff; the generic run subcommand only registers that command and does not build its spec.

## Prior Findings

| Prior item | Status | Revision disposition |
|---|---|---|
| `review-5.md PR-001` | resolved | D-022 and Design §§2–3 add `attempt-local` controls and distinguish execution controls from `nested-run` `RunRef` descendants. The narrower representability defect is fixed; the still-missing call signature is the distinct PR-001 above. |
| `review-5.md PR-002` | resolved | D-023 and Design §§3–4 restore exact dead-owner reclamation, add completed-live-owner reclamation, and permit disposal of the dormant registered resource. PR-002 above is a new release/reclaimer race, not the former no-exit defect. |
| `review-5.md PR-003` | resolved | D-024 and Design §5 provide both sequence-preserving torn-tail repair and an event-log-independent active-run terminal path. PR-003 above concerns the newly introduced terminal-absorption collision. |
| `review-5.md PR-004` | resolved | D-025 makes Driver perform the external publication through an opaque store-owned transaction, while D-033/H-003 keep `orchestration-future.md` unchanged and make a boundary change a stop condition. |
| `review-5.md PR-005` | resolved | D-026 and Design §10 specify expected-tree seeding, exact path selection, real-index isolation, normal hook ordering, signing/identity preservation, ref CAS, and post-commit disposition. |
| `review-5.md PR-006` | resolved | D-027, B-005, and Design §§1/12 separate existing-run observation from `CosmonautsRuntime` and current launch-policy validation. |
| `review-5.md PR-007` | resolved | D-028 removes the binding snapshot; Architecture Context now carries only durable decisions/boundaries and R-012 carries the work-specific undiscovered-writer risk. |
| `review-5.md Missing Coverage — CLI start barrier` | resolved | D-029 and Design §3 replace prompt gating with a broker that cannot execute the target before confirmed registration. PR-001 still requires the exact backend signature that carries this design. |
| `review-5.md Missing Coverage — task-effect lock/CAS` | resolved | D-030 and Design §10 require one unconditional task lock, digest CAS, declared lock order, and post-release episode capture. PR-005 identifies the remaining handoff-contract gap rather than absence of the rule. |
| `review-5.md Missing Coverage — failed dispatch aggregation` | resolved | D-031 and Design §§2/7/9 add aggregate/per-target `failed`, priority, retry with the same request ID, and grace-expiry history. |
| `review-5.md Missing Coverage — grace-waiting observation` | resolved | D-032, revised B-001, and Design §§7/9 make same-trigger completion conditional on attachment and preserve original intent/grace after cancellation. PR-004 identifies the missing shared API, not missing outcome semantics. |
| `review-4.md PR-001` | unresolved | D-022 fixes the descriptor variants, but the proposed `BackendStartContext` is not accepted by the current or proposed `OrchestrationBackend.start`, and the lower Driver backend remains result-only; see PR-001. |
| `review-4.md PR-004` | resolved | D-025 supplies the retained-lock storage-only effect transaction, D-023 restores crash recovery, and D-030 includes task-file CAS and ordinary-writer serialization. The architecture-level mutation protocol and concrete owners now exist, though PR-005 still requires the exact TaskManager handoff API. |

Review 5's ledger for earlier rounds otherwise still holds: every `review-2.md` and `review-3.md` item it marked resolved remains resolved, as do `review-4.md` PR-002 and PR-003. Its unresolved status for `review-4.md` PR-001 still holds; its unresolved status for `review-4.md` PR-004 is superseded by the resolution above.

## Missing Coverage

- A crash after an attempt is marked running but before any control target is registered: with `targets: []`, the stated dispatch priority vacuously reaches `delivered`; the plan does not define the honest aggregate, settlement proof, or start-phase exit for that state.
- The broker's pre-registration launch envelope: D-029 says its startup cannot load project code, but does not state the broker's safe `cwd`, inherited/preload environment policy, or how target cwd/environment are transferred only after registration.
- A crash after Git CAS receipt but before the `post-commit` hook descendant is durably registered: the plan forbids replay but has no persisted “hook owed/not-started” fact from which fresh reconciliation can distinguish omission from settlement.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Statically compared every proposed policy, store, backend, Chain, Drive, Pi-session, task, lock, event, config, and observation boundary with current TypeScript and pinned Pi 0.80.6 docs/types. Installed Claude/Codex CLIs were not invoked because no reviewed mechanism guarantees disabling user/project configuration, hooks, and plugins; their runtime behavior remains unchecked.
  findings: PR-001, PR-004, PR-005, PR-006

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`) per `analysis_status`; manual path reading was used only for interface orientation and no capability-backed duplication claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced attempt-local and persisted controls, nested runs, stop dispatch, lock owner/marker transitions, event recovery, effect intents/receipts, task digests, episode capture, compatibility projection, and restart behavior.
  findings: PR-002, PR-003, PR-005

- dimension: risk-blast-radius
  status: checked
  checked: Walked Chain/Drive launch, owner loss, registration failure, status/watch cancellation, event corruption before and after terminalization, Git/task publication, and CLI resume through user-visible outcomes.
  findings: PR-001, PR-002, PR-003, PR-006

- dimension: user-experience
  status: checked
  checked: Walked CLI/tool Chain and Drive launch, early identity, invalid-current-config observation, attached and cancelled status/watch, stop diagnostics, event-corruption reporting, and replacement-run guidance.
  findings: PR-003, PR-004, PR-006

- dimension: behavior-spec
  status: checked
  checked: Checked all twelve behaviors for AC traceability, shipped observers/entry points, concrete outcomes, failure cases, preservation, and consistency with immutable INV-001–INV-007.
  findings: PR-003

- dimension: architecture-record
  status: unchecked
  checked: Textually compared D-025/D-033 and the plan boundary rules with `missions/architecture/orchestration-future.md`; the storage-only transaction design is directionally conformant. Runtime boundary conformance is unchecked because `boundary-conformance` is unbound (`fallow`, `execution-not-consented`) per `analysis_status`.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables, predicted binding state, separate quality lists, named test files/titles, and authored-prose assertions.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked registration, zero-target dispatch, hard/idle ordering, owner lapse, caller cancellation, settlement grace, lock release/reclaim, effect recovery, post-commit handling, event repair/corruption, and terminal absorption.
  findings: PR-001, PR-002, PR-003

- dimension: constraint-ownership
  status: checked
  checked: Traced D-022–D-033, H-003, every Files to Change entry, backend/task/observation contracts, lock order, and Review 5 dispositions into current concrete composition roots and writers.
  findings: PR-001, PR-004, PR-005, PR-006

- dimension: scope-size
  status: checked
  checked: Counted twelve behavior clusters and checked the AC-001–AC-013 plus AC-018 slice and staged implementation order against the at-most-12 guidance.
  findings: none

## Assessment

The plan remains viable but is not implementation-ready. Define the reachable backend start/registration contracts first, then close the exact-release race; without those, the core stop path is unwired and the proposed live-owner recovery can violate immutable single ownership.
