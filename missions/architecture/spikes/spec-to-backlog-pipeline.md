# Spec-to-Backlog Pipeline — Observed Run & Forward Design

**Status:** Observation/spike record of the first fully-instrumented spec → plan →
tasks pipeline run (plan `code-structure-map`, 2026-07-02/03), driven manually by an
external orchestrator (Claude Code). Written to feed two consumers: (1) targeted
improvements to cosmonauts agents/prompts/processes, and (2) the design of a new
named workflow that automates this pipeline starting right after a spec is ready.
Companion artifacts: `missions/plans/code-structure-map/{spec,plan,review}.md`,
tasks TASK-439..450, commits `9d6691e` → `18b548b`.

> **Consumers delivered 2026-07-03.** Consumer 1 shipped as prompt hardening:
> planner sanity-check four systematic-failure checks; plan-reviewer dimensions
> 9 (lifecycle-and-invariant attack) + 10 (constraint ownership); task-manager
> workflow step 6 (constraint sweep). Consumer 2 shipped as the Claude Code
> command **`/spec-to-backlog`** (external coordinator — Claude Code drives
> cosmonauts chains + its own adversarial review workflows; `~/.claude/commands/`).
> The self-contained cosmonauts version remains gated on `agent-swarms` Wave A —
> see the `spec-to-backlog` ROADMAP entry.

## What actually ran (timeline)

1. **Spec** — interactive spec-writer session (human + agent). Ratified decisions
   recorded in spec Assumptions and in the two memory-track architecture docs.
   Committed before any chain ran, so chains worked against clean state.
2. **Plan design** — `cosmonauts run chain "planner -> plan-reviewer" "<prompt>"`
   (46m14s, both agents on `openai-codex/gpt-5.5`). Planner filled the plan shell
   in place: 20 behaviors with seams/tests/markers, typed contracts, quality-gate
   ladder, 9-step implementation order. Plan-reviewer wrote `review.md` (verdict:
   viable with revisions; 2 findings + 2 coverage notes).
3. **Independent adversarial plan review** — external multi-agent workflow
   (17 agents, ~1.0M tokens, ~9 min): 4 lenses (spec-fidelity, codebase
   feasibility, design-attack, scope/sequencing), each finding then attacked by a
   dedicated verifier prompted to refute it. Result: 13 findings raised,
   9 CONFIRMED / 4 PARTIAL / **0 REFUTED**.
4. **Synthesis + plan revision** — external orchestrator merged both reviews
   (see "zero overlap" below), applied ~17 edits: new behavior B-021, narrative
   completion + timestamp-inheritance rules, two-tier freshness, tsconfig-alias
   resolution, config-hash scoping, extension auto-load guard, crash-leftover
   recovery, viewer bounds, all missing type contracts + result union,
   fallow.toml entries, step-6 checkpoint. Committed.
5. **Task creation** — `cosmonauts run chain "task-manager" "<prompt>"` (3m09s).
   12 tasks, all 21 behaviors owned by exactly one task, linear dependencies
   mirroring the implementation order, audit gate first, checkpoint task before
   viewer work.
6. **Task compliance review** — mechanical coverage matrix first (grep: behavior →
   owning task), then a second adversarial workflow (10 agents, ~0.5M tokens,
   ~5 min; 3 lenses: AC-fidelity, constraint-coverage, sequencing/scope).
   7 findings, all confirmed, deduplicating to **3 issues**; fixed by editing
   task ACs directly. Committed.

## Key observations

### 1. The two review channels found DISJOINT defect sets (both earned their keep)

The chain's `plan-reviewer` found **contract-completeness** defects (nine undefined
cross-task types, missing `generateArchitectureMap` signature, fallow.toml
entries, alias-test ownership). The multi-lens adversarial workflow found
**behavioral/design** defects (idempotence-vs-timestamp circularity, pending
narratives stranded forever, per-turn full-tree hashing cost, tsconfig-alias
misclassification, pi-package auto-load leak, crash windows). **Zero overlap.**
Neither channel alone would have produced a sound plan.

### 2. Systematic planner blind spots (all majors clustered here)

- **State-lifecycle completeness:** the planner defined when `pending` narrative
  is *written* but never when it is *cleared* — a whole state with no exit
  transition. Three independent lenses converged on it.
- **Self-contradiction across sections:** mandated `timestamp` frontmatter +
  "no-change refresh changes nothing" — mutually unsatisfiable as written;
  detectable only by tracing two design sections against one behavior.
- **Cost blindness:** answered the spec's own open question about check cost with
  the most expensive option (full-tree hashing per agent turn), silently.
- **Real-world variance:** design assumed this repo's shape (no tsconfig
  `baseUrl`/`paths`), though the spec targets *any* TS project.
- **Packaging interactions:** missed that `package.json`'s pi-package extension
  advertisement would auto-load the new extension for every agent on external
  Pi hosts, contradicting its own scope rule.

### 3. Task-manager failure mode: Design-only constraints evaporate

Task decomposition was mechanically excellent (21/21 behaviors, ordering,
checkpoint). But **constraints that lived only in Design/Decision Log — not as
numbered behaviors — lost their owner**: two-tier freshness (a major, verified
only in the post-hoc checkpoint task, guaranteeing rework across three "done"
tasks), fallow.toml entries, the no-`log.md` prohibition. The behavior spine is
the only artifact that reliably survives decomposition.

### 4. Cheap mechanical checks before expensive review

The grep coverage matrix (behavior → owning task) cost seconds and let the
review workflow be told "these facts are known-good, don't re-report" —
focusing paid agent time on judgment, not bookkeeping.

### 5. Adversarial verification kept finders honest

Default-refute verifiers produced 0 refutations across 20 findings — and several
PARTIAL downgrades (blocker→major, major→minor) that calibrated the fix effort.
The verify pass is what makes multi-lens fan-out trustworthy.

### 6. Friction notes

- The external `cosmonauts` skill bundle was stale (`--workflow` flag removed by
  the orchestration-surface consolidation; now `cosmonauts run chain`). Re-export
  the bundle after CLI surface changes.
- Chains emit to stderr only; artifacts land on disk. Fine for an orchestrator,
  opaque for a human watching.
- Chain fan-out (`reviewer[3]`) sends the *same prompt* to all instances — the
  multi-lens review (different prompt per agent) is not expressible as a chain
  today. This is exactly `agent-swarms` Wave A (read/opinion swarms with real
  sharding + synthesis).

## Consumer 1 — agent/process improvements (proposed)

- **`planner` prompt:** add self-check directives: (a) every introduced state
  must name its exit transition; (b) every "X never changes" invariant must be
  traced against every field the design writes; (c) when the spec flags a cost
  question, the design must answer it explicitly; (d) assume target-project
  variance (aliases, monorepos), not this repo's shape.
- **`plan-reviewer` prompt:** add a **design-attack dimension** (devil's
  advocate: idempotence, lifecycle completeness, cost, packaging interactions)
  and a **constraint-ownership dimension** (every Design/Decision Log constraint
  and Files-to-Change entry must be traceable to a behavior or named owner).
  Today it reviews structure and contracts; it does not attack the design.
- **`task-manager` prompt:** after behavior mapping, run a **constraint sweep** —
  walk Design, Decision Log, and Files to Change; every load-bearing item must
  land in some task's AC, not only in a checkpoint/verification task.
  Alternative (stronger): planning convention that *every* load-bearing
  constraint becomes a behavior, keeping the spine the single carrier.
- **Process:** always run the mechanical coverage matrix between task creation
  and any judgment review; feed known-good facts into the review prompt.
- Relatedly: `dialogic-planner-followups` (Ideas) already tracks panel-value
  validation for reviewer specialists — this run is a data point in favor of
  multi-lens with verification.

## Consumer 2 — the `spec-to-backlog` workflow (forward design sketch)

A named pipeline starting right after a spec is ready:

```text
planner -> plan-review(multi-lens + adversarial verify) -> plan-revise
        -> task-manager -> task-review(compliance + coverage matrix) -> task-fix
        [-> optional gate: human approval -> drive]
```

Design notes from this run:

- **The revise steps are the novel agents.** Today the synthesis/revision work
  was done by the external orchestrator. A `plan-revisor` is plausibly the
  planner re-invoked with both reviews as input and a "apply verified findings,
  change nothing else" contract; same shape for task fixes.
- **Multi-lens review needs sharded fan-out** (different prompt per reviewer) +
  a verify stage — not expressible in the chain DSL today. Either (a) ship it as
  interim single-agent review dimensions (weaker), or (b) build on `agent-swarms`
  Wave A, making this workflow its first concrete consumer.
- **Mechanical gates between stages** (coverage matrix; behavior-marker checks)
  should be deterministic postflight checks, not agent judgment — consistent
  with the Drive-over-/goal evaluation decision (deterministic postflight is
  stronger).
- **Spec creation stays out of the automated pipeline for now.** Spec writing is
  the deliberately human-heavy stage (framings, decisions, ratifications). The
  existing `prd-ingestion` Idea is the principled path to including it: accept a
  written PRD, proceed only if complete, refuse with a structured gap list
  otherwise — the pipeline then starts from a validated spec either way.
- Human gates: plan-revise → task-manager is the natural approval boundary
  (matches the existing split-pipeline recipe); the second is before drive.

## Cost/benefit snapshot

Verification spend: ~1.5M subagent tokens + ~14 min wall-clock across both
review workflows, plus one plan-reviewer chain stage. Caught: 1 unimplementable
contract (idempotence circularity), 1 permanent-state bug (stranded pendings),
1 systemic performance regression (per-turn hashing), 1 cross-host scope leak
(auto-load), 1 correctness bug on common layouts (aliases), 9 undefined
contracts, and 3 orphaned plan requirements — all before a line of
implementation. Every one of these would have been materially more expensive
mid-implementation or post-merge.
