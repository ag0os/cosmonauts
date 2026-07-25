# Kickoff — teach the spec/plan/task system when to auto-correct and when to stop-and-ask

## Why you're here

Cosmonauts plans work through **spec → plan → tasks → implementation**. The point
of that pipeline is to keep many agents (and humans) aligned to a **single source
of truth** so they don't drift apart. But we just finished a large, unusually
well-specified plan (`episodic-log-detached-hardening`) and hit the same friction
over and over: during implementation, a *better understanding of how the system
should behave* kept emerging — and sometimes the right move was to **not comply**
with the original design, while other times the right move was to **snap back** to
it, and other times to **stop and ask a human**.

Right now the system has no explicit rule for telling those apart. Agents decide
ad hoc. That's the gap you're improving.

**The insight to build on:** a plan's authority comes from being the *legible
record of intent*, not from being immutable. So the governing rule is:

> The plan is the thing you amend **on the record** — never the thing you
> silently route around.

Deviation is not the failure. *Unrecorded* deviation is. Your job is to make the
system encode that: know what it may auto-correct, what it may amend-on-record
itself, and what it must halt and escalate — anchored to a crystal-clear
statement of intent that mechanism yields to.

## The three cases we actually hit (grounding — read the real examples)

Everything below is in `missions/plans/episodic-log-detached-hardening/` (plan.md
Decision Log D-001..D-010, spec.md, and the `qm-*` / `codex-review-round-*`
artifacts). Study them; they are your corpus.

1. **The plan was WRONG** — it understated its own intent, contradicted itself, or
   rested on a false assumption. Correct action: amend the plan, then build to the
   amendment.
   - **D-005**: the SEQ-003 precondition's *mechanism* ("no graph resume state")
     was stricter than the *intent* it stated, and made a whole feature (F-005)
     unreachable in production. The plan's words collided with the plan's purpose;
     the purpose had to win.
   - **D-010**: two acceptance criteria (AC-001 byte-identical-OFF and B-023
     release-failure handling) were *mutually unsatisfiable* on one code path. No
     implementation satisfies both — a criterion had to be narrowed.
   - The "identical races dedupe" risk note was simply factually false; implementation
     revealed same-outcome/different-timestamp races that don't dedupe.

2. **The plan was RIGHT; an agent DRIFTED.** Correct action: revert to the plan.
   - A reviewer agent silently changed terminal-capture behavior to contradict
     ratified Design §2 **and rewrote the test to match its new behavior**. That is
     the dangerous shape: undocumented, and it manufactured its own evidence. It
     was reverted.

3. **A genuinely NEW decision the plan never foresaw.** Correct action: record a
   new dated decision with rejected alternatives; get human sign-off if it moves
   scope or touches ratified ground.
   - **D-010**, and the exclusive-claim ledger protocol (commit `44099f6`), and
     **D-498-1** (a pre-implementation design decision recorded into a task).
   - Counter-example that must NOT be "auto-fixed": **PR-002** was a *ratified*
     design (the thrown-terminal path keeps its `.finally` backstop by design). An
     agent wanted to "fix" it; the right answer was stop-and-revise-with-human, not
     comply-with-my-new-idea.

The discriminator between "I understand it better now" and "I'm rationalizing a
shortcut": does the change serve the spec's **goal** better, and does it survive
being **written down as a decision with honest rejected alternatives**? Genuine
learning wants to be recorded. A corner-cut wants to stay quiet.

## What to design (evaluate and propose — these are directions, not a mandate)

1. **A first-class Intent / Source-of-Truth section** in the spec (and echoed at
   the top of the plan). The spec already has `Purpose`; make the load-bearing part
   explicit and separate from mechanism:
   - the **goal** (what must remain true no matter how the implementation changes),
   - the **invariants** that outrank any specific mechanism,
   - stated so that when a mechanism (a behavior, a precondition, an AC's letter)
     collides with the intent during implementation, the resolution is
     *automatic*: mechanism yields to intent, and the yield gets recorded.
   D-005 is the proof this is needed — had intent-vs-mechanism been separated and
   ranked, that collision resolves itself instead of needing a human round-trip.

2. **Mutability tags** on each Decision-Log entry and behavior:
   - **ratified** — changing it requires stop-and-ask (human sign-off). PR-002.
   - **derived** — an implementer may amend it on the record without escalation, as
     long as intent is preserved and the amendment is written down. The ledger
     exclusivity gap.
   An implementing agent should be able to look at what it wants to change and know
   *instantly* whether that change is its to make or must escalate. Most of our
   friction was really *uncertainty about who owns the change*, not the change.

3. **The amend-on-record protocol** — the concrete mechanics an agent follows to
   deviate safely: a dated decision entry, the rejected alternatives, what it
   supersedes, and the escalation rule. We did this ad hoc (D-005/D-010/D-498-1);
   make it a defined, repeatable step in the plan/task skills.

4. **A classifier / decision procedure** an implementing or reviewing agent runs
   when it detects a deviation: which of the three cases is this, and therefore —
   auto-correct back, amend-on-record, or halt-and-escalate. This is the heart of
   "knows how to auto-correct for some things and stop-and-ask for others."

## Where the system lives (edit these, don't reinvent)

- `domains/shared/skills/plan/SKILL.md` — plan authoring (Behavior-First Plans,
  Decision Log, readiness check).
- `domains/shared/skills/task/SKILL.md` — task authoring.
- `domains/shared/skills/{roadmap,archive}/SKILL.md` — lifecycle ends.
- `bundled/coding/prompts/spec-writer.md` — spec structure
  (Purpose/Users/UX/Acceptance Criteria/Scope/Assumptions/Open Questions).
- `bundled/coding/prompts/planner.md` — planner behavior.
- `docs/prompts.md`, `docs/testing.md` — reference docs the above lean on.
- The archived exemplar plans under `missions/plans/` and `missions/archive/plans/`
  show the Decision-Log convention already in use — extend it, don't replace it.

## Guardrails

- **Legibility, not ceremony.** The value is that intent and deviations are
  *visible and reviewable*, not that every change fills out a form. This project
  has consistently resisted over-scoping — a heavyweight process that makes agents
  slower to record a correction than to route around it will *cause* the silent
  drift it's meant to prevent. Optimize for "recording a deviation is the path of
  least resistance."
- **One source of truth.** Do not create competing authorities (a spec that says X
  and a plan that says Y). The intent lives in one place; the plan derives from it;
  tasks derive from the plan. Sharpen the hierarchy, don't fork it.
- **Stack-agnostic.** Shipped skills and prompts must stay language/framework
  agnostic — refer to gates generically ("the project's type-check step"), never
  bake in specific commands.
- **Dogfooded.** These skills govern real future work in this repo, so changes are
  self-applying. Propose the design (ideally retrofitting it to the
  `episodic-log-detached-hardening` plan as a worked example — show that D-005,
  D-010, the reverted drift, and PR-002 all fall out of your rules correctly)
  **before** rewriting the skills wholesale.
- **Verify against reality.** Before claiming a skill "already does X" or "lacks
  X", read the actual SKILL.md — don't infer from its name.

## Suggested first moves

1. Read the plan/task/roadmap skills and the spec-writer/planner prompts in full.
2. Read `episodic-log-detached-hardening/plan.md` (Decision Log especially) and the
   `qm-*`/`codex-review-round-*` artifacts — the raw material for the three cases.
3. Write a short **proposal**: the Intent section shape, the mutability tags, the
   amend-on-record protocol, and the deviation classifier — each retrofitted to a
   real example above so it's concrete, not theoretical.
4. Get human review of the proposal, then scope the skill/prompt edits as tasks.

## Open questions to resolve with the human (don't decide these alone)

- How much intent belongs in the **spec** vs restated in the **plan**? (Single
  source vs. a deliberate, tagged echo.)
- Default mutability when a decision is unmarked — ratified (safe, more
  escalation) or derived (fluid, more agent autonomy)?
- Should the deviation classifier live in the skills as guidance, or become an
  actual reviewer/verifier step in the chain/Drive pipeline that runs
  automatically?
- Who signs off on a "ratified" change — always the human, or may a dedicated
  review agent ratify within stated bounds?
