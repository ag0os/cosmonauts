---
description: Take a spec-ready cosmonauts plan from spec to a verified task backlog — planner→plan-reviewer chain → independent adversarial multi-lens review → synthesized plan revision → task-manager chain → mechanical coverage matrix → compliance review → task fixes — then stop where /implement-plan begins.
argument-hint: <plan-slug> [autonomous]
---

# Spec to backlog for a cosmonauts plan

You are coordinating the design-and-decomposition half of a cosmonauts plan: from an approved **spec** to a reviewed **plan** and a compliant **task backlog**. You **orchestrate, review, and revise** — cosmonauts agents do the designing and decomposing; your value-add is the independent adversarial review channel and the synthesis. Seeded from the code-structure-map run (see `missions/architecture/spikes/spec-to-backlog-pipeline.md`); improve/fork freely.

**Inputs**
- Plan slug: `$1` (required).
- Mode: `$2` — if `autonomous`, skip the human gate between plan revision and task creation.

**Preconditions (check first; stop with a clear message if unmet)**
- Cosmonauts project root (`missions/` exists), `cosmonauts` CLI on PATH. Load the `cosmonauts` skill if unsure how to drive it — and verify the CLI surface with `cosmonauts run chain --help` first (the external skill bundle has lagged the CLI before; chains run via `cosmonauts run chain`, not `--workflow`).
- `missions/plans/$1/spec.md` exists and `plan.md` is a spec-ready shell (or explicitly awaiting design). If tasks already exist for `plan:$1`, stop — this command creates the backlog; it does not reconcile one.
- Worktree clean; commit anything pending so chains run against committed state.

**Key facts about cosmonauts chains**
- Chains write artifacts to disk and log to **stderr only**; run them in the background with stderr redirected to a log file. The detached shell returning is not the chain finishing.
- A stalled stage (0% CPU mid-turn) usually means the stage's model is out of usage — check the agent's model before blaming the runner.
- Launch multi-agent review workflows **from the repo root** — a `cd` elsewhere poisons relative paths for every subagent.

---

## Phase 1 — Plan design (cosmonauts chain)

1. `cosmonauts run chain "planner -> plan-reviewer" "<prompt>" 2> <scratchpad>/chain-plan.log` in the background (expect 30–60 min).
2. Prompt must state: design the EXISTING plan slug `$1`; update `missions/plans/$1/plan.md` in place (preserve `createdAt`, do NOT create a new slug); the spec at `missions/plans/$1/spec.md` is authoritative; honor every ratified decision in the spec's Assumptions verbatim; name the relevant `missions/architecture/*.md` source-of-truth docs; design only, no implementation; plan-reviewer writes `missions/plans/$1/review.md`.
3. On completion confirm `plan.md` gained the design (behaviors `B-###`, Design, Files to Change, Quality Contract, Implementation Order) and `review.md` exists.

## Phase 2 — Independent adversarial review (your channel)

Observed fact this command exists for: the chain's plan-reviewer and this review find **disjoint** defect sets (contracts vs. design behavior). Do not skip either.

1. **Do not read `review.md` yet** — your channel must stay unanchored.
2. Launch a multi-agent Workflow: one finder per lens — **spec-fidelity** (every AC covered, ratified decisions honored, nothing invented), **codebase feasibility** (every named seam/file/hook/agent-path verified against the repo), **design-attack** (states with no exit transition; invariants traced against every field the design writes, volatile keys included; cost of recurring operations; packaging/auto-load interactions; real-world project variance), **scope/sequencing** (wave leakage, gate ordering, split points). Each finding carries a `checkable_claim`; cap ~6 per lens; zero findings is a valid answer; forbid the finders from reading `review.md`.
3. Pipe every finding to an adversarial **verifier** whose default stance is to refute it against the repo (CONFIRMED / PARTIAL with revised severity / REFUTED). Only verified findings survive.

## Phase 3 — Synthesize and revise the plan

1. Now read `review.md`. Merge both channels; dedupe (independent lenses converging on one issue is a strength signal, not three issues).
2. Apply the verified findings to `plan.md` yourself: new behaviors continue the `B-###` spine (update gate ranges like "B-001 through B-0NN"), design rules land in the section they belong to, new Decision Log entries are marked *(Added <date> after review)*, `updatedAt` bumps. Address every high/major; record explicit dispositions for anything rejected.
3. Commit plan + review with a message naming both review channels and the fix clusters.
4. **Human gate** (unless `$2` = `autonomous`): report the findings synthesis and what you changed; proceed on approval.

## Phase 4 — Task creation (cosmonauts chain)

1. `cosmonauts run chain "task-manager" "<prompt>" 2> <scratchpad>/chain-tasks.log` (fast; minutes).
2. Prompt must state: decompose `missions/plans/$1/plan.md` (read fully, plus spec.md); every behavior owned by exactly one task; dependencies mirror the Implementation Order including any gate/checkpoint steps; ACs traceable to behaviors and the Quality Contract; restate the plan's ratified constraints; create tasks only.

## Phase 5 — Mechanical coverage matrix (cheap, before judgment)

1. Grep each `B-###` across `missions/tasks/` — every behavior maps to exactly one owning task; `cosmonauts task list --label plan:$1 --json` parses and the dependency DAG matches the Implementation Order.
2. Fix trivial mechanical gaps directly; feed the verified facts into Phase 6 as "known-good, do not re-report."

## Phase 6 — Task compliance review (your channel)

Launch a second Workflow — lenses: **AC-fidelity** (could an implementation satisfy the task while violating the plan behavior it owns?), **constraint-coverage** (every Design/Decision Log constraint and every Files-to-Change entry owned by an *implementing* task's AC — a checkpoint/verification task does not count as the owner; that failure mode is the single most likely finding), **sequencing/scope** (satisfiability at each dependency position; checkpoint tasks concrete, not ceremony; wave leakage). Adversarial verify as in Phase 2.

## Phase 7 — Fix tasks and close

1. Patch task ACs by editing the task markdown directly: Read each file with the Read tool before editing; keep the `<!-- AC:BEGIN/END -->` block and sequential `#N` numbering; append rather than renumber.
2. Re-verify `cosmonauts task list --label plan:$1 --json` still parses; re-run the relevant greps to confirm the patched constraints now have owners.
3. Commit. Report: plan state, both reviews' verified-finding counts and dispositions, task list with dependency shape, what was patched. **Stop — the backlog is ready for `/implement-plan $1`.** Do not start implementation.

## Guardrails

- You never hand-design the plan or hand-write the tasks from scratch — chains do that; you review, synthesize, and patch.
- Findings survive only through adversarial verification; unverified findings are not applied.
- Never let a load-bearing constraint's only owner be a checkpoint/verification task.
- Commit between phases so chain/workflow stages always run against committed state.
- If the plan or spec turns out to be unready (missing spec decisions, contradictory requirements), stop and report — this command does not re-litigate product scope.
