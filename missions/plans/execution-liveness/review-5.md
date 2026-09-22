# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The mandatory backend control type cannot represent two current backends or nested runs"
  plan_refs: plan.md:652-655, plan.md:702-725, plan.md:934-946
  code_refs: lib/driver/drive-scheduler-backend.ts:164-199, lib/driver/shell-command-finalizer.ts:56-98, lib/orchestration/durable-chain-runner.ts:78-96, lib/orchestration/types.ts:423-426
  description: |
    The revised `BackendHandle` requires one `BackendControlDescriptor`, but the descriptor union contains only POSIX groups, direct processes, and Pi sessions. The current Drive scheduler backend starts an in-process `runDriveTaskStep` before its preflight and before any lower CLI/Pi execution exists, while the `shell-command` finalizer is entirely an in-process promise. The “attempt-local controller” promised in Design §7 has no descriptor variant, and treating the host process as `direct-process` would make a fresh reconciler kill an interactive/tool host rather than one attempt.

    The same contract says `registerDescendant` accepts only a `BackendControlDescriptor`, while Design §7 and B-009 require nested run IDs to be persisted and settled. A nested `RunRef` is not representable by that parameter. Implemented literally, workers must fabricate a process/session control, reject current Drive finalizers, or leave nested runs outside settlement. Define the local-only execution control and logical descendant data shapes before task decomposition; R-004's refusal pivot cannot solve this while the overview requires every current production backend to remain in the slice.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "The release-ready rule strands every crash that occurs inside a critical section"
  plan_refs: D-018, plan.md:778-814, plan.md:972-978
  code_refs: lib/entity-file-lock.ts:65-75, lib/entity-file-lock.ts:78-115, lib/entity-file-lock.ts:321-350
  description: |
    D-018 writes `release-ready` only after the awaited action ends and permits a later process to reclaim only a matching release-ready owner. A process that crashes after D-017 persists an effect intent, during external publication, or before recording its receipt never reaches that marker. The fresh recovery process described at plan.md:810-813 therefore cannot acquire the step lock to compare expected/candidate state or resolve the intent.

    The current lock avoids this permanent state by reclaiming an exact lock whose PID is dead (`lib/entity-file-lock.ts:101-105`). The revision adds a useful live-PID recovery case but accidentally removes the dead-owner path that D-017's crash recovery needs. This also leaves no safe outcome when backend control registration applied but lock release was unconfirmed: D-018 forbids dispatch/follow-up while a just-spawned, input-held child still needs disposal. Preserve separate exact dead-owner reclamation and completed-live-owner reclamation, with an explicit pre-work child cleanup outcome.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "A torn event tail permanently blocks the transitions needed to end a run"
  plan_refs: plan.md:819-821, Design §8 “Reconciliation state space and exits”, B-001, B-011
  code_refs: lib/durable-runtime/file-store.ts:312-345, lib/durable-runtime/file-store.ts:662-715
  description: |
    The plan requires event allocation to block writes when the persisted tail is malformed, but its claimed exhaustive state table has no malformed-tail recovery or terminal exit. The existing event store appends a JSON line directly; process death can leave a partial final line, and the existing reader already recognizes that state as `malformed_event_json`.

    Under the planned shared event/run transition boundary, a later watchdog or status invocation can then diagnose the tail but cannot append the stop/finalization transition. The attempt can remain `running` even while a framework process is able to act, contradicting immutable INV-002 and B-001. Define a safe, sequence-preserving torn-tail recovery or a separate absorbing failure record; “block writes” alone is a state with no exit.

- id: PR-004
  dimension: architecture-record
  severity: medium
  title: "RunStore is assigned execution of Driver effects despite the storage-only architecture boundary"
  plan_refs: Architecture Context boundary rules, D-017, plan.md:752-814
  code_refs: missions/architecture/orchestration-future.md:176-183, missions/architecture/orchestration-future.md:201-206, lib/driver/drive-finalization.ts:70-108
  description: |
    The architecture record limits Evidence and persistence to atomic persistence over storage primitives, assigns attempt execution/cancellation to backends, and lets durable runtime depend on backend contracts plus `RunStore`. The proposed `RunStore.commitStepEffect(input, publish)` instead invokes a Driver-supplied Git/task publication callback while the file-store step lock is held. That makes the persistence implementation the control owner of an external execution effect, not merely the owner of its intent, receipt, and fencing checks.

    The plan's Stage 0 synchronization names only D-007 and the universal envelope; it does not amend this Boundary Model. Either bring the transaction design back inside the recorded dependency direction or synchronize the architecture record through the deviation protocol before implementation. A remediation that changes the active Boundary Model touches architecture-of-record ground, not ordinary plan prose.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "The temporary-index commit protocol does not preserve the current candidate tree or commit policy"
  plan_refs: D-017, B-012, plan.md:793-813, plan.md:1004-1012
  code_refs: lib/driver/drive-finalization.ts:93-108, lib/driver/drive-finalization.ts:816-885, lib/driver/drive-finalization.ts:430-469
  description: |
    Current source finalization stages all non-missions/non-memory paths against the existing index and runs `git commit`; current state finalization runs `git commit` with exact task pathspecs. The replacement mandates a temporary index, `write-tree`, `commit-tree`, and CAS `update-ref`, but never says how the temporary index is seeded from the expected commit. An empty index would make every excluded tracked path disappear from the candidate tree, while copying the real index can import unrelated pre-staged changes.

    The plan also does not disposition the current `git commit` hook/signing behavior. A config-isolated live help probe confirmed the proposed `commit-tree` and `update-ref <ref> <new> [<old>]` forms, but those commands do not define the missing baseline or hook pipeline. Specify exact tree seeding/path selection and hook/signing semantics. Deliberately dropping existing Drive commit policy would change B-012 and immutable AC-018, so that alternative requires human approval rather than an implementation choice.

- id: PR-006
  dimension: user-experience
  severity: medium
  title: "Strict launch validation can make frozen runs impossible to observe or reconcile"
  plan_refs: B-001, B-005, plan.md:590-608, plan.md:887-904, Files to Change config and CLI entries
  code_refs: cli/run/subcommand.ts:59-102, cli/run/subcommand.ts:163-176, lib/runtime.ts:123-138, lib/config/loader.ts:57-97
  description: |
    The plan says malformed `liveness` values refuse launch and that status/watch reconcile an existing run from its frozen snapshot, but it does not define an error-bearing config contract or exempt observation from current config validation. Today both `run status` and `run watch` bootstrap a full `CosmonautsRuntime`, which calls `loadProjectConfig` before opening the run store; loader-level validation errors therefore occur before reconciliation.

    If an operator makes the current liveness block invalid after a run starts, a literal strict-loader implementation can disable the very status/watch first-opportunity path D-013 relies on, even though that run must not re-resolve policy. Define launch-only liveness rejection and an observation composition path that can still read and reconcile frozen runs while reporting the unrelated current config error.

- id: PR-007
  dimension: quality-contract
  severity: low
  title: "The plan persists run-time analysis binding state"
  plan_refs: plan.md:77-81, R-012
  code_refs: domains/shared/skills/work-artifacts/references/gate-contracts.md:16-22, domains/shared/skills/work-artifacts/references/gate-contracts.md:31-33
  description: |
    Architecture Context records that complexity, duplication, boundary-conformance, and trace are unbound with `execution-not-consented`. Binding state is a run-time fact and the artifact contract explicitly forbids writing predicted/current bindings into a plan. Keep R-012 as a work-specific risk about undiscovered parallel writers, but remove the persisted capability-state report.

## Prior Findings

| Finding | Status | Disposition |
|---|---|---|
| `review-2.md PR-001` | resolved | D-003 and Design §1 compose the configured baseline with the explicit/default Drive cap and select the earlier deadline (`plan.md:107-119`, `plan.md:595-605`). |
| `review-2.md PR-002` | resolved | Human D-013 and amended INV-002 adopt first-opportunity enforcement and fence every later promotion (`plan.md:223-241`, `plan.md:403-417`). |
| `review-2.md PR-003` | resolved | Chain `timeoutMs` remains one absolute whole-chain budget and each attempt takes the earlier bound (`plan.md:107-119`, `plan.md:1050-1059`). |
| `review-2.md PR-004` | resolved | D-009 applies settlement grace to caller cancellation, and Design §6 fixes completion/stop ordering and names launcher reaping (`plan.md:184-193`, `plan.md:914-930`). |
| `review-2.md PR-005` | resolved | D-006 removes raw lifecycle writers from scheduler-facing contracts and Design §4 gives known writers an explicit disposition (`plan.md:140-152`, `plan.md:752-828`). |
| `review-2.md PR-006` | resolved | D-015/D-020 and Design §5 define host continuity, observer identity, epoch changes, and hard-proof ordering (`plan.md:262-276`, `plan.md:347-361`, `plan.md:830-876`). |
| `review-2.md PR-007` | resolved | D-012 and Design §10 require a pre-completion Chain start handle and immediate CLI/tool publication (`plan.md:214-221`, `plan.md:1057-1059`). |
| `review-2.md PR-008` | resolved | The compiler is now an explicit owner in Files to Change (`plan.md:1138-1141`). |
| `review-2.md PR-009` | resolved | D-002 now calls four hours a human risk-tolerance choice with unknown error rates rather than an evidence-derived duration (`plan.md:96-105`). |
| `review-2.md PR-010` | resolved | B-010 states concrete blocked/failed/cancelled/stale priority outcomes (`plan.md:516-525`). |
| `review-3.md PR-001` | resolved | D-003 and the composition table give every Drive task both the configured baseline and its preserved cap (`plan.md:107-119`, `plan.md:595-605`). |
| `review-3.md PR-002` | resolved | Human D-013 supersedes the impossible continuous-local-enforcer premise with first-opportunity enforcement (`plan.md:223-241`). |
| `review-3.md PR-003` | resolved | The global Chain deadline is preserved without per-step reset (`plan.md:107-119`, `plan.md:1050-1055`). |
| `review-3.md PR-004` | resolved | Caller stop, normal/start completion, deadline priority, settlement, and launcher reaping now have explicit outcomes (`plan.md:691-695`, `plan.md:914-926`). |
| `review-3.md PR-005` | resolved | D-006 and Design §4 remove/narrow raw lifecycle APIs and list the conditional transition families (`plan.md:140-152`, `plan.md:752-828`). |
| `review-3.md PR-006` | resolved | D-015 replaces process epochs with a cross-process host epoch, while D-020 defines conservative hard-ceiling comparison (`plan.md:262-276`, `plan.md:347-361`). |
| `review-3.md PR-007` | resolved | D-012 and B-001 make exact Chain identity part of launch (`plan.md:214-221`, `plan.md:403-417`). |
| `review-3.md PR-008` | resolved | AC-018 is now in this slice through D-001, B-012, R-013, and Stage 8 (`plan.md:85-94`, `plan.md:538-546`, `plan.md:1214-1216`, `plan.md:1267-1273`). |
| `review-3.md PR-009` | resolved | `lib/orchestration/durable-chain-compiler.ts` is explicitly listed as an owner (`plan.md:1138-1141`). |
| `review-3.md PR-010` | resolved | The human-selected four-hour default and its uncertainty are recorded in D-002 (`plan.md:96-105`). |
| `review-3.md PR-011` | resolved | B-010 carries the concrete no-runnable-work projection semantics (`plan.md:516-525`). |
| `review-4.md PR-001` | unresolved | D-014 adds start/control APIs, but their mandatory descriptor cannot represent the current in-process Drive wrapper/finalizer or a nested run; see PR-001 (`plan.md:243-260`, `plan.md:652-725`). |
| `review-4.md PR-002` | resolved | D-015 separates observer identity from host continuity and D-020 makes either trusted hard proof decisive (`plan.md:262-276`, `plan.md:347-361`, `plan.md:830-876`). |
| `review-4.md PR-003` | resolved | D-016 preserves immutable stop intent plus append-only dispatch across requested/settled/unconfirmed states and adds `recordStepStopDispatch` (`plan.md:278-291`, `plan.md:634-650`, `plan.md:758-766`). |
| `review-4.md PR-004` | unresolved | D-017 closes the ordinary check-to-write race, but D-018 makes its advertised crash recovery unreachable when the process dies before `release-ready`; see PR-002 (`plan.md:293-328`, `plan.md:793-814`). |

## Missing Coverage

- The CLI start barrier still says only “prompt input held.” `Bun.spawn` starts the external program immediately (`lib/driver/backends/cli-process.ts:65-72`), so the plan does not establish a pre-exec handshake that prevents project startup hooks/plugins from mutating before control registration.
- The task-effect protocol does not place the existing per-task episode transition lock in the declared repository → step → event order or define how concurrent ordinary `TaskManager.updateTask()` calls participate in the expected/candidate digest CAS.
- `StopDispatchAttempt` permits `failed`, but aggregate `StopDispatchRecord.status` has no failed state and the exit audit says only pending → delivered/unavailable; the retry/terminal diagnostic meaning of an all-failed dispatch remains unspecified.
- B-001 says the reconciling process reaches terminal/blocked within grace, while D-021 lets a cancelled observer exit with no background reconciler. The behavior spine does not state the resulting next-trigger exception that Design §6 relies on.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Static TypeScript boundaries were checked for every proposed store, backend, Chain, Drive, Pi, process, task, config, and observation integration; Git `commit-tree`, `read-tree`, and `update-ref` usage was safely probed with system/global config disabled. Installed Claude and Codex CLIs were not invoked because no reviewed mechanism guarantees disabling user/project configuration, hooks, or plugins, so their claimed pre-prompt behavior remains unchecked.
  findings: PR-001, PR-005, PR-006

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`); manual searches were used for integration orientation only and no capability-backed duplicate-path claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced attempt authority, controls, descendants, lock ownership/release, effect intents/receipts, event tails/cursors, compatibility projection, policy snapshots, and observation across process loss and resume.
  findings: PR-001, PR-002, PR-003, PR-006

- dimension: risk-blast-radius
  status: checked
  checked: Walked deadline stops, owner/process loss, pre-work registration, Drive Git/task publication, malformed persistence, invalid current config, legacy projection, and preserved commit behavior through user-visible outcomes.
  findings: PR-001, PR-002, PR-003, PR-005, PR-006

- dimension: user-experience
  status: checked
  checked: Walked Chain/Drive launch, early identity, status/watch mutation and cancellation, invalid config after launch, blocked replacement guidance, and legacy Drive status/resume.
  findings: PR-003, PR-005, PR-006

- dimension: behavior-spec
  status: checked
  checked: Checked all twelve behaviors for AC traceability, shipped entry points, observable outcomes, preservation, and material failure cases.
  findings: PR-001, PR-003, PR-006

- dimension: architecture-record
  status: unchecked
  checked: Textually compared Architecture Context and D-014–D-021 with `orchestration-future.md`; runtime boundary conformance is unchecked because `boundary-conformance` is unbound and the architecture-map index is missing.
  findings: PR-004

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables, binding predictions, tool/command declarations, separate quality lists, and pre-named tests.
  findings: PR-007

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked every temporary state and exit for backend registration, stop dispatch, grace, lock release, effect crash recovery, malformed events, clock epochs, owner lapse, terminal absorption, and projection retry.
  findings: PR-002, PR-003, PR-006

- dimension: constraint-ownership
  status: checked
  checked: Traced D-014–D-021, architecture boundaries, every Files to Change owner, AC-018 preservation, lock order, Git publication, and prior-review dispositions into current concrete writers and adapters.
  findings: PR-001, PR-004, PR-005, PR-007

- dimension: scope-size
  status: checked
  checked: Counted twelve behavior clusters and checked the AC-001–AC-013 plus AC-018 slice and staged implementation order against the at-most-12 guidance.
  findings: none

## Assessment

The plan remains viable but is not implementation-ready. Fix the unrepresentable backend/descendant control contract and the crash-unrecoverable lock rule first; together they make the core stop and effect protocols impossible for current production paths despite D-014–D-018's stated intent.
