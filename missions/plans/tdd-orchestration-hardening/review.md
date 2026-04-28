# Plan Review: tdd-orchestration-hardening (round 3)

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Ready-task discovery is undefined for dependency-linked phase tasks"
  plan_refs: plan.md:19-29, plan.md:311-313
  code_refs: bundled/coding/coding/prompts/coordinator.md:12-26, lib/tasks/task-manager.ts:384-389
  description: |
    The revised plan moves TDD phase order into task dependencies and says `tdd-coordinator` should dispatch each ready `phase:*` task. The inherited coordinator loop it references finds ready work with `task_list(status: "To Do", hasNoDependencies: true)`, and the current task filter implements that literally as `task.dependencies.length === 0`.

    That helper can never surface `-red-verify`, `-green`, or `-refactor` tasks after their prerequisites complete, because those tasks always retain non-empty `dependencies`. The plan does not explicitly require `tdd-coordinator` to compute readiness manually from dependency task statuses, so a worker following the existing coordinator idiom can ship a coordinator that stalls after RED. The readiness algorithm at this boundary needs to be prescribed, not implied.

- id: PR-002
  dimension: risk-blast-radius
  severity: high
  title: "Fail-closed parse errors leave the TDD loop non-terminating"
  plan_refs: plan.md:195-200
  code_refs: lib/orchestration/chain-runner.ts:103-150
  description: |
    The plan's fail-closed rule says malformed phase tasks stay `To Do`, get a `file-set parse failed:` note, and are skipped on later scans until someone fixes the description. That preserves visibility, but it does not compose with the actual loop completion semantics.

    `chain-runner` only considers a loop complete when all scoped tasks are `Done`, and only considers it terminal when all scoped tasks are `Blocked`. A permanently malformed phase task parked in `To Do` keeps the loop in `pending` forever, so `tdd-coordinator` will rescan/skip until max iterations or timeout. This needs a terminal-state rule the runner can observe, or an explicit completion-check exception for parse-failed tasks.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "The behavior-shaped routing rule is still prose judgment, not a field-level predicate"
  plan_refs: plan.md:204-208, plan.md:300-306
  code_refs: bundled/coding/coding/prompts/reviewer.md:84-107, bundled/coding/coding/prompts/integration-verifier.md:35-62, bundled/coding/coding/prompts/quality-manager.md:61-70
  description: |
    The round-3 revision frames behavior-shaped routing as a clean iff predicate: exercisable code path plus a specific input/scenario with an observable wrong outcome. But the finding producers do not emit those as structured fields. Reviewer and integration-verifier findings currently provide priority/severity/confidence/complexity plus free-text `summary`, `suggestedFix`, and optional task ACs.

    That means `quality-manager` still has to infer the predicate from prose, so the routing rule is not mechanically decidable from finding fields the way the plan now implies. This is workable, but it is still judgment dressed as a predicate. The plan should either acknowledge that this remains prompt-level judgment or add explicit finding fields that carry the code-path / scenario / observable-outcome data.

## Missing Coverage

- The atomicity section covers `behavior-reviewer`'s two-write sequence, but not the consume side: it never says whether `tdd-planner` must write the revised plan body and clear `behaviorsReviewPending` in the same `plan_edit` call. A crash between separate updates can replay an already-consumed review on the next rerun.

## Assessment

Viable with revisions. The first fix is to specify how `tdd-coordinator` discovers dependency-satisfied tasks; without that, the four-task DAG can stall after the initial RED tasks.