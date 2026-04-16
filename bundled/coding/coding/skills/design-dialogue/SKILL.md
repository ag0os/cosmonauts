---
name: design-dialogue
description: Dialogic design cadence for planners running with a human in the loop. Surface 2-3 alternatives per major decision with trade-offs, walk the design in passes rather than dumping a finished plan, capture every meaningful choice in a Decision Log, and treat approval as incremental. Load ONLY when running interactively. Do NOT load as a chain stage — the doc-production stance is correct there.
---

# Design Dialogue

You are designing *with* a human, not *for* one. The plan is the record of your shared decisions — not a document you drop in their lap for terminal approval.

This skill changes the **cadence** of planning, not its rigor. You still follow every step of the planner workflow (explore, design, stress-test, define quality criteria). You still produce the same plan document. You just do it in passes, with the human steering at each pass boundary.

## When to load this skill

Load only when you are running interactively. Signals:

- The user addressed you directly and is present in the session.
- You were not invoked as a predefined chain stage with a fixed prompt pipeline.
- The parent explicitly asked you to engage with the human or confirm direction before committing.

In autonomous mode (chain stage, `--print`, non-interactive), do NOT load this skill. Produce the plan document, mark inferences as assumptions, and hand off cleanly. Trying to ask questions of a chain runner wastes tokens and delays execution.

## What counts as a major decision

Not every choice deserves dialogue. Surface alternatives only for decisions that change:

- Module boundaries, data shape, or integration surface
- User-facing behavior
- Something you are inferring without explicit user input

Minor details (naming a private helper, picking which test file to extend, choosing a local variable style) do not need a dialogue. Just do them.

## The dialogic stance

### Lead with trade-offs, not conclusions

For each major decision, present 2–3 alternatives with trade-offs before committing. Use a consistent shape:

- **Option A — short name.** One-sentence description.
  - Strengths: ...
  - Weaknesses: ...
  - When it wins: ...
- **Option B — short name.** ...
- **Option C — short name.** ... (omit if only two genuine options exist; do not invent a third)

Close with: "My default is A because X. Want to go a different direction?"

### Walk the design in passes

Do not write the full plan up front and then ask for approval. Build it in three passes:

1. **Frame pass** — State the problem as you understand it. Confirm scope and intent. Get a yes before moving on.
2. **Shape pass** — Propose module structure and key contracts. Present trade-offs on the big decisions. Converge on direction.
3. **Detail pass** — Fill in files to change, risks, quality criteria, implementation order. Only now is it a full plan.

Each pass is short. The human can steer at any boundary. You never commit to detail before the shape is agreed.

### Capture rejections, not just decisions

When the user picks B over A, write it down. The plan has a **Decision Log** section where every meaningful choice gets recorded:

- **Decision**: what was chosen
- **Alternatives considered**: what was rejected
- **Why chosen**: rationale
- **Decided by**: planner-proposed / user-directed / user-chose-among-options

This serves two purposes: downstream agents see the reasoning; a future revision can reconsider the choice with full context.

### Approval is incremental

Each decision, once captured in the Decision Log, is locked in. You do not re-ask about it later. The human approves the plan AS A WHOLE only at the end — but individual decisions are already settled from earlier passes.

If the human pushes back on a prior decision during the detail pass, update the Decision Log entry to record the revision (preserve history: "initially chose A, revised to B after learning X").

## Switching modes mid-session

Start dialogic when interactive. Switch to autonomous mid-session when the human says:

- "Just do it", "decide for me", "go ahead"
- Time is constrained and they ask you to commit
- The remaining decisions are small enough that a default is obvious

Switch back to dialogic when:

- A decision surfaces that changes user-facing behavior
- You are inferring something material to the design
- The human re-engages with a correction

## What this skill is NOT

- **Not a requirements-capture skill.** Product conversation (WHAT/WHY, users, use cases) belongs to `spec-writer`. If the human is still exploring what to build rather than how, pause and say so — suggest they route to `spec-writer` first.
- **Not a replacement for Architectural Design.** You still follow every planner step. This skill changes cadence, not substance.
- **Not a license to stall.** If every minor detail becomes a dialogue, you are wasting the human's time. Surface alternatives for major decisions only.

## Decision Log format

In the plan document, add a section near the top (after Scope, before Design):

```markdown
## Decision Log

- **D-001 — [short title]**
  - Decision: [what was chosen]
  - Alternatives: [A, B, C with one-line each]
  - Why: [rationale in one or two sentences]
  - Decided by: [planner-proposed / user-directed / user-chose]

- **D-002 — ...**
```

Every entry must have these four fields. Keep each entry tight — one screen should hold 3–5 entries. The log is a reference, not an essay.

## Quick reference

- Major decision surfaces → propose 2–3 options with trade-offs, ask for direction.
- User chooses an option → record in Decision Log with alternatives and rationale.
- Minor detail → just do it.
- User says "commit" / "just do it" → switch to autonomous, finish the plan.
- Product ambiguity surfaces → flag it, suggest `spec-writer` handoff, do not resolve it in design dialogue.
