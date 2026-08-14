---
title: 'Spec/plan intent, mutability, and the deviation protocol'
status: completed
createdAt: '2026-07-26T14:30:39.745Z'
updatedAt: '2026-07-26T14:44:17.924Z'
---

## Overview

Teach the spec → plan → tasks → implementation system when to auto-correct,
when to amend the plan on the record, and when to stop and ask. Four additions:
a required spec `## Intent` section (goal plus `INV-###` invariants), mutability
defaults derived from Decision-Log provenance, a canonical amend-on-record
protocol, and a deviation classifier installed at the two points deviations
actually flow through — implementing agents and review-fix routing. All of it
is extracted from the ad-hoc practice of `episodic-log-detached-hardening`
(D-005, D-010, the reverted `f78862f` drift, the ratified perf-review PR-002);
the design record is `missions/spec-plan-intent-proposal.md`.

Intent for this work is single-sourced in `spec.md`; this plan cites INV-1
through INV-5 by ID and does not restate them.

This is artifact/prompt content work only. No `lib/` code changes; proof is
content tests in `tests/prompts/` and `tests/docs/`.

## Decision Log

- **D-001 — Intent is single-sourced in the spec; plans cite `INV-###` by ID**
  - Decision: `## Intent` lives in `spec.md` when a spec exists; plans cite
    invariants by ID and never restate them. A plan without a spec carries the
    Intent section itself and is then the single source.
  - Alternatives: a tagged echo atop the plan (rejected — restatement is where
    forked authority starts, INV-2); intent only in the plan (rejected — the
    spec is the product source of truth whenever it exists).
  - Why: INV-2; spec and plan share a directory, so an ID is a one-hop pointer.
  - Decided by: human, 2026-07-26 (proposal §8.1 sign-off).

- **D-002 — Mutability defaults derive from `Decided by:` provenance**
  - Decision: entries whose `Decided by:` names the human are ratified; entries
    naming an agent (`planner-proposed`, `implementer, amend-on-record`,
    review-derived) are derived; entries with no provenance are ratified.
    Explicit `(ratified)` / `(derived)` markers on the entry title override the
    default and are written only when overriding.
  - Alternatives: a new mandatory `Mutability:` field (rejected — ceremony on
    every entry, INV-1); derived-when-unmarked (rejected — unsafe default that
    rewards omitting provenance).
  - Why: zero migration, zero new required fields, safe default (INV-1, INV-3).
  - Decided by: human, 2026-07-26 (proposal §8.2 sign-off).

- **D-003 — The classifier ships as guidance plus the QM routing rule; no new pipeline stage**
  - Decision: the classifier lives in skills/prompts, and enforcement lands in
    the quality-manager routing step, which already runs. Mechanical checks
    (e.g. every supersession pointer has a matching decision entry) are
    deferred until a dogfooded plan shows drift surviving guidance.
  - Alternatives: an automated reviewer/verifier pipeline stage (rejected — the
    observed failure was judgment at apply time, not a missing stage, and a
    stage taxes every run for a rare event, INV-1).
  - Why: the real drift entered through remediation routing; that step is the
    enforcement point that costs nothing new.
  - Decided by: human, 2026-07-26 (proposal §8.3 sign-off).

- **D-004 — Ratification is human-only; agents draft, never approve**
  - Decision: the escalation deliverable is a drafted decision entry, not
    applied code. Bounded agent ratification is deferred; if it ever arrives,
    the bound itself must be a ratified decision entry.
  - Alternatives: bounded review-agent ratification now (rejected — `f78862f`
    proves agents under gate pressure manufacture evidence; INV-3 is the
    backstop).
  - Why: INV-3.
  - Decided by: human, 2026-07-26 (proposal §8.4 sign-off).

- **D-005 — One canonical home: `references/deviation-protocol.md` under work-artifacts**
  - Decision: the classifier, amend-on-record mechanics, mutability defaults,
    and the reviewer/remediation rule live in one new work-artifacts reference.
    Every skill/prompt applies it with a few role-specific lines and routes to
    the reference for the rules.
  - Alternatives: inline the rules in each prompt (rejected — N copies drift,
    the same reason plan-format routes to work-artifacts); a new standalone
    skill (rejected — work-artifacts already owns the artifact contract).
  - Why: INV-1, INV-2; matches the existing reference-routing architecture.
  - Decided by: planner-proposed (derived).

## Behaviors

### B-001 - Spec format requires an Intent section

- Source: AC-001
- Context: an author drafts a planned feature/refactor spec
- Action: they consult the canonical spec format reference
- Expected: `## Intent` is listed as a required section shaped as one goal
  sentence plus `INV-###` invariants that outrank any mechanism; invariants
  are named as ratified ground; rankings are stated where invariants can
  conflict; `## Purpose` remains narrative
- Seam: `domains/shared/skills/work-artifacts/references/spec-format.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `requires an intent section with ranked invariants in spec format`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-001`

### B-002 - Plan format requires a Decision Log with provenance-derived mutability

- Source: AC-002
- Context: an author drafts or amends a full planned feature/refactor plan
- Action: they consult the canonical plan format reference
- Expected: `## Decision Log` is a required full-plan section; entries carry
  Decision / Alternatives / Why / Decided by plus `Supersedes:` when amending;
  mutability defaults derive from `Decided by:` provenance (human ⇒ ratified,
  agent ⇒ derived, absent ⇒ ratified) with explicit markers only to override;
  plans cite spec `INV-###` IDs instead of restating intent
- Seam: `domains/shared/skills/work-artifacts/references/plan-format.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `requires a decision log with provenance-derived mutability in plan format`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-002`

### B-003 - The deviation protocol defines the classifier and amendment mechanics

- Source: AC-003
- Context: any agent detects a collision between recorded ground and reality
- Action: it consults the deviation protocol reference
- Expected: the reference defines the four classifier routes (snap back /
  amend-on-record / halt-and-escalate / record), the mutability defaults, the
  five amend-on-record steps (decision first; original text as an honestly
  rejected alternative; served invariant named; dated supersession pointer;
  amendment surfaced in notes and reports), the reviewer/remediation rule,
  and the red flag that changing a test's expected behavior to go green is
  always drift
- Seam: `domains/shared/skills/work-artifacts/references/deviation-protocol.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `defines the deviation classifier and amend-on-record protocol`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-003`

### B-004 - work-artifacts routes to the deviation protocol

- Source: AC-003
- Context: an agent loads `/skill:work-artifacts` for artifact rules
- Action: it scans the reference routing list
- Expected: `references/deviation-protocol.md` is listed with a one-line
  description of when to load it
- Seam: `domains/shared/skills/work-artifacts/SKILL.md`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `routes deviation handling to the deviation protocol reference`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-004`

### B-005 - Plan readiness checks intent and routes deviations

- Source: AC-008
- Context: an agent runs the plan readiness check or amends a live plan
- Action: it consults `/skill:plan`
- Expected: the readiness check verifies Intent presence (spec when present,
  plan otherwise) with rankings where invariants can conflict; the lifecycle
  states that deviations from a ratified/derived ground go through the
  deviation protocol, with a route to the reference
- Seam: `domains/shared/skills/plan/SKILL.md`
- Test: `tests/prompts/plan-skill.test.ts` > `checks intent presence and routes deviations to the protocol`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-005`

### B-006 - Task skill classifies mid-implementation AC changes

- Source: AC-008
- Context: acceptance criteria turn out to be wrong mid-implementation
- Action: the agent consults `/skill:task` Common Problems
- Expected: the entry routes through the deviation classifier first — task ACs
  restating a ratified spec criterion or invariant escalate rather than being
  edited; ACs that are derived plan ground are updated on the record before
  continuing
- Seam: `domains/shared/skills/task/SKILL.md`
- Test: `tests/prompts/task-skill.test.ts` > `routes mid-implementation acceptance criteria changes through the deviation classifier`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-006`

### B-007 - Spec-writer captures the intent section

- Source: AC-006
- Context: the spec-writer frames a planned feature with the human
- Action: it drafts the spec
- Expected: the prompt directs it to capture the goal and the invariants that
  outrank mechanism into `## Intent` with `INV-###` IDs, distinct from
  narrative Purpose, and to state rankings where invariants can conflict
- Seam: `bundled/coding/prompts/spec-writer.md`
- Test: `tests/prompts/spec-writer.test.ts` > `captures goal and invariants in the intent section`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-007`

### B-008 - Planner records provenance and ranks intent over mechanism

- Source: AC-006
- Context: the planner writes or revises Decision Log entries
- Action: it records decisions and sanity-checks the design
- Expected: the prompt requires `Decided by:` provenance on every entry (the
  mutability default follows from it), and the sanity-check pass includes
  confirming that mechanisms which could collide with a spec invariant name
  which one wins
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `records decision provenance and checks mechanism against intent`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-008`

### B-009 - Worker classifies deviations instead of ad hoc judgment

- Source: AC-004
- Context: a worker discovers its task or the plan colliding with reality
- Action: it consults its prompt's deviation rules
- Expected: the prompt routes the collision through the deviation classifier
  (snap back / amend-on-record / halt-and-escalate / record); escalation is
  Blocked plus a drafted decision entry in implementation notes; ad hoc
  "reasonable decision" judgment is scoped to ground the classifier leaves to
  the worker; amendments are surfaced by decision ID in notes
- Seam: `bundled/coding/prompts/worker.md`
- Test: `tests/prompts/worker.test.ts` > `routes plan deviations through the classifier with drafted escalations`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-009`

### B-010 - Quality manager classifies remediations against ratified ground

- Source: AC-005
- Context: the quality-manager routes findings to remediation
- Action: it decides the remediation path for each finding
- Expected: the prompt states that a finding is evidence and its suggested fix
  an alternative to weigh; each remediation is classified against the plan's
  ratified ground before routing; a remediation that would supersede ratified
  ground becomes a decision-needed report item and is never routed to fixer or
  a review-fix task; compound findings are split so legitimate parts proceed
- Seam: `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `classifies remediations against ratified ground before routing`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-010`

### B-011 - Plan reviewer verifies intent and flags ratified-ground findings

- Source: AC-006
- Context: the plan-reviewer reviews a full planned feature/refactor plan
- Action: it works its review dimensions and writes findings
- Expected: the prompt has it verify the Intent section exists with rankings
  where invariants can conflict, and requires findings whose fix would touch
  ratified ground (spec ACs, invariants, human-decided entries) to say so
  explicitly
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/plan-reviewer.test.ts` > `verifies intent presence and names ratified ground in findings`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-011`

### B-012 - Task manager carries mutability into task handoff

- Source: AC-006
- Context: the task-manager sweeps Design and the Decision Log for constraints
- Action: it creates tasks from a plan
- Expected: the sweep carries ratified-ground constraints into the owning
  task's acceptance criteria or description, naming that changing them is
  stop-and-escalate ground rather than worker-adjustable detail
- Seam: `bundled/coding/prompts/task-manager.md`
- Test: `tests/prompts/task-manager.test.ts` > `carries ratified-ground constraints into task acceptance criteria`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-012`

### B-013 - Testing standards state the evidence-integrity rule

- Source: AC-007
- Context: an agent is tempted to change a test asserting planned behavior
- Action: it consults the testing standards
- Expected: the standards state that a test asserting planned or ratified
  behavior is evidence — it changes only after the plan text it proves,
  citing the decision that changed it
- Seam: `docs/testing.md`
- Test: `tests/docs/testing-standards.test.ts` > `states that planned behavior tests change only after the plan text they prove`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-013`

### B-014 - Archive distills supersessions

- Source: AC-008
- Context: an agent distills an archived plan into memory
- Action: it consults `/skill:archive` extraction guidance
- Expected: Key Decisions extraction explicitly includes supersessions and
  amend-on-record decisions — what was amended, why, and what it replaced
- Seam: `domains/shared/skills/archive/SKILL.md`
- Test: `tests/prompts/archive-skill.test.ts` > `distills supersessions and amend-on-record decisions into key decisions`
- Marker: `@cosmo-behavior plan:spec-plan-intent#B-014`

## Design

Three layers, dependency direction strictly downward:

1. **Canonical layer** (B-001..B-004). `references/deviation-protocol.md` owns
   the rules: the mutability table (ratified/derived, provenance defaults, the
   always-ratified list — invariants, spec AC letter, scope exclusions,
   gate/config defaults), the four-route classifier, the five amend-on-record
   steps, the reviewer/remediation rule, and the red flags. `spec-format.md`
   gains the `## Intent` shape; `plan-format.md` gains the `## Decision Log`
   requirement, entry shape, and the INV-citation rule; the work-artifacts
   SKILL routing table gains one line.
2. **Role application layer** (B-005..B-012, B-014). Each skill/prompt applies
   the protocol at its own decision point in a few lines and routes to the
   reference for the rules. No file restates the classifier; the exact leg
   names — snap back, amend-on-record, halt-and-escalate, record — are shared
   vocabulary across every file.
3. **Evidence layer** (all behaviors, B-013). Content tests assert the exact
   load-bearing strings, pinned with behavior markers. `docs/testing.md`
   carries the evidence-integrity rule the drift violated.

## Files to Change

- **New:** `domains/shared/skills/work-artifacts/references/deviation-protocol.md` — the canonical rules. Test: `tests/prompts/work-artifacts-skill.test.ts`.
- `domains/shared/skills/work-artifacts/references/spec-format.md` — required `## Intent` shape. Test: `tests/prompts/work-artifacts-skill.test.ts`.
- `domains/shared/skills/work-artifacts/references/plan-format.md` — required `## Decision Log`, entry shape, provenance defaults, INV citation. Test: `tests/prompts/work-artifacts-skill.test.ts`.
- `domains/shared/skills/work-artifacts/SKILL.md` — routing line. Test: `tests/prompts/work-artifacts-skill.test.ts`.
- `domains/shared/skills/plan/SKILL.md` — readiness + deviation routing. Test: `tests/prompts/plan-skill.test.ts`.
- `domains/shared/skills/task/SKILL.md` — classifier routing for AC changes. Test: `tests/prompts/task-skill.test.ts`.
- `domains/shared/skills/archive/SKILL.md` — supersession distillation. Test: `tests/prompts/archive-skill.test.ts` (new).
- `bundled/coding/prompts/spec-writer.md` — Intent capture. Test: `tests/prompts/spec-writer.test.ts`.
- `bundled/coding/prompts/planner.md` — provenance + intent-collision check. Test: `tests/prompts/planner.test.ts`.
- `bundled/coding/prompts/worker.md` — classifier routing. Test: `tests/prompts/worker.test.ts`.
- `bundled/coding/prompts/quality-manager.md` — remediation classification. Test: `tests/prompts/quality-manager.test.ts`.
- `bundled/coding/prompts/plan-reviewer.md` — Intent verification + ratified-ground flagging. Test: `tests/prompts/plan-reviewer.test.ts`.
- `bundled/coding/prompts/task-manager.md` — mutability in the constraint sweep. Test: `tests/prompts/task-manager.test.ts`.
- `docs/testing.md` — evidence-integrity rule. Test: `tests/docs/testing-standards.test.ts` (new).

## Risks

- **Ceremony creep.** If a role file restates protocol rules, copies drift.
  Stop condition: a skill/prompt needing more than ~12 new lines means the
  reference is wrong — fix the reference, not the prompt (INV-1, INV-2).
- **Vocabulary drift.** The classifier leg names must be byte-identical across
  every file; the content tests pin them.
- **Prompt displacement.** worker/quality-manager prompts are load-bearing;
  edits must extend, not replace, existing rules — all existing content tests
  for those files must stay green untouched. Any need to alter an existing
  test's expectation is itself a deviation-protocol event (INV-4).
- **Stack drift.** Any project-specific command in shipped content is a hard
  failure (INV-5).

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Existing suite plus all B-001–B-014 content tests pass; lint and type checks are clean | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every behavior has required fields, a root-relative test file that exists, and exactly one matching marker near its executable test | artifact evidence | hard fail |
| 3 | `duplication` | bindable | unbound | The classifier and amendment mechanics are defined in exactly one file; role files apply and route, never restate | pending | unbound; reviewer judgment required |

## Implementation Order

Test-first per behavior: write the content test RED, then edit the shipped
file to GREEN. If any stage collides with this plan's recorded ground, apply
the deviation protocol this plan ships — self-referential dogfooding is the
point.

1. **Canonical layer (B-001..B-004).** The new reference plus format/routing
   edits. Everything downstream cites this vocabulary; it lands first.
2. **Lifecycle skills (B-005, B-006).** Plan readiness and task-AC routing.
3. **Authoring prompts (B-007, B-008).** Spec-writer Intent capture; planner
   provenance and intent-collision check.
4. **Implementing/reviewing prompts (B-009..B-012).** Worker, quality-manager,
   plan-reviewer, task-manager.
5. **Evidence and archive (B-013, B-014).** Testing standards rule; archive
   supersession distillation.
6. **Gates (AC-009).** Full test, lint, and type-check runs; stack-agnostic
   sweep of every touched shipped file.
