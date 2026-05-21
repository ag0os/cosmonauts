---
title: >-
  Work-document format redesign: spec, plan, architecture + behavior spine +
  gate contracts
status: active
createdAt: '2026-05-21T00:00:00.000Z'
updatedAt: '2026-05-21T19:09:16.794Z'
---

## Overview

Redesign Cosmonauts' work-artifact guidance around a shared `work-artifacts` skill and thin role skills so agents can choose the right workflow tier, produce canonical `spec.md` / `plan.md` / `architecture.md` artifacts, trace planned behaviors to tests with durable markers, and describe quality gates by abstract kind rather than concrete tool. This is skill/prompt/test work only; it defines contracts and guidance, not the runtime enforcement engine.

## Scope

Included:

- Add a shared `work-artifacts` skill with on-demand `references/` for artifact formats, workflow tiers, behavior spine, gate contracts, visual primitives, and examples.
- Refactor `/skill:plan`, `/skill:task`, and `/skill:tdd` so they stay role/procedure dispatchers and route artifact-format knowledge to `work-artifacts` instead of duplicating it.
- Use `/skill:creating-skills` as the implementation discipline for creating and refactoring skill files, especially thin-dispatcher / thick-reference skill architecture.
- Add `/skill:architecture` for authoring active architecture records at `missions/architecture/<slug>.md`.
- Update producer, task/implementation, review, verification, and quality prompts enough to route to the new skills and consume the new artifact shapes.
- Update explicit agent skill allowlists where needed so non-wildcard agents can see `work-artifacts` and related skills.
- Add/update prompt and skill contract tests that lock the behavior without snapshotting whole markdown files.

Excluded:

- Runtime gate enforcement, behavior/test marker scanning, or artifact-conformance CLI.
- Concrete `.cosmonauts` gate-binding schema and loader.
- HTML rendering.
- Back-migration of existing plans.
- Memory ingestion/retrieval behavior.
- Creating a full `architect` agent role.
- Changes to task storage format beyond guidance in `/skill:task` and task-manager prompt text.

## Decision Log

- **D-001 — Workflow tiers instead of universal ceremony**
  - Decision: Use four tiers: direct fix, tactical task/small bugfix, planned feature/refactor, architectural/multi-plan.
  - Alternatives: Require full spec/plan/architecture for all work; keep current loose judgment with no tiers.
  - Why: Small fixes need TDD discipline, not artifact ceremony; larger work still needs explicit behavior and architecture structure.
  - Decided by: user-chose-among-options

- **D-002 — Shared `work-artifacts` skill as canonical format home**
  - Decision: Add `domains/shared/skills/work-artifacts/` as a thin dispatcher plus thick references, and make role skills route to it.
  - Alternatives: Duplicate artifact rules in each role skill; make `/skill:plan` own all artifact knowledge.
  - Why: A shared skill prevents drift and keeps per-agent context small while preserving one source of truth.
  - Decided by: user-chose-among-options

- **D-003 — Behavior/test trace uses stable IDs plus plain markers**
  - Decision: Planned work uses `AC-###`, `B-###`, and `@cosmo-behavior plan:<slug>#B-###` comments near executable tests.
  - Alternatives: Rely on test names only; introduce sidecar registries or framework-specific annotations now.
  - Why: Plain markers are language-agnostic, grepable, and enforceable later without requiring a new registry.
  - Decided by: user-chose-among-options

- **D-004 — Durable architecture records live outside plan directories**
  - Decision: Architecture records live at `missions/architecture/<slug>.md`, with plans linking through `Architecture Context`.
  - Alternatives: Put architecture records under each plan directory; store architecture only in memory.
  - Why: Architecture decisions can outlive and govern multiple plans, but active implementation still needs explicit, reviewable context.
  - Decided by: planner-proposed, user-approved

- **D-005 — Quality Contract is an abstract gate ladder**
  - Decision: Plans describe ordered gate kinds, tiers, binding state, thresholds, and degradation notes; they do not name tools or commands.
  - Alternatives: Keep the current per-criterion command format; mix abstract gates with concrete project commands.
  - Why: Generic artifact formats must travel across languages; concrete bindings belong in follow-up configuration/enforcement work.
  - Decided by: planner-proposed, user-approved

- **D-006 — Gate protocol and binding home are deferred**
  - Decision: This plan defines the protocol slot and binding concept only; enforcement moments and `.cosmonauts` binding schema are follow-ups.
  - Alternatives: Implement gate execution and config schema now.
  - Why: This plan is the format foundation; enforcement would be a separate workflow/runtime design.
  - Decided by: planner-proposed, user-approved

- **D-007 — Examples are part of the contract**
  - Decision: Ship examples/templates for direct fix, tactical bugfix, planned feature/refactor, and architecture-linked multi-plan work.
  - Alternatives: Provide only prose rules.
  - Why: Agents follow concrete examples more reliably than abstract section descriptions.
  - Decided by: user-directed

- **D-008 — Review and verification agents must consume the artifact contract**
  - Decision: Update `plan-reviewer`, `reviewer`, `verifier`, `integration-verifier`, and `quality-manager` guidance, not only producer prompts.
  - Alternatives: Rely on wildcard skill availability and generic “load relevant skills” text; keep plan-reviewer on `/skill:plan` alone.
  - Why: Moving canonical format knowledge out of `/skill:plan` means consuming gates must know when and how to load `work-artifacts`.
  - Decided by: plan-reviewer finding accepted

- **D-009 — Quality-manager parses abstract ladders separately from legacy QC entries**
  - Decision: Keep legacy `QC-*` list parsing, but add a separate prompt-level contract for ladder rows: `gate_ladder_rows`, `degraded_gates`, and final summary reporting.
  - Alternatives: Replace the old parser entirely; let abstract ladder rows be skipped as malformed legacy criteria.
  - Why: Existing plans may still use the old shape, while new plans must not silently lose gate information.
  - Decided by: plan-reviewer finding accepted

- **D-010 — Skill authoring uses the creating-skills discipline**
  - Decision: Workers creating or refactoring skills in this plan must load `/skill:creating-skills` and follow its thin-dispatcher, directly linked references, and evaluation guidance.
  - Alternatives: Encode skill-architecture discipline only in this plan; rely on general `/skill:skill-writing` guidance.
  - Why: This plan's highest-risk implementation work is skill architecture, so workers need the dedicated skill-design procedure at implementation time.
  - Decided by: user-directed

## Current State

- `domains/shared/skills/plan/SKILL.md` currently owns plan format, readiness checks, tool reference, spec guidance, examples, and lifecycle in one file. It says most plans do not need a spec, which conflicts with the new planned feature/refactor rule.
- `domains/shared/skills/task/SKILL.md` describes task lifecycle and behavior-to-AC mapping, but not behavior IDs, markers, or tactical bugfix routing.
- `bundled/coding/coding/skills/tdd/SKILL.md` tells implementers that plan behaviors are test targets, but it does not define the behavior section, marker contract, or direct-fix exception.
- `bundled/coding/coding/skills/creating-skills/SKILL.md` exists and provides the skill-authoring architecture this plan should use for new/refactored skills: small dispatcher files, directly linked `references/`, and evaluation checks.
- `.cosmonauts/config.json` includes `creating-skills`, so wildcard worker/reviewer-style agents can load it during implementation.
- `bundled/coding/coding/prompts/spec-writer.md` produces the right broad spec sections, but not `AC-###` IDs or direct-fix routing.
- `bundled/coding/coding/prompts/planner.md` delegates plan format to `/skill:plan`; it should route artifact-format concerns to `work-artifacts` once that exists.
- `bundled/coding/coding/prompts/task-manager.md` says behaviors become ACs, but not that behavior IDs/markers must be preserved.
- `bundled/coding/coding/prompts/worker.md` tells workers to work test-first, but does not require planned behavior markers in tests.
- `bundled/coding/coding/agents/plan-reviewer.ts` has an explicit skill allowlist of `pi`, `plan`, and `engineering-principles`; after `/skill:plan` becomes a dispatcher, plan-reviewer would otherwise lose access to canonical artifact rules.
- `bundled/coding/coding/prompts/plan-reviewer.md`, `reviewer.md`, `verifier.md`, `integration-verifier.md`, and `quality-manager.md` need targeted routing/consumption updates for artifact conformance, architecture context, behavior markers, and abstract gate ladders.
- Existing text-contract tests under `tests/prompts/` read markdown files and assert key phrases. Extend that testing style; do not add brittle full-file snapshots.

## Design

### 1. Shared artifact skill owns canonical format knowledge

Create:

```text
domains/shared/skills/work-artifacts/
  SKILL.md
  references/
    workflow-tiers.md
    spec-format.md
    plan-format.md
    architecture-format.md
    behavior-spine.md
    gate-contracts.md
    visual-primitives.md
    examples.md
```

Responsibilities:

- `SKILL.md` is a short dispatcher: shared laws, routing table, refusal rules, and reference map.
- `workflow-tiers.md` defines direct-fix, tactical, planned, and architectural workflows.
- `spec-format.md` defines `spec.md` sections and `AC-###` IDs.
- `plan-format.md` defines behavior-first `plan.md`, derived design, flat `Files to Change`, and Quality Contract ladder.
- `architecture-format.md` defines `missions/architecture/<slug>.md`, Decision Log, Boundary Model, plan `Architecture Context`, and memory distinction.
- `behavior-spine.md` defines `AC-###` / `B-###`, context/action/expected-result/seam/test/marker, and `@cosmo-behavior plan:<slug>#B-###`.
- `gate-contracts.md` defines gate kinds, tiers, binding states, optional thresholds, placeholder protocol slot, and degradation rule.
- `visual-primitives.md` defines Mermaid, tables, structured lists, checklists, and the ASCII-art ban.
- `examples.md` includes minimal examples/templates for all four workflow tiers.

Dependency rule: artifact references are markdown contracts consumed by role skills and prompts. They must not import runtime implementation or name concrete analysis tools.

Workers implementing this section must load `/skill:creating-skills`, then read `references/architecture.md` and `references/complex-skills.md` from that skill because `work-artifacts` is a multi-reference dispatcher with conditional routing. Use `/skill:skill-writing` only for Cosmonauts frontmatter/export conventions not covered by `creating-skills`.

### 2. Role skills remain procedural dispatchers

Refactor existing skills toward the thin-dispatcher shape:

- `domains/shared/skills/plan/SKILL.md`
  - Owns plan lifecycle, plan tools, readiness checks, and plan-to-task handoff.
  - Routes artifact shape questions to `/skill:work-artifacts` and relevant references.
  - May move lifecycle/readiness details to `domains/shared/skills/plan/references/` if the dispatcher grows too large.

- `domains/shared/skills/task/SKILL.md`
  - Owns task format, task tools, dependency rules, status flow, and AC writing.
  - Adds behavior-consumption rules: preserve behavior IDs in task ACs, carry marker expectations into worker context, and use regression tests as behavior records for tactical bugfixes.
  - May move lifecycle and behavior mapping into `domains/shared/skills/task/references/`.

- `bundled/coding/coding/skills/tdd/SKILL.md`
  - Owns red/green/refactor and characterization-test discipline.
  - Adds planned-work rule: if implementing a `B-###` behavior, place the matching `@cosmo-behavior` marker near the executable test.
  - Keeps direct-fix behavior lightweight: regression test first, no marker required unless tied to a plan.

- `domains/shared/skills/architecture/SKILL.md`
  - New dispatcher for architecture records.
  - Routes to `work-artifacts` architecture reference and enforces the usefulness rule: no `architecture.md` unless it changes implementation or review.

Workers refactoring these skills must load `/skill:creating-skills` before editing. For simple edits, `references/foundations.md` and `references/evaluation.md` are enough; if splitting a skill into dispatcher plus references, also read `references/architecture.md`.

### 3. Prompts route; skills carry contracts

Prompt updates should be small and role-specific:

- `spec-writer.md`: route direct fixes away from spec-writing; require `AC-###` IDs for planned feature/refactor specs; load `work-artifacts` for artifact format and `plan` for plan tooling.
- `planner.md`: load `work-artifacts` for artifact shape and `plan` for lifecycle/tools; require behavior IDs, seams, tests, and markers in full plans.
- `task-manager.md`: preserve behavior IDs in task ACs and ensure every behavior cluster is owned by a task.
- `worker.md`: when a task owns planned behaviors, use `/skill:tdd` and carry the marker into the failing test; direct fixes use regression tests without marker ceremony.
- `plan-reviewer.md`: load `work-artifacts` while reviewing non-trivial plans; review behavior IDs, markers, derived design, architecture context, and abstract gate ladders.
- `reviewer.md`: when review scope includes plan context or artifact-conformance criteria, load `work-artifacts` and check artifact claims only in scope.
- `verifier.md`: when parent prompt asks artifact-conformance claims, load `work-artifacts`, validate explicit claims with evidence, and do not invent extra claims.
- `integration-verifier.md`: treat `Architecture Context`, linked architecture records, `Boundary Model`, behavior seams, and abstract Quality Contract rows as auditable contracts when the plan declares them.
- `quality-manager.md`: parse and report abstract gate ladders separately from legacy `QC-*` criteria. Full deterministic gate execution remains out of scope.

Update explicit agent definitions:

- `planner.ts`: add `work-artifacts` and `architecture`.
- `spec-writer.ts`: add `work-artifacts`.
- `task-manager.ts`: add `task` and `work-artifacts`.
- `plan-reviewer.ts`: add `work-artifacts` and `architecture`.

Wildcard agents (`worker`, `reviewer`, `verifier`, `integration-verifier`, `quality-manager`, `fixer`) should see shared skills through the existing shared-skill preservation path; their prompts still need routing language so they know when artifact conformance is in scope.

### 4. Behavior/test marker contract

Every planned behavior entry uses this shape:

```md
### B-001 — Short behavior name

- Source: AC-001
- Context: ...
- Action: ...
- Expected: ...
- Seam: `path/or/skill/section`
- Test: `tests/path/file.test.ts` > `test name`
- Marker: `@cosmo-behavior plan:<slug>#B-001`
```

Corresponding tests include the marker near the executable `it()` / `test()` block as a plain comment. The marker is not a framework API and does not require runtime support in this plan.

### 5. Quality Contract ladder shape

The canonical plan reference should describe a ladder table like:

| Order | Gate kind | Tier | Binding state | Threshold | Degradation / notes |
|---:|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project tests pass | hard fail |
| 2 | `artifact-conformance` | universal | bound | behaviors name existing tests and markers | hard fail once enforcement exists |
| 3 | `mutation` | bindable | bound/unbound | project-specific | explicit degraded state when unbound |

Generic artifact formats must not include `Tool` or `Command` columns. Project-specific bindings are deferred.

### 6. Quality-manager ladder handling contract

Update `quality-manager.md` with this prompt-level compatibility contract:

1. Detect `## Quality Contract` markdown tables whose headers include `Gate kind`, `Tier`, and `Binding state`; parse them as abstract ladders. Otherwise keep legacy `QC-*` parsing.
2. Parse each row into `gate_ladder_row`: `order`, `gate_kind`, `tier`, `binding_state`, `threshold`, `degradation_notes`.
3. Do not warn on missing legacy fields for ladder rows; they are not malformed just because they lack `QC-*`, `verification`, or `command`.
4. Map `correctness` to existing project-native check claims.
5. Map `artifact-conformance` to verifier claims that can be safely expressed from the plan: planned behaviors name tests/markers, and named markers appear in referenced test files. If the claim cannot be safely constructed, report human verification rather than silently passing.
6. Add any bindable row with `binding_state: unbound` to `degraded_gates`; it does not block merge-readiness in this plan, but final output must include `Gate <kind>: unbound, not enforced — <notes>`.
7. Report bindable `bound` rows without protocol as `bound, protocol pending` unless a legacy QC criterion or detected project tool separately supplies an executable claim.
8. Preserve legacy `verifier_criteria`, `reviewer_criteria`, and `manual_criteria` behavior for old `QC-*` entries.
9. Final summary includes universal gate status, degraded bindable gates, protocol-pending gates, and legacy manual criteria.

### 7. Test strategy

Use text-contract tests that verify durable phrases, IDs, marker syntax, routing instructions, and refusal rules. Avoid full markdown snapshots. Mutation-style negative assertions should check that generic artifact references do not mention concrete tool names, do not recommend architecture records as background docs, do not force direct fixes through the full artifact stack, and do not let abstract Quality Contract ladder rows be treated as malformed legacy `QC-*` entries.

Skill-creation/refactoring tests should also verify `work-artifacts/SKILL.md` directly links every reference file, matching `/skill:creating-skills` guidance against a deep reference maze.

## Behaviors

### B-001 — Agents choose the lightest workflow tier

- Source: AC-002, AC-003
- Context: an agent is deciding how much artifact structure a change needs
- Action: the work is a direct fix, tactical bugfix, planned feature/refactor, or architectural/multi-plan change
- Expected: the guidance routes to the matching tier and does not force direct fixes through `spec.md` / `plan.md` / `architecture.md`
- Seam: `domains/shared/skills/work-artifacts/references/workflow-tiers.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `routes direct fixes to regression tests and planned work to spec plus plan`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-001`

### B-002 — Canonical artifact knowledge lives in shared references

- Source: AC-019
- Context: a role skill needs artifact-format guidance
- Action: the role skill references artifact rules
- Expected: canonical artifact rules are in `work-artifacts/references/`, and role skills route to them instead of duplicating the full rules
- Seam: `domains/shared/skills/work-artifacts/SKILL.md`; `domains/shared/skills/plan/SKILL.md`; `domains/shared/skills/task/SKILL.md`; `bundled/coding/coding/skills/tdd/SKILL.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `keeps artifact knowledge in a routed reference set`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-002`

### B-003 — Planned specs use stable acceptance-criterion IDs

- Source: AC-004, AC-006
- Context: `spec-writer` is producing a spec for planned feature/refactor work
- Action: it writes the `Acceptance Criteria` section
- Expected: criteria use `AC-###` IDs, and the prompt still treats specs as optional for bugfix/patch/direct-fix work
- Seam: `domains/shared/skills/work-artifacts/references/spec-format.md`; `bundled/coding/coding/prompts/spec-writer.md`
- Test: `tests/prompts/spec-writer.test.ts` > `requires AC identifiers for planned specs without forcing specs for direct fixes`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-003`

### B-004 — Full plans require behavior entries with source, seam, test, and marker

- Source: AC-005, AC-009
- Context: a planner writes a full planned feature/refactor implementation plan
- Action: it writes `## Behaviors` and `## Design`
- Expected: each behavior has context/action/expected result, source AC, seam, test, and marker; `Design` is described as derived from behavior placement
- Seam: `domains/shared/skills/work-artifacts/references/plan-format.md`; `domains/shared/skills/plan/SKILL.md`
- Test: `tests/prompts/plan-skill.test.ts` > `requires behavior entries with source seam test marker and derived design`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-004`

### B-005 — Planned TDD tests carry behavior markers while direct fixes stay lightweight

- Source: AC-007, AC-008, AC-018
- Context: a worker is implementing either a planned behavior or a direct fix
- Action: the worker writes the RED test
- Expected: planned behavior tests carry `@cosmo-behavior plan:<slug>#B-###`; direct fixes require a regression test but no marker unless tied to a plan
- Seam: `domains/shared/skills/work-artifacts/references/behavior-spine.md`; `bundled/coding/coding/skills/tdd/SKILL.md`; `bundled/coding/coding/prompts/worker.md`
- Test: `tests/prompts/tdd-skill.test.ts` > `distinguishes planned behavior markers from direct regression tests`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-005`

### B-006 — Task creation preserves behavior ownership

- Source: AC-005, AC-007
- Context: `task-manager` creates tasks from a plan with behavior IDs
- Action: it converts behavior clusters into task acceptance criteria
- Expected: task ACs identify the behavior IDs they own and preserve marker expectations for the worker
- Seam: `domains/shared/skills/task/SKILL.md`; `bundled/coding/coding/prompts/task-manager.md`
- Test: `tests/prompts/task-manager.test.ts` > `preserves behavior IDs and marker expectations when turning behaviors into ACs`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-006`

### B-007 — Quality Contracts use ordered gate kinds, not concrete tools

- Source: AC-010, AC-021
- Context: an artifact describes quality expectations for planned work
- Action: it writes the Quality Contract
- Expected: the contract is an ordered ladder of gate kinds with no concrete tool names or command columns
- Seam: `domains/shared/skills/work-artifacts/references/gate-contracts.md`; `domains/shared/skills/work-artifacts/references/plan-format.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `describes quality contracts as abstract gate ladders without concrete tools`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-007`

### B-008 — Unbound bindable gates degrade explicitly

- Source: AC-011, AC-012
- Context: a bindable gate has no project-specific tool binding
- Action: an agent reads the gate contract
- Expected: the gate records an explicit unbound/degraded state, never a silent pass or hard failure
- Seam: `domains/shared/skills/work-artifacts/references/gate-contracts.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `defines binding states tiers protocol slot and explicit degradation`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-008`

### B-009 — Architecture records are active implementation context

- Source: AC-013, AC-014, AC-015
- Context: a change might need durable architecture documentation
- Action: an agent decides whether to create `architecture.md`
- Expected: it creates a record only when useful for implementation/review, stores durable records under `missions/architecture/<slug>.md`, and includes Decision Log plus Boundary Model
- Seam: `domains/shared/skills/architecture/SKILL.md`; `domains/shared/skills/work-artifacts/references/architecture-format.md`
- Test: `tests/prompts/architecture-skill.test.ts` > `requires missions architecture location decision log boundary model and usefulness rule`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-009`

### B-010 — Plans link to architecture records without confusing them with memory

- Source: AC-014, AC-016
- Context: a plan depends on a durable architecture record
- Action: the plan cites architecture context
- Expected: it uses an `Architecture Context` section naming relevant decisions/boundary rules, and guidance distinguishes active architecture from post-completion memory
- Seam: `domains/shared/skills/work-artifacts/references/architecture-format.md`
- Test: `tests/prompts/architecture-skill.test.ts` > `requires Architecture Context and distinguishes architecture from memory`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-010`

### B-011 — Artifact visuals use approved markdown-native primitives

- Source: AC-017
- Context: an artifact needs a diagram, matrix, decision list, or acceptance criteria
- Action: the artifact author chooses a visual primitive
- Expected: guidance allows Mermaid, tables, structured lists, and checklists, and forbids ASCII-art diagrams
- Seam: `domains/shared/skills/work-artifacts/references/visual-primitives.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `allows approved visual primitives and forbids ascii art diagrams`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-011`

### B-012 — Planner routes artifact format to work-artifacts while plan lifecycle stays in plan skill

- Source: AC-001, AC-019
- Context: `planner` needs to write an implementation plan
- Action: it loads skill guidance
- Expected: planner loads `work-artifacts` for artifact shape and behavior/gate rules, and `/skill:plan` for lifecycle, readiness, and plan tools
- Seam: `bundled/coding/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `routes artifact formatting to work-artifacts while plan tooling stays in plan skill`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-012`

### B-013 — Explicit agent skill allowlists expose the shared artifact skill

- Source: AC-001, AC-019
- Context: an agent with an explicit `skills` allowlist needs to load `work-artifacts`
- Action: the agent session is assembled
- Expected: `planner`, `spec-writer`, `task-manager`, and `plan-reviewer` have the skills needed to follow or review the new artifact guidance
- Seam: `bundled/coding/coding/agents/planner.ts`; `bundled/coding/coding/agents/spec-writer.ts`; `bundled/coding/coding/agents/task-manager.ts`; `bundled/coding/coding/agents/plan-reviewer.ts`
- Test: `tests/agents/skills.test.ts` > `exposes work-artifacts to artifact-producing and plan-review agents with explicit skill lists`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-013`

### B-014 — Quality-manager parses and reports abstract gate ladders without enforcing bindings

- Source: AC-010, AC-012, AC-021
- Context: `quality-manager` reads a plan whose Quality Contract is a gate ladder
- Action: it loads the plan quality contract
- Expected: it parses ladder rows into `gate_ladder_rows`, maps universal gates to sign-off checks or explicit manual verification, records unbound bindable gates in `degraded_gates`, and does not expect concrete commands until the enforcement follow-up exists
- Seam: `bundled/coding/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `parses abstract gate ladders into gate state and reports degraded unbound gates`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-014`

### B-015 — Examples cover all workflow tiers

- Source: AC-020
- Context: an agent needs a concrete artifact example instead of prose rules
- Action: it loads examples for the current tier
- Expected: examples/templates exist for direct fix, tactical bugfix, planned feature/refactor, and architecture-linked multi-plan work
- Seam: `domains/shared/skills/work-artifacts/references/examples.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `ships examples for direct tactical planned and architecture-linked workflows`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-015`

### B-016 — Plan-reviewer can load and review the canonical artifact contract

- Source: AC-001, AC-005, AC-010, AC-013, AC-019
- Context: `plan-reviewer` reviews a plan after `/skill:plan` has become a thin dispatcher
- Action: it evaluates behaviors, architecture context, and Quality Contract completeness
- Expected: it can load `work-artifacts` and checks behavior IDs/markers, derived design, architecture-record usefulness, and abstract gate ladder conformance
- Seam: `bundled/coding/coding/agents/plan-reviewer.ts`; `bundled/coding/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/plan-reviewer.test.ts` > `loads work-artifacts and reviews behavior markers architecture context and gate ladders`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-016`

### B-017 — Reviewer applies artifact guidance only when artifact conformance is in scope

- Source: AC-001, AC-019
- Context: `reviewer` receives a diff review prompt that includes plan context or artifact-conformance criteria
- Action: it loads relevant skills
- Expected: it loads `work-artifacts` for behavior markers, architecture context, and gate-ladder claims when those are in scope, but does not invent artifact findings on ordinary code reviews
- Seam: `bundled/coding/coding/prompts/reviewer.md`
- Test: `tests/prompts/reviewer.test.ts` > `loads work-artifacts for artifact-conformance scope without inventing extra review claims`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-017`

### B-018 — Verifier validates explicit artifact-conformance claims with evidence

- Source: AC-007, AC-010, AC-018, AC-019
- Context: `verifier` receives explicit claims about behavior markers or abstract gate-ladder format
- Action: it validates those claims against files
- Expected: it loads `work-artifacts`, reports binary pass/fail with evidence, and does not expand beyond the claims provided
- Seam: `bundled/coding/coding/prompts/verifier.md`
- Test: `tests/prompts/verifier.test.ts` > `validates explicit artifact conformance claims without expanding scope`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-018`

### B-019 — Integration-verifier audits Architecture Context and abstract plan contracts

- Source: AC-010, AC-014, AC-016
- Context: `integration-verifier` verifies completed work against a plan with architecture context and abstract Quality Contract rows
- Action: it reads the active plan's auditable contract sections
- Expected: it includes `Architecture Context`, linked `missions/architecture/<slug>.md` records, `Boundary Model`, behavior seams, and abstract gate ladder rows among declared contracts without inventing unstated rules
- Seam: `bundled/coding/coding/prompts/integration-verifier.md`
- Test: `tests/prompts/integration-verifier.test.ts` > `audits architecture context boundary model behavior seams and abstract gate rows when declared`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-019`

### B-020 — Skill refactors follow creating-skills architecture

- Source: AC-019, AC-020
- Context: a worker creates `work-artifacts` or refactors existing skills into dispatcher/reference shape
- Action: it applies skill-authoring guidance
- Expected: it loads `/skill:creating-skills`, keeps `SKILL.md` as a dispatcher, directly links each reference file, and avoids deep reference chains
- Seam: `bundled/coding/coding/skills/creating-skills/SKILL.md`; `domains/shared/skills/work-artifacts/SKILL.md`; `domains/shared/skills/plan/SKILL.md`; `domains/shared/skills/task/SKILL.md`; `bundled/coding/coding/skills/tdd/SKILL.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `directly links reference files and follows creating-skills dispatcher discipline`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-020`

## Files to Change

- `tests/prompts/work-artifacts-skill.test.ts` — new tests for shared skill dispatcher, references, workflow tiers, gate contracts, visual primitives, examples, and direct reference linking.
- `domains/shared/skills/work-artifacts/SKILL.md` — new shared artifact dispatcher.
- `domains/shared/skills/work-artifacts/references/workflow-tiers.md` — new workflow-tier rules.
- `domains/shared/skills/work-artifacts/references/spec-format.md` — new spec format and `AC-###` rules.
- `domains/shared/skills/work-artifacts/references/plan-format.md` — new plan format, behavior-first rules, and Quality Contract ladder.
- `domains/shared/skills/work-artifacts/references/architecture-format.md` — new architecture record format, location, active-context rule, and memory distinction.
- `domains/shared/skills/work-artifacts/references/behavior-spine.md` — new behavior/test marker contract.
- `domains/shared/skills/work-artifacts/references/gate-contracts.md` — new abstract gate contract definition.
- `domains/shared/skills/work-artifacts/references/visual-primitives.md` — new visual primitive rules.
- `domains/shared/skills/work-artifacts/references/examples.md` — new minimal examples/templates for all workflow tiers.
- `tests/prompts/architecture-skill.test.ts` — new tests for architecture skill and architecture-format reference.
- `domains/shared/skills/architecture/SKILL.md` — new architecture skill dispatcher.
- `tests/prompts/plan-skill.test.ts` — update tests for behavior IDs, marker requirements, derived design, and routing to `work-artifacts`.
- `domains/shared/skills/plan/SKILL.md` — update/refactor plan skill dispatcher and readiness guidance.
- `domains/shared/skills/plan/references/lifecycle.md` — optional new reference if lifecycle/tool content is moved out of `SKILL.md`.
- `domains/shared/skills/plan/references/readiness.md` — optional new reference if readiness content is moved out of `SKILL.md`.
- `tests/prompts/task-skill.test.ts` — new tests for behavior consumption and tactical bugfix task guidance.
- `domains/shared/skills/task/SKILL.md` — update/refactor task skill.
- `domains/shared/skills/task/references/lifecycle.md` — optional new reference if task lifecycle content is moved out.
- `domains/shared/skills/task/references/from-behaviors.md` — optional new reference for behavior-to-task mapping.
- `tests/prompts/tdd-skill.test.ts` — new tests for planned behavior markers and direct-fix regression behavior.
- `bundled/coding/coding/skills/tdd/SKILL.md` — update/refactor TDD guidance for markers and direct fixes.
- `bundled/coding/coding/skills/tdd/references/red-green-refactor.md` — optional new reference if loop content is moved out.
- `bundled/coding/coding/skills/tdd/references/planned-behavior-markers.md` — optional new reference for marker-specific TDD guidance.
- `tests/prompts/spec-writer.test.ts` — update tests for `AC-###`, planned-vs-direct routing, and `work-artifacts` loading.
- `bundled/coding/coding/prompts/spec-writer.md` — update spec-writer prompt.
- `tests/prompts/planner.test.ts` — update tests for `work-artifacts` routing and behavior marker plan requirements.
- `bundled/coding/coding/prompts/planner.md` — update planner prompt routing.
- `tests/prompts/task-manager.test.ts` — update tests for preserving behavior IDs and marker expectations.
- `bundled/coding/coding/prompts/task-manager.md` — update task-manager prompt.
- `tests/prompts/worker.test.ts` — new tests for planned behavior marker instructions and direct-fix exception.
- `bundled/coding/coding/prompts/worker.md` — update worker prompt.
- `tests/prompts/plan-reviewer.test.ts` — new tests for plan-reviewer routing and artifact contract review responsibilities.
- `bundled/coding/coding/prompts/plan-reviewer.md` — update plan-reviewer prompt.
- `tests/prompts/reviewer.test.ts` — new tests for artifact-conformance review routing without over-expanding normal reviews.
- `bundled/coding/coding/prompts/reviewer.md` — update reviewer prompt.
- `tests/prompts/verifier.test.ts` — update tests for explicit artifact-conformance claim validation.
- `bundled/coding/coding/prompts/verifier.md` — update verifier prompt.
- `tests/prompts/integration-verifier.test.ts` — update tests for architecture context, boundary model, behavior seams, and abstract gate rows.
- `bundled/coding/coding/prompts/integration-verifier.md` — update integration-verifier prompt.
- `tests/prompts/quality-manager.test.ts` — update tests for abstract gate ladder parsing/reporting and deferred binding enforcement.
- `bundled/coding/coding/prompts/quality-manager.md` — update quality-manager prompt.
- `tests/agents/skills.test.ts` — update tests for explicit agent skill allowlists.
- `bundled/coding/coding/agents/planner.ts` — add `work-artifacts` and `architecture` skills.
- `bundled/coding/coding/agents/spec-writer.ts` — add `work-artifacts` skill.
- `bundled/coding/coding/agents/task-manager.ts` — add `task` and `work-artifacts` skills.
- `bundled/coding/coding/agents/plan-reviewer.ts` — add `work-artifacts` and `architecture` skills.

## Quality Contract

| Order | Gate kind | Tier | Binding state for this plan | Threshold | Degradation / notes |
|---:|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Prompt/skill contract tests pass and existing tests remain green | Hard fail |
| 2 | `artifact-conformance` | universal | bound | Every `B-###` above names a test and every new/updated test carries the matching `@cosmo-behavior` marker | Hard fail once implemented; reviewer/verifier checks until automated enforcement exists |
| 3 | `mutation` | bindable | unbound | Tests include negative assertions for: no full-stack ceremony on direct fixes, no concrete tools in generic gate docs, no shelfware architecture docs, no silent skipping of abstract gate ladder rows | Record unbound/degraded; use reviewer judgment |
| 4 | `duplication` | bindable | unbound | Canonical artifact rules appear in `work-artifacts` references and role skills/prompts route rather than re-state full sections | Record unbound/degraded; use reviewer judgment |
| 5 | `complexity` | bindable | unbound | Dispatcher skills stay short; reference files split by workflow/format/discipline rather than growing into monoliths | Record unbound/degraded; split references if a dispatcher becomes too large |
| 6 | `boundary-conformance` | bindable | unbound | Generic artifact references do not include project-specific gate bindings or concrete tool commands; architecture context remains explicit when plans depend on records | Record unbound/degraded; enforcement follow-up will bind mechanically |
| 7 | `dead-code` | bindable | unbound | Every new reference file is linked from a dispatcher, role skill, prompt, or prompt test | Record unbound/degraded; remove orphan references |

## Implementation Order

1. **Shared artifact contract tests first.** Add failing `tests/prompts/work-artifacts-skill.test.ts` and `tests/prompts/architecture-skill.test.ts` with markers from B-001, B-002, B-007, B-008, B-009, B-010, B-011, B-015, and B-020.
2. **Create `work-artifacts` and `architecture` skills.** Load `/skill:creating-skills`, then add the shared dispatcher, references, examples, and architecture skill until the new tests pass. Keep generic references free of concrete tool names and directly link every reference from `SKILL.md`.
3. **Refactor/update role skills.** Load `/skill:creating-skills`; add failing tests for `plan`, `task`, and `tdd`; then update skills and optional references until B-004, B-005, and B-006 pass.
4. **Update producer and implementation prompts.** Add/update failing tests for `spec-writer`, `planner`, `task-manager`, and `worker`; then update prompt text until B-003, B-005, B-006, and B-012 pass.
5. **Update review and verification prompts.** Add/update failing tests for `plan-reviewer`, `reviewer`, `verifier`, `integration-verifier`, and `quality-manager`; then update prompt text until B-014 and B-016 through B-019 pass.
6. **Expose skills through explicit agent allowlists.** Add/update `tests/agents/skills.test.ts`, then update `planner.ts`, `spec-writer.ts`, `task-manager.ts`, and `plan-reviewer.ts` until B-013 passes.
7. **Coherence pass.** Verify every new reference is linked, role skills/prompts do not duplicate full artifact rules, examples match the canonical format, direct-fix guidance stays lightweight, and quality-manager ladder rows cannot be silently skipped.
8. **Final verification.** Run the project test, lint, and typecheck gates according to repository practice; address prompt-test brittleness by asserting stable contract phrases rather than full snapshots.

If any stage reveals unexpected runtime changes are necessary for gate enforcement or marker scanning, stop and revise scope instead of smuggling enforcement into this format plan.

## Risks

- **Skill bloat moves instead of disappears.** Mitigation: use `/skill:creating-skills`; keep dispatchers short and move verb/discipline detail into directly linked references.
- **Prompt tests become brittle.** Mitigation: assert key contract phrases, marker syntax, and refusal rules; avoid full-file snapshots.
- **Quality-manager prompt conflicts with the current old QC parser.** Mitigation: add a precise separate ladder parsing/reporting contract while preserving legacy `QC-*` behavior; do not change runtime parsing in this plan.
- **Review/verification gates miss the new artifact contract.** Mitigation: update plan-reviewer skill allowlist and add prompt/test coverage for reviewer, verifier, integration-verifier, and quality-manager.
- **Cross-skill references are fragile when exported individually.** Mitigation: role skills say to load `/skill:work-artifacts` rather than relying on sibling relative paths; `work-artifacts` remains the canonical bundle.
- **Direct fixes accidentally get over-routed into specs/plans.** Mitigation: workflow-tier reference and prompt tests include the direct-fix exception as a first-class behavior.
- **Architecture records become shelfware.** Mitigation: architecture skill includes a hard usefulness rule and plan `Architecture Context` linkage requirement; integration-verifier audits declared architecture context when present.
- **Concrete gate bindings leak into generic artifacts.** Mitigation: gate-contract tests include negative assertions against project-specific tool names in generic references.

## Assumptions

- Existing skill discovery supports new shared directory skills with `SKILL.md` and `references/`; no framework changes are needed.
- Shared skills are available to wildcard agents through the existing shared-skill preservation behavior; explicit agent allowlists need manual updates.
- `creating-skills` is available through `.cosmonauts/config.json` for wildcard implementation agents and should be named in skill-refactoring task descriptions.
- `plan-reviewer` is an explicit-allowlist consumer of artifact rules and must receive `work-artifacts` directly.
- The implementation can add text-contract tests under `tests/prompts/` for skill markdown even when the skill is not a prompt.
- The quality-manager update is prompt-level compatibility for abstract ladder reporting; deterministic gate execution and gate-binding configuration stay out of scope.
- The current package excludes `missions/` from npm output, so defining `missions/architecture/<slug>.md` as a future artifact location does not change package contents.
