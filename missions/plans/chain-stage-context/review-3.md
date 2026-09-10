# Plan Review: chain-stage-context

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "A reviewer-established fallback target is never handed to the reviser or task-manager"
  plan_refs: plan.md:9-20, D-001, D-005, B-001, B-006, B-009, B-010, Design §2, Design §4, Design §5
  code_refs: cli/run/subcommand.ts:211-249, cli/chain-execution.ts:20-75, domains/shared/extensions/orchestration/chain-tool.ts:94-111, domains/shared/extensions/orchestration/chain-tool.ts:137-184, lib/orchestration/stage-prompts.ts:22-67, lib/orchestration/chain-runner.ts:612-681, lib/orchestration/durable-chain-compiler.ts:232-283, bundled/coding/chains.ts:4-29, ROADMAP.md:10-12
  description: |
    D-005 allows a reviewer report to establish the run-local target when `resolvePlanSlug(config)` is undefined, but that target is used only as gate state. The normal `cosmonauts run chain plan-and-build "..."` path forwards a user prompt and no plan identity; `completionLabel` is optional in both public entry points, and `executeChainExpression` does not set `ChainConfig.planSlug`. This repository itself has several active plans, so fallback selection is not a theoretical state.

    The designed prompt contract also has no runtime target slot: `StagePromptPurpose.revision` carries only review kind and author identity, inline `prepareStageExecution` derives `planSlug` again from the unchanged config, and the durable compiler freezes every stage's prompt and `planSlug` before the reviewer runs. Therefore reviewer target A can pass the gate while the reviser or task-manager, still told only to operate on “the plan,” edits or decomposes plan B. It also cannot satisfy the spec's User Experience promise that the terminal planner is told which round it is answering. The planner must redesign how the reviewer-established target becomes bounded downstream execution context without forwarding arbitrary prior-stage prose. This changes only derived D-001/D-005; it preserves ratified AC-004 and the scope exclusion on arbitrary output transport.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Addressed evidence can go stale before the task-decomposition guard runs"
  plan_refs: D-004, D-005, D-007, B-008 through B-010, Design §3 through Design §5, Design §8
  code_refs: lib/orchestration/chain-runner.ts:355-386, lib/orchestration/chain-runner.ts:414-432, lib/durable-runtime/scheduler-state.ts:31-75, lib/plans/file-system.ts:128-159
  description: |
    The revision check establishes that round N is the safe highest round at revision finalization, then inline state or durable `run_activity` caches that fact. The proposed task-manager guard checks only the cached target, addressed index, and dependency state. It does not re-assess the plan directory. If another process writes valid round N+1 between revision finalization and task-manager entry, the guard still spawns task-manager even though the active plan's highest round is now unaddressed.

    Nothing in the existing chain loop, scheduler dependency transition, or plan reader provides a lock or version token spanning those two operations. This directly contradicts ratified AC-004, which is stated at the moment the chain reaches task decomposition, and D-007's claim that current plan/review files reconstruct truth. The task-boundary design and B-008/B-010 tests must cover a newer round appearing after addressed evidence; fixing this is an amendment to derived mechanism, not a narrowing of AC-004.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "Durable addressed evidence carries a claimed index but no verifiable producer identity"
  plan_refs: D-007, D-010, B-010, Design §5, Quality Contract criterion 5
  code_refs: lib/durable-runtime/types.ts:237-252, lib/durable-runtime/file-store.ts:831-851, lib/orchestration/durable-chain-runner.ts:215-293, lib/orchestration/chain-event-adapter.ts:87-151
  description: |
    `OrchestrationEvent` defines `run_activity` as `{ runId, details: unknown }`, unlike `step_tool_activity`, which carries a `stepId`. The plan's `plan_review_addressed` detail adds a self-reported `topologyIndex` but no source step ID or role. `FileRunStore.isStoredEvent` validates only the envelope sequence/timestamp/runId relationship; it does not validate the event type or details. Consequently a resumed task guard cannot cross-check that an addressed event was emitted by the actual completed revision step at the claimed topology index.

    Implemented literally, malformed, corrupted, or incorrectly-produced activity with a low index can authorize task-manager. The adapter's planned validation of block activity does not repair the authorization path, and event adjacency cannot identify a producer safely in parallel shapes. The plan must define producer correlation and closed-shape validation at the guard, plus a negative wrong-producer/wrong-index test. This can remain in chain-local details and need not widen the generic event union.

- id: PR-004
  dimension: interface-fidelity
  severity: medium
  title: "The existing plan reader treats missing or invalid status as active"
  plan_refs: D-005, B-005, Design §2, Design §3, Risks (`Filesystem attacks/read failures must be total`)
  code_refs: lib/plans/file-system.ts:79-89, lib/plans/file-system.ts:128-159, lib/plans/plan-manager.ts:112-129, tests/plans/file-system.test.ts:287-306
  description: |
    D-005 requires the reported plan to be active, but the existing plan boundary cannot prove that condition: `parseStatus` deliberately normalizes an absent or unknown frontmatter status to `"active"`, and `PlanManager.getPlan` returns that normalized value. A `review-rounds.ts` implementation that uses the public plan reader will therefore accept a malformed plan as active rather than emit the promised typed block.

    B-005 covers active and completed plans but not missing/invalid status, and Files to Change does not identify a stricter status contract at the existing reader. The planner must specify how the assessor distinguishes an explicitly active plan from invalid frontmatter and add that case to B-005. Otherwise workers must invent whether to duplicate raw frontmatter parsing or change a compatibility-sensitive plan API.

- id: PR-005
  dimension: behavior-spec
  severity: medium
  title: "The spec has neither ratified Intent nor stable acceptance-criterion IDs"
  plan_refs: plan.md:17-21, Behaviors B-001 through B-012, Quality Contract gate 2, spec.md `## Acceptance Criteria`
  code_refs: domains/shared/skills/work-artifacts/references/spec-format.md:5-48, domains/shared/skills/work-artifacts/references/behavior-spine.md:5-21, bundled/coding/prompts/plan-reviewer.md:176-181, tests/prompts/plan-reviewer.test.ts:13-25
  description: |
    This is full planned feature work, but `spec.md` omits the required `## Intent` goal/invariants and its seven acceptance bullets have no `AC-###` IDs. The plan explicitly acknowledges both gaps and invents local ordinal aliases. Those aliases are not durable source links: reordering or inserting a spec bullet changes their meaning without changing any B-### entry, while the Quality Contract still claims bound artifact conformance.

    The missing Intent is especially material here because target propagation, fail-closed task gating, prompt preservation, and public UX can collide during implementation with no ranked invariant to resolve them. Adding or ranking `INV-###` entries creates ratified ground and therefore requires human ratification; the planner must not manufacture it as another derived Decision Log entry. Stable AC labels may be added without changing the ratified letter of the existing criteria, but their text must not be narrowed silently.

## Missing Coverage

- Interruption after a plan-reviewer writes `review-N.md` but before its terminal `COSMO_PLAN_REVIEW` line leaves a durable orphan round. A later run can allocate N+1 and the latest-only citation check can ignore unresolved high/medium findings in N.
- Multiple participating `plan-reviewer` siblings at one topology index can establish different fallback targets in completion/event order; no behavior defines deterministic selection or a typed ambiguity block.
- A topology containing both an exact `plan-reviewer` and a suffix reviewer between the same repeated author pair does not define whether plan-specialized or generic revision purpose wins.
- B-005 rejects symlink review entries but does not cover the plan directory itself being a symlink outside `missions/plans/`; the current joined-path plan reader follows that parent path.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Public CLI/tool chain inputs, static and runtime prompt construction, inline/durable spawn options, plan status parsing, durable activity envelopes, event-store validation, and adapter consumption were compared with the proposed contracts.
  findings: PR-001, PR-003, PR-004
- dimension: duplication
  status: unchecked
  checked: The duplication and trace capabilities report `unbound` with reason `execution-not-consented` from provider `fallow`; no project-wide duplication verdict is claimed. Direct reading compared the proposed terminal parser with the existing Drive report parser only.
  findings: none
- dimension: state-sync
  status: checked
  checked: Expected versus fallback plan identity, downstream plan context, inline cached target/addressed state, durable rehydration, event producer correlation, plan-file freshness, and the unchanged `behaviorsReviewPending` field were traced.
  findings: PR-001, PR-002, PR-003, PR-004
- dimension: risk-blast-radius
  status: checked
  checked: Both shipped planning chains, loop-free custom durable chains, public invocations with and without completion labels, multiple active plans, concurrent/newer review artifacts, restart windows, and task-manager entry were walked.
  findings: PR-001, PR-002, PR-003
- dimension: user-experience
  status: checked
  checked: The operator path from ordinary named-chain invocation through reviewer, revision, task decomposition, visible block, correction, and rerun was reviewed, including ambiguous active-plan selection.
  findings: PR-001, PR-002
- dimension: behavior-spec
  status: checked
  checked: B-001 through B-012 were mapped to the actual unnumbered spec bullets, seams, named tests, failure cases, and the canonical Intent/AC/marker contract.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005
- dimension: architecture-record
  status: unchecked
  checked: `missions/architecture/orchestration-future.md`, `missions/architecture/durable-orchestration-runtime.md`, current runtime types, and the plan's no-new-runtime/no-generic-widening claims were read directly. Project-wide boundary-conformance evidence is unavailable because the capability is unbound (`execution-not-consented`), and the architecture-map capability reports no available modules.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Ordered gate shape, binding/degradation states, task-boundary freshness, target propagation, durable evidence trust, malformed plan status, failure tests, and artifact-conformance claims were reviewed.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005
- dimension: lifecycle-invariant
  status: checked
  checked: Reviewer target entry, revision address transition, task-manager authorization, newer-round races, interruption before/after activity, restart reconstruction, malformed persisted evidence, cancellation, and rerun exits were attacked.
  findings: PR-002, PR-003
- dimension: constraint-ownership
  status: checked
  checked: D-001 through D-010, every Files-to-Change row, generic-runtime exclusions, prompt preservation, task domination, and report/artifact constraints were traced to behaviors and implementation stages. The fallback target handoff and task-boundary freshness constraints have no implementing behavior owner.
  findings: PR-001, PR-002
- dimension: scope-size
  status: checked
  checked: The plan has exactly 12 behaviors, at the project guidance limit, and its behavior clusters/implementation stages remain plausible task units.
  findings: none

## Assessment

The plan is viable with another revision, but it still does not carry one authoritative plan target through the full reviewer → reviser → task-manager flow. Fix that handoff first, then make task-boundary authorization fresh and producer-correlated before treating the fail-closed design as ready for task creation.
