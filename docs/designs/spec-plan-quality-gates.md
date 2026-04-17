# Spec & Plan Quality Gates for Human-Agent Conversations

**Status:** Design. Plan A is approved for implementation; Plan B is deferred.

## Problem

The cosmonauts pipeline is rigorous once a plan exists. The `planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` chain materializes four quality factors at every stage:

1. **Specificity of requirements**
2. **Constraints**
3. **Context**
4. **Explicit success criteria**

But the *human↔Cosmo boundary* — the conversation that produces the spec or plan in the first place — has no comparable gates. A user can type "implement auth for my app" and Cosmo can delegate straight to a planner without first extracting purpose, users, experience, edge cases, or success criteria. Whatever vagueness enters at that boundary propagates through the rest of the pipeline, where the machinery is too late to recover the missing information.

Concretely, the gaps are:

- **No router.** Nothing forces fuzzy requests into `spec-writer`. Cosmo's judgment is the only filter, and fuzzy requests slip through.
- **Spec-writer's "know when to stop" is a vibe.** The prompt says "you have enough" when purpose, experience, ACs, edge cases, and scope are clear — but there is no visible rubric, no completeness check, and no shared artifact the human can audit before the spec is written.
- **The Quality Contract is planner-only.** Specs have no equivalent testable-criteria contract. ACs in `spec.md` are free-form and can be vague.
- **Specs are untyped markdown.** `plan_create` accepts any spec content. A spec missing error paths or edge cases is not detectable mechanically.
- **Assumptions travel silently.** Spec-writer is told to "flag assumptions" but there is no budget, no escalation, and no downstream consumer that forces resolution.
- **No adversarial review of specs.** `plan-reviewer` exists; `spec-reviewer` does not. A spec built on shared hallucination between human and agent has no fresh-context check.

## Goals

1. Human↔agent conversations aimed at producing a spec or plan satisfy the four quality factors before downstream work begins.
2. The quality factors are observable as structure (artifacts, rubrics, schemas) rather than intentions (prompt guidance).
3. Mechanisms preserve conversational flow — the human talks naturally, the agent carries the structure.
4. Gaps are mechanical where possible (schema validation, routing rules), judgmental only where necessary (adversarial review).
5. Backwards compatible: existing workflows (`plan-and-build`, `spec-and-build`, `spec-and-tdd`) keep working; gates enhance, not replace.

## Non-Goals

- Changing the downstream pipeline (planner, task-manager, coordinator, quality-manager). Those already enforce rigor well.
- Forcing the human to fill out forms. Structure is on the agent's side.
- Gating every conversational turn. Gates belong at transitions (phase → phase, spec → plan, plan → tasks).
- Replacing `plan-reviewer` or existing QC criteria mechanisms.

## Current Primitives

**Already in place:**

- `spec-writer` agent with sections for Purpose, Users, Experience, ACs, Scope, Assumptions, Open Questions (`bundled/coding/coding/prompts/spec-writer.md`).
- `planner` agent with Decision Log, Architecture, Integration Seams, Quality Contract (`bundled/coding/coding/prompts/planner.md`).
- `plan-reviewer` agent performing adversarial plan review on six dimensions, writing findings to `missions/plans/<slug>/review.md` (`bundled/coding/coding/prompts/plan-reviewer.md`).
- `design-dialogue` skill defining Frame → Shape → Detail cadence for interactive planning (advisory, not enforced).
- `plan_create` / `plan_edit` / `plan_view` tools (`lib/plans/`).
- Four-layer prompt composition: base → capabilities → persona → runtime.
- Workflows mapped in `bundled/coding/coding/workflows.ts`.

**Missing:**

- Entry-level router at Cosmo that classifies fuzzy vs. concrete requests.
- Visible readiness rubric that spec-writer and planner must satisfy before calling `plan_create`.
- Phase-transition protocol (Frame/Shape/Detail) enforced as mandatory output, not advisory.
- Assumption budget with explicit escalation threshold.
- Typed spec schema enforced at the `plan_create` tool boundary.
- `spec-reviewer` agent mirroring the `plan-reviewer` pattern.
- Workflow wiring so `spec-and-build` / `spec-and-tdd` invoke `spec-reviewer` between spec and plan.

## Four-Factor Analysis

| Factor | Where enforced today | Gap at entry/spec boundary |
|---|---|---|
| Specificity | Planner's "Prescribe, Do Not Suggest"; task-manager's outcome-ACs | Spec ACs are free-form; no vagueness detection pre-plan |
| Constraints | Capability packs; plan contracts; sub-agent allowlists | Spec does not surface interactions with existing features |
| Context | Mandatory exploration in planner/worker; skills index; plan-as-shared-context | Spec-writer exploration is advisory; no citation requirement |
| Success criteria | Quality Contract (planner); ACs (task-manager) | Spec ACs have no ≥⅓ failure-mode rule, no testability check |

## Proposed Mechanisms

Six mechanisms, layered. Each targets specific gaps.

### M1 — Cosmo router

A classification step in Cosmo's prompt that, before delegating to `planner`, asks whether the request needs product framing first.

**Signals that route to spec-writer:**
- No `spec.md` exists for the area of work.
- Request contains intent verbs without concrete nouns ("improve", "clean up", "make better").
- Request mentions users/experience/workflow (product framing).
- Request spans multiple unknowns.

**Signals that route to planner:**
- `spec.md` exists.
- Request names specific files/functions/APIs.
- Request is a concrete technical change.

Cosmo must state the route before taking it and offer the alternative: *"This looks fuzzy on user experience — I'd start with spec-writer to capture product framing. Alternatively go straight to planner if you already know the shape. Which?"*

### M2 — Visible readiness rubric

Before calling `plan_create`, spec-writer (and planner in autonomous mode) must produce a visible readiness checklist covering all four factors, surfaced to the human for approval:

```
Readiness check:
  Specificity:
    - [x] Purpose stated in one sentence
    - [x] Primary user action traced end-to-end
    - [ ] Failure/cancel flow described        ← blocks exit
  Constraints:
    - [x] In-scope / out-of-scope listed
    - [ ] Interactions with existing features  ← blocks exit
  Context:
    - [x] Relevant existing code identified (3 file refs)
  Success criteria:
    - [x] 4 user-verifiable ACs, 2 cover error paths
  Assumptions: 2 flagged, 0 critical
```

Converts the agent's private "am I ready?" judgment into a shared artifact. Missing items block exit — the agent continues the conversation until the rubric is satisfied or the human explicitly waives an item.

### M3 — Phase transitions with explicit handoffs

Make `design-dialogue`'s Frame → Shape → Detail cadence mandatory in interactive spec-writer runs. The agent announces transitions:

- *"I have Purpose and Users. Moving to Experience unless you want to revisit."*
- *"Experience is clear. Moving to edge cases."*
- *"I believe I have enough. Here's what I'll write — approve, correct, or expand?"*

This surfaces premature convergence (jumping Frame → Detail without Shape) and gives the human well-timed injection points.

### M4 — Assumption budget

Assumptions are technical debt carried into planning. Make them visible and bounded:

> "This spec contains 7 assumptions, 2 marked critical. Budget is 3 critical before a second dialogue round is required. Proceed, or resolve the criticals now?"

Forces the human to explicitly convert assumptions to requirements or accept the risk knowingly. Currently assumptions sit in a bullet list and get ignored downstream.

### M5 — Typed spec schema (deferred to Plan B)

Convert the spec from free markdown to a typed structure validated at `plan_create`:

```ts
interface Spec {
  purpose: string;              // required, ≤3 sentences
  users: UserDescription[];     // required, ≥1
  experience: {
    happyPath: Step[];          // required, ≥1
    errorPaths: Step[];         // required, ≥1 — enforces failure thinking
    cancelPaths: Step[];        // required if stateful
  };
  acceptanceCriteria: AC[];     // required, 3–10, ≥⅓ non-happy
  scope: { in: string[]; out: string[] };
  assumptions: Assumption[];    // each with {text, confidence, verifyBy}
  openQuestions: string[];
}
```

Makes gaps mechanical rather than judgmental. Touches framework code (`lib/plans/`), not just prompts. Higher risk — defer until M1–M4 are shown to be insufficient on their own.

### M6 — spec-reviewer agent (deferred to Plan B)

Mirrors the `plan-reviewer` pattern. Fresh-context adversarial pass against the four factors:

- **Specificity**: are any ACs vague? Flag them.
- **Constraints**: are interactions with existing features traced? Spot-check 2 integration points.
- **Context**: are named files/functions real? Grep them.
- **Success criteria**: can each AC be verified by a human in ≤2 minutes? If not, flag.

Writes findings to `missions/plans/<slug>/spec-review.md`. The spec-writer reads findings and revises before the plan is built. Workflow wiring: `spec-and-build` becomes `spec-writer → spec-reviewer → spec-writer → planner → plan-reviewer → planner → task-manager → ...`.

## Phasing

### Plan A — Prompt-only changes (approved, ship now)

Low-risk, high-leverage. No framework changes, no new agents, no workflow rewiring.

- **M1** Cosmo router: prompt-level decision tree added to `bundled/coding/coding/prompts/cosmo.md`.
- **M2** Readiness rubric: required output block in `bundled/coding/coding/prompts/spec-writer.md` and `bundled/coding/coding/prompts/planner.md` before `plan_create`.
- **M3** Phase transitions: promote `design-dialogue` cadence from advisory to mandatory in `spec-writer.md` interactive mode; announce transitions explicitly.
- **M4** Assumption budget: explicit counting and escalation threshold in `spec-writer.md`.

Expected outcome: 80% of the quality-gate value from prompt changes alone, with a one-week observation window before committing to Plan B.

### Plan B — Structural changes (deferred, pending evidence)

Revisit after Plan A has run long enough to see residual failure modes.

- **M5** Typed spec schema in `lib/plans/` with validation at `plan_create`.
- **M6** `spec-reviewer` agent definition, prompt, and workflow wiring in `bundled/coding/coding/` plus updates to `spec-and-build` and `spec-and-tdd` workflows.

Trigger conditions for proceeding to Plan B:
- Plan A specs still regularly omit error paths or edge cases.
- Downstream planners still frequently request clarification on spec content.
- Specs pass through the pipeline with undetected factual errors (hallucinated file refs, nonexistent APIs).

If Plan A is sufficient, Plan B can be dropped entirely.

## Decision Log

- **D-001 — Ship Plan A prompt-only first**
  - Decision: implement M1–M4 as prompt changes; defer M5–M6.
  - Alternatives: (a) ship everything at once; (b) ship only M1; (c) ship M5 first to force structure.
  - Why: prompt-only changes are lowest risk, fastest to ship, and produce observable evidence about whether structural changes are needed. Avoids speculative framework work.
  - Decided by: user-directed.

- **D-002 — Router lives at Cosmo prompt level, not as a typed classifier tool**
  - Decision: M1 is a decision tree embedded in `cosmo.md`, not a new tool.
  - Alternatives: (a) new `classify_request` tool with typed output; (b) hard-coded keyword rules in `lib/`.
  - Why: keeps the change in the prompt surface, consistent with how Cosmo's other routing rules already work. A tool can be added later if prompt-level classification proves unreliable.
  - Decided by: planner-proposed, user-approved implicitly by approving Plan A scope.

- **D-003 — Readiness rubric is a shared artifact, not a private check**
  - Decision: M2 rubric is emitted visibly to the human before `plan_create`.
  - Alternatives: (a) internal self-check in the prompt; (b) post-hoc validation by a reviewer.
  - Why: the value of the rubric is that the human can audit what the agent thinks is "done." A private check reproduces the current failure mode under a new name.
  - Decided by: planner-proposed.

- **D-004 — Typed spec schema deferred**
  - Decision: M5 moves to Plan B.
  - Alternatives: (a) ship schema now alongside prompts; (b) drop schema entirely.
  - Why: framework change with non-trivial design decisions (schema shape, validation strictness, error surfacing). Prompt changes may make the schema unnecessary. Easier to add structural enforcement once the shape is stable than to roll it back.
  - Decided by: user-directed.

- **D-005 — spec-reviewer deferred**
  - Decision: M6 moves to Plan B.
  - Alternatives: (a) ship spec-reviewer alongside prompt changes; (b) never add spec-reviewer, rely on prompts only.
  - Why: a reviewer is expensive per invocation. If M1–M4 produce high-quality specs, a reviewer adds cost without proportional value. Ship cheap mechanisms first; add expensive ones only if needed.
  - Decided by: user-directed.

## Open Questions

- Should the readiness rubric in `planner.md` be identical to the one in `spec-writer.md`, or tailored to architectural concerns (integration seams, contract completeness, QC coverage)?
- In autonomous mode (no human present), does the rubric still block exit, or does it convert blocking items into explicit assumptions?
- How strict should the Cosmo router be about routing to `spec-writer`? Hard block on fuzzy signals, or soft nudge with an option to bypass?
- Does M3's phase-transition protocol conflict with the existing `design-dialogue` skill, or extend it? (Likely extend — the skill defines cadence, M3 makes it mandatory.)
- Where does the assumption-budget threshold come from — fixed in the prompt, configurable per project, or inferred from spec complexity?

These are for the planner to resolve during Plan A design, not this document.
