## Purpose

Only the first stage of a chain receives the user prompt. Every later stage falls
through to a one-line role default, so a stage that repeats a role has no way to
know it is doing a *different job* the second time.

The concrete failure: in `planner -> plan-reviewer -> planner`, the terminal
planner is told `"Analyze the project and design an implementation plan."` — the
same instruction the first planner got. Observed 2026-08-25 on `harness-adapters`:
the reviewer wrote `review-4.md` (one high, four medium — a self-deadlocking
owner-lock re-acquisition, and transaction artifacts left untracked at the repo
root), and the terminal planner then ran for **24 seconds doing only reads and
revised nothing**. The agent behaved correctly: it was told to design a plan and
found a finished one. The findings were applied by hand.

Blast radius is two shipped chains, not one: `plan-and-build` and `spec-and-build`
both carry `planner -> plan-reviewer -> planner`, and both continue into
`task-manager -> coordinator`. So a chain can decompose into tasks a plan whose
final review round was never addressed, with nothing in the run signalling it.

## Users

Anyone running `plan-and-build`, `spec-and-build`, or `/spec-to-backlog` — which
is every planning-chain run in this repo. Also the agents themselves: the planner
persona already carries a revision contract (`bundled/coding/prompts/planner.md:71`)
and honours it unprompted when it runs first; the default stage prompt simply
never puts it in that mode.

## User Experience

Nothing changes at the CLI. Two things change in a run:

- A planner stage that follows a review stage is told it is revising, and which
  round it is answering. It reads the review and applies the findings, instead of
  finding a finished plan and stopping.
- A chain that would advance past a review round nothing has addressed says so,
  rather than proceeding silently into task decomposition.

## Acceptance Criteria

- In `planner -> plan-reviewer -> planner`, the terminal planner's resolved prompt
  differs from the first planner's and names the revision job. A test asserts both
  prompts and their difference, not just that a prompt exists.
- The rule is positional and role-aware, not hardcoded to one chain shape: it
  holds for `spec-writer -> planner -> plan-reviewer -> planner` and for any chain
  where a role repeats after an intervening reviewer. A single-planner chain is
  byte-identical to today.
- Both prompt-building call sites behave identically —
  `lib/orchestration/chain-runner.ts:661` and
  `lib/orchestration/durable-chain-compiler.ts:278`. A test covers both; a fix in
  one path only is a defect.
- A chain that reaches a task-decomposition stage while the active plan's
  highest-numbered review round is unaddressed produces a visible, machine-readable
  signal. Silence is not an acceptable outcome; halting is one acceptable design,
  and so is a recorded warning — the plan must choose and say why.
- The decision on how much prior-stage context a stage receives is **recorded in
  the plan's Decision Log**, with the alternatives considered. This is the item's
  stated purpose ("decide and record it rather than patching past it"), and the
  implementation must match what is recorded.
- No existing chain changes behaviour except the repeated-role case: `implement`,
  `verify`, and every single-stage chain produce byte-identical prompts.
- Full suite, lint, typecheck and `plan check-artifacts` pass.

## Scope

**In.** Stage-prompt resolution for repeated roles
(`lib/orchestration/stage-prompts.ts`, `chain-steps.ts`) and its two call sites;
the unaddressed-review-round signal; the recorded decision on prior-stage context.

**Out.** A general mechanism for passing arbitrary prior-stage *output* forward —
see Assumptions for why. Anything touching `drive-envelope`'s `runStart` seam.
The `factory-evals` scoreboard, though review-round counts are a named signal
there and this work makes them computable. Changes to the planner persona itself,
which already carries the revision contract.

## Assumptions

- **Stages already share the filesystem, and that is the context channel.** The
  plan directory holds `plan.md` and every `review-N.md`; the terminal planner can
  read them. What it lacks is being *told* it is in a revision pass. So this is a
  prompt-mode problem, not a context-plumbing problem — which is why passing
  stage output forward is out of scope. If that assumption is wrong, the slice
  grows and the plan should say so rather than quietly widen.
- **Step-0-only prompt injection is plausibly deliberate**, to avoid context bloat
  on long chains. The plan should ratify or reverse that explicitly rather than
  patch past it.
- **Position is enough to select the mode.** A planner preceded by a reviewer is
  revising. The agent can determine *which* round from the directory itself. If
  selecting the mode turns out to need artifact I/O inside what is currently a
  pure function, that is a design decision worth recording, not an implementation
  detail.
- There is **no existing review-round machinery** to build on: `lib/plans/` has
  no review-round concept, and `check-artifacts` lives at the CLI layer and checks
  behaviour markers. The signal is new machinery, and its home is a real choice.

## Open Questions

- **Halt or warn** when a chain advances past an unaddressed review round? Halting
  is safer and matches the fail-closed posture elsewhere in this repo; warning
  keeps long unattended runs alive. This likely depends on whether the run is
  attended, which the chain does not currently know.
- **What counts as "addressed"?** A review round with findings, followed by a
  later plan mtime, is the cheap heuristic and is wrong in both directions. A
  recorded per-round status is accurate but is new artifact surface, and the
  `planning-system-hardening` plan already shipped versioned review rounds — that
  work should be checked before inventing a second scheme.
- **Should the mode layer be general?** `factory-modes` (roadmap) proposes a mode
  layer in the four-layer prompt assembly. A revision mode is arguably the first
  instance of that. Building it narrowly here risks a second mechanism later;
  building it generally here widens a thread item that is meant to be small. The
  plan should take a position.
