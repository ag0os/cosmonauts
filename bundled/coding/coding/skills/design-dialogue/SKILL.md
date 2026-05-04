---
name: design-dialogue
description: Dialogic design cadence for planners running with a human in the loop. Surface 2-3 alternatives per major decision with trade-offs, walk the design in passes rather than dumping a finished plan, capture every meaningful choice in a Decision Log, and treat approval as incremental. Load ONLY when running interactively. Do NOT load as a chain stage — the doc-production stance is correct there.
---

# Design Dialogue

You are designing *with* a human, not *for* one. The plan is the record of your shared decisions — not a document you drop in their lap for terminal approval.

This skill changes the **cadence** of planning, not its rigor. You still follow every step of the planner workflow (explore, design, stress-test, define quality criteria). You still produce the same plan document. You just do it in passes, with the human steering at each pass boundary.

## When to load this skill

Default to NOT loading this skill. Load it only when ONE of these is true:

- Your spawn prompt (or initial user instruction) explicitly asks you to dialogue. Trigger phrases: "walk me through", "let's discuss", "work with me on", "dialogic", "step by step", "frame this with me", or a literal `[dialogic]` tag.
- You are the main agent in an interactive REPL with no chain-stage parent (your runtime context has no parent role, or the parent is "user"/"human"). This is the `cosmonauts -a planner "..."` pattern.
- A facilitating agent (e.g., cody) that has already loaded this skill is using you as a sub-agent and has passed the Decision Log or dialogue artifacts forward.

If you cannot confirm at least one of these signals, stay autonomous: produce the plan document in one pass, mark inferences as assumptions, do not ask questions. Dialoguing with a chain runner wastes tokens.

## Compatible invocation patterns

**Direct planner REPL**: the user invokes the planner as the main agent (`cosmonauts -a planner "..."`). You have a direct channel with the human across turns. Full dialogic cadence applies.

**Cody-as-facilitator**: cody (persistent, interactive) loads this skill, runs the dialogue with the user directly, captures decisions in a Decision Log in its working context, and spawns the planner only once direction is settled. The planner itself runs autonomously but receives the Decision Log in its spawn prompt and reflects those decisions in the plan document.

If you are a planner sub-agent spawned via `spawn_agent` WITHOUT the facilitator having run dialogue first, you do NOT have a direct channel. Do not load this skill — you cannot dialogue; any questions you ask will never reach the user. Run autonomous.

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

Decisions captured in the Decision Log are approved at the moment the human directs them. Once logged, you do not re-ask about them — but the human can reopen any entry at any later pass by saying so. When they do, update the entry to record the revision (see plan_edit note below). In autonomous mode you still record decisions in the Decision Log, but mark each one `Decided by: planner-proposed` — that flags it for human review rather than treating it as approved.

If the human reopens a prior decision, re-emit the full plan body via `plan_edit` with the Decision Log entry updated (preserve history: "initially chose A; revised to B after learning X"). `plan_edit` replaces the entire body — there is no partial section patch — so include every other section unchanged.

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
  - Alternatives: [one line each for the options considered]
  - Why: [one or two sentences of rationale]
  - Decided by: [planner-proposed / user-directed / user-chose-among-options]

- **D-002 — ...**
```

Every entry must have these four fields. Keep each entry tight — one screen should hold 3–5 entries. The log is a reference, not an essay.

## Quick reference

- Major decision surfaces → propose 2–3 options with trade-offs, ask for direction.
- User chooses an option → record in Decision Log with alternatives and rationale.
- Minor detail → just do it.
- User says "commit" / "just do it" → switch to autonomous, finish the plan.
- Product ambiguity surfaces → flag it, suggest `spec-writer` handoff, do not resolve it in design dialogue.
