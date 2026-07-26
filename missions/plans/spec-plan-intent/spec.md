# Spec — spec/plan intent, mutability, and the deviation protocol

Implements the approved proposal at `missions/spec-plan-intent-proposal.md`
(kickoff: `missions/spec-plan-intent-kickoff.md`). The worked corpus behind
every rule is `missions/archive/plans/episodic-log-detached-hardening/`.

## Purpose

During implementation of a well-specified plan, better understanding emerges —
and sometimes the right move is to not comply with the original design,
sometimes to snap back to it, and sometimes to stop and ask a human. Today the
system has no explicit rule for telling those apart; agents decide ad hoc. One
real drift (commit `f78862f`, later reverted) silently contradicted ratified
design and rewrote the evidence test to match. The governing rule this work
encodes: **the plan is the thing you amend on the record — never the thing you
silently route around.** Deviation is not the failure; unrecorded deviation is.

## Intent

Goal: an agent that detects a collision between recorded ground and reality
always knows — from the artifacts alone — whether the change is its to make,
and every deviation that happens leaves a dated, reviewable record.

Invariants — mechanism yields to these; no local fix may trade one away:

- INV-1 — Legibility over ceremony: recording a deviation stays cheaper than
  routing around it. One decision entry plus one dated pointer; no new files
  per deviation, no approval loop for derived ground.
- INV-2 — One source of truth: intent lives in exactly one artifact; plans
  cite it by ID; tasks derive from plans. No forked authority.
- INV-3 — Ratified ground moves only by human decision. Agents may draft
  ratified changes; they never approve them.
- INV-4 — Evidence integrity: a test asserting planned behavior changes only
  after the plan text it proves, citing the decision that changed it.
- INV-5 — Stack-agnostic shipped content: skills and prompts refer to project
  gates generically, never by project-specific commands.

Where INV-1 and INV-3 pull against each other (an escalation is never
zero-ceremony), INV-3 wins: safety of ratified ground outranks friction.

## Users

- **Implementing agents** (worker, fixer) — currently told to "make a
  reasonable decision and document it"; gain a classifier that says whose
  decision it is.
- **Review-routing agents** (quality-manager and the agents applying its
  remediations) — the channel the real drift came through; gain the rule that
  findings are evidence and remediations are classified against ratified
  ground before routing.
- **Authoring agents** (spec-writer, planner, plan-reviewer, task-manager) —
  gain intent capture, provenance recording, and mutability carried through
  handoffs.
- **The human** — sees every deviation as a dated decision instead of diff
  archaeology, and is interrupted exactly when ratified ground must move.

## User Experience

All flows are artifact-level; nothing here changes runtime code.

**Authoring:** the spec-writer captures a goal and ranked invariants in a
first-class `## Intent` section. The planner logs decisions with provenance
(`Decided by:`), from which mutability defaults follow; plans cite spec
invariants by `INV-###` ID instead of restating them.

**Implementation collision:** a worker discovers plan text colliding with
reality. Instead of improvising, it runs the deviation classifier: snap back
when it is drifting, amend-on-record when the colliding ground is derived,
halt-and-escalate (Blocked plus a drafted decision entry) when the ground is
ratified, record a dated proposed decision when the plan is silent.

**Review routing:** the quality-manager receives a finding whose suggested fix
would supersede ratified ground. It routes the finding to a decision-needed
item for the human instead of fixer, and splits compound findings so the
legitimate part still gets fixed.

**Amendment:** an agent amending derived ground writes the dated decision
first — original text as an honestly rejected alternative, the invariant
served named — marks the superseded text with a dated pointer, builds to the
amendment, and surfaces the decision ID in its notes and completion report.

**Archive:** supersessions and amend-on-record decisions get distilled into
memory as key decisions.

## Acceptance Criteria

- **AC-001** — The spec format requires a `## Intent` section for planned
  feature/refactor specs: one goal sentence plus `INV-###` invariants that
  outrank any mechanism, ratified by definition, with rankings stated where
  invariants can conflict.
- **AC-002** — The plan format requires a `## Decision Log` for full plans:
  entries carry Decision / Alternatives / Why / Decided by, plus `Supersedes:`
  when amending; mutability defaults derive from `Decided by:` provenance
  (human-directed ⇒ ratified, agent-proposed ⇒ derived, absent ⇒ ratified)
  with explicit `(ratified)` / `(derived)` markers only to override; plans
  cite spec `INV-###` by ID and do not restate intent.
- **AC-003** — A single canonical deviation-protocol reference defines the
  classifier (snap back / amend-on-record / halt-and-escalate / record), the
  amend-on-record mechanics (decision written first; original text as an
  honestly rejected alternative; the served invariant named; dated
  supersession pointer; amendment surfaced in notes and reports), the
  reviewer/remediation rule, and the test-rewrite red flag. Other skills and
  prompts route to it rather than restating it.
- **AC-004** — The worker prompt routes deviations through the classifier;
  escalation is Blocked plus a drafted decision entry; ad-hoc "reasonable
  decision" judgment applies only to ground the classifier leaves to the
  worker.
- **AC-005** — The quality-manager prompt classifies each remediation against
  the plan's ratified ground before routing; a remediation that would
  supersede ratified ground becomes a decision-needed report item, never a
  fixer or review-fix route; compound findings are split so legitimate parts
  proceed.
- **AC-006** — Authoring prompts apply the protocol at their decision points:
  spec-writer captures Intent; planner records provenance and checks
  mechanisms against intent; plan-reviewer verifies Intent presence and names
  ratified ground its findings would touch; task-manager carries
  ratified-ground constraints into task acceptance criteria.
- **AC-007** — The testing standards state the evidence-integrity rule: a test
  asserting planned behavior changes only after the plan text it proves,
  citing the decision.
- **AC-008** — Lifecycle skills route through the protocol: plan readiness
  checks Intent presence; the task skill routes mid-implementation acceptance
  criteria changes through the classifier; the archive skill distills
  supersessions into memory.
- **AC-009** — Project gates pass (the test, lint, and type-check steps) and
  every shipped skill/prompt change remains stack-agnostic.

## Scope

Included:

- The proposal §6 edit map: one new work-artifacts reference plus targeted
  edits to spec-format, plan-format, the work-artifacts/plan/task/archive
  skills, the spec-writer/planner/worker/quality-manager/plan-reviewer/
  task-manager prompts, and the testing standards doc.
- Content tests in `tests/prompts/` and `tests/docs/` proving each behavior.

Excluded:

- Any pipeline or automation stage for the classifier (D-003 in plan.md).
- Mechanical artifact-conformance checks for supersession pointers (deferred
  until dogfooding shows drift surviving guidance).
- Migration of archived or in-flight plans; archives are not governed.
- Changes to plan/task tooling code under `lib/` — this work is artifact and
  prompt content only.

## Assumptions

- The proposal's §8 recommendations were accepted at approval; they are
  recorded as ratified decisions D-001..D-004 in `plan.md`.
- Content tests reading skill/prompt files and asserting exact strings are the
  established proof convention (`tests/prompts/*.test.ts`).
- The `episodic-log-detached-hardening` corpus remains the evidence of record
  for the incidents cited; they are not re-litigated here.

## Open Questions

None — the four kickoff questions are resolved as D-001..D-004 in `plan.md`.