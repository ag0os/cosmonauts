# Stage 8 review 2 — Claude subagent

The prompt is `stage8-review-2-prompt.md`. The review covers `512df8b..81fde23` (TASK-759 at `6240a21`). Condensed by the coordinator.

**Verdict: SHIP for Stage 8.** No HIGH or MEDIUM findings.

## 1. Review-1 findings

All resolved:
- spawning capability (`:16`, `:22`);
- Fallow doc (`:235`, `:299-313`);
- review-base wording (`implement-plan.md:50`), with a small wording gap (LOW-B);
- ROADMAP (`:271`);
- entry-point test.

## 2. Caller prose

Every QM mention is review-only.

- **LOW-A: stale QM default stage prompt.** `lib/orchestration/stage-prompts.ts:17-18` still reads "…orchestrate fixes until merge-ready."
  - It never reaches the QM: the raw `stage.prompt` is passed as the operator note.
  - It is baked into the durable QM step input (`durable-chain-compiler.ts:319`), so it lands in every `verify` run's `graph.json` and `step.json`.
  - It is pinned by `tests/orchestration/chain-steps.test.ts:255`.
- **LOW-B: the base description leaves out a step.** `implement-plan.md:50` omits that the host takes the merge-base of the captured HEAD and the found ref (`quality-review-workspace.ts:399-402`). `range.txt` records that merge-base.

## 3. Entry-point test

The test drives:
- the `run chain <name>` command from `createRunProgram`;
- shipped name resolution;
- real `executeChainExpression` routing.

`verify` takes the durable route (`runDurableChain`, run id `chain-*`). `implement` runs inline.

Mutations killed:
- `-> fixer` appended, both with and without the placement guard;
- no durable artifacts;
- `qualityReview` not threaded through;
- `verify` forced inline.

The seams do not change production behavior. `cli/main.ts:768` uses the defaults, and `qualityReview` is threaded into both runners.

Residual: `createContext` is stubbed, so real runtime bootstrap is not exercised.

## 4. Regressions

The only runtime diff is two optional seams. The worktree suite passed 3408/3408, and `tsc` is clean.
