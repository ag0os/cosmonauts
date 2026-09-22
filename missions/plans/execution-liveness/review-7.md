# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "Backend-directed task edits bypass the attempt fence"
  plan_refs: B-006, D-038, Design §2 permanent fence, Design §10 task mutation, R-005, Files to Change task/memory entry
  code_refs: lib/driver/prompt-template.ts:123-160, cli/tasks/commands/edit.ts:151-190, lib/tasks/task-manager.ts:180-239, lib/driver/backends/cli-process.ts:57-72
  description: |
    Drive deliberately tells Codex and Claude workers to run `cosmonauts task edit <id> --check-ac ...`. That command constructs an ordinary `TaskManager` and calls `updateTask(id, input)`. D-038 makes that operation share a per-task lock, but neither the current call nor the proposed `withTaskMutation(taskId, action)` carries a `RunRef`, `AttemptAuthority`, deadline, or effect fence. Lock serialization therefore cannot make the write conditional on the owning attempt still being current.

    A child that reaches the hard deadline can issue this task edit after the fence closes, including during stop grace; if stop remains unconfirmed, it can also issue it after the step has become blocked. The ordinary update will still acquire the task lock and replace task bytes. That directly contradicts B-006's promise that no late task transition is accepted and ratified AC-007's post-settlement side-effect rule. R-005 acknowledges arbitrary host-source bytes, but this is a framework-prescribed task mutation, and `lib/driver/prompt-template.ts` is not assigned a disposition in Files to Change. The plan must route managed worker task edits through attempt authority or explicitly contain/refuse the backend; weakening AC-007 or the AC-018 Drive contract would touch ratified ground.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "A concurrent observer can block a live post-commit owner in the normal owed-hook gap"
  plan_refs: D-040, B-009, Design §7 grace rule, Design §9 “Git receipt plus hook owed”, Design §10 post-commit flow
  code_refs: lib/driver/drive-finalization.ts:57-109, lib/driver/drive-finalization.ts:853-869, cli/run/subcommand.ts:57-75, cli/run/subcommand.ts:132-174
  description: |
    D-040 creates a normal interval after the ref CAS receipt is persisted and before the owning invocation releases and settles the already-registered dormant hook. It then says any fresh process finding `hook-owed/not-started` blocks as `post-commit-outcome-unconfirmed`; Design §9 repeats “fresh process blocks without replay.” A concurrent `run status` or `run watch` can enter during that ordinary interval while the exact owner is alive and about to release the hook, and permanently win the first terminal outcome.

    That conflicts with B-009 and Design §7, which block an owed hook at grace expiry, not immediately, and can turn a healthy commit into a false terminal block. The existing implementation has no comparable externally observable gap because `git commit` performs ref publication and configured hooks inside one awaited command. D-040 is derived mechanism and must distinguish a live/reachable owner from a crashed or inaccessible owner while retaining the original grace; AC-018's preserved Git policy and immutable first-terminal behavior must not be weakened.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "Fresh reconciliation still has named ports but no callable control contract"
  plan_refs: D-034, D-037, Design §§2-3, Design §§7-9, Design §12 `RunObservationContext`
  code_refs: lib/durable-runtime/backends.ts:17-44, lib/durable-runtime/controller.ts:11-42, lib/process/process-group.ts:13-48, lib/process/process-group.ts:73-112
  description: |
    D-034 now connects `BackendStartContext` to both backend layers and gives an owner-process handle `requestStop()`, which fixes Review 6's narrow start-signature defect. A fresh status/watch process cannot use that handle. It must consume persisted descriptors through the proposed `BackendControlPort`, `NestedRunControlPort`, `AttemptOwnerProbe`, and `CompatibilityProjector`, but the plan defines none of those interfaces' methods or result variants. `BackendCompletion`, `BackendSettlement`, `AttemptMutationRejection`, and the settlement query carried across those ports are likewise only names.

    The current repository has only result-only backend handles, store-only `runStatus`/`runWatch`, and low-level POSIX signal/reap functions; there is no existing generic port whose signature fills the gap. Independent process, Pi, nested-run, reconciler, and observation workers can therefore produce incompatible dispatch and settlement contracts, leaving the fresh-process half of B-001/B-009 unwired. Define the exact probe, dispatch, and settlement signatures, including idempotent request/target identity and unavailable/failed outcomes. This is derived design work; no invariant change is needed. Review 4 PR-001 remains unresolved for this fresh-reconciler portion.

- id: PR-004
  dimension: interface-fidelity
  severity: medium
  title: "The retained effect transaction cannot record a known non-publication"
  plan_refs: D-025, Design §4 `AttemptEffectTransaction`, Design §9 effect exits, Design §10 effect protocol and task conflict
  code_refs: lib/driver/drive-finalization.ts:57-108, lib/driver/drive-finalization.ts:159-228, lib/tasks/task-manager.ts:180-262
  description: |
    The transaction API exposes only `recordReceipt()` and `recordUnconfirmed()`. Yet the state audit says an effect intent may end `absent`, and Design §10 explicitly permits a task digest conflict; the planned Git `update-ref <ref> <candidate> <expected>` can also fail its expected-value CAS with proof that publication did not occur. Those are known non-publications, not uncertainty.

    `RunStore.resolveStepEffect()` is listed separately without an input shape or a rule permitting it to resolve the transaction while that same transaction retains the step lock. Implemented literally, a worker must misrecord a known CAS rejection as unconfirmed, leave the intent pending, or call a second store operation that may reacquire its own retained lock. Add an exact transaction/resolve outcome for absent or conflict and define its close/recovery semantics so every effect intent has the exit Design §9 promises.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "The shared frozen Drive policy still has no `DriverRunSpec` data contract"
  plan_refs: D-003, D-039, B-005, Design §1 policy persistence, Files to Change Drive policy writers
  code_refs: lib/driver/types.ts:32-67, cli/drive/subcommand.ts:1044-1111, domains/shared/extensions/orchestration/driver-tool.ts:340-404, lib/driver/drive-graph-compiler.ts:35-61, lib/driver/event-stream.ts:118-147
  description: |
    D-039 correctly names the missing CLI owner, but “the same shape” is still not specified. Current `DriverRunSpec` carries only `taskTimeoutMs`; the CLI and tool independently construct object literals, while the graph compiler and event sink independently copy that one value into `RunPolicy.timeoutMs`. The proposed `ResolvedLivenessPolicy` models the project baseline but does not define where the independent explicit/resumed/default Drive cap, all candidates and sources, effective deadline, or legacy marker live in `DriverRunSpec`.

    Without an exact field/type contract, the two launch writers, resume loader, compiler, event bridge, and status projection can each serialize a different snapshot while still claiming D-039. Define the shared `DriverRunSpec` liveness member and its mapping into durable run/attempt records. Review 6 PR-006's file-ownership defect is resolved, but its required CLI/tool interoperability is not yet protected by a shared type.

- id: PR-006
  dimension: architecture-record
  severity: medium
  title: "The active architecture record still contradicts the mandatory hard ceiling"
  plan_refs: Architecture Context D-007 paragraph, D-013, D-033, H-003, Implementation Order stage 0
  code_refs: missions/architecture/orchestration-future.md:87-104, spec.md:30-47
  description: |
    The active architecture decision still says hard timeout is optional and that useful active work has no mandatory wall-clock ceiling. Human-ratified, later INV-002 requires an absolute hard ceiling in every mode, and plan D-013 implements that rule. Architecture Context acknowledges the contradiction but D-033 instructs workers to leave the active source of truth unchanged.

    D-033 is derived doer-session ground; it cannot make two human-ratified sources agree. The current plan's implementation direction must continue to obey immutable INV-002, but the architecture-of-record conflict needs a human architecture amendment before this plan can claim conformance. This finding touches ratified architecture ground: the planner may draft the amendment, not silently edit the decision or weaken the spec.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "Visible adapter refusal is required by the design but deferred out of the behavior spine"
  plan_refs: Overview, Architecture Context final boundary rule, D-001, B-001, R-004, R-006, R-007, Implementation Order stages 1 and 8
  code_refs: lib/driver/backends/orchestration-adapter.ts:13-38, lib/driver/backends/cli-process.ts:10-14, lib/driver/backends/cli-process.ts:57-72, lib/process/process-group.ts:13-48
  description: |
    The plan requires unsupported clock, process-control, filesystem, or backend combinations to refuse launch visibly, and Stage 1 must prove every current backend honest. Current code already exposes a concrete incompatible case: Windows deliberately lacks process-group control, while current backend capability records report cancellation unsupported. A visible refusal is therefore a shipped failure outcome, not only an internal proof.

    D-001 nevertheless defers AC-014, and Stage 8 says to confirm AC-014 did not land. None of B-001/B-005/B-009 states what an operator sees when a named launch surface cannot satisfy the control/platform contract. Task decomposition can consequently preserve the stop condition by halting work without delivering or verifying the user-visible refusal required by immutable INV-006. Carry the refusal outcome in an existing launch behavior, or revise the slice declaration; narrowing AC-014 itself would touch ratified acceptance ground.

## Prior Findings

| Prior item | Status | Revision disposition |
|---|---|---|
| `review-6.md PR-001` | resolved | D-034 and Design §3 now revise both `OrchestrationBackend.start/resume` and lower `Backend.start`, pass start contexts, and return discriminated start outcomes. PR-003 concerns the separate fresh-process control port. |
| `review-6.md PR-002` | resolved | D-035 and Design §4 prohibit the former owner's delayed path unlink and make release/reclamation claim one exact generation. |
| `review-6.md PR-003` | resolved | D-036 plus Design §5 branch corruption on current terminal state and add a lowest-level terminal-to-different-terminal rejection. |
| `review-6.md PR-004` | resolved | D-037 and Design §12 define shared signal-bearing `runStatus`/`runWatch` calls and complete/interrupted observations. PR-003 concerns undefined collaborators below that public call shape. |
| `review-6.md PR-005` | resolved | D-038 and Design §10 define `withTaskMutation`, prepared digest/path CAS, release certainty, and deferred TaskManager-owned capture. PR-001 identifies a distinct authority bypass by ordinary worker-issued updates. |
| `review-6.md PR-006` | resolved | D-039 and Files to Change now name `cli/drive/subcommand.ts` as the actual CLI writer. PR-005 identifies the remaining cross-writer serialized type gap. |
| `review-4.md PR-001` | unresolved | D-034 fixes owner-process start/control reachability, but fresh status/watch still has no defined `BackendControlPort`/settlement contract for persisted descriptors; see PR-003. |
| `review-5.md PR-001` | resolved | D-022 retains distinct `attempt-local`, execution-control, and `nested-run` data, and D-034 transports those shapes through both start APIs. |
| `review-5.md PR-002` | resolved | D-023 preserves dead-owner and completed-live-owner recovery, while D-035 removes the old release/reclaimer unlink race with generation-bound retirement. |

Review 6's ledger of earlier rounds still holds for the set it actually covered: every Review 2 and Review 3 item it kept resolved remains resolved, as do Review 4 PR-002/PR-003 and the Review 4 PR-004 transaction-boundary resolution. Its unresolved status for Review 4 PR-001 also still holds for the fresh-process half described in PR-003. That ledger did not disposition Review 1 PR-010; the still-active architecture-policy conflict is reported as PR-006 above.

The three Review 6 missing-coverage repairs are present in narrow form: zero-target start is covered by D-034/B-009, the broker bootstrap envelope by D-034/Design §3, and pre-CAS hook registration by D-040. PR-002 is a new live-owner race introduced by D-040's recovery rule, not the former missing-registration gap.

## Missing Coverage

- Existing normalized event logs interleave unsequenced `StoredRuntimeDiagnostic` records through `FileRunStore.appendDiagnostic()` (`lib/durable-runtime/file-store.ts:357-366`). Design §5 must say whether those valid non-event records remain legal when it validates a contiguous event-envelope prefix, or ordinary diagnostics can be mistaken for structural corruption.
- The outcome of a manually executed `post-commit` hook that returns nonzero is unspecified. Current `git commit` does not let `post-commit` change commit success, while the new `PostCommitHookState` records `failed`; B-012 needs the preserved user-visible result.
- D-035 requires dead-claimant takeover but does not define where the retirement claimant's exact process identity is stored atomically with the exclusive inode claim, or when generation tombstones can be collected without unbounded accumulation.
- Pi session construction loads configured extension paths/factories before returning the real `sessionId` (`lib/orchestration/session-factory.ts:69-128`). The plan should account for project-controlled extension startup that can run before Pi-session registration and may not honor the attempt-local abort signal.
- A title-changing task update changes both task bytes and pathname. The “one atomic replacement” rule needs an achievable filesystem outcome for `expectedPath !== candidatePath`; current code writes the new file and deletes the old in separate operations (`lib/tasks/task-manager.ts:240-262`).

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Statically compared every proposed start, store/effect, observation, policy, task, process, Pi-session, Chain, and Drive boundary with current TypeScript and pinned Pi 0.80.6 docs/types. Claude/Codex runtime startup was not live-probed because no reviewed invocation mechanism guarantees disabling user/project configuration, hooks, and plugins.
  findings: PR-003, PR-004, PR-005

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`); manual reading was used for interface orientation only and no capability-backed duplicate-path conclusion is asserted.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced authority, direct task writes, post-commit obligation, effect intent/receipt/conflict, start/control descriptors, policy snapshots, locks, diagnostics, and compatibility state across owner, observer, crash, and resume paths.
  findings: PR-001, PR-002, PR-004, PR-005

- dimension: risk-blast-radius
  status: checked
  checked: Walked hard/idle stop, surviving backend mutation, concurrent observation during Git publication, unsupported platform launch, task/Git effects, Pi startup, event corruption, and legacy projection through user-visible outcomes.
  findings: PR-001, PR-002, PR-006, PR-007

- dimension: user-experience
  status: checked
  checked: Walked CLI/tool Chain and Drive launch, early identity, unsupported launch, status/watch cancellation and concurrent reconciliation, task updates, post-commit recovery, and replacement-run guidance.
  findings: PR-001, PR-002, PR-005, PR-007

- dimension: behavior-spec
  status: checked
  checked: Checked all twelve behaviors against AC-001–AC-013 and AC-018, shipped entry points, failure cases, immutable INV-001–INV-007, and the declared AC-014–AC-017 slice boundary.
  findings: PR-001, PR-002, PR-007

- dimension: architecture-record
  status: unchecked
  checked: Textually compared the plan with `orchestration-future.md` decisions and Boundary Model. Runtime dependency-direction conformance could not be capability-checked because `boundary-conformance` is unbound (`fallow`, `execution-not-consented`) and the architecture-map index is missing.
  findings: PR-006

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables, predicted bindings, separate quality lists, pre-named tests, and authored-prose assertions.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked start registration, deadline promotion, owner lapse, stop dispatch, descendant/effect settlement, post-commit phases, task CAS, lock retirement, event corruption, first-terminal absorption, and every named temporary-state exit.
  findings: PR-001, PR-002, PR-004

- dimension: constraint-ownership
  status: checked
  checked: Traced D-034–D-040, Files to Change, shared contracts, architecture ground, risks, and implementation stages into the current concrete writers and adapters.
  findings: PR-001, PR-003, PR-004, PR-005, PR-006, PR-007

- dimension: scope-size
  status: checked
  checked: Counted twelve behavior clusters and evaluated the AC-001–AC-013 plus AC-018 slice against the at-most-12 guidance and the plan's required unsupported-adapter outcome.
  findings: PR-007

## Assessment

The revision resolves the six narrow Review 6 defects, but the plan is still not implementation-ready. Fix the unfenced backend task-update path first; it is a current, explicitly instructed mutation route that bypasses the central authority contract and directly violates ratified AC-007.
