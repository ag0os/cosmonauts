# Plan Review: spec-plan-quality-gates-a

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The proposed Cosmo router contract drops the existing cosmo-facilitated design-dialogue path"
  plan_refs: plan.md:97-99, plan.md:110-114, plan.md:125-140, plan.md:175, plan.md:193-204, plan.md:265
  code_refs: bundled/coding/coding/prompts/cosmo.md:37-40
  description: |
    The plan describes `cosmo.md` as choosing between only two routes — product framing via `spec-writer` or engineering design via `planner` — and codifies that with `type PlannedRoute = "spec-writer" | "planner"` plus a route announcement that says "I can go straight to planner." That does not match the current prompt contract.

    `bundled/coding/coding/prompts/cosmo.md:37-40` already has three distinct planning behaviors: route fuzzy/no-spec work to `spec-writer` (line 37), keep interactive design dialogue in Cosmo itself using `/skill:design-dialogue` (line 38), and only spawn planner autonomously once direction is settled or the user says "just decide" (lines 38-40). If a worker implements the plan literally, the new two-route contract will conflict with line 38 or implicitly bypass it. The planner should reconcile the router design with the existing interactive-dialogue path instead of treating planning as a binary `spec-writer`/`planner` choice.

- id: PR-002
  dimension: duplication
  severity: medium
  title: "The planner readiness block duplicates existing QC rules instead of extending a single source of truth"
  plan_refs: plan.md:242-257, plan.md:325-329
  code_refs: bundled/coding/coding/prompts/planner.md:103-125, bundled/coding/coding/prompts/planner.md:218-248
  description: |
    The planned `Plan Readiness Check` hard-codes `3-8 QC items` and `at least one-third cover failure/edge cases` as a second copy of rules the planner prompt already defines. The existing workflow already states in step 5 that the planner must define 3–8 criteria (`planner.md:103-123`) and that at least one-third must cover failure/edge cases (`planner.md:125`). The output format then repeats the required quality-contract fields and the one-third rule again (`planner.md:218-248`).

    Adding a third independent copy in the readiness block creates drift risk inside the same prompt file: if the core planner rule changes later, the pre-`plan_create` gate can silently disagree. This is exactly the kind of prompt duplication the plan says it wants to avoid with durable tests. The planner should decide whether the readiness gate references the existing QC rule or replaces one of the duplicated copies.

- id: PR-003
  dimension: user-experience
  severity: medium
  title: "The fixed `critical >= 3` escalation has no waiver path and overrides the existing 'know when to stop' heuristic"
  plan_refs: plan.md:68-72, plan.md:86-90, plan.md:155-171, plan.md:237-239, plan.md:289-292
  code_refs: bundled/coding/coding/prompts/spec-writer.md:55-67
  description: |
    The existing `spec-writer` prompt tells the agent to play back understanding, flag inferences, and stop once purpose, experience, acceptance criteria, edge cases, and scope are clear (`spec-writer.md:55-67`). The plan adds a mandatory second clarification round whenever `critical >= 3` in interactive mode, but the planned wording does not give the human an explicit way to waive that extra round and proceed with documented assumptions.

    That conflicts with the plan's own broader rule in D-007 that interactive blockers can be "resolved or explicitly waived" before `plan_create` (`plan.md:68-72`). As written, a user can reach a spec-ready state under the current prompt heuristic and still be forced into another dialogue loop solely because three assumptions were classified as critical. The planner should address whether this threshold is truly mandatory or whether it can be waived with explicit acknowledgment, otherwise the new gate introduces avoidable friction in interactive sessions.

- id: PR-004
  dimension: risk-blast-radius
  severity: medium
  title: "The plan relies on readiness blocks staying out of persisted specs/plans, but no quality criterion locks that boundary"
  plan_refs: plan.md:27, plan.md:45-48, plan.md:155-159, plan.md:176-177, plan.md:301-335
  code_refs: bundled/coding/coding/prompts/spec-writer.md:69-111, bundled/coding/coding/prompts/planner.md:27, bundled/coding/coding/prompts/planner.md:127-133
  description: |
    The plan assumes the readiness blocks are conversational output emitted before `plan_create`, not new persisted artifacts (`plan.md:27`). That boundary matters because the current `spec-writer` output format persists only `Purpose`, `Users`, `User Experience`, `Acceptance Criteria`, `Scope`, `Assumptions`, and `Open Questions` (`spec-writer.md:69-111`), and the planner is instructed to treat an existing `spec.md` as the authoritative source of requirements (`planner.md:27`).

    None of QC-001 through QC-006 verify that `Readiness Check` or `Plan Readiness Check` remain non-persisted. The proposed tests only assert prompt phrases are present. A worker could satisfy every listed verifier while also editing the spec output format to add a persisted readiness section, changing the artifact downstream agents consume. Because the plan explicitly cites downstream compatibility as an assumption, this omission should be treated as a real blast-radius gap rather than a cosmetic detail.

- id: PR-005
  dimension: state-sync
  severity: low
  title: "The TypeScript 'contracts' are ambiguous in a prompt-only plan and can be mistaken for implementation work"
  plan_refs: plan.md:123-171, plan.md:263-270
  code_refs: bundled/coding/coding/prompts/planner.md:183-185
  description: |
    The plan's `RouteAnnouncement`, `ReadinessBlock`, and `AssumptionBudget` snippets are presented as TypeScript interfaces under `## Design > Key contracts`. In this codebase, the planner prompt explicitly says the `Key contracts` section is where workers get the types and interfaces they will implement against (`planner.md:183-185`).

    This plan is otherwise strict that Plan A is prompt-only and the `Files to Change` list includes no TypeScript contract file. Without an explicit note that these snippets are illustrative prompt shapes rather than real types to add to the repo, a worker can reasonably infer that the contracts should be materialized somewhere. That would violate scope and create unnecessary state/abstractions for a prompt-only change.

## Missing Coverage

- No criterion verifies that `cosmo.md` preserves the existing "Cosmo facilitates interactive design dialogue" behavior rather than collapsing all concrete asks to immediate planner delegation.
- No criterion verifies that the readiness blocks stay conversational-only and do not become new persisted sections in `spec.md` or `plan.md`.
- No criterion verifies the explicit critical-assumption classification rule itself (user-visible behavior, scope boundaries, existing-feature interaction, acceptance criteria); QC-003 only checks the threshold behavior.
- No criterion verifies the shared-contract details around unchecked items remaining visibly unchecked and interactive waivers being possible; those behaviors appear in the design contract but not in the listed verifiers.

## Assessment

The plan is viable after revision, but it is not ready as written. Fix the Cosmo routing model first: the current design misstates the existing prompt surface by omitting the cosmo-facilitated interactive design path, and that mismatch will ripple through the router wording, tests, and UX.