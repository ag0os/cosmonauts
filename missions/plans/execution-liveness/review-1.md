# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "Shadow-by-default permits the permanent running state that Intent forbids"
  plan_refs: spec.md:18-21, spec.md:83-99, plan.md:65-68, plan.md:276-281, plan.md:358-365, plan.md:480-483
  code_refs: lib/durable-runtime/scheduler.ts:695-738, missions/tasks/TASK-685 - Decide idle-policy enforcement from live evidence.md:19-24
  description: |
    The Intent requires every in-scope attempt to complete or reach a durable terminal/blocked state, but B-020 requires shadow mode to leave an attempt and its descendants running after both idle and hard deadlines. Heartbeat renewal is independent of useful activity, so a silent process can continue renewing its lease and never enter B-021's expired-lease quarantine. TASK-685 may explicitly defer enforcement and still complete with shadow as the default, leaving exactly the forever-`running` state this plan says it removes.

    This is a collision between ratified Intent, AC-002, and the default-state declaration, not an implementation detail. The planner must halt and obtain a human ruling on whether bounded termination is conditional on enforcement, whether defer can complete the plan, or whether another terminal path applies in shadow; an agent must not silently weaken any of those promises.

- id: PR-002
  dimension: user-experience
  severity: high
  title: "No shipped surface selects liveness mode or resolves Drive's preserved hard cap"
  plan_refs: plan.md:157-169, plan.md:269-281, plan.md:310-336, plan.md:407-437, spec.md:136-155
  code_refs: cli/run/subcommand.ts:47-49, cli/run/subcommand.ts:104-128, cli/drive/subcommand.ts:77-93, cli/drive/subcommand.ts:213-258, lib/durable-runtime/types.ts:78-91, lib/driver/drive-graph-compiler.ts:48-54
  description: |
    B-004 and B-020 use `cosmonauts run chain` / `cosmonauts run drive` and “the liveness mode setting” as their shipped entry points, but neither CLI accepts a liveness mode and no CLI file appears in Files to Change. The existing Drive `--mode` is the unrelated `inline | detached` selector. Adding an internal `RunPolicy` field alone does not make enforcement or shadow selectable by the named observers.

    The unresolved mapping also threatens ratified AC-010/AC-013: Drive's existing task cap must remain enforced after becoming `hardTimeoutMs`, while B-020 says a hard deadline in shadow does not cancel and D-005 makes shadow the default. The plan must define the shipped policy source and exact per-frontend/per-deadline mode mapping, with an implementation owner. Any change to the shadow default or the preserved Drive policy touches ratified ground.

- id: PR-003
  dimension: risk-blast-radius
  severity: high
  title: "Implementation Order violates the human-decided TASK-683 dependency"
  plan_refs: plan.md:464-473
  code_refs: missions/tasks/TASK-683 - Make spawn completion waiters lossless.md:11-12, missions/tasks/TASK-683 - Make spawn completion waiters lossless.md:31-33, lib/orchestration/agent-spawner.ts:225-236, lib/orchestration/spawn-completion-loop.ts:74-85
  description: |
    The plan schedules TASK-683 “in parallel” before TASK-678, but TASK-683 now depends on TASK-678 and its implementation note records the human decision not to ship it first. Removing the current timeout-to-failure behavior while the parent loop still waits on `activeCount()` leaves a hung child bounded only by caller abort, reintroducing an indefinite wait.

    The task dependency is the newer, human-decided ground. Correct the plan's implementation order to match it; do not remove or weaken the task dependency as a formatting fix.

- id: PR-004
  dimension: lifecycle-invariant
  severity: high
  title: "A foreign quarantine pass can revoke a live owner before reacquisition"
  plan_refs: plan.md:140-145, plan.md:224-229, plan.md:255-260, plan.md:283-288, plan.md:303-308, spec.md:25-35, spec.md:109-116, spec.md:146-152
  code_refs: lib/durable-runtime/scheduler.ts:655-679, lib/durable-runtime/scheduler.ts:972-988, lib/entity-file-lock.ts:86-115
  description: |
    B-002/B-017 promise that the current unsuperseded owner can reacquire after expiry or host suspension. AC-014/B-021 simultaneously require a scheduler that does not hold the expired lease to revoke that token and quarantine without confirmed process death. Under B-013's concurrent-resume scenario, the per-step lock only serializes the race: if the foreign invocation obtains it before the waking owner, it quarantines a still-live owner, after which reacquisition is impossible and its eventual result is rejected.

    Clock-discontinuity rebasing does not distinguish a crashed holder from a delayed live holder, especially in a fresh process with no prior monotonic observation. This is a collision among ratified AC-003, AC-014, and INV-001; the planner must escalate the state-space outcome to the human rather than choosing which promise loses during implementation.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "The Decision Log does not establish usable provenance or amendments"
  plan_refs: plan.md:44-129
  code_refs: domains/shared/skills/work-artifacts/references/plan-format.md:18-44, domains/shared/skills/work-artifacts/references/deviation-protocol.md:19-38
  description: |
    D-001 through D-010 are single-paragraph directives with no `Decision`, `Alternatives`, `Why`, or `Decided by` fields and no `INV-###` citation. Under the current protocol their missing provenance makes them ratified by default. D-011 then says “human-accepted ... (derived)” in prose, but a human-approved entry defaults to ratified unless `(derived)` is an explicit title override. D-013/D-014 use another ad hoc nested form.

    The plan therefore cannot reliably tell workers which implementation choices are amend-on-record and which require a stop. Normalize every entry to the current structured shape and reconcile intended mutability from the recorded human decisions; changing mutability by inference would itself be an unauthorized change.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "B-003, B-007, and B-016 remain internal test prescriptions, not behaviors"
  plan_refs: plan.md:121-129, plan.md:147-155, plan.md:178-186, plan.md:245-253
  code_refs: domains/shared/skills/work-artifacts/references/behavior-spine.md:10-17, domains/shared/skills/work-artifacts/references/behavior-spine.md:30-40, domains/shared/extensions/orchestration/spawn-tool.ts:650-682, lib/orchestration/spawn-compiler.ts:60-88, missions/architecture/orchestration-future.md:221-237
  description: |
    These three entries still use Context/Action/Expected and pre-name seams, test files, test titles, and markers. Their actors are internal scheduler/registry components, so a worker can satisfy them with isolated functions rather than a shipped outcome. B-007 also includes a “scheduler-launched spawn” population that does not exist: `spawn_agent` launches a detached promise and `compileSpawnToGraph` has no production caller.

    D-014 explicitly leaves these entries pending a human ruling, so the recent restatement is incomplete under the current behavior contract. Obtain that ruling, preserving the ratified AC-002/003/006/010 substance while moving internal invariants to Design or restating their observable refusal/failure outcomes.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "The restatement changed AC-012's delivery claim and left AC-013 partly orphaned"
  plan_refs: plan.md:121-129, plan.md:217-222, plan.md:358-365, plan.md:480-483, spec.md:142-155
  code_refs: missions/tasks/TASK-681 - Prove and observe Quality Manager liveness.md:19-28, missions/tasks/TASK-683 - Make spawn completion waiters lossless.md:23-28
  description: |
    AC-012 promises a synthetic silent Quality Manager step through `runDurableChain`, and TASK-681 owns exactly that shadow-first proof with an enforced test policy. Restated B-012 instead promises that a human's actual Quality Manager workflow is bounded under enforcement. The plan itself says B-012 proves only the observed synthetic tail and permits TASK-685 to defer production enforcement, so the task can close without delivering the behavior as written. That contradicts D-014's claim that the restatement changed notation only.

    AC-013 is also not named as the Source of any behavior. Its spawn depth/concurrency preservation survives only in TASK-683 AC #4, while coordinator neutrality remains architecture prose. Because AC-012/AC-013 are ratified ground, preserve their letter in the behavior spine or ask the human to approve a substantive change; do not let task-only criteria substitute for plan traceability.

- id: PR-008
  dimension: constraint-ownership
  severity: medium
  title: "Independent tasks have no exact shared lifecycle contracts, and owner files are missing"
  plan_refs: plan.md:292-356, plan.md:387-405, plan.md:407-437, plan.md:464-479
  code_refs: lib/durable-runtime/types.ts:203-239, lib/durable-runtime/types.ts:350-390, lib/durable-runtime/backends.ts:10-55, lib/durable-runtime/run-start.ts:418-447, lib/driver/drive-graph-compiler.ts:48-54, lib/driver/event-stream.ts:139-154, lib/driver/backends/orchestration-adapter.ts:18-40, lib/driver/shell-command-finalizer.ts:33-62
  description: |
    The design lists fields and verbs—claim, renew/reacquire, report activity, finalize, settlement, identity, evidence—but does not define signatures, result variants, rejection semantics, or the exact capability data shape that TASK-677/684/678/682/679/680 must share. The existing `RunStore`, `BackendCapabilities`, optional `cancel()`, and the manually enumerated `schedulerWriteWrapper` are exact interfaces; widening them without a prescribed contract lets sequential workers invent incompatible meanings or omit forwarding methods.

    Files to Change also omits concrete owners of required work: both current `RunPolicy.timeoutMs` writers are in `lib/driver/drive-graph-compiler.ts` and `lib/driver/event-stream.ts`, and production capability declarations include `lib/driver/backends/orchestration-adapter.ts` and `lib/driver/shell-command-finalizer.ts`. “production registrations” is not a flat file owner. Define the shared contracts and list these paths explicitly before implementation.

- id: PR-009
  dimension: quality-contract
  severity: low
  title: "A former gate checklist remains as a separate test contract"
  plan_refs: plan.md:371-385
  code_refs: domains/shared/skills/work-artifacts/references/plan-format.md:76-78, domains/shared/skills/work-artifacts/references/behavior-spine.md:38-49, bundled/coding/prompts/plan-reviewer.md:104-108
  description: |
    The Design section explicitly carries over a former gate table and requires a separate list of cases that “the delivered tests must cover.” Current plans carry quality through observable behavior failure cases and named risks, while the implementer owns test design. Most listed cases already map to B-001/B-004/B-013/B-014/B-016/B-017/B-019; move any missing observable consequence there or into a risk pivot, and remove the standalone test checklist.

- id: PR-010
  dimension: architecture-record
  severity: medium
  title: "Architecture Context omits the boundary rules and delegates architecture authority back to the plan"
  plan_refs: plan.md:23-42, plan.md:98-110, plan.md:371-381
  code_refs: missions/architecture/orchestration-future.md:87-104, missions/architecture/orchestration-future.md:174-219, missions/architecture/orchestration-future.md:479-491, domains/shared/skills/work-artifacts/references/architecture-format.md:13-14, domains/shared/skills/work-artifacts/references/architecture-format.md:38-52
  description: |
    Architecture Context names several decision IDs but does not enumerate the record's relevant dependency rules: frontend authority, scheduler dependencies, backend responsibility, store-owned atomic checks, and explicit failure for incompatible capabilities. A shorter store/scheduler/transport slogan appears later in Design, where downstream integration verification is not told to treat it as the linked boundary contract.

    The universal expiry-quarantine rule is also exact only in plan D-012/spec INV-001; architecture D-007 says it is “further amended by the execution-liveness quarantine ruling.” That makes a child implementation plan the authority for a cross-plan node-attempt boundary, contrary to the architecture format. Update the architecture record/context without changing the human-ratified quarantine substance. Actual dependency conformance remains unchecked because the boundary-analysis capability is unbound.

- id: PR-011
  dimension: behavior-spec
  severity: medium
  title: "The spec still ratifies implementation mechanisms as acceptance criteria"
  plan_refs: spec.md:16-35, spec.md:101-155, plan.md:441-443
  code_refs: domains/shared/skills/work-artifacts/references/spec-format.md:18-44, domains/shared/skills/work-artifacts/references/spec-format.md:46-64, lib/entity-file-lock.ts:86-115, lib/orchestration/session-factory.ts:78-143, lib/driver/drive-scheduler-backend.ts:574-619
  description: |
    The current spec contract requires one explicit goal sentence and outcome-level ACs, leaving structure to Plan Design. This spec uses a two-sentence unlabeled Intent goal and several ACs that prescribe mechanisms: the exact `entity-file-lock` protocol and `.init.lock` exclusion (AC-004), a live registry and cancellation latch (AC-007/008), concrete capability/timer/field changes (AC-010), and the `runDurableChain` function (AC-012). The plan's own risk says the lock mechanism may prove impossible, but every AC's letter is ratified, so the current shape turns a design pivot into a mandatory human escalation.

    Restate product outcomes separately from implementation design and use the current AC shape. Because the existing AC wording is ratified ground, substantive narrowing or replacement requires human approval rather than a planner-only cleanup.

- id: PR-012
  dimension: scope-size
  severity: medium
  title: "Twenty-one behaviors exceed the plan-size guidance without slices or justification"
  plan_refs: plan.md:131-288, plan.md:462-483
  code_refs: bundled/coding/prompts/plan-reviewer.md:127-132, bundled/coding/prompts/planner.md:32-32
  description: |
    The plan contains 21 behaviors and nine implementation tasks. Implementation Order lists tasks, but it neither defines independently reviewable plan slices nor records why one oversized plan is necessary. That exceeds the current at-most-12 guidance and makes the unresolved behavior/contract collisions harder to revise safely.

    The existing clusters provide real split seams: store/ownership and graph finalization; watchdog/backend/Drive policy; and Pi evidence/descendants/Quality Manager plus the human rollout checkpoint. Record explicit slices with dependencies or a concrete justification before task execution.

## Missing Coverage

- Fresh-process reconstruction and cleanup semantics for the session-to-attempt registry, descendant-handle ownership, waiter buffers, and late completions across resume, detached execution, or session replacement.
- An idempotence/coalescing rule for repeated shadow `would-cancel` decisions so a long silent attempt cannot append an unbounded event/metric stream on every watchdog tick.
- The exact `run status` / `run watch` output contract for attempt identity, token state, activity, cancellation hops, session references, and rejected opaque evidence; current status reads only run-level status and diagnostics.
- A shipped operator procedure for starting a replacement run with confirmed-death evidence; the spec requires this recovery while excluding a public RunControl protocol.
- The relationship between B-007's explicit unsupported-combination outcome and the deliberately deferred “silently skipped missing backend mappings” issue.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the plan with the current CLI options, `RunPolicy`/`RunStore`, backend contracts and registrations, Drive timeout writers, Pi 0.80.6 local SDK types/docs, session factory, and spawn paths.
  findings: PR-002, PR-006, PR-008, PR-011

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`). Manual symbol/path searches were used for orientation but are not treated as capability evidence.
  findings: none

- dimension: state-sync
  status: checked
  checked: Reviewed fencing-token authority, lease renewal/quarantine, event allocation, live session registries, descendant handles, waiter buffers, and cross-process implications.
  findings: PR-004, PR-008

- dimension: risk-blast-radius
  status: checked
  checked: Traced shadow deferral, Drive timeout preservation, waiter ordering, cancellation settlement, host suspension, and expiry recovery into user-visible run completion.
  findings: PR-001, PR-002, PR-003, PR-004

- dimension: user-experience
  status: checked
  checked: Walked chain, Drive, status/watch, spawn completion, Quality Manager, resume, shadow/enforce, and replacement-run flows from their shipped commands/tools.
  findings: PR-001, PR-002, PR-007

- dimension: behavior-spec
  status: checked
  checked: Compared all 21 behaviors with the observer/entry-point/outcome contract and traced their `AC-###` sources, including failure and preservation cases.
  findings: PR-006, PR-007, PR-011

- dimension: architecture-record
  status: unchecked
  checked: The architecture record, Decision Log, Boundary Model, and plan linkage were compared textually, but dependency-direction conformance could not be fully checked because `boundary-conformance` is unbound (`fallow`, `execution-not-consented`).
  findings: PR-010

- dimension: quality-contract
  status: checked
  checked: Checked the plan for gate declarations, separate quality criteria, test prescriptions, and placement of work-specific expectations.
  findings: PR-009

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked shadow/enforce, renewal/activity separation, expiry/reacquisition/quarantine races, cancellation settlement, terminal absorption, waiter expiry, and finalization exits.
  findings: PR-001, PR-003, PR-004

- dimension: constraint-ownership
  status: checked
  checked: Traced Decision Log and Design constraints, Files to Change, AC preservation, shared interfaces, and Implementation Order into the nine existing tasks.
  findings: PR-003, PR-005, PR-007, PR-008, PR-010

- dimension: scope-size
  status: checked
  checked: Counted 21 behaviors and evaluated the task/behavior clusters against the at-most-12 guidance and available delivery seams.
  findings: PR-012

## Assessment

The architecture direction remains viable, but the plan is not implementation-ready in the current artifact format. Resolve the ratified shadow-boundedness and expiry/reacquisition collisions with the human first; then repair provenance, behavior reachability, shared contracts, and task ordering before any worker proceeds.
