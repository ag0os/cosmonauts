---
title: Prompt-Only Spec/Plan Quality Gates (Plan A)
status: completed
createdAt: '2026-04-17T14:55:43.511Z'
updatedAt: '2026-04-17T16:11:34.184Z'
---

## Summary

Implement Plan A as prompt-only quality gates at the human→spec→plan boundary by tightening Cosmo routing, preserving Cosmo’s existing three-path planning behavior, adding visible readiness gates to `spec-writer` and `planner`, and making `spec-writer` phase/assumption handling explicit. This closes the current fuzzy-entry and silent-assumption gaps without changing `lib/`, workflows, agent definitions, or adding new tools.

## Scope

**In scope**
- Prompt-only changes in `bundled/coding/coding/prompts/cosmo.md`, `bundled/coding/coding/prompts/spec-writer.md`, and `bundled/coding/coding/prompts/planner.md`.
- Prompt-contract tests under `tests/prompts/` that lock the required router, rubric, phase-transition, and assumption-budget instructions.
- Resolving the five open questions from `docs/designs/spec-plan-quality-gates.md:224-230` in this plan.

**Out of scope**
- `lib/` or plans-extension changes, including typed spec schema enforcement (`docs/designs/spec-plan-quality-gates.md:132-152`).
- New agents, agent-definition edits, or workflow rewiring, including `spec-reviewer` (`docs/designs/spec-plan-quality-gates.md:154-190`).
- Changes to `bundled/coding-minimal/coding/` prompts.
- Changes to `bundled/coding/coding/skills/design-dialogue/SKILL.md`; Plan A will consume its cadence conceptually from the spec-writer persona prompt, not by broadening the skill.

**Assumptions**
- Prompt content is the only enforcement surface in Plan A, so verifier coverage will come from prompt-contract tests rather than runtime classifier tests.
- The human review point remains `plan.md`; the readiness blocks are conversational output emitted before `plan_create`, not new persisted artifacts.
- The prompt-only scope applies to the full coding bundle (`bundled/coding/coding/`), not the minimal domain.

## Decision Log

- **D-001 — Ship Plan A prompt-only first**
  - Decision: implement M1–M4 as prompt changes; defer M5–M6.
  - Alternatives: ship everything at once; ship only M1; ship M5 first.
  - Why: locked by the design doc; lowest-risk path that produces evidence before framework work.
  - Decided by: user-directed.

- **D-002 — Router lives at Cosmo prompt level, not as a typed classifier tool**
  - Decision: keep M1 in `bundled/coding/coding/prompts/cosmo.md`.
  - Alternatives: new classifier tool; hard-coded `lib/` rules.
  - Why: locked by the design doc; Plan A stays prompt-only.
  - Decided by: user-directed.

- **D-003 — Readiness rubric is a shared artifact, not a private check**
  - Decision: the readiness check is emitted visibly before `plan_create`.
  - Alternatives: internal self-check; post-hoc reviewer validation.
  - Why: locked by the design doc; the human must be able to audit the gate.
  - Decided by: planner-proposed.

- **D-004 — Typed spec schema deferred**
  - Decision: leave schema validation to Plan B.
  - Alternatives: ship schema now; drop schema entirely.
  - Why: locked by the design doc; prompt-only evidence comes first.
  - Decided by: user-directed.

- **D-005 — spec-reviewer deferred**
  - Decision: do not add a spec-reviewer in Plan A.
  - Alternatives: ship reviewer now; rely on prompts forever.
  - Why: locked by the design doc; review cost is deferred until prompt gates prove insufficient.
  - Decided by: user-directed.

- **D-006 — Shared rubric shell, tailored checklist items**
  - Decision: use the same four visible headings (`Specificity`, `Constraints`, `Context`, `Success criteria`) in both prompts, but tailor the checklist items to each role.
  - Alternatives: identical rubric text in both files; completely separate rubric shapes.
  - Why: a shared shell makes the gate recognizable to humans, while tailored items avoid a generic checklist that is too vague to block anything.
  - Decided by: planner-proposed.

- **D-007 — Interactive runs block; autonomous runs convert blockers into assumptions**
  - Decision: in interactive mode, unchecked required items block `plan_create` until resolved or explicitly waived; in autonomous/non-interactive mode, unchecked items are converted into explicit assumptions/open questions and surfaced in the readiness block.
  - Alternatives: always hard-block; always proceed with warnings.
  - Why: hard-blocking autonomous runs would deadlock existing chains, while always proceeding would make the rubric toothless.
  - Decided by: planner-proposed.

- **D-008 — Cosmo router preserves three planning paths and announces the chosen one**
  - Decision: Cosmo must route among `spec-writer`, Cosmo-facilitated interactive design dialogue, and autonomous planner handoff; it announces the route and rationale, preserves the direct-planner suggestion for users who want planner-led dialogue, and defaults to autonomous planner only when the user says “just decide” or the run is non-interactive.
  - Alternatives: collapse to a binary `spec-writer`/`planner` router; hard-block fuzzy requests into `spec-writer`; leave routing as a one-line heuristic.
  - Why: `bundled/coding/coding/prompts/cosmo.md:37-40` already encodes three distinct planning behaviors, so the revised plan must make that structure explicit rather than replacing it with a binary contract.
  - Decided by: planner-proposed.

- **D-009 — M3 extends the cadence concept, but implementation stays in `spec-writer.md`**
  - Decision: do not modify `bundled/coding/coding/skills/design-dialogue/SKILL.md`; encode the mandatory Frame → Shape → Detail handoffs directly in `spec-writer.md`.
  - Alternatives: widen the skill to cover requirements capture; have `spec-writer` load the skill by changing its agent definition.
  - Why: `bundled/coding/coding/skills/design-dialogue/SKILL.md:98-100` explicitly says requirements capture belongs to `spec-writer`, and `bundled/coding/coding/agents/spec-writer.ts:9-11` does not load that skill. Prompt-local enforcement satisfies Plan A without agent-definition changes.
  - Decided by: planner-proposed.

- **D-010 — Fixed critical-assumption threshold of 3 with explicit human waiver**
  - Decision: keep the assumption budget fixed in `spec-writer.md` at `critical >= 3` triggering one more clarification round in interactive mode unless the human explicitly waives with wording such as `proceed with assumptions`; autonomous runs still convert blockers into explicit assumptions/open questions.
  - Alternatives: project-configurable threshold; inferred threshold based on feature size; mandatory extra round with no waiver path.
  - Why: Plan A excludes framework/config work, and a fixed threshold keeps the gate visible, simple, and testable without trapping interactive users in an unnecessary loop once they knowingly accept the assumptions.
  - Decided by: planner-proposed.

- **D-011 — Revision pass incorporated the reviewer findings**
  - Decision: revise Plan A per plan-reviewer findings PR-001 through PR-005 without expanding scope beyond prompt-only changes.
  - Alternatives: re-plan from scratch; defer the findings to implementation.
  - Why: the findings identified concrete contract, duplication, waiver, persistence-boundary, and scope-clarity issues that would otherwise propagate into tasks and prompt tests.
  - Decided by: planner-proposed.

## Design

### Module structure

**Existing prompt modules to modify**
- `bundled/coding/coding/prompts/cosmo.md` — entry router for planning requests. Single responsibility: route planning work among product framing via `spec-writer`, Cosmo-facilitated interactive design dialogue, and autonomous planner handoff.
- `bundled/coding/coding/prompts/spec-writer.md` — spec capture contract. Single responsibility: drive the human conversation to a spec-ready state, make readiness visible, and bound unresolved assumptions.
- `bundled/coding/coding/prompts/planner.md` — plan handoff gate. Single responsibility: require a visible plan-readiness check before `plan_create` while reusing the planner’s existing quality-criteria rules as the single source of truth.

**New test modules**
- `tests/prompts/cosmo.test.ts` — assert router instructions are present and preserve the existing three-path behavior, route announcement, and direct-planner suggestion/default behavior.
- `tests/prompts/spec-writer.test.ts` — assert mandatory phase announcements, readiness rubric coverage, waiver/escalation rules, critical-assumption classification, and assumption-budget instructions.
- `tests/prompts/planner.test.ts` — assert the tailored plan-readiness rubric, reference to the existing QC rule, and autonomous fallback instructions.

No new runtime modules are introduced. Plan A stays entirely in persona prompts plus prompt-contract tests.

### Dependency graph

```text
human request
  -> cosmo.md router
     -> spec-writer.md readiness gate -> existing plan_create
     -> Cosmo-facilitated design dialogue in-session -> planner.md readiness gate -> existing plan_create
     -> planner.md readiness gate -> existing plan_create

prompt tests
  -> read prompt markdown files only
  -> assert required instructions via Vitest
```

Dependency direction stays one-way: tests depend on prompts; prompts depend only on existing tool availability and surrounding persona instructions. No `lib/` dependency changes.

### Key contracts

These TypeScript shapes are illustrative — they describe the conceptual structure of prompt-emitted text, not types to add to the repo. Plan A introduces no new TypeScript types.

**1. Cosmo route-announcement contract**

```ts
type PlannedRoute =
  | "spec-writer"
  | "cosmo-facilitates-dialogue"
  | "planner-autonomous";

interface RouteAnnouncement {
  route: PlannedRoute;
  why: string;
  next: string;
  bypass?: string;
}
```

Required behavior:
- announce one of the three routes before delegating or continuing;
- name at least one signal that drove the choice (fuzzy/no-spec, interactive-dialogue preference, or no-dialogue/autonomous preference);
- when routing to `spec-writer`, preserve the interactive planner bypass for users who already know the technical shape;
- when routing to `cosmo-facilitates-dialogue`, preserve the direct-planner suggestion from `bundled/coding/coding/prompts/cosmo.md:39` as a user choice, not a fourth router variant;
- when routing to `planner-autonomous`, proceed immediately for “just decide” / `go ahead` / `commit` signals, non-interactive runs, or after Cosmo has already settled direction through dialogue.

**2. Shared readiness-block shape**

```ts
interface ReadinessBlock {
  specificity: string[];
  constraints: string[];
  context: string[];
  successCriteria: string[];
  assumptions: { total: number; critical: number; threshold?: number };
  decision: "continue-dialogue" | "ready-to-write" | "ready-with-assumptions";
}
```

Shared contract:
- both `spec-writer` and `planner` must emit the same four visible factor headings;
- unchecked items remain visibly unchecked, not silently rewritten as passed;
- interactive mode blocks on unchecked required items until they are resolved or explicitly waived by the human;
- autonomous mode converts unchecked required items into explicit assumptions/open questions before the tool call;
- the readiness blocks stay conversational output before `plan_create`; they are not added as new persisted sections in `spec.md` or `plan.md`.

**3. Critical-assumption classification contract (`spec-writer`)**

```ts
interface AssumptionBudget {
  total: number;
  critical: number;
  threshold: 3;
}
```

Critical assumptions are those that change user-visible behavior, scope boundaries, interaction with existing features, or acceptance criteria. When `critical >= 3` in interactive mode, `spec-writer` must run one more clarification round before writing the spec unless the human explicitly waives and chooses to proceed with documented assumptions.

### Integration seams

- `bundled/coding/coding/prompts/cosmo.md:37-40` currently encodes the three planning behaviors across four bullets: fuzzy/no-spec work goes to `spec-writer`; interactive engineering dialogue stays in Cosmo with `/skill:design-dialogue`; direct planner dialogue is suggested via `cosmonauts -a planner`; “just decide” / non-interactive runs spawn planner autonomously. Revise this seam into an explicit three-route decision tree plus route-announcement template without dropping any of those existing behaviors.
- `bundled/coding/coding/prompts/spec-writer.md:55-67` currently uses a “Know when to stop” heuristic and non-interactive fallback. This is the insertion seam for M2–M4: add mandatory phase cadence, a visible readiness block with unresolved items left visibly unchecked, explicit waiver language, and the `critical >= 3` escalation rule.
- `bundled/coding/coding/prompts/spec-writer.md:69-111` already defines the persisted spec output as `Purpose`, `Users`, `User Experience`, `Acceptance Criteria`, `Scope`, `Assumptions`, and `Open Questions`. Tighten those existing section instructions instead of adding a persisted `Readiness Check` section.
- `bundled/coding/coding/prompts/planner.md:103-125` already defines the single-source QC rule in step 5, and `bundled/coding/coding/prompts/planner.md:218-248` repeats the same constraints in the plan output format. The pre-`plan_create` readiness gate inserted near `bundled/coding/coding/prompts/planner.md:125-131` must reference the step-5 rule instead of introducing a third hard-coded copy.
- `bundled/coding/coding/prompts/planner.md:150-159,192-248` already define how assumptions, the Decision Log, and the Quality Contract appear in the persisted plan. The new `Plan Readiness Check` belongs before `plan_create` only and must not be added as a new persisted plan section.
- `bundled/coding/coding/skills/design-dialogue/SKILL.md:10,57-61,98-100` already defines pass-based cadence and explicitly excludes requirements capture. This is evidence for leaving the skill unchanged and encoding M3 only in `spec-writer.md`.
- `bundled/coding/coding/agents/spec-writer.ts:9-11` shows `spec-writer` stays on readonly tools, the plans extension, and skills `["pi", "plan"]`; Plan A therefore cannot rely on a newly loaded skill without violating scope.
- `tests/prompts/integration-verifier.test.ts:1-24` and `tests/prompts/quality-manager.test.ts:1-51` establish the existing prompt-contract test style: read the markdown file with `readFile`, then assert required phrases with `toContain`. New prompt tests must follow that exact pattern.

### Seams for change

- The four-factor rubric shell is stable; individual checklist items are the planned seam for future evolution. If Plan B adds typed schemas or a spec reviewer, those later mechanisms can reuse the same factor headings without rewriting human-facing terminology.
- The assumption budget is intentionally fixed in Plan A. If observation shows the threshold is wrong, the only planned seam is prompt text; configurability is deferred to Plan B or later.
- The prompt tests should assert durable phrases and section labels, not every line of prompt copy, so later wording cleanup does not cause churn while still protecting the gate behavior and the non-persisted boundary.

## Approach

Keep the existing prompt shape and strengthen the weakest transition points instead of reorganizing files.

**Cosmo router (`bundled/coding/coding/prompts/cosmo.md`)**
- Replace the current planning-routing bullets at `cosmo.md:37-40` with an explicit three-route decision tree embedded in the existing “Additional Cosmo-specific delegation rules” list.
- Add a visible route announcement that covers all three routes while preserving the existing planner-bypass/direct-planner wording.

Signal table:

| Signals | Route | Behavior |
| --- | --- | --- |
| Idea is fuzzy and no spec exists | `spec-writer` | Spawn `spec-writer` for product framing before any planner handoff. |
| User wants to dialogue the design interactively in Cosmo, or the request is concrete enough to discuss architecture with back-and-forth | `cosmo-facilitates-dialogue` | Cosmo loads `/skill:design-dialogue`, walks frame → shape → detail in-session, records a Decision Log, then spawns `planner` autonomously with the settled direction embedded. |
| User says `just decide` / `go ahead` / `commit`, the run is non-interactive, or Cosmo dialogue has already settled direction | `planner-autonomous` | Spawn `planner` autonomously with the raw request or the in-session Decision Log. |

Planned excerpt:

```md
Route: <spec-writer|cosmo-facilitates-dialogue|planner-autonomous>
Why: <one sentence tied to fuzzy/no-spec, interactive-dialogue, or no-dialogue signals>
Next: <spawn spec-writer | I’ll facilitate the design dialogue here, then hand the settled direction to planner | I’ll spawn planner autonomously now>
If route = spec-writer and you already know the technical shape, I can go straight to planner.
If route = cosmo-facilitates-dialogue and you prefer planner-led dialogue, use `cosmonauts -a planner "..."`.
```

**Spec-writer gate (`bundled/coding/coding/prompts/spec-writer.md`)**
- Add a mandatory interactive cadence immediately under section 2 without introducing new top-level structure: `Frame` (purpose/users), `Shape` (experience/scope/interactions), `Detail` (ACs/assumptions/readiness).
- Replace the current `spec-writer.md:55-67` exit heuristic with a required readiness block and explicit blocking/waiver rules.
- Expand the non-interactive fallback so autonomous runs convert blockers to `Assumptions`/`Open Questions` instead of stalling.
- Tighten `Acceptance Criteria` and `Assumptions` guidance in `spec-writer.md:91-107` so the output format stays unchanged while reflecting the rubric.

Planned excerpts:

```md
Frame → Shape: "I understand the purpose and user. Moving to the user flow and scope unless you want to revisit."
Shape → Detail: "The flow is clear. Moving to acceptance criteria, assumptions, and readiness."
Detail → Write: "Here’s the readiness check and what I’ll write — approve, correct, or expand?"
```

```md
Readiness Check
- Specificity
  - [ ] Purpose and primary user are explicit
  - [ ] Happy path is traced end-to-end
  - [ ] At least one failure, invalid-input, or cancel flow is described
- Constraints
  - [ ] In-scope and out-of-scope are listed
  - [ ] Existing-feature interactions are named
- Context
  - [ ] Relevant code/docs are cited
- Success criteria
  - [ ] User-verifiable ACs are drafted
  - [ ] At least one-third cover error, edge, or cancel paths
Assumptions: total <n>, critical <n>/3
Unchecked required items stay visibly unchecked.
If interactive, missing required items block spec writing until resolved or explicitly waived.
If autonomous, convert missing required items into explicit Assumptions/Open Questions before writing.
```

```md
Mark an assumption critical when it changes user-visible behavior, scope boundaries, existing-feature interaction, or acceptance criteria.
If critical assumptions >= 3 in interactive mode, do one more clarification round before writing unless the human explicitly waives with `proceed with assumptions`.
```

**Planner gate (`bundled/coding/coding/prompts/planner.md`)**
- Insert a short `Plan Readiness Check` between `planner.md:125` and `planner.md:127`.
- Tailor the rubric items to architecture while preserving the same four headings.
- Point autonomous fallback at the planner’s existing assumptions/Decision Log rules (`planner.md:150-159`).
- Reference the existing step-5 QC rule instead of restating hard-coded counts in the readiness block.

Planned excerpt:

```md
Plan Readiness Check
- Specificity: scope/non-goals explicit; major ambiguities resolved or logged as assumptions
- Constraints: module boundaries, dependency direction, and integration seams are explicit
- Context: existing code paths/patterns were verified with file:line references
- Success criteria: the QC section meets the 3–8 / ≥1/3 failure-mode rule already defined in step 5
If interactive, missing required items block `plan_create` until resolved or explicitly waived.
If autonomous, convert blockers into explicit assumptions before `plan_create`.
```

**Verification strategy**
- Follow the repo’s existing prompt-test pattern from `tests/prompts/integration-verifier.test.ts:1-24` and `tests/prompts/quality-manager.test.ts:1-51`.
- Do not snapshot full prompt files. Assert only the durable contract strings that define routing, phase transitions, blocking behavior, threshold language, and the planner readiness block’s reference to the existing QC rule.
- Use reviewer inspection for the non-persisted-output boundary: the readiness blocks must stay outside the persisted `spec.md` and `plan.md` output formats.

## Files to Change

- `bundled/coding/coding/prompts/cosmo.md` -- rewrite the planning router as an explicit three-route decision tree, add a route announcement covering all three routes, and preserve planner-bypass/direct-planner wording.
- `bundled/coding/coding/prompts/spec-writer.md` -- add mandatory interactive phases, phase-announcement templates, the visible readiness block, visible unchecked-item/waiver rules, the fixed assumption budget with explicit critical categories, and autonomous fallback wording; tighten `Acceptance Criteria`/`Assumptions` guidance without changing the persisted spec output sections.
- `bundled/coding/coding/prompts/planner.md` -- add a tailored plan-readiness block immediately before `plan_create`, reference the existing step-5 QC rule instead of duplicating it, and clarify autonomous conversion of blockers into assumptions without adding a persisted plan section.
- `tests/prompts/cosmo.test.ts` -- new prompt contract test covering the three-route decision tree, routing signals, route announcement, direct-planner suggestion, and default autonomous-planner wording.
- `tests/prompts/spec-writer.test.ts` -- new prompt contract test covering phase transitions, readiness rubric headings/items, visible unchecked-item behavior, waiver language, critical-assumption categories, threshold escalation, and autonomous fallback wording.
- `tests/prompts/planner.test.ts` -- new prompt contract test covering the tailored plan-readiness rubric, explicit reference to the existing QC rule, and autonomous fallback wording.

## Risks

1. **Router collapses the existing three-path planning flow and misroutes interactive design requests**
   - Blast radius: interactive Cosmo sessions, users who expect Cosmo-led design dialogue, and users who want planner-led dialogue via the documented direct-planner suggestion.
   - Classification: **Mitigated**
   - Countermeasure: codify the three-route contract, add the signal table and route-announcement template, and lock the preserved behaviors with `tests/prompts/cosmo.test.ts`.

2. **Generic rubric language fails to block real gaps**
   - Blast radius: `spec-writer` and `planner` both look more rigorous while still allowing missing failure flows, missing integration constraints, or weak QC.
   - Classification: **Must fix**
   - Countermeasure: use the same four headings but tailor the checklist items per role, and lock those role-specific items with prompt-contract tests.

3. **Mandatory phase transitions conflict with `design-dialogue` or imply unsupported skill loading**
   - Blast radius: prompt authors, future maintainers, and any attempt to mirror this behavior in the wrong layer.
   - Classification: **Mitigated**
   - Countermeasure: keep M3 in `spec-writer.md` only, cite `design-dialogue` as conceptual precedent, and make no skill or agent-definition changes.

4. **Assumption-budget escalation traps interactive users or deadlocks autonomous runs**
   - Blast radius: non-interactive `spec-writer`/`planner` runs, plus interactive spec sessions where a user knowingly accepts unresolved critical assumptions.
   - Classification: **Must fix**
   - Countermeasure: block only interactive runs, allow explicit human waiver for the `critical >= 3` escalation, and require autonomous runs to surface unmet blockers as assumptions/open questions and continue with narrower scope.

5. **Prompt edits drift later because they are not mechanically checked**
   - Blast radius: future prompt refactors could silently delete the route announcement, waiver language, threshold categories, QC-rule reference, or non-persisted-output boundary.
   - Classification: **Mitigated**
   - Countermeasure: add focused prompt-contract tests for the verifier-covered behaviors and include a reviewer check that the persisted output sections remain unchanged.

## Quality Contract

- id: QC-001
  category: behavior
  criterion: "`cosmo.md` defines a three-route planning decision (`spec-writer`, Cosmo-facilitated dialogue, `planner-autonomous`), names the routing signals for each path, announces the chosen route before proceeding, preserves the direct-planner suggestion, and defaults to autonomous planner for 'just decide' or non-interactive runs."
  verification: verifier
  command: "bun run test -- tests/prompts/cosmo.test.ts"

- id: QC-002
  category: behavior
  criterion: "`spec-writer.md` defines mandatory Frame → Shape → Detail transitions with explicit handoff phrases before spec writing."
  verification: verifier
  command: "bun run test -- tests/prompts/spec-writer.test.ts"

- id: QC-003
  category: correctness
  criterion: "`spec-writer.md` emits a readiness block with all four quality-factor headings, keeps unmet required items visibly unchecked, and defines critical assumptions as changes to user-visible behavior, scope boundaries, existing-feature interaction, or acceptance criteria."
  verification: verifier
  command: "bun run test -- tests/prompts/spec-writer.test.ts"

- id: QC-004
  category: behavior
  criterion: "`spec-writer.md` requires one more clarification round when critical assumptions reach 3 in interactive mode unless the human explicitly waives with `proceed with assumptions`, and both `spec-writer.md` and `planner.md` state that autonomous/non-interactive runs convert unmet blockers into explicit assumptions or open questions instead of deadlocking before `plan_create`."
  verification: verifier
  command: "bun run test -- tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts"

- id: QC-005
  category: integration
  criterion: "`planner.md` adds a tailored pre-`plan_create` readiness block that checks scope clarity, dependency/integration completeness, and that the QC section satisfies the rule already defined in planner step 5 rather than restating a new hard-coded copy."
  verification: verifier
  command: "bun run test -- tests/prompts/planner.test.ts"

- id: QC-006
  category: correctness
  criterion: "The modified prompt and prompt-test files pass repository lint/format checks after the edits."
  verification: verifier
  command: "bun run lint"

- id: QC-007
  category: behavior
  criterion: "The existing spec-writer output format (`Purpose`, `Users`, `User Experience`, `Acceptance Criteria`, `Scope`, `Assumptions`, `Open Questions`) is unchanged — the `Readiness Check` block does not appear as a new persisted section; likewise, `Plan Readiness Check` remains conversational-only and is not added as a persisted plan section."
  verification: reviewer

## Implementation Order

1. **Spec-writer gate first** — update `bundled/coding/coding/prompts/spec-writer.md` for M2–M4 in one pass: mandatory phases, readiness block, visible unchecked-item behavior, blocking/waiver rules, fixed assumption budget with critical categories, and autonomous fallback. This is the highest-risk file and defines the shared rubric language.
2. **Entry/exit prompts second** — update `bundled/coding/coding/prompts/cosmo.md` and `bundled/coding/coding/prompts/planner.md` to preserve the three-route router, align the plan-readiness gate with the spec-writer contract, and reference the planner’s existing QC rule rather than duplicating it.
3. **Prompt-contract tests third** — add `tests/prompts/cosmo.test.ts`, `tests/prompts/spec-writer.test.ts`, and `tests/prompts/planner.test.ts` using the existing `readFile` + `toContain` pattern to lock the new instructions.
4. **Verification sweep last** — run the targeted prompt tests, then `bun run lint`, and perform a prompt-review pass confirming the readiness blocks stay out of the persisted spec/plan output formats.
