# Plan Review: artifact-format-redesign

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Plan-reviewer will lose access to the artifact contract it must review"
  plan_refs: Design §2 "Role skills remain procedural dispatchers", Design §3 "Update explicit agent definitions", Files to Change, Assumptions
  code_refs: bundled/coding/coding/agents/plan-reviewer.ts:15-16, bundled/coding/coding/prompts/plan-reviewer.md:93-145, lib/agents/skills.ts:54-91
  description: |
    The plan moves canonical plan/behavior/gate format knowledge out of `/skill:plan` into `/skill:work-artifacts`, then updates explicit skill allowlists only for `planner`, `spec-writer`, and `task-manager`. `plan-reviewer` is also an explicit-allowlist agent, not a wildcard agent: its definition exposes only `pi`, `plan`, and `engineering-principles` (`skills: ["pi", "plan", "engineering-principles"]`). `buildSkillsOverride` filters explicit agents to exactly the agent/project intersection, so a skill omitted from the agent allowlist is not visible even if it exists in the shared domain.

    This conflicts with the plan-reviewer prompt, which is the pre-task gate for `## Behaviors`, quality contract completeness, and artifact/code fidelity. After `/skill:plan` becomes a thin lifecycle dispatcher, plan-reviewer will be told by the plan skill to route artifact-format questions to `work-artifacts` but will not be able to load that skill. The plan needs to update plan-reviewer skill availability, or otherwise keep the full reviewable artifact contract reachable by that agent.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "Spec-required reviewer and verifier prompt routing is out of scope in the plan"
  plan_refs: Scope "Included", Design §3 "Prompt updates should be small and role-specific", Behaviors B-012, Files to Change
  code_refs: bundled/coding/coding/prompts/reviewer.md:54-58, bundled/coding/coding/prompts/verifier.md:20-29, bundled/coding/coding/agents/reviewer.ts:14-16, bundled/coding/coding/agents/verifier.ts:8-10
  description: |
    The spec says consuming agents including `reviewer` and `verifier` should route to the relevant artifact skill instead of embedding or guessing the format. The plan narrows prompt updates to `spec-writer`, `planner`, `task-manager`, `worker`, and `quality-manager`, and its B-012 behavior names only those five prompts. Existing `reviewer` and `verifier` prompts only say to load generally relevant skills; they do not mention `work-artifacts`, behavior markers, abstract gate ladders, or architecture context.

    The reviewer and verifier agents do have wildcard skill access, so this is not a loader-interface failure. It is a prompt/behavior coverage failure: availability does not make those agents know when artifact conformance is in scope. The planner should either revise the spec mapping and explicitly justify excluding reviewer/verifier, or add prompt/test coverage for their consumption responsibilities.

- id: PR-003
  dimension: quality-contract
  severity: medium
  title: "Quality-manager abstract ladder handling has no concrete parse or sign-off contract"
  plan_refs: Design §5 "Quality Contract ladder shape", Behaviors B-014, Quality Contract, Risks
  code_refs: bundled/coding/coding/prompts/quality-manager.md:44-72, bundled/coding/coding/prompts/quality-manager.md:270-286
  description: |
    The current quality-manager prompt has a concrete old-shape parser: it locates `## Quality Contract`, parses each list entry into `id`, `category`, `verification`, and optional `command`, and turns only `verification: verifier` criteria into verifier claims. Malformed entries are warned and skipped. Final sign-off likewise checks parsed verifier/reviewer/manual criteria by `QC-*` identity.

    The new plan says quality-manager should recognize an ordered abstract gate ladder and record unbound bindable gates explicitly, but it does not specify the replacement parsing rules, working-state fields, final-summary output, or how abstract universal gates differ from old `verifier_criteria`. A table with `Order`, `Gate kind`, `Tier`, `Binding state`, `Threshold`, and `Degradation / notes` will not fit the current `QC-*` parser. Without a precise prompt contract, a worker can satisfy B-014 with vague prose while the quality-manager workflow still silently skips the new gates. The plan should define the exact quality-manager handling of ladder rows and where degraded/unbound states are reported, while keeping runtime enforcement out of scope.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "B-012 spans five prompts but names only one executable test"
  plan_refs: Behaviors B-012, Files to Change, Quality Contract gate 2
  code_refs: tests/prompts/spec-writer.test.ts:7-59, tests/prompts/planner.test.ts:7-35, tests/prompts/task-manager.test.ts:7-34, tests/prompts/quality-manager.test.ts:8-67
  description: |
    B-012 expects `spec-writer`, `planner`, `task-manager`, `worker`, and `quality-manager` prompts to route to skills rather than embedding the full artifact format, but it names only `tests/prompts/planner.test.ts` as the test. The existing prompt-test convention is one file per prompt, and the plan's own Files to Change lists separate tests for spec-writer, planner, task-manager, worker, and quality-manager.

    This makes the behavior under-test ambiguous and conflicts with the plan's marker contract: a worker could add the B-012 marker only to `planner.test.ts` and leave the other four prompt routing requirements untested, while still appearing to satisfy the behavior entry. The planner should split B-012 by prompt or list the concrete test in each affected prompt-test file so the behavior/test spine is authorable without guessing.

## Missing Coverage

- `plan-reviewer` agent skill allowlist and prompt behavior after `/skill:plan` becomes a dispatcher to `work-artifacts`.
- `reviewer` and `verifier` prompt instructions for artifact-conformance checks: behavior markers, abstract gate ladders, and architecture context.
- Exact quality-manager ladder parsing/reporting contract for bound/unbound gates and final sign-off in the absence of old `QC-*` command entries.
- Integration-verifier interaction with the new `Architecture Context`, `Boundary Model`, and abstract Quality Contract sections; it currently reads `## Quality Contract` as an auditable contract but has no new-format guidance.
- A direct negative test that artifact-format rules are not duplicated into role prompts/skills beyond short routing text; B-002 states this intent but does not define a measurable threshold.

## Assessment

The plan is viable with revisions, but it is not ready for task creation. The most important fix is skill/prompt availability for the agents that review and verify the new artifacts; otherwise the canonical format can be created but the consuming gates will not reliably load or apply it.
