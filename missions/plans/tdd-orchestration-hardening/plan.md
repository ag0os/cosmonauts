---
title: TDD Orchestration Hardening
status: active
createdAt: '2026-04-24T00:00:00.000Z'
updatedAt: '2026-04-28T14:25:41.345Z'
---

## Summary

Revise the TDD hardening plan to remove marker-based phase tracking entirely: each behavior now expands into dependency-linked phase tasks, `tdd-coordinator` dispatches ready `phase:*` tasks by label with coordinator-style conflict checks, and rerun state for behavior review moves into `plan.md` frontmatter instead of artifact existence. This resolves the durable-state and testability issues called out in round 2 while keeping TDD remediation on explicit task primitives.

## Scope

**Included**

- New `behavior-reviewer` agent that adversarially reviews the `## Behaviors` section, writes `missions/plans/<slug>/behavior-review.md`, and sets `behaviorsReviewPending: true` in `plan.md` frontmatter when a revision pass is required.
- Update `tdd-planner.md` so TDD revision mode is gated by `behaviorsReviewPending === true` in plan frontmatter, not by `behavior-review.md` existence; after consuming the review it writes the revised `## Behaviors` content and `behaviorsReviewPending: false` back to the plan in the same `plan_edit` call.
- Keep first-pass detection explicit: if `plan.md` has no `## Behaviors` section, `tdd-planner` creates it; stale `behavior-review.md` files alone are ignored.
- Update the shared `task-manager.md` so TDD plans (identified by a `## Behaviors` section) emit four phase tasks per behavior using existing task primitives only:
  - `<base>-red` — labels include `plan:<slug>` and `phase:red`; dispatched to `test-writer`
  - `<base>-red-verify` — labels include `plan:<slug>` and `phase:red-verify`; depends on `<base>-red`; dispatched to `verifier`
  - `<base>-green` — labels include `plan:<slug>` and `phase:green`; depends on `<base>-red-verify`; dispatched to `implementer`
  - `<base>-refactor` — labels include `plan:<slug>` and `phase:refactor`; depends on `<base>-green`; dispatched to `refactorer`
- Replace the parent behavior task entirely with those four phase tasks. The plan’s `## Behaviors` section remains the human-readable index; no separate tracking row is retained.
- Split each behavior’s content across the phase tasks: `-red` carries the tests to author, `-red-verify` carries per-test failure claims, `-green` carries implementation pointers plus the targets that must now pass, and `-refactor` carries the targets that must remain green.
- Rewrite `tdd-coordinator.md` around ready phase-task dispatch: for each ready `phase:*` task, choose the mapped agent, apply coordinator-style file-conflict sequencing before spawning, and verify/mark task completion for that phase. A phase task is ready iff its status is `To Do` and every dependency ID resolves to `Done`; `tdd-coordinator` computes that manually from plan-scoped `To Do` tasks plus dependency status checks, not via `task_list(hasNoDependencies: true)`. No `select_next_phase` tool, no parsed-marker state table, and no `RED-VERIFIED:` invention.
- Add `verifier` to `tdd-coordinator.subagents`, making the phase-to-agent map `phase:red → test-writer`, `phase:red-verify → verifier`, `phase:green → implementer`, `phase:refactor → refactorer`.
- Extend `bundled/coding/coding/prompts/verifier.md` so named-test `phase:red-verify` claims carry `test_file`, `test_name`, `expected: fails-on-assertion`, and the test-suite command to run, and so per-claim results classify `observed_outcome` as `assertion-failure | test-error | not-collected | compile/startup-error | passed`; GREEN is unblocked only on `assertion-failure`. `bundled/coding/coding/agents/verifier.ts` stays unchanged.
- Carry over `coordinator.md`’s file-conflict rule into `tdd-coordinator.md`: ready phase tasks that touch overlapping files must be sequenced even when the dependency DAG says they are ready. File sets are derived from each task’s `## Test Targets` and `## Implementation Pointers` sections.
- Keep `quality-manager` TDD remediation task-based, but update the contract to match phase tasks:
  - behavior-shaped findings with concrete test targets create the same four phase tasks and run through `chain_run(expression: "tdd-coordinator", ...)`
  - structural findings with no meaningful test target create a single `phase:green` task and run through `chain_run(expression: "coordinator", ...)`
  - planless runs and verifier/project-native failures still fall back to `fixer`
- Update workflow chains `tdd` and `spec-and-tdd` in both `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts` to include `behavior-reviewer` and a second `tdd-planner` pass.
- Add `behavior-reviewer` to `DEFAULT_STAGE_PROMPTS` in `lib/orchestration/chain-runner.ts`.
- Minimal shared plan-infrastructure support for the frontmatter flag in `lib/plans/*` and `domains/shared/extensions/plans/index.ts`, because current plan read/write/edit/view code does not round-trip arbitrary plan-frontmatter fields.
- Test coverage for: the new agent definition; updated subagent allowlists; workflow parity/order; plan frontmatter read/write/edit support for `behaviorsReviewPending`; TDD task-manager phase-task emission guidance; verifier named-test RED-verification claim formatting and outcome classification; `quality-manager` remediation routing from finding prose; and the phase→agent invariant plus ready-task discovery rule for `tdd-coordinator`.

**Excluded**

- Adding a new task schema field such as `phase`; phase stays encoded as labels plus dependencies.
- Keeping or reintroducing a parsed-marker state machine, `RED-VERIFIED:` notes, or any `select_next_phase` helper tool.
- Retaining a parent behavior task in addition to the four phase tasks.
- Introducing a new `tdd-fixer` lineage or forking shared generic agents beyond the targeted TDD-specific insertions already in scope.
- Changing non-TDD task creation semantics; the four-task expansion applies only when the approved plan is a TDD plan with `## Behaviors`.
- Solving deleted/renamed tasks mid-run inside TDD orchestration. With markers removed, malformed handoffs are no longer TDD-specific; task disappearance remains a general task-system concern governed by existing task-tool semantics.

**Assumptions**

- Task IDs remain auto-generated by the task system; `<base>-red` / `-green` / etc. are stable task-title suffixes derived from the behavior heading, and dependencies link the generated IDs after creation.
- Phase tasks can carry enough path hints in `## Test Targets` and `## Implementation Pointers` for `tdd-coordinator` to derive a conservative file set before spawning parallel work.
- Behavior-shaped remediation findings can usually be expressed as at least one observable behavior plus one or more concrete test targets; when they cannot, they are intentionally treated as structural green-only work.

## Decision Log

- **D-001 — Insertion over fork**
  - Decision: Add `behavior-reviewer` as an insertion into the shared TDD chain and keep remediation on the existing quality-manager → task/task-runner path rather than forking generic agents into a separate TDD lineage.
  - Alternatives: Fully parallel TDD-only lineage for all agents; selective fork of `planner`/`quality-manager`.
  - Why: Only a small subset of the chain has genuinely TDD-specific behavior. Forking shared agents would duplicate prompts that drift over time and raise maintenance cost for no architectural gain.
  - Decided by: user-directed

- **D-002 — Pipelined parallelism in `tdd-coordinator` (superseded in part by D-008)**
  - Decision: Keep coordinator-style non-blocking fan-out across ready work, but the unit of orchestration is now the phase task (`-red`, `-red-verify`, `-green`, `-refactor`) rather than marker transitions inside one behavior task.
  - Alternatives: Keep strict serial execution; preserve the prior marker-based state machine.
  - Why: Pipelining still removes the cross-behavior bottleneck, but durable phase order now comes from the existing task DAG instead of parsed notes. File-overlap sequencing remains mandatory even when tasks are dependency-free.
  - Decided by: planner-proposed

- **D-003 — Keep specialized phase agents separate**
  - Decision: `test-writer`, `verifier`, `implementer`, and `refactorer` remain distinct agents with one phase each.
  - Alternatives: Merge `implementer` + `refactorer`; let `tdd-coordinator` run RED verification itself; collapse all TDD work back into a generic worker.
  - Why: The TDD boundaries are the core contract of this workflow. Separate agents keep test authoring, failure verification, implementation, and cleanup independently inspectable and prevent prompt drift from blurring phase responsibilities.
  - Decided by: planner-proposed

- **D-005 — Behaviors-section signal is plan-scoped, not global**
  - Decision: `quality-manager` detects a TDD remediation path only when `activePlanSlug` exists and the active plan contains a `## Behaviors` section.
  - Alternatives: Pass a `tddMode` flag through chain config; route based on workflow name; infer TDD mode without a plan slug.
  - Why: The plan document is the stable source of truth for TDD behavior specs, but that source does not exist on planless runs. Treating `activePlanSlug` as a prerequisite keeps the existing planless fallback contract intact.
  - Decided by: planner-proposed

- **D-006 — RED verification stays on the existing `verifier` agent**
  - Decision: Model RED verification as a first-class `phase:red-verify` task dispatched to `verifier` rather than teaching `tdd-coordinator` to execute tests itself.
  - Alternatives: Give `tdd-coordinator` execution tools; trust `test-writer` self-report; fold RED verification into the GREEN task.
  - Why: Trusting self-report is the weakest link in the old flow, but giving `tdd-coordinator` direct execution tools breaks its orchestrator-only role. A dedicated verifier task preserves the orchestration boundary and makes RED verification visible in the DAG.
  - Decided by: planner-proposed

- **D-007 — Remediation stays task-based, but only behavior-shaped fixes use the TDD path**
  - Decision: In TDD mode with `activePlanSlug`, behavior-shaped reviewer/integration findings expand into the same four phase tasks and run through `tdd-coordinator`; structural findings without meaningful test targets create one `phase:green` task and run through `coordinator`. Keep `fixer` only for planless runs and verifier/project-native failures already on the verifier path.
  - Alternatives: Keep a `tdd-fixer`; send every finding through fake RED/GREEN/REFACTOR tasks; keep one lightweight remediation task that `tdd-coordinator` interprets internally.
  - Why: This preserves TDD where behavior can be expressed, but avoids inventing meaningless RED work for prompt-contract, workflow-ordering, or allowlist fixes that have no test target.
  - Decided by: user-directed

- **D-008 — Option A: task-per-phase replaces parsed-marker state machine**
  - Decision: Encode TDD phases as four tasks per behavior linked by DAG dependencies, with `phase:*` labels mapping to `test-writer`/`verifier`/`implementer`/`refactorer`.
  - Alternatives: Text markers + `select_next_phase` helper tool; structured `phase` field in task schema; status-state explosion.
  - Why: PR-001 and PR-004 dissolve together. No parallel state machine remains to maintain or test. Phase ordering and parallelism reuse the existing task DAG primitives. The trade-off is task-count fan-out (~4× per behavior), which is bounded and acceptable.
  - Decided by: user-directed

- **D-009 — Prompt-only verifier extension for RED verification**
  - Decision: Extend `verifier.md` prompt to support named-test RED-verification claims with observed-outcome classification.
  - Alternatives: Keep the claim format as-is and trust free-form `evidence` for failure mode; build a new `red-verifier` agent.
  - Why: The explorer investigation confirmed `verifier` is already multi-claim and structured-output capable, but lacks failure-mode classification. The minimum sufficient change is prompt-only.
  - Decided by: explorer-confirmed, user-directed

## Design

### Module structure

All additions stay in the existing coding domain package plus minimal shared plan-infrastructure support and regression coverage.

New agents (definition + prompt pair each):

- `bundled/coding/coding/agents/behavior-reviewer.ts` — adversarial reviewer for the `## Behaviors` section and its fit to the architecture plan
- `bundled/coding/coding/prompts/behavior-reviewer.md`

Modified prompts/agents:

- `bundled/coding/coding/prompts/tdd-planner.md` — define first-pass vs revision-pass mode explicitly; gate revision mode on `behaviorsReviewPending`; clear the flag in the same `plan_edit` call that writes the revised `## Behaviors` section; keep the generalization-forcing rule
- `bundled/coding/coding/prompts/task-manager.md` — add TDD-specific phase-task emission rules for plans with `## Behaviors`, while preserving current non-TDD task creation guidance
- `bundled/coding/coding/agents/tdd-coordinator.ts` — add `verifier` to `subagents`
- `bundled/coding/coding/prompts/tdd-coordinator.md` — replace marker-state orchestration with manual ready-task discovery for dependency-linked phase tasks, the phase→agent map, and coordinator-style file-conflict sequencing
- `bundled/coding/coding/prompts/verifier.md` — extend claim examples, RED-verification validation rule, and per-claim result schema for named-test `phase:red-verify`; `bundled/coding/coding/agents/verifier.ts` stays unchanged
- `bundled/coding/coding/agents/quality-manager.ts` — add `tdd-coordinator` to `subagents` while keeping `coordinator` for green-only structural fixes
- `bundled/coding/coding/prompts/quality-manager.md` — route behavior-shaped TDD remediation to phase-task sets + `tdd-coordinator`, structural no-test-target fixes to green-only tasks + `coordinator`, and keep `fixer` fallback behavior; the routing predicate is applied to finding prose, not to structured behavior fields

Modified shared plan infrastructure:

- `lib/plans/plan-types.ts` — add explicit support for optional `behaviorsReviewPending`
- `lib/plans/file-system.ts` — read and write the flag in plan frontmatter without dropping it on update
- `lib/plans/plan-manager.ts` — thread the flag through create/get/update
- `domains/shared/extensions/plans/index.ts` — expose the flag through `plan_view` details and allow `plan_edit` to set/clear it

Modified orchestration/config files:

- `bundled/coding/coding/workflows.ts` — update `tdd` and `spec-and-tdd`
- `lib/config/defaults.ts` — same chains, kept in parity with `workflows.ts`
- `lib/orchestration/chain-runner.ts` — add `behavior-reviewer` to `DEFAULT_STAGE_PROMPTS`

Modified tests:

- agent-invariant coverage for the new/changed subagent allowlists
- workflow-chain and parity coverage for the reviewed TDD planning loop
- prompt-contract coverage for TDD phase-task emission, verifier named-test claims/outcome classification, TDD remediation routing from finding prose, and the simplified phase→agent mapping plus ready-task discovery rule
- plan-manager / plans-extension coverage for the new frontmatter flag

### Dependency graph

- `tdd-planner` owns the `## Behaviors` section only. It reads the architecture plan plus, on revision passes only, the `behavior-reviewer` output that is explicitly signaled by `behaviorsReviewPending` in plan frontmatter, then clears that flag in the same `plan_edit` call that writes the revised section.
- `behavior-reviewer` depends on `plan.md` content and writes two plan-scoped artifacts: `behavior-review.md` plus the frontmatter flag. `tdd-planner` is the only consumer of that flag.
- `task-manager` consumes the approved TDD plan and translates each behavior into four ordinary tasks using only `labels` and `dependencies`; no task-schema change is introduced.
- `tdd-coordinator` depends on those phase-task labels/descriptions plus `spawn_agent`. It never invents phase state; it lists plan-scoped `To Do` tasks, computes readiness by resolving each dependency to a `Done` task, sequences overlaps, and dispatches the mapped subagent.
- `verifier` remains the execution surface for `phase:red-verify`; only its prompt contract changes so named-test claims can distinguish assertion failures from collection/compile/test harness failures. `task-manager` and `tdd-coordinator` depend on that prompt-level contract, not on any new agent/session capability.
- `quality-manager` decides which remediation surface to use by applying the behavior-shaped predicate to reviewer/integration-verifier finding prose:
  - behavior-shaped findings → create phase-task sets → run `tdd-coordinator`
  - structural findings without test targets → create one green-only task → run `coordinator`
  - planless / verifier-native failures → run `fixer`
- Shared plan infrastructure sits underneath both `behavior-reviewer` and `tdd-planner`; coding-domain prompts depend on the plan tool contract, not on raw file edits.

### Updated chains

```text
tdd:
  planner
    -> plan-reviewer
    -> planner
    -> tdd-planner
    -> behavior-reviewer
    -> tdd-planner
    -> task-manager
    -> tdd-coordinator
    -> integration-verifier
    -> quality-manager

spec-and-tdd:
  spec-writer
    -> planner
    -> plan-reviewer
    -> planner
    -> tdd-planner
    -> behavior-reviewer
    -> tdd-planner
    -> task-manager
    -> tdd-coordinator
    -> integration-verifier
    -> quality-manager
```

### Key contracts

**Plan-frontmatter review-state contract**

```ts
interface Plan {
  // existing fields...
  behaviorsReviewPending?: boolean;
}

interface PlanUpdateInput {
  // existing fields...
  behaviorsReviewPending?: boolean;
}
```

Semantics:
- absent or `false` → no pending behavior-review revision
- `true` → `behavior-reviewer` has written `behavior-review.md` and the next `tdd-planner` pass must revise `## Behaviors`
- after revision, `tdd-planner` writes `behaviorsReviewPending: false`
- `behavior-review.md` existence alone is never a mode signal

Atomicity and recovery:
- The two writes (`behavior-review.md` and the `behaviorsReviewPending` flag) are NOT transactional. `behavior-reviewer` MUST write `behavior-review.md` first, then set `behaviorsReviewPending: true` via `plan_edit`. This ordering means a crash between the two writes leaves "review written, flag never set" — which the existing first-pass logic handles cleanly (no flag → next chain stage proceeds normally).
- If `tdd-planner` enters a pass and finds `behaviorsReviewPending === true` but `behavior-review.md` is absent, empty, or contains zero parseable findings, it MUST hard-fail with a clear error identifying both the flag state and the file state. It MUST NOT silently clear the flag, because that masks the inconsistency on subsequent runs. Recovery is by human intervention or chain rerun.
- `tdd-planner`'s consume-side write MUST clear `behaviorsReviewPending` and write the revised `## Behaviors` content in a SINGLE `plan_edit` call. Splitting them across two calls re-introduces a non-atomic window where a crash leaves a consumed review with the flag still set, causing the next rerun to revise against an already-incorporated review.

**TDD phase-task emission contract**

For every behavior heading in `plan.md`, derive a stable kebab-case base name and create four tasks whose *titles* end with:

```text
<base>-red
<base>-red-verify
<base>-green
<base>-refactor
```

All four tasks carry `plan:<slug>`. Title suffixes (`-red`, `-red-verify`, `-green`, `-refactor`) are documentation/identification only — they are NOT used for dependency lookup. Dependency wiring uses the task IDs returned by each `task_create` call, captured in working memory during the four-task emission for a single behavior, and passed as the `dependencies` array of the next `task_create`. This is consistent with `task-manager.md`'s existing rule that prerequisite tasks are created before dependents (titles cannot be forward-referenced).

Additional rules (capture each generated ID as you go):
- `<base>-red` has label `phase:red` and no dependencies; capture its ID as `id_red`
- `<base>-red-verify` has label `phase:red-verify` and `dependencies: [id_red]`; capture its ID as `id_red_verify`
- `<base>-green` has label `phase:green` and `dependencies: [id_red_verify]`; capture its ID as `id_green`
- `<base>-refactor` has label `phase:refactor` and `dependencies: [id_green]`
- no parent behavior task is created

Content split:
- `-red` description includes the behavior statement plus the `## Test Targets` that must be authored
- `-red-verify` description includes one failure claim per test target
- `-green` description includes `## Test Targets` plus `## Implementation Pointers` and states those targets must now pass
- `-refactor` description includes the green target list that must remain passing

**Verifier named-test RED-verification claim contract**

Each `-red-verify` task supplies one claim per named test in this shape:

```yaml
- test_file: tests/path/to/file.test.ts
  test_name: "descriptive test name"
  expected: fails-on-assertion
  command: bun run test -- tests/path/to/file.test.ts
```

Observed outcome classes:
- `assertion-failure`
- `test-error`
- `not-collected`
- `compile/startup-error`
- `passed`

Rules:
- the claim passes only when `observed_outcome === "assertion-failure"`
- `test-error`, `not-collected`, `compile/startup-error`, and `passed` all fail the claim
- each per-claim result extends the existing verifier schema with `test_file`, `test_name`, `observed_outcome`, and `failure_reason` alongside `id`, `claim`, `result`, `evidence`, and `notes`

**Phase→agent dispatch contract**

```text
phase:red         -> test-writer
phase:red-verify  -> verifier
phase:green       -> implementer
phase:refactor    -> refactorer
```

`tdd-coordinator` uses the label map only. Unknown or missing `phase:*` labels are task-definition errors and should block the task instead of guessing.

Ready-task discovery rule:
- A phase task is **ready** iff (1) its status is `To Do`, and (2) every task ID in its `dependencies` array has status `Done`.
- `tdd-coordinator` MUST NOT use `task_list(status: "To Do", hasNoDependencies: true)` for phase tasks. That helper only surfaces tasks whose `dependencies` arrays are empty, so it can never discover ready `-red-verify`, `-green`, or `-refactor` tasks.
- Instead, `tdd-coordinator` lists `To Do` tasks scoped by `plan:<slug>`, reads each candidate task's `dependencies`, and verifies each dependency is `Done` via `task_view` before treating the candidate as ready.

**File-set extraction contract for conflict avoidance**

Every TDD phase task that can overlap with other ready work must expose its candidate write set in the task description:

```markdown
## Test Targets
- file: tests/path/to/file.test.ts | test: "descriptive test name"

## Implementation Pointers
- file: lib/path/to/source.ts | reason: touched to satisfy the behavior
```

Rules:
- `phase:red` and `phase:red-verify` must include `## Test Targets`
- `phase:green` and `phase:refactor` must include both `## Test Targets` and `## Implementation Pointers`
- `tdd-coordinator` derives a conservative file set from all listed `file:` entries and sequences ready tasks whose file sets overlap

Fail-closed parser rule: If a phase task description is missing the required section, contains bullets that do not match the `file: <path> | test: "..."` (or `| reason: ...`) format, or yields an empty file set after parsing, `tdd-coordinator` MUST NOT spawn that task. Instead, set the task to `Blocked` with a `file-set parse failed: <reason>` note in `implementationNotes` and skip it on subsequent ready-task scans until the description is corrected. Parse failures are non-recoverable without a task-description fix, and `Blocked` composes correctly with `chain-runner`'s loop semantics; leaving the task in `To Do` would keep the loop pending until timeout/max iterations. Silent over-eagerness on an empty file set would re-introduce the very race the file-conflict guard prevents — visible blockage is the correct failure mode.

**TDD remediation-task contract**

Behavior-shaped vs structural predicate (binding decision rule for `quality-manager`):

> A finding is **behavior-shaped** iff it identifies (a) a code path that can be exercised by the project's test runner AND (b) at least one specific input or scenario that produces an observable wrong outcome a failing test could capture (a wrong return value, a missing error, an incorrect side effect on a known surface). Otherwise the finding is **structural** — e.g., prompt-contract changes, workflow-ordering fixes, allowlist updates, capability adjustments, documentation drift, dead-code removal, formatting/style fixes that do not alter observable behavior.

**Application note**: Reviewer and integration-verifier findings today emit free-text `summary` and `suggestedFix` fields, not structured `code_path` / `observable_input` data. Applying this predicate therefore remains prompt-level judgment by `quality-manager` based on the finding's prose. The predicate gives the rubric a reviewer can use to verify routing decisions; it does not yet permit fully mechanical classification. Future refinement: add structured fields to reviewer / integration-verifier finding emitters so the predicate becomes mechanically decidable.

This predicate is the routing rubric. `quality-manager.md` MUST cite it verbatim and apply it to finding prose (`summary`, `suggestedFix`, and any task acceptance criteria) before deciding between the four-task TDD path and the green-only structural path.

When `quality-manager` creates TDD remediation work for a behavior-shaped finding, it emits the same four-task set above and adds `review-fix` plus `review-round:<n>` labels to each task before calling:

```text
chain_run(expression: "tdd-coordinator", prompt: "Process only tasks labeled review-round:<n>...", completionLabel: "review-round:<n>")
```

When a finding has no meaningful test target, `quality-manager` instead creates one `phase:green` task with `review-fix`, `review-round:<n>`, and `plan:<slug>` labels, and routes it through `coordinator`. `tdd-coordinator` is reserved for behavior-shaped work only.

### Integration seams

- `lib/tasks/task-types.ts:57-59` already provides `labels` and `dependencies`, and `lib/tasks/task-types.ts:80-125` already allows those fields on create/update. Phase encoding can therefore stay inside existing task primitives with no schema field addition.
- `bundled/coding/coding/prompts/task-manager.md:12-13,76` already requires dependency-ordered task creation and DAG verification. The TDD expansion reuses that existing contract rather than inventing a parallel task generator.
- `bundled/coding/coding/prompts/coordinator.md:33-39,70,86,109-110` already defines non-blocking fan-out plus the file-conflict guard. `tdd-coordinator.md` should mirror that spawning/overlap discipline, but not its zero-dependency ready-task helper.
- `lib/tasks/task-manager.ts:384-389` implements `task_list(..., hasNoDependencies: true)` as a literal `task.dependencies.length === 0` check. Because `-red-verify`, `-green`, and `-refactor` phase tasks always retain non-empty dependency arrays, `tdd-coordinator` cannot reuse that helper for ready-task discovery and must compute readiness per task from dependency statuses.
- `bundled/coding/coding/prompts/tdd-coordinator.md:11-25,44-81,98-109` currently encodes marker-driven per-task progression and `implementationNotes` markers. Those sections are replaced outright; phase order is now represented by dependencies, not parsed notes.
- `bundled/coding/coding/agents/tdd-coordinator.ts:6-12` currently allows only `test-writer`, `implementer`, and `refactorer`. Add `verifier` here so `phase:red-verify` remains on the same orchestration path.
- `bundled/coding/coding/prompts/verifier.md:9-18,36-61,73-74` already supports multi-claim validation, structured per-claim reporting, and binary pass/fail output, while `bundled/coding/coding/agents/verifier.ts:1-13` contains no extra schema logic. The required hardening is therefore prompt-only: extend the claim pattern, observed-outcome rule, and result fields without changing the agent definition.
- `bundled/coding/coding/prompts/quality-manager.md:27-47,132-150,160,169` already establishes `activePlanSlug`, task-based remediation, and integration-verifier reruns. The TDD change is surgical: swap the remediation task shape, apply the behavior-shaped predicate to finding prose, and choose `tdd-coordinator` vs `coordinator` accordingly.
- `bundled/coding/coding/prompts/reviewer.md:95-116` and `bundled/coding/coding/prompts/integration-verifier.md:115-134` define findings with free-text `summary` and `suggestedFix`, not structured behavior-routing fields. The routing predicate therefore remains a prompt-level rubric over prose until those emitters grow explicit code-path / scenario / observable-outcome fields.
- `bundled/coding/coding/agents/quality-manager.ts:18-27` currently lacks `tdd-coordinator` in the allowlist. It must be added while retaining `coordinator` for green-only structural fixes.
- `bundled/coding/coding/workflows.ts:26-30,40-44` and `lib/config/defaults.ts:35-51` are duplicated chain sources. Both must include `behavior-reviewer` and the second `tdd-planner` pass, and a parity test must keep them in lockstep.
- `lib/orchestration/chain-runner.ts:154-177` only treats loops as complete when all scoped tasks are `Done` and terminal when all scoped tasks are `Blocked`. Parse-failed phase tasks therefore must transition to `Blocked`, not remain `To Do`, or the TDD loop will stay pending until timeout/max iterations.
- `lib/orchestration/chain-runner.ts:53-73,117-118` already has distinct default stage prompts and label scoping for `tdd-coordinator`; only the new `behavior-reviewer` default prompt is added.
- `bundled/coding/coding/prompts/tdd-planner.md:17-24,72,102-104` currently frames enrichment around existing tasks and generic review artifacts while exposing `## Behaviors` as the TDD payload. Revision-mode selection must move from artifact existence to the explicit frontmatter flag.
- `lib/plans/file-system.ts:141-159,175-192`, `lib/plans/plan-types.ts:22-36,62-70`, and `domains/shared/extensions/plans/index.ts:90-128,132-154` currently only round-trip title/status/body/spec. Minimal scope expansion is required so `behavior-reviewer` and `tdd-planner` can write/read `behaviorsReviewPending` via plan tools without dropping it on save.

### Seams for change

- The four `phase:*` labels are the stable TDD orchestration vocabulary. If a future TDD variant adds another phase, extend the label map and task emission contract rather than adding ad hoc state.
- `behaviorsReviewPending` is the stable review-state seam for TDD planning reruns. Future plan-scoped orchestration state should extend plan frontmatter deliberately, not infer mode from leftover files.
- The verifier seam remains prompt-level: future RED-verification variants should extend the named-test claim/result contract in `verifier.md` before considering any new agent definition.
- The remediation split point is whether the finding has a concrete behavior and test target. That keeps `tdd-coordinator` behavior-oriented and isolates structural fixes at the coordinator/fixer edge.

## Approach

- **Replace state-machine prose with task DAGs.** The previous plan’s hardest problems — durable post-verifier state, stale completion ambiguity, malformed marker handling, and the lack of a testable orchestration seam — all came from encoding phase inside one task. The revised model makes phase state equal to normal task readiness and status.
- **Keep the human behavior index in the plan, not in extra tasks.** The plan’s `## Behaviors` section remains the source of truth for what is being built; the task graph is only the executable projection of that section.
- **Reuse existing coordinator idioms where they fit.** `coordinator.md` already specifies the correct non-blocking spawn pattern and file-conflict sequencing. `tdd-coordinator` should copy those orchestration rules, but it must NOT copy the `hasNoDependencies` ready-task helper because dependency-linked phase tasks require manual readiness checks.
- **Treat RED verification as a phase task, not an internal flag.** That keeps `verifier` visible in the graph and removes the need for hidden coordinator memory or new persisted state.
- **Harden RED verification at the prompt boundary, not the agent boundary.** The existing verifier already supports multi-claim runs and structured output, so the minimal sufficient change is to tighten `verifier.md` around named-test claim fields, observed outcomes, and pass criteria.
- **Make revision mode state explicit data.** `behavior-review.md` becomes evidence; `behaviorsReviewPending` becomes the decision bit; `tdd-planner` consumes both atomically by writing the revised body and clearing the flag in one `plan_edit` call. That makes reruns deterministic and independent of cleanup discipline.
- **Handle structural findings honestly.** If a finding has no meaningful test target, do not fabricate RED work just to stay on the TDD path. Route it as green-only coordinator work. Until finding producers emit structured behavior fields, this routing remains prompt-level judgment over finding prose.
- **Marker-malformation coverage dissolves under this model.** There are no TDD markers left to parse incorrectly. Remaining task-deletion/rename failures are ordinary task-system errors and should be handled by the existing task tools, not by new TDD-specific state recovery logic.

## Files to Change

New files:

- `bundled/coding/coding/agents/behavior-reviewer.ts` — new agent definition
- `bundled/coding/coding/prompts/behavior-reviewer.md` — new prompt describing review scope, report format, and frontmatter flag writeback
- `tests/orchestration/workflows-parity.test.ts` — assert `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts` keep the same TDD chains
- `tests/prompts/task-manager.test.ts` — prompt-contract test covering both (a) TDD case: a plan with `## Behaviors` produces four-task-per-behavior emission with phase labels, dependency ordering via captured IDs, and no parent behavior task; and (b) non-TDD regression case: a plan without `## Behaviors` produces single tasks per scope item (the TDD branch does NOT trigger). The negative case is mandatory because `task-manager.md` is shared across every workflow.
- `tests/prompts/tdd-coordinator.test.ts` — prompt-contract test for the phase→agent mapping, manual ready-task discovery from dependency statuses, and coordinator-style file-conflict sequencing rules
- `tests/prompts/verifier.test.ts` — create if absent; cover the named-test RED-verification claim pattern, observed-outcome classification, and required per-claim result fields

Modified files:

- `bundled/coding/coding/prompts/tdd-planner.md` — define first pass vs revision pass using `## Behaviors` + `behaviorsReviewPending`; require the revised `## Behaviors` body and flag clear to happen in the same `plan_edit` call; keep generalization guidance
- `bundled/coding/coding/prompts/task-manager.md` — add TDD-plan detection and four-task-per-behavior emission rules using labels/dependencies only
- `bundled/coding/coding/agents/tdd-coordinator.ts` — add `verifier` to `subagents`
- `bundled/coding/coding/prompts/tdd-coordinator.md` — replace marker-state instructions with ready phase-task dispatch, manual readiness checks via dependency status (not `hasNoDependencies`), mapped agents, completion verification, and file-overlap sequencing
- `bundled/coding/coding/prompts/verifier.md` — extend the claim pattern, RED-verification validation rule, and per-claim result schema for named-test outcome classification
- `bundled/coding/coding/agents/quality-manager.ts` — add `tdd-coordinator` to `subagents`
- `bundled/coding/coding/prompts/quality-manager.md` — create behavior-shaped remediation as four phase tasks for `tdd-coordinator`; route no-test-target findings to one green-only task for `coordinator`; preserve `fixer` fallback; apply the behavior-shaped predicate to reviewer/integration-verifier prose rather than pretending the finding fields are already structured for mechanical routing
- `bundled/coding/coding/workflows.ts` — insert `behavior-reviewer` and the second `tdd-planner` pass into TDD workflows
- `lib/config/defaults.ts` — same TDD workflow updates, kept in parity with `workflows.ts`
- `lib/orchestration/chain-runner.ts` — add the `behavior-reviewer` default stage prompt
- `lib/plans/plan-types.ts` — add optional `behaviorsReviewPending` support to plan types/update input
- `lib/plans/file-system.ts` — read/write the new frontmatter flag without dropping it
- `lib/plans/plan-manager.ts` — thread the flag through plan CRUD operations
- `domains/shared/extensions/plans/index.ts` — allow `plan_edit` to set/clear the flag and expose it through `plan_view`
- `tests/domains/coding-agents.test.ts` — assert `quality-manager` can spawn `tdd-coordinator` and `tdd-coordinator` can spawn `verifier`
- `tests/domains/coding-workflows.test.ts` — assert every TDD workflow contains `tdd-planner -> behavior-reviewer -> tdd-planner -> task-manager`
- `tests/orchestration/chain-runner.test.ts` — cover the new `behavior-reviewer` default stage prompt and preserve TDD label scoping behavior
- `tests/prompts/quality-manager.test.ts` — assert behavior-shaped TDD remediation routes through `tdd-coordinator`, the predicate is applied to finding prose, and no-test-target findings plus planless runs still fall back correctly
- `tests/plans/plan-manager.test.ts` — cover `behaviorsReviewPending` persistence across get/update/read/write
- `tests/extensions/plans.test.ts` — cover `plan_view`/`plan_edit` behavior for the new frontmatter flag

## Risks

- **Cross-behavior file overlap under pipelined phase tasks** — blast radius: any TDD run with multiple ready behaviors can race on shared test or source files, producing corrupted edits or flaky verifier results. Classification: **mitigated**. Countermeasure: `tdd-coordinator` inherits `coordinator`'s overlap rule and derives file sets from `## Test Targets` + `## Implementation Pointers` before spawning work, AND applies the fail-closed parser rule (set malformed/empty-file-set tasks to `Blocked` with a `file-set parse failed:` note rather than treating them as empty) so a bad description cannot silently re-enable racing or keep the loop pending forever.
- **Workflow duplication drift** — blast radius: `workflows.ts` and `defaults.ts` could disagree, producing different TDD chains depending on load path and skipping `behavior-reviewer` or the second `tdd-planner` pass. Classification: **must fix**. Countermeasure: keep both files in the same implementation step and add a parity test.
- **Shared plan tools drop `behaviorsReviewPending` on update** — blast radius: reruns misclassify the first `tdd-planner` pass, stale reviews become active again, and behavior revisions stop being deterministic. Classification: **must fix**. Countermeasure: extend plan types, serializer, manager, and plan tools together; add plan-manager and plans-extension tests for round-tripping the flag.
- **Structural review findings are forced through fake TDD phases** — blast radius: reviewers generate meaningless RED tasks for prompt/order/allowlist fixes, slowing remediation and confusing the agent path. Classification: **mitigated**. Countermeasure: explicit rule that no-test-target findings become one `phase:green` task routed via `coordinator`, not `tdd-coordinator`.
- **`verifier` claim shape for `phase:red-verify` was previously too weak** — blast radius: GREEN could be unblocked without trustworthy proof that the authored tests fail for the right reason. Classification: **mitigated**. Countermeasure: extend `verifier.md` only — add named-test claims, observed-outcome classification, and the explicit rule that only `assertion-failure` passes; the change is prompt-only and bounded.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "The `tdd` and `spec-and-tdd` workflow chains include `behavior-reviewer` between two `tdd-planner` passes before `task-manager`, in both `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts`."
  verification: reviewer

- id: QC-002
  category: correctness
  criterion: "`bun run typecheck` exits 0 with the new `behavior-reviewer` definition, updated subagent allowlists, and shared plan-type/frontmatter changes in place."
  verification: verifier
  command: "bun run typecheck"

- id: QC-003
  category: correctness
  criterion: "`bun run test` exits 0, including coverage for workflow parity/order, plan frontmatter persistence, TDD task-manager task-shape guidance, quality-manager remediation routing, and the TDD phase→agent invariant."
  verification: verifier
  command: "bun run test"

- id: QC-004
  category: behavior
  criterion: "`tdd-planner.md` selects revision mode only when `behaviorsReviewPending === true`; a stale `behavior-review.md` without that flag does not trigger revision mode; and after consuming the review the planner clears the flag in the same `plan_edit` call that writes the revised `## Behaviors` content."
  verification: reviewer

- id: QC-005
  category: integration
  criterion: "Plan read/write/edit/view flows round-trip `behaviorsReviewPending` without losing it when unrelated plan fields are updated."
  verification: verifier
  command: "bun run test tests/plans/plan-manager.test.ts tests/extensions/plans.test.ts"

- id: QC-006
  category: behavior
  criterion: "For TDD plans (with a `## Behaviors` section), `task-manager.md` instructs exactly four phase tasks per behavior with `phase:red → phase:red-verify → phase:green → phase:refactor` dependencies wired via captured `task_create` IDs and no parent behavior task. For non-TDD plans (no `## Behaviors` section), the TDD branch does NOT trigger and tasks are emitted one per scope item per the existing rules. Both cases are covered by `tests/prompts/task-manager.test.ts`."
  verification: verifier
  command: "bun run test tests/prompts/task-manager.test.ts"

- id: QC-007
  category: behavior
  criterion: "`quality-manager.md` cites the explicit behavior-shaped predicate (code path exercisable by the test runner AND at least one input that produces an observable wrong outcome), applies that rubric to reviewer/integration-verifier finding prose, routes behavior-shaped remediation through phase-task sets and `tdd-coordinator`, routes structural findings (no test target) through a single green-only task on `coordinator`, and keeps planless runs on `fixer`."
  verification: reviewer

- id: QC-008
  category: behavior
  criterion: "`tdd-coordinator.md` defines and uses the invariant mapping `phase:red → test-writer`, `phase:red-verify → verifier`, `phase:green → implementer`, `phase:refactor → refactorer`, and the mapping is covered by a small invariant test rather than a state-machine harness."
  verification: verifier
  command: "bun run test tests/prompts/tdd-coordinator.test.ts tests/domains/coding-agents.test.ts"

- id: QC-009
  category: integration
  criterion: "`tdd-coordinator.md` carries over coordinator-style file-conflict sequencing and derives each ready task's file set from `## Test Targets` and `## Implementation Pointers` before spawning parallel work, AND applies the fail-closed parser rule: missing required sections, malformed bullets, or empty file sets set the task to `Blocked` with a `file-set parse failed:` note instead of allowing parallel spawning or leaving the loop pending."
  verification: reviewer

- id: QC-010
  category: behavior
  criterion: "`verifier.md` defines a named-test RED-verification claim format with observed-outcome classification (`assertion-failure | test-error | not-collected | compile/startup-error | passed`); a claim passes only when `observed_outcome === \"assertion-failure\"`; per-claim result fields include `test_file`, `test_name`, `observed_outcome`, `failure_reason`."
  verification: verifier
  command: "bun run test tests/prompts/verifier.test.ts"

## Implementation Order

1. **Add explicit review-state support to plans** — extend `lib/plans/plan-types.ts`, `lib/plans/file-system.ts`, `lib/plans/plan-manager.ts`, and `domains/shared/extensions/plans/index.ts` so `behaviorsReviewPending` can be read, written, viewed, and edited without being dropped. Update `tdd-planner.md` to use that flag for revision mode and to clear it in the same `plan_edit` call that writes the revised `## Behaviors` section.

2. **Introduce `behavior-reviewer` and wire the reviewed planning loop** — add the new agent definition/prompt pair, update `lib/orchestration/chain-runner.ts` with the stage prompt, and insert `behavior-reviewer` plus the second `tdd-planner` pass into `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts`. Add workflow-order/parity coverage in the same step.

3. **Teach `task-manager` to expand TDD behaviors into phase tasks** — update `task-manager.md` so TDD plans emit four dependency-linked phase tasks per behavior, with the required title suffixes, labels, and content split. Add the focused prompt test for this layout. This is where the old single behavior task disappears.

4. **Extend `verifier` for named-test RED verification** — update `bundled/coding/coding/prompts/verifier.md` with the claim pattern, observed-outcome classification, and per-claim result fields required by `phase:red-verify`, and add `tests/prompts/verifier.test.ts` coverage. This locks the RED-verification contract before `tdd-coordinator` depends on it.

5. **Simplify `tdd-coordinator` around phase dispatch** — add `verifier` to the allowlist, replace marker-driven prompt logic with manual ready-task discovery over plan-scoped `To Do` tasks plus dependency-status checks, define the phase→agent map, and import the coordinator-style file-conflict rule based on `## Test Targets` / `## Implementation Pointers`. Add the small invariant tests for mapping and allowlists in the same step.

6. **Update TDD remediation routing in `quality-manager`** — create behavior-shaped remediation as four phase tasks for `tdd-coordinator`, route no-test-target findings to one green-only task for `coordinator`, and preserve existing `fixer` fallbacks for planless/verifier-native cases. Update `tests/prompts/quality-manager.test.ts` alongside the prompt change.

7. **Run the focused regression pass** — verify workflow parity, plan frontmatter persistence, prompt invariants, and shared allowlists together. This final step replaces the old state-machine harness with smaller executable contracts around the actual seams that now exist.
